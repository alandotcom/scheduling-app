import { Controller, type Control } from "react-hook-form";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

function getFieldWrapperClass(
  type: CustomAttributeDefinitionResponse["type"],
): string {
  switch (type) {
    case "TEXT":
      return "space-y-2.5 sm:col-span-2";
    default:
      return "space-y-2.5";
  }
}

export function CustomAttributeFormField({
  definition,
  control,
  disabled = false,
}: CustomAttributeFormFieldProps) {
  const fieldPath = `customAttributes.${definition.fieldKey}` as const;
  const label = `${definition.label}${definition.required ? "" : " (optional)"}`;
  const fieldWrapperClass = getFieldWrapperClass(definition.type);

  switch (definition.type) {
    case "TEXT":
      return (
        <div className={fieldWrapperClass}>
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
        <div className={fieldWrapperClass}>
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
        <div className={fieldWrapperClass}>
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
        <div className={fieldWrapperClass}>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <Label htmlFor={`ca-${definition.fieldKey}`} className="text-sm">
              {label}
            </Label>
            <Controller
              name={fieldPath}
              control={control}
              render={({ field }) => (
                <Switch
                  id={`ca-${definition.fieldKey}`}
                  checked={!!field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                  disabled={disabled}
                />
              )}
            />
          </div>
        </div>
      );
    case "SELECT":
      return (
        <div className={fieldWrapperClass}>
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
                <SelectTrigger className="w-full min-w-0">
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
        <div className={fieldWrapperClass}>
          <Label>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            render={({ field }) => (
              <MultiSelectCombobox
                className="w-full"
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
