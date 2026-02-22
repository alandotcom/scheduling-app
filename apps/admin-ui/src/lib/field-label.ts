const OPTIONAL_SUFFIX = " (optional)";
const REQUIRED_SUFFIX = " (required)";

export function stripFieldRequirementSuffix(label: string): string {
  if (label.endsWith(OPTIONAL_SUFFIX)) {
    return label.slice(0, -OPTIONAL_SUFFIX.length);
  }

  if (label.endsWith(REQUIRED_SUFFIX)) {
    return label.slice(0, -REQUIRED_SUFFIX.length);
  }

  return label;
}

export function formatFieldLabel(label: string, required: boolean): string {
  const baseLabel = stripFieldRequirementSuffix(label);
  return required ? `${baseLabel} *` : baseLabel;
}
