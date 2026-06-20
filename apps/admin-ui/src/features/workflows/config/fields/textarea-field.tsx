import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { formatFieldLabel } from "@/lib/field-label";
import { ExpressionInput } from "../expression-input";
import type { FieldComponentProps } from "./types";
import { useFieldRenderContext } from "./field-render-context";
import { getExpressionSuggestionsForField } from "./field-helpers";

export function TextareaField({
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

  return (
    <div className="space-y-2">
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
      <ExpressionInput
        disabled={disabled}
        multiline
        onChange={(nextValue) => setLocalValue(nextValue)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        rows={field.rows}
        suggestions={scopedSuggestions}
        value={localValue}
      />
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}
