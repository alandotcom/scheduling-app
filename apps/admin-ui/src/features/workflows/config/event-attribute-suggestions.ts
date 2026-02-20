import {
  domainEventDataSchemaByType,
  domainEventTypesByDomain,
  type DomainEventDomain,
  type DomainEventType,
} from "@scheduling/dto";
import { z } from "zod";

export type EventAttributeSuggestion = {
  value: string;
  type: string;
  isDateTime: boolean;
};

export type EventAttributeSuggestionMode = "general" | "condition";

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDomainRoot(domain: DomainEventDomain): string {
  return domain
    .split("_")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join("");
}

function resolveNullableSchema(schema: JsonSchema): JsonSchema {
  const anyOf = schema.anyOf;
  if (!Array.isArray(anyOf)) {
    return schema;
  }

  const nonNull = anyOf.find(
    (entry) => isRecord(entry) && entry.type !== "null",
  );

  return isRecord(nonNull) ? nonNull : schema;
}

function schemaType(schema: JsonSchema): string {
  const value = schema.type;
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(" | ");
  }

  return "unknown";
}

function schemaFormat(schema: JsonSchema): string | undefined {
  return typeof schema.format === "string" ? schema.format : undefined;
}

function isDateTimeSuggestion(input: {
  path: string;
  type: string;
  format?: string;
}): boolean {
  if (input.type !== "string") {
    return false;
  }

  if (input.format === "date-time") {
    return true;
  }

  const normalizedPath = input.path.toLowerCase();
  return (
    normalizedPath.endsWith("at") ||
    normalizedPath.endsWith("time") ||
    normalizedPath.endsWith("timestamp") ||
    normalizedPath.endsWith("date")
  );
}

function collectPaths(
  schema: JsonSchema,
  prefix: string,
  output: Map<string, EventAttributeSuggestion>,
) {
  const resolved = resolveNullableSchema(schema);

  if (!output.has(prefix)) {
    const type = schemaType(resolved);
    const format = schemaFormat(resolved);
    output.set(prefix, {
      value: prefix,
      type,
      isDateTime: isDateTimeSuggestion({
        path: prefix,
        type,
        format,
      }),
    });
  }

  const type = schemaType(resolved);
  if (type !== "object") {
    return;
  }

  const properties = resolved.properties;
  if (!isRecord(properties)) {
    return;
  }

  for (const [key, value] of Object.entries(properties)) {
    if (!isRecord(value)) {
      continue;
    }

    collectPaths(value, `${prefix}.${key}`, output);
  }
}

function isIdSuggestionPath(path: string): boolean {
  const lastSegment = path.split(".").at(-1)?.toLowerCase();
  if (!lastSegment) {
    return false;
  }

  return lastSegment === "id" || lastSegment.endsWith("id");
}

type CustomAttributeDefinitionForSuggestion = {
  fieldKey: string;
  type: string;
};

function mapCustomAttributeTypeToSuggestionType(type: string): string {
  if (type === "NUMBER") return "number";
  if (type === "BOOLEAN") return "boolean";
  return "string";
}

export function buildEventAttributeSuggestions(input: {
  domain: DomainEventDomain;
  eventTypes?: DomainEventType[];
  mode?: EventAttributeSuggestionMode;
  customAttributeDefinitions?: CustomAttributeDefinitionForSuggestion[];
}): EventAttributeSuggestion[] {
  const eventTypes =
    input.eventTypes && input.eventTypes.length > 0
      ? input.eventTypes
      : [...domainEventTypesByDomain[input.domain]];
  const mode = input.mode ?? "general";

  const root = toDomainRoot(input.domain);
  const suggestions = new Map<string, EventAttributeSuggestion>();

  suggestions.set(`${root}.event`, {
    value: `${root}.event`,
    type: "string",
    isDateTime: false,
  });
  suggestions.set(`${root}.timestamp`, {
    value: `${root}.timestamp`,
    type: "string",
    isDateTime: true,
  });
  suggestions.set(`${root}.data`, {
    value: `${root}.data`,
    type: "object",
    isDateTime: false,
  });

  for (const eventType of eventTypes) {
    const jsonSchema = z.toJSONSchema(domainEventDataSchemaByType[eventType]);
    collectPaths(jsonSchema as JsonSchema, `${root}.data`, suggestions);
  }

  if (input.customAttributeDefinitions?.length) {
    const customAttributePrefix =
      input.domain === "client"
        ? `${root}.data.customAttributes`
        : input.domain === "appointment"
          ? `${root}.data.client.customAttributes`
          : null;

    for (const def of input.customAttributeDefinitions) {
      if (!customAttributePrefix) {
        continue;
      }

      const path = `${customAttributePrefix}.${def.fieldKey}`;
      if (!suggestions.has(path)) {
        suggestions.set(path, {
          value: path,
          type: mapCustomAttributeTypeToSuggestionType(def.type),
          isDateTime: def.type === "DATE",
        });
      }
    }
  }

  const values = [...suggestions.values()];
  if (mode === "condition") {
    return values;
  }

  return values.filter((suggestion) => !isIdSuggestionPath(suggestion.value));
}
