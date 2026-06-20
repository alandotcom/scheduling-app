import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFieldLabel } from "@/lib/field-label";
import type { FieldComponentProps } from "./types";

export function NumberField({
  field,
  config,
  onUpdateConfig,
  disabled,
}: FieldComponentProps) {
  const configValue =
    config[field.key] != null
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);
  const [prevConfigValue, setPrevConfigValue] = useState(configValue);
  if (configValue !== prevConfigValue) {
    setPrevConfigValue(configValue);
    setLocalValue(configValue);
  }

  return (
    <div className="space-y-2">
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
      <Input
        disabled={disabled}
        min={field.min}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        type="number"
        value={localValue}
      />
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}
