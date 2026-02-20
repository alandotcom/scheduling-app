import { Controller, type Control } from "react-hook-form";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MultiSelectCombobox,
  type MultiSelectComboboxOption,
} from "@/components/ui/multi-select-combobox";

interface CustomAttributeFormFieldProps {
  definition: CustomAttributeDefinitionResponse;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic form fields bypass strict typing
  control: Control<any>;
  disabled?: boolean;
}

export function CustomAttributeFormField({
  definition,
  control,
  disabled = false,
}: CustomAttributeFormFieldProps) {
  const fieldPath = `customAttributes.${definition.fieldKey}` as const;
  const label = `${definition.label}${definition.required ? "" : " (optional)"}`;

  switch (definition.type) {
    case "TEXT":
      return (
        <div className="space-y-2">
          <Label htmlFor={`ca-${definition.fieldKey}`}>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => (
              <Input
                id={`ca-${definition.fieldKey}`}
                type="text"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={disabled}
              />
            )}
          />
        </div>
      );
    case "NUMBER":
      return (
        <div className="space-y-2">
          <Label htmlFor={`ca-${definition.fieldKey}`}>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => (
              <Input
                id={`ca-${definition.fieldKey}`}
                type="number"
                value={field.value ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? null : Number(val));
                }}
                onBlur={field.onBlur}
                disabled={disabled}
              />
            )}
          />
        </div>
      );
    case "DATE":
      return (
        <div className="space-y-2">
          <Label htmlFor={`ca-${definition.fieldKey}`}>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => {
              let dateValue = "";
              if (field.value && typeof field.value === "string") {
                dateValue = field.value.slice(0, 10);
              }
              return (
                <Input
                  id={`ca-${definition.fieldKey}`}
                  type="date"
                  value={dateValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val || null);
                  }}
                  onBlur={field.onBlur}
                  disabled={disabled}
                />
              );
            }}
          />
        </div>
      );
    case "BOOLEAN":
      return (
        <div className="space-y-2">
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => (
              <Checkbox
                checked={!!field.value}
                onChange={(checked) => field.onChange(!!checked)}
                label={label}
                disabled={disabled}
              />
            )}
          />
        </div>
      );
    case "SELECT":
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onValueChange={(value) => field.onChange(value || null)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {(definition.options ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      );
    case "MULTI_SELECT": {
      const comboboxOptions: MultiSelectComboboxOption[] = (
        definition.options ?? []
      ).map((opt) => ({ label: opt, value: opt }));
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => (
              <MultiSelectCombobox
                options={comboboxOptions}
                value={Array.isArray(field.value) ? field.value : []}
                onChange={field.onChange}
                placeholder="Select options..."
                disabled={disabled}
              />
            )}
          />
        </div>
      );
    }
  }
}
