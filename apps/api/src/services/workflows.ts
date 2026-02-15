// Workflow service - business logic layer for workflow CRUD

import {
  domainEventDataSchemaByType,
  createWorkflowSchema,
  listWorkflowExecutionsQuerySchema,
  serializedWorkflowGraphSchema,
  updateWorkflowSchema,
  workflowExecuteInputSchema,
  type ListWorkflowExecutionsQuery,
  type CreateWorkflowInput,
  type DomainEventType,
  type WorkflowExecuteInput,
  type WorkflowExecuteResponse,
  type WorkflowExecutionCancelResponse,
  type WorkflowExecutionSample,
  type WorkflowExecutionSampleListResponse,
  type SerializedWorkflowGraph,
  type UpdateWorkflowInput,
} from "@scheduling/dto";
import { and, desc, eq } from "drizzle-orm";
import { forEachAsync } from "es-toolkit/array";
import {
  appointmentTypes,
  appointments,
  calendars,
  clients,
  locations,
  resources,
} from "@scheduling/db/schema";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import {
  workflowRepository,
  type WorkflowWaitState,
  type Workflow,
  type WorkflowExecution,
  type WorkflowExecutionEvent,
  type WorkflowExecutionLog,
} from "../repositories/workflows.js";
import type { ServiceContext } from "./locations.js";
import {
  sendWorkflowCancelRequested,
  sendWorkflowRunRequested,
} from "../inngest/runtime-events.js";
import {
  evaluateWorkflowDomainEventTrigger,
  getWorkflowTriggerConfig,
} from "./workflow-trigger-registry.js";
import { orchestrateTriggerExecution } from "./workflow-trigger-orchestrator.js";
import type { DbClient } from "../lib/db.js";

const UNIQUE_CONSTRAINT_VIOLATION = "23505";
const WORKFLOW_NAME_UNIQUE_CONSTRAINT = "workflows_org_name_ci_uidx";

function duplicateGraphWithReset(
  graph: SerializedWorkflowGraph,
): SerializedWorkflowGraph {
  const duplicatedGraph = structuredClone(graph);
  const nodeIdMap = new Map<string, string>();

  const duplicatedNodes = duplicatedGraph.nodes.map((sourceNode) => {
    const newId = crypto.randomUUID();
    const duplicatedNode = {
      ...sourceNode,
      key: newId,
      attributes: {
        ...sourceNode.attributes,
        id: newId,
        data: {
          ...sourceNode.attributes.data,
          status: "idle" as const,
        },
      },
    };

    const config = duplicatedNode.attributes.data.config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      delete (config as Record<string, unknown>)["integrationId"];
    }

    nodeIdMap.set(sourceNode.key, duplicatedNode.key);
    nodeIdMap.set(sourceNode.attributes.id, duplicatedNode.attributes.id);

    return duplicatedNode;
  });

  const duplicatedEdges = duplicatedGraph.edges.map((edge) => {
    const source = nodeIdMap.get(edge.source) ?? edge.source;
    const target = nodeIdMap.get(edge.target) ?? edge.target;
    const newId = crypto.randomUUID();

    return {
      ...edge,
      key: newId,
      source,
      target,
      attributes: {
        ...edge.attributes,
        id: newId,
        source,
        target,
      },
    };
  });

  return {
    attributes: duplicatedGraph.attributes,
    options: duplicatedGraph.options,
    nodes: duplicatedNodes,
    edges: duplicatedEdges,
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("errno" in cause && cause.errno === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
    if ("code" in cause && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
}

function getConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("constraint" in cause && typeof cause.constraint === "string") {
      return cause.constraint;
    }
  }

  return null;
}

function mapWorkflowWriteError(error: unknown): ApplicationError | null {
  if (!isUniqueConstraintViolation(error)) {
    return null;
  }

  const constraint = getConstraintName(error);
  if (constraint === WORKFLOW_NAME_UNIQUE_CONSTRAINT) {
    return new ApplicationError("Workflow name already exists", {
      code: "CONFLICT",
      details: { field: "name" },
    });
  }

  return new ApplicationError("Workflow already exists", {
    code: "CONFLICT",
  });
}

