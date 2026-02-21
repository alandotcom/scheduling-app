import {
  ArrowDown01Icon,
  ArrowRight02Icon,
  Layers01Icon,
  Menu01Icon,
  Search01Icon,
  Settings01Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import {
  isJourneyActionAllowedForTriggerType,
  type JourneyTriggerConfig,
} from "@scheduling/dto";
import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAllActions, type ActionDefinition } from "../action-registry";
import { getActionVisualSpec } from "../action-visuals";

interface ActionGridProps {
  disabled?: boolean;
  triggerType?: JourneyTriggerConfig["triggerType"] | null;
  onSelectAction: (actionType: string) => void;
}

type ActionGroup = {
  category: string;
  actions: ActionDefinition[];
};

type ActionGridViewMode = "list" | "grid";

const HIDDEN_GROUPS_KEY = "workflow-action-grid-hidden-groups";
const VIEW_MODE_KEY = "workflow-action-grid-view-mode";

function renderActionIcon(actionType: string): ReactNode {
  const visual = getActionVisualSpec(actionType);

  if (visual.brandIcon) {
    return (
      <visual.brandIcon
        className="size-4 shrink-0 object-contain"
        data-testid={`action-grid-action-logo-${actionType}`}
      />
    );
  }

  return (
    <Icon
      icon={visual.icon}
      className={cn("size-4", visual.iconColorClass)}
      data-testid={`action-grid-action-icon-${actionType}`}
    />
  );
}

function getCategoryIcon(
  category: string,
  actions: ActionDefinition[],
): ReactNode {
  if (category === "System") {
    return (
      <Icon
        icon={Settings01Icon}
        className="size-4 text-muted-foreground"
        data-testid="action-grid-category-icon-system"
      />
    );
  }

  const firstAction = actions[0];
  if (firstAction) {
    const visual = getActionVisualSpec(firstAction.id);
    if (visual.brandIcon) {
      return (
        <visual.brandIcon
          className="size-4 shrink-0 object-contain"
          data-testid={`action-grid-category-logo-${toCategoryKey(category)}`}
        />
      );
    }
  }

  return (
    <Icon
      icon={getActionVisualSpec(actions[0]?.id).icon}
      className="size-4 text-muted-foreground"
    />
  );
}

function sortActionGroups(actions: ActionDefinition[]): ActionGroup[] {
  const groupsByCategory = new Map<string, ActionDefinition[]>();

  for (const action of actions) {
    const existing = groupsByCategory.get(action.category) ?? [];
    groupsByCategory.set(action.category, [...existing, action]);
  }

  const categories = [...groupsByCategory.keys()].toSorted((a, b) => {
    if (a === "System") {
      return -1;
    }

    if (b === "System") {
      return 1;
    }

    return a.localeCompare(b);
  });

  return categories.map((category) => ({
    category,
    actions: [...(groupsByCategory.get(category) ?? [])].toSorted((a, b) =>
      a.label.localeCompare(b.label),
    ),
  }));
}

function toCategoryKey(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function readHiddenGroups(): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const stored = window.localStorage.getItem(HIDDEN_GROUPS_KEY);
    if (!stored) {
      return new Set<string>();
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    );
  } catch {
    return new Set<string>();
  }
}

function readViewMode(): ActionGridViewMode {
  if (typeof window === "undefined") {
    return "list";
  }

  const stored = window.localStorage.getItem(VIEW_MODE_KEY);
  return stored === "grid" ? "grid" : "list";
}

