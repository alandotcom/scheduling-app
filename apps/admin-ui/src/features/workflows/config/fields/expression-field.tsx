import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { formatFieldLabel } from "@/lib/field-label";
import { ExpressionInput } from "../expression-input";
import type { FieldComponentProps } from "./types";
import { useFieldRenderContext } from "./field-render-context";
import { getExpressionSuggestionsForField } from "./field-helpers";
import { validateWaitUntilValue } from "./wait-field-validation";
import { ConditionExpressionField } from "./condition";

function PlainExpressionField({
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
    if (field.key !== "waitUntil") {
      return null;
    }

    return validateWaitUntilValue(localValue, expressionSuggestions);
  }, [field.key, localValue, expressionSuggestions]);

  return (
    <div className="space-y-2">
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
      <ExpressionInput
        disabled={disabled}
        onBlur={() => {
          if (validationError) {
            return;
          }

          onUpdateConfig(field.key, localValue);
        }}
        onChange={(nextValue) => setLocalValue(nextValue)}
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

// The expression field owns the decision to render the condition builder: a
// condition node's `expression` key is configured through the dedicated
// condition subsystem rather than the plain expression input.
export function ExpressionField(props: FieldComponentProps) {
  if (
    props.field.key === "expression" &&
    typeof props.config.actionType === "string" &&
    props.config.actionType === "condition"
  ) {
    return <ConditionExpressionField {...props} />;
  }

  return <PlainExpressionField {...props} />;
}
