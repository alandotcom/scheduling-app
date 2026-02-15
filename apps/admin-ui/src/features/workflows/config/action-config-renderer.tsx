import { useEffect, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ActionConfigField,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
} from "../action-registry";
import { isFieldGroup } from "../action-registry";

interface ActionConfigRendererProps {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}

function TextFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Input
        disabled={disabled}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        value={localValue}
      />
    </div>
  );
}

function TextareaFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Textarea
        disabled={disabled}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        rows={field.rows}
        value={localValue}
      />
    </div>
  );
}

function NumberFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const configValue =
    config[field.key] != null
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Input
        disabled={disabled}
        min={field.min}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        type="number"
        value={localValue}
      />
    </div>
  );
}

function SelectFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const currentValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Select
        disabled={disabled}
        value={currentValue}
        onValueChange={(val) => onUpdateConfig(field.key, val)}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder={field.placeholder ?? "Select..."} />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function GroupFieldRenderer({
  group,
  config,
  onUpdateConfig,
  disabled,
}: {
  group: ActionConfigFieldGroup;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(group.defaultExpanded ?? true);

  return (
    <div className="space-y-2">
      <button
        className="flex w-full items-center gap-1.5 text-sm font-medium"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <Icon
          icon={ArrowDown01Icon}
          className={cn(
            "size-4 transition-transform duration-150",
            !expanded && "-rotate-90",
          )}
        />
        {group.label}
      </button>
      {expanded ? (
        <div className="space-y-3 pl-1">
          {group.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              config={config}
              onUpdateConfig={onUpdateConfig}
              disabled={disabled}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigField;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  if (isFieldGroup(field)) {
    return (
      <GroupFieldRenderer
        group={field}
        config={config}
        onUpdateConfig={onUpdateConfig}
        disabled={disabled}
      />
    );
  }

  // Check showWhen condition
  if (field.showWhen) {
    const raw = config[field.showWhen.field];
    const val = typeof raw === "string" ? raw : "";
    if (val !== field.showWhen.equals) return null;
  }

  switch (field.type) {
    case "text":
      return (
        <TextFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
        />
      );
    case "textarea":
      return (
        <TextareaFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <NumberFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
        />
      );
    case "select":
      return (
        <SelectFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
        />
      );
  }
}

export function ActionConfigRenderer({
  fields,
  config,
  onUpdateConfig,
  disabled,
}: ActionConfigRendererProps) {
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldRenderer
          key={isFieldGroup(field) ? field.label : field.key}
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
