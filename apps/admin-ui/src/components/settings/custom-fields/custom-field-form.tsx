import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import {
  customAttributeTypeSchema,
  customAttributeRelationValueModeSchema,
  type CustomAttributeRelationValueMode,
  type CustomAttributeType,
  type SlotUsage,
} from "@scheduling/dto";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
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
  CUSTOM_ATTRIBUTE_TYPE_OPTIONS,
  getCustomAttributeTypeLabel,
} from "@/lib/custom-attribute-type-label";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

const SLOT_PREFIX_BY_TYPE: Record<
  Exclude<CustomAttributeType, "RELATION_CLIENT">,
  keyof SlotUsage
> = {
  TEXT: "t",
  SELECT: "t",
  NUMBER: "n",
  DATE: "d",
  BOOLEAN: "b",
  MULTI_SELECT: "j",
};

const RELATION_VALUE_MODE_OPTIONS: ReadonlyArray<{
  value: CustomAttributeRelationValueMode;
  label: string;
}> = [
  { value: "single", label: "Single client" },
  { value: "multi", label: "Multiple clients" },
];

export function getRelationValueModeLabel(
  value: string | null | undefined,
): string | undefined {
  return resolveSelectValueLabel({
    value,
    options: RELATION_VALUE_MODE_OPTIONS,
    getOptionValue: (option) => option.value,
    getOptionLabel: (option) => option.label,
    unknownLabel: "Unknown selection",
  });
}

function labelToFieldKey(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");
  return key || "field";
}

const createFormSchema = z
  .object({
    fieldKey: z
      .string()
      .min(1, "Field key is required")
      .max(100, "Field key is too long")
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        "Must start with a letter and contain only letters, numbers, and underscores",
      ),
    label: z.string().min(1, "Label is required").max(255, "Label is too long"),
    type: customAttributeTypeSchema,
    required: z.boolean(),
    options: z.array(z.object({ value: z.string().min(1).max(255) })),
    relationValueMode: customAttributeRelationValueModeSchema,
    createReverseRelation: z.boolean(),
    reverseFieldKey: z.string().max(100, "Field key is too long"),
    reverseLabel: z.string().max(255, "Label is too long"),
    reverseValueMode: customAttributeRelationValueModeSchema,
    reverseRequired: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "RELATION_CLIENT" && value.createReverseRelation) {
      if (!value.reverseLabel || value.reverseLabel.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Label is required",
          path: ["reverseLabel"],
        });
      }

      if (!value.reverseFieldKey || value.reverseFieldKey.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Field key is required",
          path: ["reverseFieldKey"],
        });
      } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value.reverseFieldKey)) {
        ctx.addIssue({
          code: "custom",
          message:
            "Must start with a letter and contain only letters, numbers, and underscores",
          path: ["reverseFieldKey"],
        });
      }

      if (value.reverseFieldKey === value.fieldKey) {
        ctx.addIssue({
          code: "custom",
          message: "Reverse field key must differ from primary field key",
          path: ["reverseFieldKey"],
        });
      }
    }
  });

type CreateFormValues = z.infer<typeof createFormSchema>;

const editFormSchema = z.object({
  label: z.string().min(1, "Label is required").max(255, "Label is too long"),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1).max(255) })),
});

type EditFormValues = z.infer<typeof editFormSchema>;

