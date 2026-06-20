import {
  createJourneySchema,
  isJourneyActionAllowedForTriggerType,
  journeyTriggerConfigSchema,
  linearJourneyGraphSchema,
  listJourneyRunsByEntityQuerySchema,
  listJourneyRunsQuerySchema,
  publishJourneySchema,
  setJourneyModeSchema,
  updateJourneySchema,
  type CreateJourneyInput,
  type JourneyTriggerConfig,
  type LinearJourneyGraph,
  type ListJourneyRunsByEntityQuery,
  type ListJourneyRunsQuery,
  type PublishJourneyInput,
  type SetJourneyModeInput,
  type UpdateJourneyInput,
} from "@scheduling/dto";
import { journeys, journeyVersions } from "@scheduling/db/schema";
import { compact, uniq } from "es-toolkit/array";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { ApplicationError } from "../../errors/application-error.js";
import { type DbClient } from "../../lib/db.js";
import { isRecord } from "../../lib/type-guards.js";
import { customAttributeRepository } from "../../repositories/custom-attributes.js";

// Journey definition validation and publish-time overlap detection: parses the
// linear-graph snapshot, enforces client-trigger/action compatibility rules, and
// computes overlap warnings against other published/paused journeys. Also hosts
// the request-payload guards (`validate*Input`) shared by the service methods.

const OVERLAP_CANDIDATE_STATES = ["published", "paused"] as const;
const JOURNEY_DEFINITION_INVALID_CODE = "JOURNEY_DEFINITION_INVALID";
const HIGH_SIGNAL_FILTER_FIELDS = new Set([
  "appointment.calendarId",
  "appointment.appointmentTypeId",
  "appointment.clientId",
]);
const BUILT_IN_CLIENT_TRACKED_ATTRIBUTE_KEYS = [
  "client.id",
  "client.firstName",
  "client.lastName",
  "client.email",
  "client.phone",
] as const;

function journeyDefinitionInvalidError(
  issues: unknown,
  message = "Journey definition is invalid",
): ApplicationError {
  return new ApplicationError(message, {
    code: "CONFLICT",
    details: {
      code: JOURNEY_DEFINITION_INVALID_CODE,
      issues,
    },
  });
}

export function parseLinearJourneyGraph(
  definition: unknown,
): LinearJourneyGraph {
  const parsed = linearJourneyGraphSchema.safeParse(definition);
  if (!parsed.success) {
    throw journeyDefinitionInvalidError(parsed.error.issues);
  }

  return parsed.data;
}

function getTriggerConfigFromGraph(
  graph: LinearJourneyGraph,
): JourneyTriggerConfig | null {
  const triggerNode =
    graph.nodes.find((node) => node.attributes.data.type === "trigger") ?? null;
  if (!triggerNode) {
    return null;
  }

  const parsed = journeyTriggerConfigSchema.safeParse(
    triggerNode.attributes.data.config,
  );

  return parsed.success ? parsed.data : null;
}

function collectRoutingEvents(config: JourneyTriggerConfig): string[] {
  if (config.triggerType === "AppointmentJourney") {
    return uniq([config.start, config.restart]);
  }

  if (config.triggerType === "ClientJourney") {
    return [config.event];
  }

  return [];
}

export async function validateClientTriggerCustomAttributeReferences(input: {
  tx: DbClient;
  orgId: string;
  graph: LinearJourneyGraph;
}): Promise<void> {
  const triggerConfig = getTriggerConfigFromGraph(input.graph);
  if (
    !triggerConfig ||
    triggerConfig.triggerType !== "ClientJourney" ||
    triggerConfig.event !== "client.updated"
  ) {
    return;
  }

  const trackedAttributeKey = triggerConfig.trackedAttributeKey?.trim();
  if (!trackedAttributeKey) {
    throw journeyDefinitionInvalidError([
      {
        code: "custom",
        path: ["trigger", "config", "trackedAttributeKey"],
        message: 'Client updated triggers must include "trackedAttributeKey".',
      },
    ]);
  }

  const definitions = await customAttributeRepository.listDefinitions(
    input.tx,
    input.orgId,
  );
  const validFieldKeys = new Set<string>([
    ...BUILT_IN_CLIENT_TRACKED_ATTRIBUTE_KEYS,
    ...definitions.map((definition) => definition.fieldKey),
  ]);

  if (validFieldKeys.has(trackedAttributeKey)) {
    return;
  }

  throw journeyDefinitionInvalidError([
    {
      code: "custom",
      path: ["trigger", "config", "trackedAttributeKey"],
      message: `Tracked attribute key "${trackedAttributeKey}" does not exist in supported client attributes.`,
    },
  ]);
}

function collectHighSignalEqualsFilters(
  config: JourneyTriggerConfig,
): Map<string, string> {
  const pairs = new Map<string, string>();

  for (const group of config.filter?.groups ?? []) {
    for (const condition of group.conditions) {
      if (condition.operator !== "equals") {
        continue;
      }

      if (!HIGH_SIGNAL_FILTER_FIELDS.has(condition.field)) {
        continue;
      }

      if (typeof condition.value !== "string") {
        continue;
      }

      pairs.set(condition.field, condition.value);
    }
  }

  return pairs;
}

