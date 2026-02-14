/**
 * Template variable processor for workflow action inputs.
 *
 * Template pattern: `{{@nodeId:Label.field}}`
 *
 * - `nodeId` is sanitized (non-alphanumeric → "_") for lookup in outputs map
 * - `Label` is the human-readable display name (ignored at runtime)
 * - `field` is the dot-separated path into the node's output data
 *
 * Standardized outputs with shape `{ success, data, error }` are auto-unwrapped:
 * accessing `firstName` resolves to `data.firstName` unless the field is literally
 * `success`, `data`, or `error`.
 */

export type NodeOutputs = Record<string, { label: string; data: unknown }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveFieldPath(data: unknown, fields: string[]): unknown {
  let current: unknown = data;

  for (const field of fields) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[field];
  }

  return current;
}

function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return `${value}`;
  }
  if (typeof value === "symbol") {
    return value.description ?? "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return "";
}

const TEMPLATE_PATTERN = /\{\{@([^:]+):([^}]+)\}\}/g;

function processTemplateString(value: string, outputs: NodeOutputs): string {
  return value.replace(
    TEMPLATE_PATTERN,
    (match, nodeId: string, rest: string) => {
      const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
      const output = outputs[sanitizedNodeId];
      if (!output) {
        return match;
      }

      const dotIndex = rest.indexOf(".");
      if (dotIndex === -1) {
        return valueToString(output.data);
      }

      if (output.data === null || output.data === undefined) {
        return "";
      }

      const fieldPath = rest.substring(dotIndex + 1);
      const fields = fieldPath.split(".");

      let data: unknown = output.data;

      // Auto-unwrap standardized { success, data, error } outputs
      if (
        isRecord(data) &&
        "success" in data &&
        "data" in data &&
        fields[0] !== "success" &&
        fields[0] !== "data" &&
        fields[0] !== "error"
      ) {
        data = data["data"];
      }

      const resolved = resolveFieldPath(data, fields);
      return valueToString(resolved);
    },
  );
}

export function processTemplates(
  config: Record<string, unknown>,
  outputs: NodeOutputs,
): Record<string, unknown> {
  const processed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      processed[key] = processTemplateString(value, outputs);
    } else {
      processed[key] = value;
    }
  }

  return processed;
}
