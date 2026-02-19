import { clientCustomAttributeValues } from "@scheduling/db/schema";
import type { CustomAttributeType } from "@scheduling/dto";

type NonSlotColumn = "id" | "orgId" | "clientId" | "createdAt" | "updatedAt";
export type SlotColumn = Exclude<
  keyof typeof clientCustomAttributeValues.$inferSelect,
  NonSlotColumn
>;

export type SlotPrefix = "t" | "n" | "d" | "b" | "j";

export const SLOT_PREFIX_BY_TYPE: Record<CustomAttributeType, SlotPrefix> = {
  TEXT: "t",
  SELECT: "t",
  NUMBER: "n",
  DATE: "d",
  BOOLEAN: "b",
  MULTI_SELECT: "j",
};

export const SLOT_COUNT_BY_PREFIX: Record<SlotPrefix, number> = {
  t: 10,
  n: 5,
  d: 3,
  b: 5,
  j: 2,
};

const VALID_SLOT_COLUMN_STRINGS = new Set<string>(
  Object.entries(SLOT_COUNT_BY_PREFIX).flatMap(([prefix, count]) =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}`),
  ),
);

// Compile-time safety: if a column is added to clientCustomAttributeValues
// without updating NonSlotColumn, SlotColumn expands and this check fails
// because the new member won't match the `${SlotPrefix}${number}` pattern.
type _AssertSlotShape = SlotColumn extends `${SlotPrefix}${number}`
  ? true
  : never;
const _exhaustiveCheck: _AssertSlotShape = true;
void _exhaustiveCheck;

export function isSlotColumn(value: string): value is SlotColumn {
  return VALID_SLOT_COLUMN_STRINGS.has(value);
}

export function isSlotPrefix(value: string): value is SlotPrefix {
  return value in SLOT_COUNT_BY_PREFIX;
}
