import type { ReactElement } from "react";
import type { ActionConfigFieldBase } from "../../action-registry";

// The field contract: everything a single field type needs to render and commit
// one config key. Ambient dependencies (suggestions, filter options, timezone)
// are read from the field render context, not passed here.
export interface FieldComponentProps {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
}

export type FieldComponent = (
  props: FieldComponentProps,
) => ReactElement | null;
