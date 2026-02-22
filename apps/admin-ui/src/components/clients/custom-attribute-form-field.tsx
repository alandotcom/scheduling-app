import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, type Control, useWatch } from "react-hook-form";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import {
  ClientRelationPickerModal,
  type RelatedClientOption,
} from "@/components/clients/client-relation-picker-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MultiSelectCombobox,
  type MultiSelectComboboxOption,
} from "@/components/ui/multi-select-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { orpc } from "@/lib/query";

interface CustomAttributeFormFieldProps {
  definition: CustomAttributeDefinitionResponse;
  clientOptions?: MultiSelectComboboxOption[];
  currentClientId?: string;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic form fields bypass strict typing
  control: Control<any>;
  disabled?: boolean;
}

interface RelationClientFieldProps {
  definition: CustomAttributeDefinitionResponse;
  fieldPath: `customAttributes.${string}`;
  errorId: string;
  label: string;
  fieldWrapperClass: string;
  currentClientId?: string;
  clientOptions?: MultiSelectComboboxOption[];
  // biome-ignore lint/suspicious/noExplicitAny: dynamic form fields bypass strict typing
  control: Control<any>;
  disabled: boolean;
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

function normalizeRelationFieldValue(
  value: unknown,
  mode: "single" | "multi",
): string[] {
  if (mode === "single") {
    if (typeof value === "string" && value.length > 0) {
      return [value];
    }
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

function formatClientLabel(client: RelatedClientOption): string {
  return `${client.firstName} ${client.lastName}`.trim();
}

function buildRelationSummary(
  relationMode: "single" | "multi",
  selectedIds: string[],
  selectedClientById: Record<string, RelatedClientOption>,
): string {
  if (relationMode === "single") {
    const selectedId = selectedIds[0];
    if (!selectedId) return "No client selected.";
    const client = selectedClientById[selectedId];
    return client ? formatClientLabel(client) : selectedId;
  }

  if (selectedIds.length === 0) {
    return "No clients selected.";
  }

  const previewNames = selectedIds
    .slice(0, 2)
    .map((clientId) => {
      const client = selectedClientById[clientId];
      return client ? formatClientLabel(client) : clientId;
    })
    .join(", ");

  return `${selectedIds.length} selected | ${previewNames}`;
}

function RelationClientField({
  definition,
  fieldPath,
  errorId,
  label,
  fieldWrapperClass,
  currentClientId,
  clientOptions,
  control,
  disabled,
}: RelationClientFieldProps) {
  const relationMode = definition.relationConfig?.valueMode ?? "single";
  const [pickerOpen, setPickerOpen] = useState(false);
  const watchedValue = useWatch({ control, name: fieldPath });
  const watchedSelectedIds = Array.from(
    new Set(normalizeRelationFieldValue(watchedValue, relationMode)),
  );

  const { data: selectedClients = [] } = useQuery({
    ...orpc.clients.getByIds.queryOptions({
      input: { ids: watchedSelectedIds },
    }),
    enabled: watchedSelectedIds.length > 0,
    retry: false,
  });

  const selectedClientById: Record<string, RelatedClientOption> = {};
  for (const option of clientOptions ?? []) {
    if (option.value === currentClientId) continue;
    selectedClientById[option.value] = {
      id: option.value,
      firstName: option.label,
      lastName: "",
      email: null,
      phone: null,
    };
  }
  for (const client of selectedClients) {
    if (client.id === currentClientId) continue;
    selectedClientById[client.id] = {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
    };
  }

  return (
    <div className={fieldWrapperClass}>
      <Label>{label}</Label>
      <Controller
        name={fieldPath}
        control={control}
        defaultValue={relationMode === "single" ? null : []}
        render={({ field, fieldState }) => {
          const selectedIds = normalizeRelationFieldValue(
            field.value,
            relationMode,
          );
          const summaryText = buildRelationSummary(
            relationMode,
            selectedIds,
            selectedClientById,
          );
          const totalSelected = selectedIds.length;

          return (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start text-left"
                onClick={() => setPickerOpen(true)}
                aria-describedby={fieldState.error ? errorId : undefined}
                aria-invalid={!!fieldState.error}
                disabled={disabled}
              >
                {relationMode === "single"
                  ? totalSelected > 0
                    ? "Change related client"
                    : "Choose related client"
                  : totalSelected > 0
                    ? `Manage related clients (${totalSelected})`
                    : "Choose related clients"}
              </Button>

              <div className="flex h-10 items-center rounded-md border border-border/60 px-3">
                <p className="truncate text-sm">{summaryText}</p>
              </div>

              <ClientRelationPickerModal
                open={pickerOpen}
                mode={relationMode}
                selectedIds={selectedIds}
                selectedClientById={selectedClientById}
                currentClientId={currentClientId}
                disabled={disabled}
                onOpenChange={setPickerOpen}
                onApply={(nextSelectedIds) => {
                  if (relationMode === "single") {
                    field.onChange(nextSelectedIds[0] ?? null);
                    return;
                  }
                  field.onChange(nextSelectedIds);
                }}
              />

              {fieldState.error ? (
                <p id={errorId} className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}

export function CustomAttributeFormField({
  definition,
  clientOptions,
  currentClientId,
  control,
  disabled = false,
}: CustomAttributeFormFieldProps) {
  const fieldPath = `customAttributes.${definition.fieldKey}` as const;
  const errorId = `ca-${definition.fieldKey}-error`;
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
            defaultValue={null}
            render={({ field, fieldState }) => (
              <>
                <Input
                  id={`ca-${definition.fieldKey}`}
                  type="text"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-describedby={fieldState.error ? errorId : undefined}
                  aria-invalid={!!fieldState.error}
                  disabled={disabled}
                />
                {fieldState.error ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </>
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
            defaultValue={null}
            render={({ field, fieldState }) => (
              <>
                <Input
                  id={`ca-${definition.fieldKey}`}
                  type="number"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val === "" ? null : Number(val));
                  }}
                  onBlur={field.onBlur}
                  aria-describedby={fieldState.error ? errorId : undefined}
                  aria-invalid={!!fieldState.error}
                  disabled={disabled}
                />
                {fieldState.error ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </>
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
            defaultValue={null}
            render={({ field, fieldState }) => {
              let dateValue = "";
              if (field.value && typeof field.value === "string") {
                dateValue = field.value.slice(0, 10);
              }
              return (
                <>
                  <Input
                    id={`ca-${definition.fieldKey}`}
                    type="date"
                    value={dateValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      field.onChange(val || null);
                    }}
                    onBlur={field.onBlur}
                    aria-describedby={fieldState.error ? errorId : undefined}
                    aria-invalid={!!fieldState.error}
                    disabled={disabled}
                  />
                  {fieldState.error ? (
                    <p id={errorId} className="text-sm text-destructive">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </>
              );
            }}
          />
        </div>
      );
    case "BOOLEAN":
      return (
        <div className={fieldWrapperClass}>
          <Label htmlFor={`ca-${definition.fieldKey}`}>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            defaultValue={null}
            render={({ field, fieldState }) => (
              <>
                <div className="flex items-center justify-end rounded-lg border border-border px-3 py-2.5">
                  <Switch
                    id={`ca-${definition.fieldKey}`}
                    checked={!!field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                    aria-describedby={fieldState.error ? errorId : undefined}
                    aria-invalid={!!fieldState.error}
                    disabled={disabled}
                  />
                </div>
                {fieldState.error ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </>
            )}
          />
        </div>
      );
    case "SELECT":
      return (
        <div className={fieldWrapperClass}>
          <Label>{label}</Label>
          <Controller
            name={fieldPath}
            control={control}
            defaultValue={null}
            render={({ field, fieldState }) => (
              <>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => field.onChange(value || null)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className="w-full min-w-0"
                    aria-describedby={fieldState.error ? errorId : undefined}
                    aria-invalid={!!fieldState.error}
                  >
                    <SelectValue placeholder="Select...">
                      {typeof field.value === "string"
                        ? field.value
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(definition.options ?? []).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.error ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </>
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
            defaultValue={[]}
            render={({ field, fieldState }) => (
              <>
                <MultiSelectCombobox
                  className="w-full"
                  options={comboboxOptions}
                  value={Array.isArray(field.value) ? field.value : []}
                  onChange={field.onChange}
                  placeholder="Select options..."
                  disabled={disabled}
                />
                {fieldState.error ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </>
            )}
          />
        </div>
      );
    }
    case "RELATION_CLIENT":
      return (
        <RelationClientField
          definition={definition}
          fieldPath={fieldPath}
          errorId={errorId}
          label={label}
          fieldWrapperClass={fieldWrapperClass}
          currentClientId={currentClientId}
          clientOptions={clientOptions}
          control={control}
          disabled={disabled}
        />
      );
  }
}
