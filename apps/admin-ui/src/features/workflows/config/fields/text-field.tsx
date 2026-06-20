import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { formatFieldLabel } from "@/lib/field-label";
import { ExpressionInput } from "../expression-input";
import type { FieldComponentProps } from "./types";
import { useFieldRenderContext } from "./field-render-context";
import { getExpressionSuggestionsForField } from "./field-helpers";
import {
  validateWaitAllowedTimeValue,
  validateWaitTimezoneValue,
} from "./wait-field-validation";

export function TextField({
  field,
  config,
  onUpdateConfig,
  disabled,
}: FieldComponentProps) {
  const { expressionSuggestions } = useFieldRenderContext();
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);
  const [prevConfigValue, setPrevConfigValue] = useState(configValue);
  if (configValue !== prevConfigValue) {
    setPrevConfigValue(configValue);
    setLocalValue(configValue);
  }
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, expressionSuggestions),
    [field.key, expressionSuggestions],
  );
  const validationError = useMemo(() => {
    const waitAllowedError = validateWaitAllowedTimeValue({
      fieldKey: field.key,
      value: localValue,
      config,
    });
    if (waitAllowedError) {
      return waitAllowedError;
    }

    return validateWaitTimezoneValue({
      fieldKey: field.key,
      value: localValue,
    });
  }, [field.key, localValue, config]);

  return (
    <div className="space-y-2">
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
      <ExpressionInput
        disabled={disabled}
        onChange={(nextValue) => setLocalValue(nextValue)}
        onBlur={() => {
          if (validationError) {
            return;
          }
          onUpdateConfig(field.key, localValue);
        }}
        placeholder={field.placeholder}
        suggestions={scopedSuggestions}
        value={localValue}
      />
      {validationError ? (
        <p className="text-destructive text-xs">{validationError}</p>
      ) : null}
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}
