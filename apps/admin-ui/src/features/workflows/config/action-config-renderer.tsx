import type { EventAttributeSuggestion } from "./event-attribute-suggestions";
import type {
  WorkflowFilterFieldOption,
  WorkflowFilterValueOption,
} from "../filter-builder-shared";
import type { ActionConfigField } from "../action-registry";
import { isFieldGroup } from "../action-registry";
import { FieldRenderProvider } from "./fields/field-render-context";
import { FieldRenderer } from "./fields/field-renderer";
import { collectFieldDefaults } from "./fields/field-helpers";

interface ActionConfigRendererProps {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  configScopeKey: string;
  disabled?: boolean;
  expressionSuggestions?: EventAttributeSuggestion[];
  fieldOptions?: WorkflowFilterFieldOption[];
  selectOptionsByKey?: Record<string, Array<{ value: string; label: string }>>;
  conditionValueOptionsByField?: Record<string, WorkflowFilterValueOption[]>;
  defaultTimezone?: string;
}

const EMPTY_EXPRESSION_SUGGESTIONS: EventAttributeSuggestion[] = [];
const EMPTY_SELECT_OPTIONS_BY_KEY: Record<
  string,
  Array<{ value: string; label: string }>
> = {};
const EMPTY_CONDITION_VALUE_OPTIONS_BY_FIELD: Record<
  string,
  WorkflowFilterValueOption[]
> = {};

export function ActionConfigRenderer({
  fields,
  config,
  onUpdateConfig,
  onUpdateConfigBatch,
  configScopeKey,
  disabled,
  expressionSuggestions = EMPTY_EXPRESSION_SUGGESTIONS,
  fieldOptions,
  selectOptionsByKey = EMPTY_SELECT_OPTIONS_BY_KEY,
  conditionValueOptionsByField = EMPTY_CONDITION_VALUE_OPTIONS_BY_FIELD,
  defaultTimezone = "America/New_York",
}: ActionConfigRendererProps) {
  const fieldDefaults = collectFieldDefaults(fields);

  return (
    <FieldRenderProvider
      value={{
        expressionSuggestions,
        fieldOptions,
        selectOptionsByKey,
        conditionValueOptionsByField,
        defaultTimezone,
        configScopeKey,
        fieldDefaults,
      }}
    >
      <div className="space-y-3">
        {fields.map((field) => (
          <FieldRenderer
            key={`${configScopeKey}:${isFieldGroup(field) ? field.label : field.key}`}
            field={field}
            config={config}
            onUpdateConfig={onUpdateConfig}
            onUpdateConfigBatch={onUpdateConfigBatch}
            disabled={disabled}
          />
        ))}
      </div>
    </FieldRenderProvider>
  );
}
