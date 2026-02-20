import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface MultiSelectComboboxOption {
  label: string;
  value: string;
}

interface MultiSelectComboboxProps {
  ariaLabel?: string;
  className?: string;
  id?: string;
  options: readonly MultiSelectComboboxOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function normalizeSelectedValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

export function MultiSelectCombobox({
  ariaLabel,
  className,
  id,
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
}: MultiSelectComboboxProps) {
  const optionByValue = new Map(
    options.map((option) => [option.value, option.label]),
  );

  return (
    <Select<string, true>
      multiple
      value={value}
      onValueChange={(nextValue) => {
        onChange(normalizeSelectedValues(nextValue));
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel ?? placeholder}
        className={cn("w-full min-w-0", className)}
      >
        <SelectValue placeholder={placeholder}>
          {(selectedValue: unknown) => {
            const selectedValues = normalizeSelectedValues(selectedValue);
            if (selectedValues.length === 0) {
              return placeholder;
            }

            const labels = selectedValues.map((selected) => {
              return optionByValue.get(selected) ?? selected;
            });

            if (labels.length <= 2) {
              return labels.join(", ");
            }

            return `${labels.length} selected`;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
