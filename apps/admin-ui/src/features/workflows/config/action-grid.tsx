import { useMemo, useState } from "react";
import type { WorkflowActionCatalogItem } from "@scheduling/dto";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ActionGridProps = {
  actions: WorkflowActionCatalogItem[];
  selectedActionId?: string;
  onSelect: (action: WorkflowActionCatalogItem) => void;
};

export function ActionGrid({
  actions,
  selectedActionId,
  onSelect,
}: ActionGridProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) {
      return actions;
    }

    return actions.filter((action) => {
      const haystack = [
        action.id,
        action.label,
        action.description,
        action.category,
      ]
        .filter((entry): entry is string => typeof entry === "string")
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [actions, search]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search actions"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="grid max-h-52 gap-1 overflow-y-auto rounded-md border p-2">
        {filtered.map((action) => (
          <Button
            key={action.id}
            className="justify-start"
            onClick={() => onSelect(action)}
            size="sm"
            variant={selectedActionId === action.id ? "secondary" : "ghost"}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
