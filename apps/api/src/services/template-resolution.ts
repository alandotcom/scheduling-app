import { isRecord } from "../lib/type-guards.js";

const TOKEN_PATTERN = /(^|[^A-Za-z0-9_.])@([A-Za-z][A-Za-z0-9_.]*)/g;

export function getTemplatePathValue(root: unknown, path: string): unknown {
  if (path.length === 0) {
    return root;
  }

  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return null;
    }

    current = current[segment];
  }

  return current;
}

export function resolveReference(
  token: string,
  context: Record<string, unknown>,
): unknown {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const tokenWithoutPrefix = trimmed.startsWith("@")
    ? trimmed.slice(1)
    : trimmed;

  if (tokenWithoutPrefix.length === 0) {
    return null;
  }

  const appointmentDataMatch = /^appointment\.data\.(.+)$/i.exec(
    tokenWithoutPrefix,
  );
  const appointmentMatch = /^appointment\.(.+)$/i.exec(tokenWithoutPrefix);
  const dataMatch = /^data\.(.+)$/i.exec(tokenWithoutPrefix);
  const clientMatch = /^client\.(.+)$/i.exec(tokenWithoutPrefix);

  if (appointmentDataMatch?.[1]) {
    return (
      getTemplatePathValue(
        context["Appointment"],
        `data.${appointmentDataMatch[1]}`,
      ) ??
      getTemplatePathValue(
        context["appointment"],
        `data.${appointmentDataMatch[1]}`,
      )
    );
  }

  if (appointmentMatch?.[1]) {
    return (
      getTemplatePathValue(context["appointment"], appointmentMatch[1]) ??
      getTemplatePathValue(context["Appointment"], appointmentMatch[1])
    );
  }

  if (dataMatch?.[1]) {
    return getTemplatePathValue(context["data"], dataMatch[1]);
  }

  if (clientMatch?.[1]) {
    return getTemplatePathValue(context["client"], clientMatch[1]);
  }

  const [root, ...rest] = tokenWithoutPrefix.split(".");
  if (!root) {
    return null;
  }
  const rootValue = context[root];
  if (rest.length === 0) {
    return rootValue ?? null;
  }

  return getTemplatePathValue(rootValue, rest.join("."));
}

export function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return "";
}

export function resolveTemplateString(
  value: unknown,
  context: Record<string, unknown>,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("@") && !trimmed.includes(" ")) {
    const resolved = resolveReference(trimmed, context);
    const normalized = stringifyTemplateValue(resolved).trim();
    return normalized.length > 0 ? normalized : null;
  }

  const interpolated = trimmed.replaceAll(
    TOKEN_PATTERN,
    (_match, prefix: string, tokenPath: string) => {
      const resolved = resolveReference(tokenPath, context);
      return `${prefix}${stringifyTemplateValue(resolved)}`;
    },
  );

  const normalized = interpolated.trim();
  return normalized.length > 0 ? normalized : null;
}
