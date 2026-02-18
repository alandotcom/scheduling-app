import { useMemo, useState } from "react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { type EventAttributeSuggestion } from "./event-attribute-suggestions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ActionDefinition,
  getAction,
  getActionsByCategory,
} from "../action-registry";
import { getActionVisualSpec } from "../action-visuals";
import { ActionConfigRenderer } from "./action-config-renderer";

function filterActionsByEnvironment(input: {
  categoryMap: Map<string, ActionDefinition[]>;
  isDev: boolean;
}): Map<string, ActionDefinition[]> {
  const filtered = new Map<string, ActionDefinition[]>();

  for (const [category, actions] of input.categoryMap.entries()) {
    const visibleActions = actions.filter(
      (action) => !action.devOnly || input.isDev,
    );

    if (visibleActions.length === 0) {
      continue;
    }

    filtered.set(category, visibleActions);
  }

  return filtered;
}

interface ActionConfigProps {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch?: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
  expressionSuggestions?: EventAttributeSuggestion[];
  selectOptionsByKey?: Record<string, Array<{ value: string; label: string }>>;
  defaultTimezone?: string;
}

function ActionSelectLabel({ action }: { action: ActionDefinition }) {
  const visual = getActionVisualSpec(action.id);

  return (
    <span className="flex min-w-0 items-center gap-2">
      {visual.brandIcon ? (
        <visual.brandIcon
          className="size-4 shrink-0 object-contain"
          data-testid={`action-config-brand-logo-${action.id}`}
        />
      ) : (
        <Icon
          icon={visual.icon}
          className={`size-4 shrink-0 ${visual.iconColorClass}`}
        />
      )}
      <span className="truncate">{action.label}</span>
    </span>
  );
}

export function ActionConfig({
  config,
  onUpdateConfig,
  onUpdateConfigBatch,
  disabled,
  expressionSuggestions = [],
  selectOptionsByKey = {},
  defaultTimezone = "America/New_York",
}: ActionConfigProps) {
  const isDev = String(import.meta.env.DEV) === "true";

  const fullCategoryMap = useMemo(() => getActionsByCategory(), []);
  const categoryMap = useMemo(
    () =>
      filterActionsByEnvironment({
        categoryMap: fullCategoryMap,
        isDev,
      }),
    [fullCategoryMap, isDev],
  );
  const categories = useMemo(() => [...categoryMap.keys()], [categoryMap]);

  const currentAction =
    typeof config.actionType === "string"
      ? getAction(config.actionType)
      : undefined;
  const canSelectCurrentAction = !currentAction?.devOnly || isDev;

  const selectedCategoryFallback = categories[0] ?? "System";

  const [manuallySelectedCategory, setManuallySelectedCategory] =
    useState<string>(selectedCategoryFallback);
  const selectedCategory = useMemo(() => {
    if (canSelectCurrentAction && currentAction) {
      return currentAction.category;
    }
    if (categories.includes(manuallySelectedCategory)) {
      return manuallySelectedCategory;
    }
    return selectedCategoryFallback;
  }, [
    canSelectCurrentAction,
    categories,
    currentAction,
    manuallySelectedCategory,
    selectedCategoryFallback,
  ]);

  const actionsInCategory = useMemo(
    () => categoryMap.get(selectedCategory) ?? [],
    [categoryMap, selectedCategory],
  );
  const actionOptions = useMemo(() => {
    if (!currentAction) {
      return actionsInCategory;
    }

    if (actionsInCategory.some((action) => action.id === currentAction.id)) {
      return actionsInCategory;
    }

    return [currentAction, ...actionsInCategory];
  }, [actionsInCategory, currentAction]);

  const categoryActionByName = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category,
          (categoryMap.get(category) ?? [])[0],
        ]),
      ),
    [categories, categoryMap],
  );

  const handleCategoryChange = (value: string | null) => {
    if (typeof value !== "string" || value.length === 0) {
      return;
    }

    setManuallySelectedCategory(value);
    const firstAction = categoryActionByName.get(value);
    if (
      firstAction &&
      typeof config.actionType === "string" &&
      firstAction.id !== config.actionType
    ) {
      onUpdateConfig("actionType", firstAction.id);
      return;
    }

    if (firstAction && typeof config.actionType !== "string") {
      onUpdateConfig("actionType", firstAction.id);
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-2 min-[640px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-2">
          <Label className="ml-1">Service</Label>
          <Select
            disabled={disabled}
            value={selectedCategory}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger size="sm" className="min-w-0 w-full">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => {
                const firstAction = categoryActionByName.get(category);
                const visual = firstAction
                  ? getActionVisualSpec(firstAction.id)
                  : null;

                return (
                  <SelectItem key={category} value={category}>
                    <span className="flex items-center gap-2">
                      {category === "System" ? (
                        <Icon icon={Settings01Icon} className="size-4" />
                      ) : visual?.brandIcon ? (
                        <visual.brandIcon
                          className="size-4 shrink-0 object-contain"
                          data-testid={`action-config-category-logo-${category.toLowerCase()}`}
                        />
                      ) : visual ? (
                        <Icon
                          icon={visual.icon}
                          className={`size-4 shrink-0 ${visual.iconColorClass}`}
                        />
                      ) : null}
                      <span>{category}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-2">
          <Label className="ml-1">Action</Label>
          <Select
            disabled={disabled}
            value={
              typeof config.actionType === "string"
                ? config.actionType
                : undefined
            }
            onValueChange={(val) => onUpdateConfig("actionType", val)}
          >
            <SelectTrigger size="sm" className="min-w-0 w-full">
              <SelectValue placeholder="Action">
                <span className="truncate">{currentAction?.label}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  <ActionSelectLabel action={action} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {currentAction ? (
        <ActionConfigRenderer
          defaultTimezone={defaultTimezone}
          fields={currentAction.configFields}
          config={config}
          onUpdateConfig={onUpdateConfig}
          onUpdateConfigBatch={onUpdateConfigBatch}
          disabled={disabled}
          expressionSuggestions={expressionSuggestions}
          selectOptionsByKey={selectOptionsByKey}
        />
      ) : (
        <p className="text-muted-foreground text-xs">
          Select an action type to configure.
        </p>
      )}
    </section>
  );
}
