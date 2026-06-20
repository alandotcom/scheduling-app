import type { ActionConfigField } from "../../action-registry";
import { isFieldGroup } from "../../action-registry";
import type { EventAttributeSuggestion } from "../event-attribute-suggestions";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectFieldDefaults(
  fields: ActionConfigField[],
): Record<string, string> {
  const defaults: Record<string, string> = {};

  for (const field of fields) {
    if (isFieldGroup(field)) {
      const nestedDefaults = collectFieldDefaults(field.fields);
      for (const [key, value] of Object.entries(nestedDefaults)) {
        defaults[key] = value;
      }
      continue;
    }

    if (typeof field.defaultValue === "string") {
      defaults[field.key] = field.defaultValue;
    }
  }

  return defaults;
}

export function serializeConfigValueForKey(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "unserializable";
  }
}

function normalizeAttributeReference(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

export function extractAttributeReferences(value: string): string[] {
  const pattern = /@?[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g;
  return Array.from(value.matchAll(pattern), (match) =>
    normalizeAttributeReference(match[0]),
  );
}

export function getExpressionSuggestionsForField(
  fieldKey: string,
  suggestions: EventAttributeSuggestion[],
): EventAttributeSuggestion[] {
  if (fieldKey === "waitUntil") {
    return suggestions.filter((suggestion) => suggestion.isDateTime);
  }

  if (fieldKey === "waitDuration" || fieldKey === "waitOffset") {
    return [];
  }

  if (
    fieldKey === "waitAllowedStartTime" ||
    fieldKey === "waitAllowedEndTime"
  ) {
    return [];
  }

  return suggestions;
}
