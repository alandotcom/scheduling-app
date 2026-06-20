import type {
  ActionConfigField,
  ActionConfigFieldBase,
} from "../../action-registry";
import { isFieldGroup } from "../../action-registry";
import type { FieldComponent } from "./types";
import { useFieldRenderContext } from "./field-render-context";
import { TextField } from "./text-field";
import { TextareaField } from "./textarea-field";
import { NumberField } from "./number-field";
import { SelectField } from "./select-field";
import { ExpressionField } from "./expression-field";
import { KeyValueListField } from "./key-value-list-field";
import { GroupField } from "./group-field";

const FIELD_COMPONENTS: Record<ActionConfigFieldBase["type"], FieldComponent> =
  {
    text: TextField,
    textarea: TextareaField,
    number: NumberField,
    select: SelectField,
    expression: ExpressionField,
    key_value_list: KeyValueListField,
  };

// The only module that knows the set of field types. It evaluates showWhen,
// recurses into groups, and maps a field type to its self-contained component.
export function FieldRenderer({
  field,
  config,
  onUpdateConfig,
  onUpdateConfigBatch,
  disabled,
}: {
  field: ActionConfigField;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const { fieldDefaults } = useFieldRenderContext();

  if (isFieldGroup(field)) {
    return (
      <GroupField
        group={field}
        config={config}
        onUpdateConfig={onUpdateConfig}
        onUpdateConfigBatch={onUpdateConfigBatch}
        disabled={disabled}
      />
    );
  }

  if (field.showWhen) {
    const raw = config[field.showWhen.field];
    const val =
      typeof raw === "string"
        ? raw
        : (fieldDefaults[field.showWhen.field] ?? "");
    if (val !== field.showWhen.equals) return null;
  }

  const Component = FIELD_COMPONENTS[field.type];
  return (
    <Component
      field={field}
      config={config}
      onUpdateConfig={onUpdateConfig}
      onUpdateConfigBatch={onUpdateConfigBatch}
      disabled={disabled}
    />
  );
}
