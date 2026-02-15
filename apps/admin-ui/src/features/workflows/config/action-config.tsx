import { useEffect, useMemo, useState } from "react";
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
  disabled?: boolean;
  expressionSuggestions?: EventAttributeSuggestion[];
  selectOptionsByKey?: Record<string, Array<{ value: string; label: string }>>;
}

export function ActionConfig({
  config,
  onUpdateConfig,
  disabled,
  expressionSuggestions = [],
  selectOptionsByKey = {},
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

  const [selectedCategory, setSelectedCategory] = useState(() =>
    canSelectCurrentAction && currentAction
      ? currentAction.category
      : selectedCategoryFallback,
  );

  useEffect(() => {
    if (canSelectCurrentAction && currentAction) {
      setSelectedCategory(currentAction.category);
      return;
    }

    if (!categories.includes(selectedCategory)) {
      setSelectedCategory(selectedCategoryFallback);
    }
  }, [
    canSelectCurrentAction,
    categories,
    currentAction,
    selectedCategory,
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
  }, [actionsInCategory, canSelectCurrentAction, currentAction]);

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Label>Action Type</Label>
        <div className="grid grid-cols-2 gap-2">
          <Select
            disabled={disabled}
            value={selectedCategory}
            onValueChange={(val) => {
              if (val) setSelectedCategory(val);
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            disabled={disabled}
            value={
              typeof config.actionType === "string"
                ? config.actionType
                : undefined
            }
            onValueChange={(val) => onUpdateConfig("actionType", val)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {currentAction ? (
        <ActionConfigRenderer
          fields={currentAction.configFields}
          config={config}
          onUpdateConfig={onUpdateConfig}
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