export function ActionGrid({
  disabled,
  triggerType = null,
  onSelectAction,
}: ActionGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [hiddenGroups, setHiddenGroups] =
    useState<Set<string>>(readHiddenGroups);
  const [showHiddenGroups, setShowHiddenGroups] = useState(false);
  const [viewMode, setViewMode] = useState<ActionGridViewMode>(readViewMode);

  const filteredActions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const eligibleActions = getAllActions().filter((action) =>
      isJourneyActionAllowedForTriggerType(action.id, triggerType),
    );

    if (!normalizedQuery) {
      return eligibleActions;
    }

    return eligibleActions.filter((action) => {
      return (
        action.label.toLowerCase().includes(normalizedQuery) ||
        action.description.toLowerCase().includes(normalizedQuery) ||
        action.category.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [searchQuery, triggerType]);

  const groupedActions = useMemo(
    () => sortActionGroups(filteredActions),
    [filteredActions],
  );

  const visibleGroups = useMemo(() => {
    if (showHiddenGroups) {
      return groupedActions;
    }

    return groupedActions.filter((group) => !hiddenGroups.has(group.category));
  }, [groupedActions, hiddenGroups, showHiddenGroups]);

  const hiddenGroupCount = hiddenGroups.size;

  const toggleViewMode = () => {
    const nextMode = viewMode === "list" ? "grid" : "list";
    setViewMode(nextMode);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_KEY, nextMode);
    }
  };

  const toggleGroupCollapsed = (category: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleGroupHidden = (category: string) => {
    setHiddenGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          HIDDEN_GROUPS_KEY,
          JSON.stringify([...next]),
        );
      }

      return next;
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            icon={Search01Icon}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-10"
            data-testid="action-search-input"
            disabled={disabled}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search actions..."
            value={searchQuery}
          />
        </div>
        <Button
          data-testid="action-view-mode-toggle"
          disabled={disabled}
          onClick={toggleViewMode}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Icon
            icon={viewMode === "list" ? Layers01Icon : Menu01Icon}
            className="size-4"
          />
        </Button>
      </div>

      {hiddenGroupCount > 0 ? (
        <button
          className="flex items-center gap-2 self-start text-muted-foreground text-xs transition-colors hover:text-foreground"
          data-testid="action-show-hidden-groups"
          onClick={() => setShowHiddenGroups((current) => !current)}
          type="button"
        >
          <Icon
            icon={showHiddenGroups ? ViewOffIcon : ViewIcon}
            className="size-3.5"
          />
          {showHiddenGroups ? "Hide hidden groups" : "Show hidden groups"} (
          {hiddenGroupCount})
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {visibleGroups.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            No actions found.
          </p>
        ) : (
          visibleGroups.map((group, index) => {
            const categoryKey = toCategoryKey(group.category);
            const isCollapsed = collapsedGroups.has(group.category);
            const isHidden = hiddenGroups.has(group.category);

            return (
              <div
                className={cn(
                  "space-y-2",
                  index > 0 && "mt-3 border-t border-border pt-3",
                  showHiddenGroups && isHidden && "opacity-60",
                )}
                key={group.category}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    data-testid={`action-group-toggle-${categoryKey}`}
                    onClick={() => toggleGroupCollapsed(group.category)}
                    type="button"
                  >
                    <Icon
                      icon={isCollapsed ? ArrowRight02Icon : ArrowDown01Icon}
                      className="size-3.5 text-muted-foreground"
                    />
                    {getCategoryIcon(group.category, group.actions)}
                    <span className="truncate font-medium text-sm">
                      {group.category}
                    </span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                          data-testid={`action-group-menu-${categoryKey}`}
                          disabled={disabled}
                          type="button"
                        >
                          <span className="text-base leading-none">...</span>
                        </button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        data-testid={`action-group-hide-${categoryKey}`}
                        onClick={() => toggleGroupHidden(group.category)}
                      >
                        {isHidden ? "Unhide group" : "Hide group"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {isCollapsed ? null : (
                  <div
                    className={cn(
                      viewMode === "grid"
                        ? "grid grid-cols-1 gap-1 md:grid-cols-2"
                        : "space-y-1",
                    )}
                  >
                    {group.actions.map((action) => (
                      <button
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                          "hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
                          viewMode === "grid" && "border border-border",
                        )}
                        data-testid={`action-option-${action.id}`}
                        disabled={disabled}
                        key={action.id}
                        onClick={() => onSelectAction(action.id)}
                        type="button"
                      >
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                          {renderActionIcon(action.id)}
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
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