interface CustomFieldFormProps {
  mode: "create" | "edit";
  defaultValues?: {
    fieldKey?: string;
    label?: string;
    type?: CustomAttributeType;
    required?: boolean;
    options?: string[] | null;
    relationConfig?: {
      targetEntity: "CLIENT";
      valueMode: CustomAttributeRelationValueMode;
      pairedDefinitionId: string | null;
      pairedRole: "forward" | "reverse" | null;
    } | null;
  };
  slotUsage: SlotUsage | undefined;
  onSubmit: (data: {
    fieldKey?: string;
    label: string;
    type?: CustomAttributeType;
    required: boolean;
    options?: string[];
    relationConfig?: {
      targetEntity?: "CLIENT";
      valueMode: CustomAttributeRelationValueMode;
    };
    reverseRelation?: {
      fieldKey: string;
      label: string;
      valueMode: CustomAttributeRelationValueMode;
      required?: boolean;
    };
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function CustomFieldForm({
  mode,
  defaultValues,
  slotUsage,
  onSubmit,
  onCancel,
  isSubmitting,
}: CustomFieldFormProps) {
  if (mode === "create") {
    return (
      <CreateFieldForm
        slotUsage={slotUsage}
        onSubmit={onSubmit}
        onCancel={onCancel}
        isSubmitting={isSubmitting}
      />
    );
  }

  return (
    <EditFieldForm
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

function CreateFieldForm({
  slotUsage,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  slotUsage: SlotUsage | undefined;
  onSubmit: CustomFieldFormProps["onSubmit"];
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      fieldKey: "",
      label: "",
      type: "TEXT",
      required: false,
      options: [],
      relationValueMode: "single",
      createReverseRelation: false,
      reverseFieldKey: "",
      reverseLabel: "",
      reverseValueMode: "multi",
      reverseRequired: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });

  const watchedLabel = watch("label");
  const watchedType = watch("type");
  const relationValueMode = watch("relationValueMode");
  const watchedRelationCreateReverse = watch("createReverseRelation");
  const watchedReverseLabel = watch("reverseLabel");
  const reverseValueMode = watch("reverseValueMode");
  const [fieldKeyTouched, setFieldKeyTouched] = useState(false);
  const [reverseFieldKeyTouched, setReverseFieldKeyTouched] = useState(false);

  useEffect(() => {
    if (!fieldKeyTouched && watchedLabel) {
      setValue("fieldKey", labelToFieldKey(watchedLabel));
    }
  }, [watchedLabel, fieldKeyTouched, setValue]);

  useEffect(() => {
    if (!reverseFieldKeyTouched && watchedReverseLabel) {
      setValue("reverseFieldKey", labelToFieldKey(watchedReverseLabel));
    }
  }, [watchedReverseLabel, reverseFieldKeyTouched, setValue]);

  const showOptions =
    watchedType === "SELECT" || watchedType === "MULTI_SELECT";
  const isRelationType = watchedType === "RELATION_CLIENT";

  const slotWarning = useMemo(() => {
    if (!slotUsage || !watchedType || watchedType === "RELATION_CLIENT") {
      return null;
    }

    const prefix = SLOT_PREFIX_BY_TYPE[watchedType];
    const bucket = slotUsage[prefix];

    if (bucket.used >= bucket.total) {
      return `No available slots for ${getCustomAttributeTypeLabel(watchedType)} type. Maximum ${bucket.total} reached.`;
    }

    return null;
  }, [slotUsage, watchedType]);

  const relationValueModeLabel = getRelationValueModeLabel(relationValueMode);
  const reverseValueModeLabel = getRelationValueModeLabel(reverseValueMode);

  const handleFormSubmit = (data: CreateFormValues) => {
    onSubmit({
      fieldKey: data.fieldKey,
      label: data.label,
      type: data.type,
      required: data.required,
      options: showOptions
        ? data.options.map((option) => option.value)
        : undefined,
      relationConfig: isRelationType
        ? {
            targetEntity: "CLIENT",
            valueMode: data.relationValueMode,
          }
        : undefined,
      reverseRelation:
        isRelationType && data.createReverseRelation
          ? {
              fieldKey: data.reverseFieldKey,
              label: data.reverseLabel,
              valueMode: data.reverseValueMode,
              required: data.reverseRequired,
            }
          : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cf-label">Label *</Label>
        <Input
          id="cf-label"
          placeholder="e.g. Insurance Provider"
          disabled={isSubmitting}
          {...register("label")}
        />
        {errors.label ? (
          <p className="text-xs text-destructive">{errors.label.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cf-field-key">Field Key *</Label>
        <Input
          id="cf-field-key"
          placeholder="e.g. insurance_provider"
          className="font-mono text-sm"
          disabled={isSubmitting}
          {...register("fieldKey", {
            onChange: () => setFieldKeyTouched(true),
          })}
        />
        {errors.fieldKey ? (
          <p className="text-xs text-destructive">{errors.fieldKey.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type *</Label>
          <Select
            value={watchedType}
            onValueChange={(value) => {
              const parsed = customAttributeTypeSchema.safeParse(value);
              if (parsed.success) {
                setValue("type", parsed.data);
              }
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue>
                {getCustomAttributeTypeLabel(watchedType)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_ATTRIBUTE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end pb-1">
          <Checkbox
            checked={watch("required")}
            onChange={(checked) => setValue("required", !!checked)}
            label="Required"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {isRelationType ? (
        <div className="space-y-4 rounded-md border border-border p-3">
          <div className="space-y-2">
            <Label>Relation Value Mode *</Label>
            <Select
              value={relationValueMode}
              onValueChange={(value) => {
                const parsed =
                  customAttributeRelationValueModeSchema.safeParse(value);
                if (parsed.success) {
                  setValue("relationValueMode", parsed.data);
                }
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue>{relationValueModeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RELATION_VALUE_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Checkbox
            checked={watchedRelationCreateReverse}
            onChange={(checked) => setValue("createReverseRelation", !!checked)}
            label="Create reverse field"
            disabled={isSubmitting}
          />

          {watchedRelationCreateReverse ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-2">
                <Label htmlFor="cf-reverse-label">Reverse Label *</Label>
                <Input
                  id="cf-reverse-label"
                  placeholder="e.g. Referrals"
                  disabled={isSubmitting}
                  {...register("reverseLabel")}
                />
                {errors.reverseLabel ? (
                  <p className="text-xs text-destructive">
                    {errors.reverseLabel.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cf-reverse-field-key">
                  Reverse Field Key *
                </Label>
                <Input
                  id="cf-reverse-field-key"
                  placeholder="e.g. referrals"
                  className="font-mono text-sm"
                  disabled={isSubmitting}
                  {...register("reverseFieldKey", {
                    onChange: () => setReverseFieldKeyTouched(true),
                  })}
                />
                {errors.reverseFieldKey ? (
                  <p className="text-xs text-destructive">
                    {errors.reverseFieldKey.message}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Reverse Value Mode *</Label>
                  <Select
                    value={reverseValueMode}
                    onValueChange={(value) => {
                      const parsed =
                        customAttributeRelationValueModeSchema.safeParse(value);
                      if (parsed.success) {
                        setValue("reverseValueMode", parsed.data);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue>{reverseValueModeLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {RELATION_VALUE_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end pb-1">
                  <Checkbox
                    checked={watch("reverseRequired")}
                    onChange={(checked) =>
                      setValue("reverseRequired", !!checked)
                    }
                    label="Required"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {slotWarning ? (
        <p className="text-sm text-destructive">{slotWarning}</p>
      ) : null}

      {showOptions ? (
        <div className="space-y-2">
          <Label>Options</Label>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  disabled={isSubmitting}
                  {...register(`options.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={isSubmitting}
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Icon icon={Delete01Icon} className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ value: "" })}
            disabled={isSubmitting}
          >
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add option
          </Button>
          {errors.options ? (
            <p className="text-xs text-destructive">
              At least one option is required
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !!slotWarning}
        >
          {isSubmitting ? "Creating..." : "Create field"}
        </Button>
      </div>
    </form>
  );
}

function EditFieldForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  defaultValues: CustomFieldFormProps["defaultValues"];
  onSubmit: CustomFieldFormProps["onSubmit"];
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const showOptions =
    defaultValues?.type === "SELECT" || defaultValues?.type === "MULTI_SELECT";
  const isRelationType = defaultValues?.type === "RELATION_CLIENT";

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      label: defaultValues?.label ?? "",
      required: defaultValues?.required ?? false,
      options: (defaultValues?.options ?? []).map((value) => ({ value })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });

  const handleFormSubmit = (data: EditFormValues) => {
    onSubmit({
      label: data.label,
      required: data.required,
      options: showOptions
        ? data.options.map((option) => option.value)
        : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Field Key</Label>
        <Input
          value={defaultValues?.fieldKey ?? ""}
          className="font-mono text-sm"
          disabled
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cf-edit-label">Label *</Label>
        <Input
          id="cf-edit-label"
          disabled={isSubmitting}
          {...register("label")}
        />
        {errors.label ? (
          <p className="text-xs text-destructive">{errors.label.message}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Input
            value={
              defaultValues?.type
                ? getCustomAttributeTypeLabel(defaultValues.type)
                : ""
            }
            disabled
          />
        </div>

        <div className="flex items-end pb-1">
          <Checkbox
            checked={watch("required")}
            onChange={(checked) => setValue("required", !!checked)}
            label="Required"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {isRelationType ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label>Relation Value Mode</Label>
          <Input
            value={
              defaultValues?.relationConfig?.valueMode === "multi"
                ? "Multiple clients"
                : "Single client"
            }
            disabled
          />
        </div>
      ) : null}

      {showOptions ? (
        <div className="space-y-2">
          <Label>Options</Label>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  disabled={isSubmitting}
                  {...register(`options.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={isSubmitting}
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Icon icon={Delete01Icon} className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ value: "" })}
            disabled={isSubmitting}
          >
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add option
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
