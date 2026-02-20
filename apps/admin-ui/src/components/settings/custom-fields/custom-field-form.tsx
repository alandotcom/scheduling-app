import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import {
  customAttributeTypeSchema,
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

const ATTRIBUTE_TYPE_OPTIONS: { value: CustomAttributeType; label: string }[] =
  [
    { value: "TEXT", label: "Text" },
    { value: "NUMBER", label: "Number" },
    { value: "DATE", label: "Date" },
    { value: "BOOLEAN", label: "Boolean" },
    { value: "SELECT", label: "Select" },
    { value: "MULTI_SELECT", label: "Multi-Select" },
  ];

const SLOT_PREFIX_BY_TYPE: Record<CustomAttributeType, keyof SlotUsage> = {
  TEXT: "t",
  SELECT: "t",
  NUMBER: "n",
  DATE: "d",
  BOOLEAN: "b",
  MULTI_SELECT: "j",
};

function labelToFieldKey(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");
  return key || "field";
}

const createFormSchema = z.object({
  fieldKey: z
    .string()
    .min(1, "Field key is required")
    .max(100, "Field key is too long")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      "Must start with a letter and contain only letters, numbers, and underscores",
    ),
  label: z.string().min(1, "Label is required").max(255, "Label is too long"),
  type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"]),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string().min(1).max(255) })),
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
  };
  slotUsage: SlotUsage | undefined;
  onSubmit: (data: {
    fieldKey?: string;
    label: string;
    type?: CustomAttributeType;
    required: boolean;
    options?: string[];
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
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });

  const watchedLabel = watch("label");
  const watchedType = watch("type");
  const [fieldKeyTouched, setFieldKeyTouched] = useState(false);

  useEffect(() => {
    if (!fieldKeyTouched && watchedLabel) {
      setValue("fieldKey", labelToFieldKey(watchedLabel));
    }
  }, [watchedLabel, fieldKeyTouched, setValue]);

  const showOptions =
    watchedType === "SELECT" || watchedType === "MULTI_SELECT";
  const slotWarning = useMemo(() => {
    if (!slotUsage || !watchedType) return null;
    const prefix = SLOT_PREFIX_BY_TYPE[watchedType];
    const bucket = slotUsage[prefix];
    if (bucket.used >= bucket.total) {
      return `No available slots for ${watchedType} type. Maximum ${bucket.total} reached.`;
    }
    return null;
  }, [slotUsage, watchedType]);

  const handleFormSubmit = (data: CreateFormValues) => {
    onSubmit({
      fieldKey: data.fieldKey,
      label: data.label,
      type: data.type,
      required: data.required,
      options: showOptions ? data.options.map((o) => o.value) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cf-label">Label</Label>
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
        <Label htmlFor="cf-field-key">Field Key</Label>
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
          <Label>Type</Label>
          <Select
            value={watchedType}
            onValueChange={(value) => {
              const parsed = customAttributeTypeSchema.safeParse(value);
              if (parsed.success) setValue("type", parsed.data);
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTRIBUTE_TYPE_OPTIONS.map((option) => (
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

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !!slotWarning}>
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
      options: (defaultValues?.options ?? []).map((v) => ({ value: v })),
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
      options: showOptions ? data.options.map((o) => o.value) : undefined,
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
        <Label htmlFor="cf-edit-label">Label</Label>
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
          <Input value={defaultValues?.type ?? ""} disabled />
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

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
