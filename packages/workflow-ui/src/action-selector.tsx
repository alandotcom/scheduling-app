// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useMemo, useState } from "react";
import type { WorkflowActionCatalogItem } from "@scheduling/dto";

type ActionSelectorProps = {
  actions: readonly WorkflowActionCatalogItem[];
  selectedActionId: string;
  onSelect: (action: WorkflowActionCatalogItem) => void;
  disabled?: boolean;
};

export function ActionSelector({
  actions,
  selectedActionId,
  onSelect,
  disabled,
}: ActionSelectorProps) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const groups = new Map<string, WorkflowActionCatalogItem[]>();
    for (const action of actions) {
      const category = action.category ?? "Other";
      const existing = groups.get(category) ?? [];
      existing.push(action);
      groups.set(category, existing);
    }
    return groups;
  }, [actions]);

  const filteredGroups = useMemo(() => {
    if (search.length === 0) return grouped;
    const lower = search.toLowerCase();
    const result = new Map<string, WorkflowActionCatalogItem[]>();
    for (const [category, items] of grouped) {
      const filtered = items.filter(
        (item) =>
          item.label.toLowerCase().includes(lower) ||
          item.description?.toLowerCase().includes(lower) ||
          category.toLowerCase().includes(lower),
      );
      if (filtered.length > 0) {
        result.set(category, filtered);
      }
    }
    return result;
  }, [grouped, search]);

  return (
    <div className="space-y-2">
      <input
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
        placeholder="Search actions..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
      />

      <div className="max-h-48 overflow-auto rounded-md border border-border">
        {[...filteredGroups.entries()].map(([category, items]) => (
          <div key={category}>
            <div className="sticky top-0 border-b border-border bg-muted/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </div>
            {items.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs ${
                  action.id === selectedActionId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
                onClick={() => onSelect(action)}
                disabled={disabled}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{action.label}</span>
                  {action.description ? (
                    <span className="text-muted-foreground">
                      {action.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ))}

        {filteredGroups.size === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            No actions match your search.
          </div>
        ) : null}
      </div>
    </div>
  );
}
