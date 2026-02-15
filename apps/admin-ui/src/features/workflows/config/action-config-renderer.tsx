import { useEffect, useMemo, useState } from "react";
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
import type { EventAttributeSuggestion } from "./event-attribute-suggestions";
import { ExpressionInput } from "./expression-input";
import { parseTimestampWithTimezone } from "../wait-time";

interface ActionConfigRendererProps {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  expressionSuggestions?: EventAttributeSuggestion[];
  selectOptionsByKey?: Record<string, Array<{ value: string; label: string }>>;
}

function collectFieldDefaults(
  fields: ActionConfigField[],
): Record<string, string> {
  const defaults: Record<string, string> = {};

  for (const field of fields) {
    if (isFieldGroup(field)) {
      const nestedDefaults = collectFieldDefaults(field.fields);
      for (const [key, value] of Object.entries(nestedDefaults)) {
        defaults[key] = value;
      }
      continue;
    }

    if (typeof field.defaultValue === "string") {
      defaults[field.key] = field.defaultValue;
    }
  }

  return defaults;
}

function normalizeAttributeReference(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

function extractAttributeReferences(value: string): string[] {
  const pattern = /@?[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g;
  return Array.from(value.matchAll(pattern), (match) =>
    normalizeAttributeReference(match[0]),
  );
}

function getExpressionSuggestionsForField(
  fieldKey: string,
  suggestions: EventAttributeSuggestion[],
): EventAttributeSuggestion[] {
  if (fieldKey === "waitUntil") {
    return suggestions.filter((suggestion) => suggestion.isDateTime);
  }

  if (fieldKey === "waitDuration" || fieldKey === "waitOffset") {
    return [];
  }

  return suggestions;
}

function validateWaitUntilValue(
  value: string,
  suggestions: EventAttributeSuggestion[],
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (parseTimestampWithTimezone(trimmed)) {
    return null;
  }

  const datetimeAttributes = new Set(
    suggestions
      .filter((suggestion) => suggestion.isDateTime)
      .map((suggestion) => suggestion.value),
  );
  const references = extractAttributeReferences(trimmed);

  if (references.length === 0) {
    return "Use an ISO timestamp or a datetime attribute reference.";
  }

  const invalidReference = references.find(
    (reference) => !datetimeAttributes.has(reference),
  );

  if (!invalidReference) {
    return null;
  }

  return `"${invalidReference}" is not a datetime attribute.`;
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
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
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
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
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
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function SelectFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  selectOptionsByKey,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
}) {
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
      ? [{ value: currentValue, label: currentValue }, ...options]
      : options;

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

function ExpressionFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  suggestions,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, suggestions),
    [field.key, suggestions],
  );
  const validationError = useMemo(() => {
    if (field.key !== "waitUntil") {
      return null;
    }

    return validateWaitUntilValue(localValue, suggestions);
  }, [field.key, localValue, suggestions]);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <ExpressionInput
        disabled={disabled}
        onBlur={() => {
          if (validationError) {
            return;
          }

          onUpdateConfig(field.key, localValue);
        }}
        onChange={(nextValue) => setLocalValue(nextValue)}
        placeholder={field.placeholder}
        suggestions={scopedSuggestions}
        value={localValue}
      />
      {validationError ? (
        <p className="text-destructive text-xs">{validationError}</p>
      ) : null}
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function GroupFieldRenderer({
  group,
  config,
  onUpdateConfig,
  disabled,
  expressionSuggestions,
  selectOptionsByKey,
  fieldDefaults,
}: {
  group: ActionConfigFieldGroup;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  expressionSuggestions: EventAttributeSuggestion[];
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
  fieldDefaults: Record<string, string>;
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
              expressionSuggestions={expressionSuggestions}
              selectOptionsByKey={selectOptionsByKey}
              fieldDefaults={fieldDefaults}
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
  expressionSuggestions,
  selectOptionsByKey,
  fieldDefaults,
}: {
  field: ActionConfigField;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  expressionSuggestions: EventAttributeSuggestion[];
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
  fieldDefaults: Record<string, string>;
}) {
  if (isFieldGroup(field)) {
    return (
      <GroupFieldRenderer
        group={field}
        config={config}
        onUpdateConfig={onUpdateConfig}
        disabled={disabled}
        expressionSuggestions={expressionSuggestions}
        selectOptionsByKey={selectOptionsByKey}
        fieldDefaults={fieldDefaults}
      />
    );
  }

  // Check showWhen condition
  if (field.showWhen) {
    const raw = config[field.showWhen.field];
    const val =
      typeof raw === "string"
        ? raw
        : (fieldDefaults[field.showWhen.field] ?? "");
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
          selectOptionsByKey={selectOptionsByKey}
        />
      );
    case "expression":
      return (
        <ExpressionFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          suggestions={expressionSuggestions}
        />
      );
  }
}

export function ActionConfigRenderer({
  fields,
  config,
  onUpdateConfig,
  disabled,
  expressionSuggestions = [],
  selectOptionsByKey = {},
}: ActionConfigRendererProps) {
  const fieldDefaults = collectFieldDefaults(fields);

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldRenderer
          key={isFieldGroup(field) ? field.label : field.key}
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          expressionSuggestions={expressionSuggestions}
          selectOptionsByKey={selectOptionsByKey}
          fieldDefaults={fieldDefaults}
        />
      ))}
    </div>
  );
}
