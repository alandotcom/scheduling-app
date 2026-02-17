import type { IconSvgElement } from "@hugeicons/react";
import {
  FlashIcon,
  HourglassIcon,
  Search01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAllActions, type ActionDefinition } from "../action-registry";

interface ActionGridProps {
  disabled?: boolean;
  onSelectAction: (actionType: string) => void;
}

type ActionGroup = {
  category: string;
  actions: ActionDefinition[];
};

function getActionIcon(actionType: string): IconSvgElement {
  switch (actionType) {
    case "wait":
      return HourglassIcon;
    case "send-message":
      return FlashIcon;
    case "logger":
      return FlashIcon;
    default:
      return FlashIcon;
  }
}

function getCategoryIcon(category: string): IconSvgElement {
  return category === "System" ? Settings01Icon : FlashIcon;
}

function sortActionGroups(actions: ActionDefinition[]): ActionGroup[] {
  const groupsByCategory = new Map<string, ActionDefinition[]>();

  for (const action of actions) {
    const existing = groupsByCategory.get(action.category) ?? [];
    groupsByCategory.set(action.category, [...existing, action]);
  }

  const categories = [...groupsByCategory.keys()].toSorted((a, b) => {
    if (a === "System") return -1;
    if (b === "System") return 1;
    return a.localeCompare(b);
  });

  return categories.map((category) => ({
    category,
    actions: [...(groupsByCategory.get(category) ?? [])].toSorted((a, b) =>
      a.label.localeCompare(b.label),
    ),
  }));
}

export function ActionGrid({ disabled, onSelectAction }: ActionGridProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const allActions = getAllActions();

    if (!normalizedQuery) {
      return allActions;
    }

    return allActions.filter((action) => {
      return (
        action.label.toLowerCase().includes(normalizedQuery) ||
        action.description.toLowerCase().includes(normalizedQuery) ||
        action.category.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [searchQuery]);

  const groupedActions = useMemo(
    () => sortActionGroups(filteredActions),
    [filteredActions],
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative shrink-0">
        <Icon
          icon={Search01Icon}
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          disabled={disabled}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search actions..."
          value={searchQuery}
          className="pl-10"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {groupedActions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            No actions found.
          </p>
        ) : (
          groupedActions.map((group, index) => (
            <div
              key={group.category}
              className={cn(index > 0 && "mt-4 border-t border-border pt-4")}
            >
              <div className="mb-1 flex items-center gap-2 px-2 py-1 text-muted-foreground">
                <Icon
                  icon={getCategoryIcon(group.category)}
                  className="size-4"
                />
                <span className="font-medium text-xs uppercase tracking-wider">
                  {group.category}
                </span>
              </div>

              <div className="space-y-1">
                {group.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelectAction(action.id)}
                    data-testid={`action-option-${action.id}`}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                      "hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
                    )}
                  >
                    <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                      <Icon
                        icon={getActionIcon(action.id)}
                        className="size-3"
                      />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground text-sm">
                        {action.label}
                      </span>
                      <span className="block truncate text-muted-foreground text-sm">
                        {action.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