function validateCreateInput(input: CreateWorkflowInput): CreateWorkflowInput {
  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid workflow payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateUpdateInput(input: UpdateWorkflowInput): UpdateWorkflowInput {
  const parsed = updateWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid workflow payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function workflowNameConflictError(): ApplicationError {
  return new ApplicationError("Workflow name already exists", {
    code: "CONFLICT",
    details: { field: "name" },
  });
}

const SAMPLE_ROWS_PER_EVENT = 10;

function ensureWorkflowEnabled(workflow: Workflow) {
  if (workflow.isEnabled) {
    return;
  }

  throw new ApplicationError("Workflow is off. Turn it on before running.", {
    code: "CONFLICT",
  });
}

function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

function toTitleCaseWords(value: string): string {
  return value
    .split("_")
    .map((segment) => {
      if (segment.length === 0) {
        return segment;
      }

      return `${segment[0]!.toUpperCase()}${segment.slice(1)}`;
    })
    .join(" ");
}

function formatSampleDateTime(value: Date | string, timezone: string): string {
  const date = value instanceof Date ? value : new Date(value);

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return toIsoTimestamp(date);
  }
}

function dedupeEventTypes(values: DomainEventType[]): DomainEventType[] {
  const deduped: DomainEventType[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

function resolveConfiguredEventTypes(
  workflow: Workflow,
): { domain: string; eventTypes: DomainEventType[] } | null {
  const triggerConfig = getWorkflowTriggerConfig(workflow.graph);
  if (!triggerConfig) {
    return null;
  }

  const eventTypes = dedupeEventTypes([...triggerConfig.startEvents]);

  if (eventTypes.length === 0) {
    return null;
  }

  return {
    domain: triggerConfig.domain,
    eventTypes,
  };
}

function addSample(
  samples: WorkflowExecutionSample[],
  eventType: DomainEventType,
  recordId: string,
  label: string,
  payload: Record<string, unknown>,
) {
  const parsedPayload =
    domainEventDataSchemaByType[eventType].safeParse(payload);
  if (!parsedPayload.success) {
    return;
  }

  samples.push({
    eventType,
    recordId,
    label,
    payload: parsedPayload.data as Record<string, unknown>,
  });
}

function withPreviousIfUpdated(
  eventType: DomainEventType,
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  if (eventType.endsWith(".updated")) {
    return {
      ...snapshot,
      previous: snapshot,
    };
  }

  return snapshot;
}

async function listClientSamples(
  tx: DbClient,
  orgId: string,
  eventTypes: DomainEventType[],
): Promise<WorkflowExecutionSample[]> {
  const rows = await tx
    .select()
    .from(clients)
    .where(eq(clients.orgId, orgId))
    .orderBy(desc(clients.createdAt), desc(clients.id))
    .limit(SAMPLE_ROWS_PER_EVENT);
  const samples: WorkflowExecutionSample[] = [];

  for (const eventType of eventTypes) {
    for (const row of rows) {
      const snapshot = {
        clientId: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
      };

      addSample(
        samples,
        eventType,
        row.id,
        `${row.firstName} ${row.lastName} (${eventType})`,
        withPreviousIfUpdated(eventType, snapshot),
      );
    }
  }

  return samples;
}

async function listLocationSamples(
  tx: DbClient,
  orgId: string,
  eventTypes: DomainEventType[],
): Promise<WorkflowExecutionSample[]> {
  const rows = await tx
    .select()
    .from(locations)
    .where(eq(locations.orgId, orgId))
    .orderBy(desc(locations.createdAt), desc(locations.id))
    .limit(SAMPLE_ROWS_PER_EVENT);
  const samples: WorkflowExecutionSample[] = [];

  for (const eventType of eventTypes) {
    for (const row of rows) {
      const snapshot = {
        locationId: row.id,
        name: row.name,
        timezone: row.timezone,
      };

      addSample(
        samples,
        eventType,
        row.id,
        `${row.name} (${eventType})`,
        withPreviousIfUpdated(eventType, snapshot),
      );
    }
  }

  return samples;
}

async function listCalendarSamples(
  tx: DbClient,
  orgId: string,
  eventTypes: DomainEventType[],
): Promise<WorkflowExecutionSample[]> {
  const rows = await tx
    .select()
    .from(calendars)
    .where(eq(calendars.orgId, orgId))
    .orderBy(desc(calendars.createdAt), desc(calendars.id))
    .limit(SAMPLE_ROWS_PER_EVENT);
  const samples: WorkflowExecutionSample[] = [];

  for (const eventType of eventTypes) {
    for (const row of rows) {
      const snapshot = {
        calendarId: row.id,
        name: row.name,
        timezone: row.timezone,
        locationId: row.locationId,
      };

      addSample(
        samples,
        eventType,
        row.id,
        `${row.name} (${eventType})`,
        withPreviousIfUpdated(eventType, snapshot),
      );
    }
  }

  return samples;
}

async function listAppointmentTypeSamples(
  tx: DbClient,
  orgId: string,
  eventTypes: DomainEventType[],
): Promise<WorkflowExecutionSample[]> {
  const rows = await tx
    .select()
    .from(appointmentTypes)
    .where(eq(appointmentTypes.orgId, orgId))
    .orderBy(desc(appointmentTypes.createdAt), desc(appointmentTypes.id))
    .limit(SAMPLE_ROWS_PER_EVENT);
  const samples: WorkflowExecutionSample[] = [];

  for (const eventType of eventTypes) {
    for (const row of rows) {
      const snapshot = {
        appointmentTypeId: row.id,
        name: row.name,
        durationMin: row.durationMin,
        paddingBeforeMin: row.paddingBeforeMin,
        paddingAfterMin: row.paddingAfterMin,
        capacity: row.capacity,
        metadata: row.metadata ?? null,
      };

      addSample(
        samples,
        eventType,
        row.id,
        `${row.name} (${eventType})`,
        withPreviousIfUpdated(eventType, snapshot),
      );
    }
  }

  return samples;
}

async function listResourceSamples(
  tx: DbClient,
  orgId: string,
  eventTypes: DomainEventType[],
): Promise<WorkflowExecutionSample[]> {
  const rows = await tx
    .select()
    .from(resources)
    .where(eq(resources.orgId, orgId))
    .orderBy(desc(resources.createdAt), desc(resources.id))
    .limit(SAMPLE_ROWS_PER_EVENT);
  const samples: WorkflowExecutionSample[] = [];

  for (const eventType of eventTypes) {
    for (const row of rows) {
      const snapshot = {
        resourceId: row.id,
        name: row.name,
        quantity: row.quantity,
        locationId: row.locationId,
      };

      addSample(
        samples,
        eventType,
        row.id,
        `${row.name} (${eventType})`,
        withPreviousIfUpdated(eventType, snapshot),
      );
    }
  }

  return samples;
}

async function listAppointmentSamples(
  tx: DbClient,
  orgId: string,
  eventTypes: DomainEventType[],
): Promise<WorkflowExecutionSample[]> {
  const rows = await tx
    .select({
      id: appointments.id,
      calendarId: appointments.calendarId,
      appointmentTypeId: appointments.appointmentTypeId,
      clientId: appointments.clientId,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      timezone: appointments.timezone,
      status: appointments.status,
      notes: appointments.notes,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      appointmentTypeName: appointmentTypes.name,
      calendarName: calendars.name,
    })
    .from(appointments)
    .leftJoin(
      clients,
      and(
        eq(clients.id, appointments.clientId),
        eq(clients.orgId, appointments.orgId),
      ),
    )
    .leftJoin(
      appointmentTypes,
      and(
        eq(appointmentTypes.id, appointments.appointmentTypeId),
        eq(appointmentTypes.orgId, appointments.orgId),
      ),
    )
    .leftJoin(
      calendars,
      and(
        eq(calendars.id, appointments.calendarId),
        eq(calendars.orgId, appointments.orgId),
      ),
    )
    .where(eq(appointments.orgId, orgId))
    .orderBy(desc(appointments.createdAt), desc(appointments.id))
    .limit(SAMPLE_ROWS_PER_EVENT);
  const samples: WorkflowExecutionSample[] = [];

  for (const eventType of eventTypes) {
    for (const row of rows) {
      const clientName = [row.clientFirstName, row.clientLastName]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ");
      const sampleLabelParts = [
        formatSampleDateTime(row.startAt, row.timezone),
        clientName.length > 0 ? clientName : "Unknown client",
        toTitleCaseWords(row.status),
      ];

      if (row.appointmentTypeName) {
        sampleLabelParts.push(row.appointmentTypeName);
      }

      if (row.calendarName) {
        sampleLabelParts.push(row.calendarName);
      }

      const snapshot = {
        appointmentId: row.id,
        calendarId: row.calendarId,
        appointmentTypeId: row.appointmentTypeId,
        clientId: row.clientId,
        startAt: toIsoTimestamp(row.startAt),
        endAt: toIsoTimestamp(row.endAt),
        timezone: row.timezone,
        status: row.status,
        notes: row.notes ?? null,
      };

      addSample(
        samples,
        eventType,
        row.id,
        sampleLabelParts.join(" • "),
        withPreviousIfUpdated(eventType, snapshot),
      );
    }
  }

  return samples;
}

async function listDomainSamples(input: {
  tx: DbClient;
  orgId: string;
  domain: string;
  eventTypes: DomainEventType[];
}): Promise<WorkflowExecutionSample[]> {
  if (input.domain === "client") {
    return listClientSamples(input.tx, input.orgId, input.eventTypes);
  }

  if (input.domain === "location") {
    return listLocationSamples(input.tx, input.orgId, input.eventTypes);
  }

  if (input.domain === "calendar") {
    return listCalendarSamples(input.tx, input.orgId, input.eventTypes);
  }

  if (input.domain === "appointment_type") {
    return listAppointmentTypeSamples(input.tx, input.orgId, input.eventTypes);
  }

  if (input.domain === "resource") {
    return listResourceSamples(input.tx, input.orgId, input.eventTypes);
  }

  if (input.domain === "appointment") {
    return listAppointmentSamples(input.tx, input.orgId, input.eventTypes);
  }

  return [];
}

async function cancelWaitingExecutions(input: {
  tx: DbClient;
  orgId: string;
  waitStates: WorkflowWaitState[];
  reason: string;
}): Promise<{
  cancelledExecutions: number;
  cancelledWaits: number;
}> {
  if (input.waitStates.length === 0) {
    return {
      cancelledExecutions: 0,
      cancelledWaits: 0,
    };
  }

  const cancelledWaitStateIds =
    await workflowRepository.markWaitingStatesCancelled(
      input.tx,
      input.orgId,
      input.waitStates.map((state) => state.id),
    );
  const cancelledWaitStateIdSet = new Set(cancelledWaitStateIds);
  const executionIds = Array.from(
    new Set(
      input.waitStates
        .filter((state) => cancelledWaitStateIdSet.has(state.id))
        .map((state) => state.executionId),
    ),
  );

  await forEachAsync(
    executionIds,
    async (executionId) => {
      await workflowRepository.markExecutionCancelled(
        input.tx,
        input.orgId,
        executionId,
        input.reason,
      );
    },
    { concurrency: 1 },
  );

  return {
    cancelledExecutions: executionIds.length,
    cancelledWaits: cancelledWaitStateIds.length,
  };
}

export class WorkflowService {
  async list(context: ServiceContext): Promise<Workflow[]> {
    return withOrg(context.orgId, (tx) =>
      workflowRepository.findMany(tx, context.orgId),
    );
  }

  async get(id: string, context: ServiceContext): Promise<Workflow> {
    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findById(tx, context.orgId, id);
      if (!workflow) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      return workflow;
    });
  }

  async create(
    input: CreateWorkflowInput,
    context: ServiceContext,
  ): Promise<Workflow> {
    const parsed = validateCreateInput(input);

    return withOrg(context.orgId, async (tx) => {
      const name =
        parsed.name ?? (await this.generateUntitledName(tx, context.orgId));

      const existing = await workflowRepository.findByNameInsensitive(
        tx,
        context.orgId,
        name,
      );

      if (existing) {
        throw workflowNameConflictError();
      }

      try {
        return await workflowRepository.create(tx, context.orgId, {
          name,
          description: parsed.description ?? null,
          graph: parsed.graph,
          isEnabled: parsed.isEnabled ?? false,
          visibility: parsed.visibility ?? "private",
        });
      } catch (error: unknown) {
        const mapped = mapWorkflowWriteError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }
    });
  }

  private async generateUntitledName(
    tx: Parameters<typeof workflowRepository.findNamesByPrefix>[0],
    orgId: string,
  ): Promise<string> {
    const baseName = "Untitled workflow";
    const existingNames = await workflowRepository.findNamesByPrefix(
      tx,
      orgId,
      baseName,
    );

    const lowerNames = new Set(existingNames.map((n) => n.toLowerCase()));
    if (!lowerNames.has(baseName.toLowerCase())) return baseName;

    for (let i = 2; i <= 100; i++) {
      const candidate = `${baseName} (${i})`;
      if (!lowerNames.has(candidate.toLowerCase())) return candidate;
    }

    return `${baseName} (${crypto.randomUUID().slice(0, 8)})`;
  }

  async update(
    id: string,
    input: UpdateWorkflowInput,
    context: ServiceContext,
  ): Promise<Workflow> {
    const parsed = validateUpdateInput(input);

    return withOrg(context.orgId, async (tx) => {
      const existing = await workflowRepository.findById(tx, context.orgId, id);
      if (!existing) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      if (parsed.name !== undefined) {
        const conflict = await workflowRepository.findByNameInsensitive(
          tx,
          context.orgId,
          parsed.name,
          id,
        );
        if (conflict) {
          throw workflowNameConflictError();
        }
      }

      let updated: Workflow | null;
      try {
        updated = await workflowRepository.update(tx, context.orgId, id, {
          name: parsed.name,
          description: parsed.description,
          graph: parsed.graph,
          isEnabled: parsed.isEnabled,
          visibility: parsed.visibility,
        });
      } catch (error: unknown) {
        const mapped = mapWorkflowWriteError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }

      if (!updated) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      return updated;
    });
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await workflowRepository.findById(tx, context.orgId, id);
      if (!existing) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      await workflowRepository.delete(tx, context.orgId, id);
      return { success: true };
    });
  }

  async duplicate(id: string, context: ServiceContext): Promise<Workflow> {
    return withOrg(context.orgId, async (tx) => {
      const source = await workflowRepository.findById(tx, context.orgId, id);
      if (!source) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      const name = `${source.name} (Copy)`;
      const conflict = await workflowRepository.findByNameInsensitive(
        tx,
        context.orgId,
        name,
      );
      if (conflict) {
        throw workflowNameConflictError();
      }

      const graph = serializedWorkflowGraphSchema.parse(
        duplicateGraphWithReset(source.graph),
      );

      try {
        return await workflowRepository.create(tx, context.orgId, {
          name,
          description: source.description,
          graph,
          isEnabled: false,
          visibility: "private",
        });
      } catch (error: unknown) {
        const mapped = mapWorkflowWriteError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }
    });
  }

  async listExecutionSamples(
    workflowId: string,
    context: ServiceContext,
  ): Promise<WorkflowExecutionSampleListResponse> {
    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findById(
        tx,
        context.orgId,
        workflowId,
      );
      if (!workflow) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      const configured = resolveConfiguredEventTypes(workflow);
      if (!configured) {
        return { samples: [] };
      }

      const samples = await listDomainSamples({
        tx,
        orgId: context.orgId,
        domain: configured.domain,
        eventTypes: configured.eventTypes,
      });

      return { samples };
    });
  }

  async execute(
    workflowId: string,
    input: WorkflowExecuteInput,
    context: ServiceContext,
  ): Promise<WorkflowExecuteResponse> {
    const parsedInput = workflowExecuteInputSchema.parse(input);

    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findById(
        tx,
        context.orgId,
        workflowId,
      );
      if (!workflow) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      ensureWorkflowEnabled(workflow);

      const triggerConfig = getWorkflowTriggerConfig(workflow.graph);
      const evaluation = evaluateWorkflowDomainEventTrigger({
        config: triggerConfig,
        eventType: parsedInput.eventType,
        payload: parsedInput.payload,
      });

      const waitStates = evaluation.correlationKey
        ? await workflowRepository.listWorkflowWaitingStatesByCorrelation(
            tx,
            context.orgId,
            {
              workflowId: workflow.id,
              correlationKey: evaluation.correlationKey,
            },
          )
        : [];

      const outcome = await orchestrateTriggerExecution({
        dryRun: parsedInput.dryRun ?? false,
        eventType: parsedInput.eventType,
        routingDecision: evaluation.routingDecision,
        waitStates,
        ...(evaluation.correlationKey
          ? { correlationKey: evaluation.correlationKey }
          : {}),
        startExecution: async () => {
          const execution = await workflowRepository.createExecution(
            tx,
            context.orgId,
            {
              workflowId: workflow.id,
              status: "running",
              triggerType: "manual",
              isDryRun: parsedInput.dryRun ?? false,
              triggerEventType: parsedInput.eventType,
              correlationKey: evaluation.correlationKey ?? null,
              input: parsedInput.payload,
            },
          );

          if (parsedInput.dryRun) {
            await workflowRepository.markExecutionSucceeded(
              tx,
              context.orgId,
              execution.id,
              {
                simulated: true,
                eventType: parsedInput.eventType,
                payload: parsedInput.payload,
              },
            );

            return {
              executionId: execution.id,
              dryRun: true,
            };
          }

          try {
            const run = await sendWorkflowRunRequested({
              orgId: context.orgId,
              workflowId: workflow.id,
              workflowName: workflow.name,
              executionId: execution.id,
              graph: workflow.graph,
              triggerInput: parsedInput.payload,
              eventContext: {
                eventType: parsedInput.eventType,
                ...(evaluation.correlationKey
                  ? { correlationKey: evaluation.correlationKey }
                  : {}),
              },
            });

            if (run.eventId) {
              await workflowRepository.setExecutionRunId(
                tx,
                context.orgId,
                execution.id,
                run.eventId,
              );
            }

            return {
              executionId: execution.id,
              dryRun: false,
              ...(run.eventId ? { runId: run.eventId } : {}),
            };
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to enqueue workflow run";
            await workflowRepository.markExecutionErrored(
              tx,
              context.orgId,
              execution.id,
              message,
            );
            throw error;
          }
        },
        cancelWaitStates: async (eventType) => {
          if (!evaluation.correlationKey) {
            return {
              cancelledExecutions: 0,
              cancelledWaits: 0,
            };
          }

          if (parsedInput.dryRun) {
            return {
              cancelledExecutions: new Set(
                waitStates.map((waitState) => waitState.executionId),
              ).size,
              cancelledWaits: waitStates.length,
            };
          }

          await forEachAsync(
            Array.from(
              new Set(waitStates.map((waitState) => waitState.executionId)),
            ),
            async (executionId) => {
              await sendWorkflowCancelRequested({
                executionId,
                workflowId: workflow.id,
                reason: `Cancelled by ${eventType} (${evaluation.correlationKey})`,
                requestedBy: context.userId,
                eventType,
                ...(evaluation.correlationKey
                  ? { correlationKey: evaluation.correlationKey }
                  : {}),
              });
            },
            { concurrency: 1 },
          );

          return cancelWaitingExecutions({
            tx,
            orgId: context.orgId,
            waitStates,
            reason: `Cancelled by ${eventType} (${evaluation.correlationKey})`,
          });
        },
      });

      if (outcome.status !== "running") {
        throw new ApplicationError(
          "Selected event does not start a workflow run.",
          {
            code: "CONFLICT",
          },
        );
      }

      return outcome;
    });
  }

  async listExecutions(
    workflowId: string,
    query: ListWorkflowExecutionsQuery,
    context: ServiceContext,
  ): Promise<WorkflowExecution[]> {
    const parsed = listWorkflowExecutionsQuerySchema.parse(query);

    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findById(
        tx,
        context.orgId,
        workflowId,
      );
      if (!workflow) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      const executions = await workflowRepository.listExecutionsByWorkflow(
        tx,
        context.orgId,
        workflowId,
        parsed.limit,
      );

      return executions;
    });
  }

  async getExecution(
    executionId: string,
    context: ServiceContext,
  ): Promise<WorkflowExecution> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      return execution;
    });
  }

  async getExecutionLogs(
    executionId: string,
    context: ServiceContext,
  ): Promise<{ execution: WorkflowExecution; logs: WorkflowExecutionLog[] }> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const logs = await workflowRepository.listExecutionLogs(
        tx,
        context.orgId,
        executionId,
      );

      return { execution, logs };
    });
  }

  async getExecutionEvents(
    executionId: string,
    context: ServiceContext,
  ): Promise<{ events: WorkflowExecutionEvent[] }> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const events = await workflowRepository.listExecutionEvents(
        tx,
        context.orgId,
        executionId,
      );

      return { events };
    });
  }

  async getExecutionStatus(
    executionId: string,
    context: ServiceContext,
  ): Promise<{
    status: string;
    nodeStatuses: Array<{ nodeId: string; status: string }>;
  }> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const logs = await workflowRepository.listExecutionLogs(
        tx,
        context.orgId,
        executionId,
      );

      const nodeStatuses = Array.from(
        logs.reduce((latestByNode, log) => {
          if (latestByNode.has(log.nodeId)) {
            return latestByNode;
          }

          latestByNode.set(log.nodeId, {
            nodeId: log.nodeId,
            status:
              execution.status === "cancelled" &&
              (log.status === "pending" || log.status === "running")
                ? "cancelled"
                : log.status,
          });

          return latestByNode;
        }, new Map<string, { nodeId: string; status: string }>()),
      ).map(([, nodeStatus]) => nodeStatus);

      return {
        status: execution.status,
        nodeStatuses,
      };
    });
  }

  async cancelExecution(
    executionId: string,
    context: ServiceContext,
  ): Promise<WorkflowExecutionCancelResponse> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const waitingStates = await workflowRepository.listExecutionWaitingStates(
        tx,
        context.orgId,
        executionId,
      );

      if (waitingStates.length === 0) {
        throw new ApplicationError("Execution is not currently waiting", {
          code: "CONFLICT",
        });
      }

      await sendWorkflowCancelRequested({
        executionId,
        workflowId: execution.workflowId,
        reason: "Cancelled manually",
        requestedBy: context.userId,
      });

      await workflowRepository.createExecutionEvent(tx, context.orgId, {
        workflowId: execution.workflowId,
        executionId,
        eventType: "run.cancel_requested",
        message: "Manual cancellation requested",
        metadata: {
          requestedBy: context.userId,
        },
      });

      const cancelledWaitStateIds =
        await workflowRepository.markWaitingStatesCancelled(
          tx,
          context.orgId,
          waitingStates.map((state) => state.id),
        );

      if (cancelledWaitStateIds.length === 0) {
        throw new ApplicationError("Execution is no longer waiting", {
          code: "CONFLICT",
        });
      }

      await workflowRepository.markExecutionCancelled(
        tx,
        context.orgId,
        executionId,
        "Cancelled manually",
      );

      await workflowRepository.createExecutionEvent(tx, context.orgId, {
        workflowId: execution.workflowId,
        executionId,
        eventType: "run.cancelled",
        message: "Run cancelled manually while waiting",
      });

      return {
        success: true,
        status: "cancelled",
        cancelledWaitStates: cancelledWaitStateIds.length,
      };
    });
  }
}

export const workflowService = new WorkflowService();
