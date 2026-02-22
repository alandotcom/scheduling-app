import type { CustomAttributeType } from "@scheduling/dto";

export const CUSTOM_ATTRIBUTE_TYPE_LABELS: Readonly<
  Record<CustomAttributeType, string>
> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Boolean",
  SELECT: "Select",
  MULTI_SELECT: "Multi-Select",
  RELATION_CLIENT: "Client Relation",
};

export const CUSTOM_ATTRIBUTE_TYPE_OPTIONS: ReadonlyArray<{
  value: CustomAttributeType;
  label: string;
}> = [
  { value: "TEXT", label: CUSTOM_ATTRIBUTE_TYPE_LABELS.TEXT },
  { value: "NUMBER", label: CUSTOM_ATTRIBUTE_TYPE_LABELS.NUMBER },
  { value: "DATE", label: CUSTOM_ATTRIBUTE_TYPE_LABELS.DATE },
  { value: "BOOLEAN", label: CUSTOM_ATTRIBUTE_TYPE_LABELS.BOOLEAN },
  { value: "SELECT", label: CUSTOM_ATTRIBUTE_TYPE_LABELS.SELECT },
  {
    value: "MULTI_SELECT",
    label: CUSTOM_ATTRIBUTE_TYPE_LABELS.MULTI_SELECT,
  },
  {
    value: "RELATION_CLIENT",
    label: CUSTOM_ATTRIBUTE_TYPE_LABELS.RELATION_CLIENT,
  },
];

export function getCustomAttributeTypeLabel(type: CustomAttributeType): string {
  return CUSTOM_ATTRIBUTE_TYPE_LABELS[type];
}
