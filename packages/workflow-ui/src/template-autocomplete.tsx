// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkflowActionCatalogItem,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@scheduling/dto";

type TemplateAutocompleteProps = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  currentNodeId: string;
  actionCatalog: readonly WorkflowActionCatalogItem[];
  onSelect: (template: string) => void;
  onClose: () => void;
};

type AutocompleteOption = {
  template: string;
  nodeLabel: string;
  fieldName: string;
  fieldDescription: string;
};

function getUpstreamNodeIds(
  currentNodeId: string,
  edges: WorkflowGraphEdge[],
  allNodeIds: Set<string>,
): string[] {
  const visited = new Set<string>();
  const queue: string[] = [];

  // Find all nodes that can reach currentNodeId
  for (const edge of edges) {
    if (edge.target === currentNodeId && allNodeIds.has(edge.source)) {
      queue.push(edge.source);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const edge of edges) {
      if (
        edge.target === nodeId &&
        allNodeIds.has(edge.source) &&
        !visited.has(edge.source)
      ) {
        queue.push(edge.source);
      }
    }
  }

  return [...visited];
}

function getNodeLabel(node: WorkflowGraphNode): string {
  const raw = node as Record<string, unknown>;
  if (typeof raw["label"] === "string" && raw["label"].length > 0) {
    return raw["label"];
  }
  if (node.kind === "action") {
    return node.actionId;
  }
  return node.id;
}

function buildOptions(
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
  currentNodeId: string,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): AutocompleteOption[] {
  const options: AutocompleteOption[] = [];
  const allNodeIds = new Set(nodes.map((n) => n.id));
  const upstreamIds = getUpstreamNodeIds(currentNodeId, edges, allNodeIds);

  // Add trigger as always available
  options.push({
    template: "{{@trigger:Trigger.payload}}",
    nodeLabel: "Trigger",
    fieldName: "payload",
    fieldDescription: "Full trigger event payload",
  });

  for (const nodeId of upstreamIds) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const label = getNodeLabel(node);

    if (node.kind === "action") {
      const catalogItem = actionCatalog.find((a) => a.id === node.actionId);
      const outputFields = catalogItem?.outputFields ?? [];

      if (outputFields.length > 0) {
        for (const field of outputFields) {
          options.push({
            template: `{{@${nodeId}:${label}.${field.field}}}`,
            nodeLabel: label,
            fieldName: field.field,
            fieldDescription: field.description,
          });
        }
      } else {
        // Fallback: provide generic output reference
        options.push({
          template: `{{@${nodeId}:${label}.output}}`,
          nodeLabel: label,
          fieldName: "output",
          fieldDescription: "Action output data",
        });
      }
    }

    if (node.kind === "condition") {
      options.push({
        template: `{{@${nodeId}:${label}.result}}`,
        nodeLabel: label,
        fieldName: "result",
        fieldDescription: "Condition evaluation result (true/false)",
      });
    }

    if (node.kind === "wait") {
      options.push({
        template: `{{@${nodeId}:${label}.completedAt}}`,
        nodeLabel: label,
        fieldName: "completedAt",
        fieldDescription: "Wait completion timestamp",
      });
    }
  }

  return options;
}

export function TemplateAutocomplete({
  nodes,
  edges,
  currentNodeId,
  actionCatalog,
  onSelect,
  onClose,
}: TemplateAutocompleteProps) {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const allOptions = useMemo(
    () => buildOptions(nodes, edges, currentNodeId, actionCatalog),
    [nodes, edges, currentNodeId, actionCatalog],
  );

  const filteredOptions = useMemo(() => {
    if (filter.length === 0) return allOptions;
    const lower = filter.toLowerCase();
    return allOptions.filter(
      (opt) =>
        opt.nodeLabel.toLowerCase().includes(lower) ||
        opt.fieldName.toLowerCase().includes(lower),
    );
  }, [allOptions, filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredOptions.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const option = filteredOptions[selectedIndex];
        if (option) {
          onSelect(option.template);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filteredOptions, selectedIndex, onSelect, onClose],
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg"
      onKeyDown={handleKeyDown}
    >
      <div className="border-b border-border p-2">
        <input
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          placeholder="Filter variables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      {filteredOptions.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No matching variables found.
        </div>
      ) : (
        <div className="py-1">
          {filteredOptions.map((option, index) => (
            <button
              key={option.template}
              type="button"
              className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs ${
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              }`}
              onClick={() => onSelect(option.template)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="inline-flex shrink-0 rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {option.nodeLabel}
              </span>
              <span className="flex flex-col">
                <span className="font-medium">{option.fieldName}</span>
                <span className="text-muted-foreground">
                  {option.fieldDescription}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
