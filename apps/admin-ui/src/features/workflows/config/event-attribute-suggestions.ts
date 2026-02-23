import {
  domainEventDataSchemaByType,
  domainEventTypesByDomain,
  type DomainEventDomain,
  type DomainEventType,
} from "@scheduling/dto";
import { z } from "zod";

export type EventAttributeSuggestion = {
  value: string;
  label: string;
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

function humanizeSegment(segment: string): string {
  const normalized = segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!normalized) {
    return segment;
  }

  return normalized
    .split(/\s+/)
    .map((part) =>
      /^[A-Z0-9]+$/.test(part)
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

function toSuggestionLabel(
  path: string,
  options?: {
    domainRoot?: string;
    dropCustomAttributes?: boolean;
    dropDomainRoot?: boolean;
  },
): string {
  const segments = path.split(".").filter((segment) => segment.length > 0);
  const labelSegments: string[] = [];
  let previousSegment: string | null = null;

  for (const [index, segment] of segments.entries()) {
    if (options?.dropDomainRoot && index === 0) {
      continue;
    }
    if (index === 1 && segment === "data") {
      continue;
    }
    if (options?.dropCustomAttributes && segment === "customAttributes") {
      continue;
    }

    const humanizedSegment = humanizeSegment(segment);
    if (
      options?.dropDomainRoot &&
      options.domainRoot &&
      labelSegments.length === 0 &&
      humanizedSegment.toLowerCase() === options.domainRoot.toLowerCase()
    ) {
      continue;
    }
    if (
      previousSegment &&
      previousSegment.toLowerCase() === humanizedSegment.toLowerCase()
    ) {
      continue;
    }

    labelSegments.push(humanizedSegment);
    previousSegment = humanizedSegment;
  }

  const label = labelSegments.join(" ").trim();
  if (label.length > 0) {
    return label;
  }

  const fallbackSegment = segments.at(-1);
  return fallbackSegment ? humanizeSegment(fallbackSegment) : path;
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
  labelOptions?: {
    domainRoot?: string;
    dropDomainRoot?: boolean;
  },
) {
  const resolved = resolveNullableSchema(schema);

  if (!output.has(prefix)) {
    const type = schemaType(resolved);
    const format = schemaFormat(resolved);
    output.set(prefix, {
      value: prefix,
      label: toSuggestionLabel(prefix, labelOptions),
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

    collectPaths(value, `${prefix}.${key}`, output, labelOptions);
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
  label?: string;
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
  const labelOptions =
    mode === "general"
      ? {
          domainRoot: root,
          dropDomainRoot: true,
        }
      : undefined;
  const suggestions = new Map<string, EventAttributeSuggestion>();

  suggestions.set(`${root}.event`, {
    value: `${root}.event`,
    label: toSuggestionLabel(`${root}.event`, labelOptions),
    type: "string",
    isDateTime: false,
  });
  suggestions.set(`${root}.timestamp`, {
    value: `${root}.timestamp`,
    label: toSuggestionLabel(`${root}.timestamp`, labelOptions),
    type: "string",
    isDateTime: true,
  });
  suggestions.set(`${root}.data`, {
    value: `${root}.data`,
    label: toSuggestionLabel(`${root}.data`, labelOptions),
    type: "object",
    isDateTime: false,
  });

  for (const eventType of eventTypes) {
    const jsonSchema = z.toJSONSchema(domainEventDataSchemaByType[eventType]);
    collectPaths(
      jsonSchema as JsonSchema,
      `${root}.data`,
      suggestions,
      labelOptions,
    );
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
      const label =
        typeof def.label === "string" && def.label.trim().length > 0
          ? def.label.trim()
          : toSuggestionLabel(path, {
              ...labelOptions,
              dropCustomAttributes: true,
            });
      const existingSuggestion = suggestions.get(path);
      const nextSuggestion: EventAttributeSuggestion = {
        value: path,
        label,
        type: mapCustomAttributeTypeToSuggestionType(def.type),
        isDateTime: def.type === "DATE" || def.type === "DATE_TIME",
      };

      if (existingSuggestion) {
        suggestions.set(path, {
          ...existingSuggestion,
          ...nextSuggestion,
        });
        continue;
      }

      suggestions.set(path, nextSuggestion);
    }
  }

  const values = [...suggestions.values()];
  if (mode === "condition") {
    return values;
  }

  return values.filter((suggestion) => !isIdSuggestionPath(suggestion.value));
}
