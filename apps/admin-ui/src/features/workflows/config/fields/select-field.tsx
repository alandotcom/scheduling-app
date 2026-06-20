import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatFieldLabel } from "@/lib/field-label";
import type { FieldComponentProps } from "./types";
import { useFieldRenderContext } from "./field-render-context";

function formatFallbackSelectLabel(value: string): string {
  const parts = value
    .trim()
    .split(/[_-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return value;
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SelectField({
  field,
  config,
  onUpdateConfig,
  disabled,
}: FieldComponentProps) {
  const { selectOptionsByKey } = useFieldRenderContext();
  const currentValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");

  const options =
    field.options && field.options.length > 0
      ? field.options
      : (selectOptionsByKey[field.key] ?? []);
  const optionsWithCurrent =
    currentValue.length > 0 &&
    !options.some((option) => option.value === currentValue)
      ? [
          {
            value: currentValue,
            label: formatFallbackSelectLabel(currentValue),
          },
          ...options,
        ]
      : options;
  const selectedOptionLabel = optionsWithCurrent.find(
    (option) => option.value === currentValue,
  )?.label;

  return (
    <div className="space-y-2">
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
      <Select
        disabled={disabled}
        value={currentValue}
        onValueChange={(val) => onUpdateConfig(field.key, val)}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder={field.placeholder ?? "Select..."}>
            {selectedOptionLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {optionsWithCurrent.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}
