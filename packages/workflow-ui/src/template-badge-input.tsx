// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkflowActionCatalogItem,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@scheduling/dto";
import { TemplateAutocomplete } from "./template-autocomplete";

const TEMPLATE_PATTERN = /\{\{@([^:]+):([^.}]+)\.([^}]+)\}\}/g;

type TemplateBadgeInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  currentNodeId: string;
  actionCatalog: readonly WorkflowActionCatalogItem[];
  multiline?: boolean | undefined;
  rows?: number | undefined;
};

function doesNodeExist(nodeId: string, nodes: WorkflowGraphNode[]): boolean {
  return nodes.some((n) => n.id === nodeId);
}

function getNodeLabel(nodeId: string, nodes: WorkflowGraphNode[]): string {
  if (nodeId === "trigger") return "Trigger";
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return nodeId;
  // Check for a label property (loose schema allows extra fields)
  const raw = node as Record<string, unknown>;
  if (typeof raw["label"] === "string" && raw["label"].length > 0) {
    return raw["label"];
  }
  return nodeId;
}

function renderValueWithBadges(
  value: string,
  nodes: WorkflowGraphNode[],
): (string | { template: string; display: string; valid: boolean })[] {
  const parts: (
    | string
    | { template: string; display: string; valid: boolean }
  )[] = [];
  let lastIndex = 0;

  const pattern = new RegExp(TEMPLATE_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(value.slice(lastIndex, match.index));
    }

    const nodeId = match[1]!;
    const field = match[3]!;
    const label = getNodeLabel(nodeId, nodes);
    const valid = nodeId === "trigger" || doesNodeExist(nodeId, nodes);
    parts.push({
      template: match[0],
      display: `${label}.${field}`,
      valid,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
}

export function TemplateBadgeInput({
  value,
  onChange,
  placeholder,
  disabled,
  nodes,
  edges,
  currentNodeId,
  actionCatalog,
  multiline = false,
  rows = 1,
}: TemplateBadgeInputProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [localText, setLocalText] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    setLocalText(value);
  }, [value]);

  const handleInsertTemplate = useCallback(
    (template: string) => {
      // Insert template at cursor position or append
      const el = inputRef.current;
      if (el) {
        const start = el.selectionStart ?? localText.length;
        const end = el.selectionEnd ?? localText.length;
        // Remove the trailing "@" that triggered autocomplete
        const before = localText.slice(0, start).replace(/@$/, "");
        const after = localText.slice(end);
        const next = before + template + after;
        setLocalText(next);
        onChange(next);
      } else {
        const next = localText + template;
        setLocalText(next);
        onChange(next);
      }
      setShowAutocomplete(false);
    },
    [localText, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "@" && !showAutocomplete) {
        setShowAutocomplete(true);
      }
      if (e.key === "Escape") {
        setShowAutocomplete(false);
      }
    },
    [showAutocomplete],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const next = e.target.value;
      setLocalText(next);
      onChange(next);

      // Show autocomplete when @ is typed
      if (next.endsWith("@")) {
        setShowAutocomplete(true);
      }
    },
    [onChange],
  );

  const parts = renderValueWithBadges(value, nodes);
  const hasTemplates = parts.some((p) => typeof p !== "string");

  return (
    <div className="relative">
      {/* Badge preview (shown when there are templates and not editing) */}
      {hasTemplates && disabled ? (
        <div className="flex min-h-[32px] flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-sm">
          {parts.map((part, i) =>
            typeof part === "string" ? (
              <span key={i}>{part}</span>
            ) : (
              <span
                key={i}
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                  part.valid
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                }`}
              >
                {part.display}
              </span>
            ),
          )}
        </div>
      ) : multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
          value={localText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={localText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}

      {showAutocomplete && !disabled ? (
        <TemplateAutocomplete
          nodes={nodes}
          edges={edges}
          currentNodeId={currentNodeId}
          actionCatalog={actionCatalog}
          onSelect={handleInsertTemplate}
          onClose={() => setShowAutocomplete(false)}
        />
      ) : null}
    </div>
  );
}