export function validateClientJourneyActionCompatibility(
  graph: LinearJourneyGraph,
) {
  const triggerConfig = getTriggerConfigFromGraph(graph);
  if (!triggerConfig || triggerConfig.triggerType !== "ClientJourney") {
    return;
  }

  const violatingNodeIndexes = graph.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.attributes.data.type === "action")
    .filter(({ node }) => {
      const config = isRecord(node.attributes.data.config)
        ? node.attributes.data.config
        : null;
      if (!config) {
        return false;
      }

      const actionType =
        "actionType" in config ? config["actionType"] : undefined;
      if (typeof actionType !== "string") {
        return false;
      }

      return !isJourneyActionAllowedForTriggerType(
        actionType,
        triggerConfig.triggerType,
      );
    })
    .map(({ index }) => index);

  if (violatingNodeIndexes.length === 0) {
    return;
  }

  throw journeyDefinitionInvalidError(
    violatingNodeIndexes.map((nodeIndex) => ({
      code: "custom",
      path: ["nodes", nodeIndex, "attributes", "data", "config", "actionType"],
      message:
        'Client journeys cannot include "Wait For Confirmation" steps. Use appointment journeys for confirmation-aware automation.',
    })),
  );
}

function buildOverlapWarning(input: {
  candidateName: string;
  sharedEvents: string[];
  matchingField?: string;
}): string {
  const eventLabel = input.sharedEvents.join(", ");
  if (!input.matchingField) {
    return `Potential overlap with "${input.candidateName}" on ${eventLabel}.`;
  }

  return `Potential overlap with "${input.candidateName}" on ${eventLabel} (matching ${input.matchingField}).`;
}

export async function computePublishOverlapWarnings(input: {
  tx: DbClient;
  journeyId: string;
  graph: LinearJourneyGraph;
}): Promise<string[]> {
  const sourceTriggerConfig = getTriggerConfigFromGraph(input.graph);
  if (!sourceTriggerConfig) {
    return [];
  }

  const sourceEvents = new Set(collectRoutingEvents(sourceTriggerConfig));
  if (sourceEvents.size === 0) {
    return [];
  }

  const sourceHighSignalFilters =
    collectHighSignalEqualsFilters(sourceTriggerConfig);

  const candidateJourneys = await input.tx
    .select({
      id: journeys.id,
      name: journeys.name,
    })
    .from(journeys)
    .where(
      and(
        ne(journeys.id, input.journeyId),
        inArray(journeys.state, [...OVERLAP_CANDIDATE_STATES]),
      ),
    );

  const warnings = await Promise.all(
    candidateJourneys.map(async (candidate) => {
      const [latestVersion] = await input.tx
        .select({
          definitionSnapshot: journeyVersions.definitionSnapshot,
        })
        .from(journeyVersions)
        .where(eq(journeyVersions.journeyId, candidate.id))
        .orderBy(desc(journeyVersions.version), desc(journeyVersions.id))
        .limit(1);

      if (!latestVersion) {
        return null;
      }

      const parsedGraph = linearJourneyGraphSchema.safeParse(
        latestVersion.definitionSnapshot,
      );
      if (!parsedGraph.success) {
        return null;
      }

      const candidateTriggerConfig = getTriggerConfigFromGraph(
        parsedGraph.data,
      );
      if (!candidateTriggerConfig) {
        return null;
      }

      const sharedEvents = collectRoutingEvents(candidateTriggerConfig).filter(
        (eventType) => sourceEvents.has(eventType),
      );
      if (sharedEvents.length === 0) {
        return null;
      }

      if (!sourceTriggerConfig.filter || !candidateTriggerConfig.filter) {
        return buildOverlapWarning({
          candidateName: candidate.name,
          sharedEvents,
        });
      }

      const candidateHighSignalFilters = collectHighSignalEqualsFilters(
        candidateTriggerConfig,
      );

      const matchingField = [...sourceHighSignalFilters.entries()].find(
        ([field, value]) => candidateHighSignalFilters.get(field) === value,
      )?.[0];

      if (!matchingField) {
        return null;
      }

      return buildOverlapWarning({
        candidateName: candidate.name,
        sharedEvents,
        matchingField,
      });
    }),
  );

  return uniq(compact(warnings));
}

export function validateCreateInput(
  input: CreateJourneyInput,
): CreateJourneyInput {
  const parsed = createJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid journey payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

export function validateUpdateInput(
  input: UpdateJourneyInput,
): UpdateJourneyInput {
  const parsed = updateJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid journey payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

export function validatePublishInput(
  input: PublishJourneyInput,
): PublishJourneyInput {
  const parsed = publishJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid publish payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

export function validateSetModeInput(
  input: SetJourneyModeInput,
): SetJourneyModeInput {
  const parsed = setJourneyModeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid journey mode payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

export function validateListRunsQuery(
  input: ListJourneyRunsQuery,
): ListJourneyRunsQuery {
  const parsed = listJourneyRunsQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid runs query", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

export function validateListRunsByEntityQuery(
  input: ListJourneyRunsByEntityQuery,
): ListJourneyRunsByEntityQuery {
  const parsed = listJourneyRunsByEntityQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid runs query", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}
