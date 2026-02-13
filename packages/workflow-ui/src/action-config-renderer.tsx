// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useState } from "react";
import type {
  WorkflowActionConfigField,
  WorkflowActionConfigFieldBase,
  WorkflowActionCatalogItem,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@scheduling/dto";
import { TemplateBadgeInput } from "./template-badge-input";
import { TemplateBadgeTextarea } from "./template-badge-textarea";

type ActionConfigRendererProps = {
  configFields: WorkflowActionConfigField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean | undefined;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  currentNodeId: string;
  actionCatalog: readonly WorkflowActionCatalogItem[];
};

function shouldShowField(
  field: WorkflowActionConfigFieldBase,
  values: Record<string, unknown>,
): boolean {
  if (!field.showWhen) return true;
  return values[field.showWhen.field] === field.showWhen.equals;
}

function BaseFieldRenderer({
  field,
  value,
  onFieldChange,
  disabled,
  nodes,
  edges,
  currentNodeId,
  actionCatalog,
}: {
  field: WorkflowActionConfigFieldBase;
  value: unknown;
  onFieldChange: (key: string, value: unknown) => void;
  disabled?: boolean | undefined;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  currentNodeId: string;
  actionCatalog: readonly WorkflowActionCatalogItem[];
}) {
  const stringValue =
    typeof value === "string" ? value : (value?.toString() ?? "");
  const numValue = typeof value === "number" ? value : 0;

  return (
    <div className="space-y-1">
      <label className="block text-xs text-muted-foreground">
        {field.label}
        {field.required ? (
          <span className="ml-0.5 text-destructive">*</span>
        ) : null}
      </label>

      {field.type === "template-input" ? (
        <TemplateBadgeInput
          value={stringValue}
          onChange={(v) => onFieldChange(field.key, v)}
          placeholder={field.placeholder}
          disabled={disabled}
          nodes={nodes}
          edges={edges}
          currentNodeId={currentNodeId}
          actionCatalog={actionCatalog}
        />
      ) : null}

      {field.type === "template-textarea" ? (
        <TemplateBadgeTextarea
          value={stringValue}
          onChange={(v) => onFieldChange(field.key, v)}
          placeholder={field.placeholder}
          disabled={disabled}
          nodes={nodes}
          edges={edges}
          currentNodeId={currentNodeId}
          actionCatalog={actionCatalog}
          rows={field.rows}
        />
      ) : null}

      {field.type === "text" ? (
        <input
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          type="text"
          value={stringValue}
          onChange={(e) => onFieldChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      ) : null}

      {field.type === "number" ? (
        <input
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          type="number"
          value={numValue}
          onChange={(e) => onFieldChange(field.key, Number(e.target.value))}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      ) : null}

      {field.type === "select" && field.options ? (
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={stringValue}
          onChange={(e) => onFieldChange(field.key, e.target.value)}
          disabled={disabled}
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

export function ActionConfigRenderer({
  configFields,
  values,
  onChange,
  disabled,
  nodes,
  edges,
  currentNodeId,
  actionCatalog,
}: ActionConfigRendererProps) {
  const onFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value });
    },
    [values, onChange],
  );

  return (
    <div className="space-y-3">
      {configFields.map((field) => {
        if (field.type === "group") {
          return (
            <FieldGroup
              key={field.label}
              field={field}
              values={values}
              onFieldChange={onFieldChange}
              disabled={disabled}
              nodes={nodes}
              edges={edges}
              currentNodeId={currentNodeId}
              actionCatalog={actionCatalog}
            />
          );
        }

        if (!shouldShowField(field, values)) {
          return null;
        }

        return (
          <BaseFieldRenderer
            key={field.key}
            field={field}
            value={values[field.key]}
            onFieldChange={onFieldChange}
            disabled={disabled}
            nodes={nodes}
            edges={edges}
            currentNodeId={currentNodeId}
            actionCatalog={actionCatalog}
          />
        );
      })}
    </div>
  );
}

function FieldGroup({
  field,
  values,
  onFieldChange,
  disabled,
  nodes,
  edges,
  currentNodeId,
  actionCatalog,
}: {
  field: {
    label: string;
    fields: WorkflowActionConfigFieldBase[];
    defaultExpanded?: boolean | undefined;
  };
  values: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
  disabled?: boolean | undefined;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  currentNodeId: string;
  actionCatalog: readonly WorkflowActionCatalogItem[];
}) {
  const [expanded, setExpanded] = useState(field.defaultExpanded ?? false);

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {field.label}
        <span className="text-muted-foreground">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-2">
          {field.fields.map((subField) => {
            if (!shouldShowField(subField, values)) {
              return null;
            }
            return (
              <BaseFieldRenderer
                key={subField.key}
                field={subField}
                value={values[subField.key]}
                onFieldChange={onFieldChange}
                disabled={disabled}
                nodes={nodes}
                edges={edges}
                currentNodeId={currentNodeId}
                actionCatalog={actionCatalog}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
