import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { type EventAttributeSuggestion } from "./event-attribute-suggestions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAction, getActionsByCategory } from "../action-registry";
import { ActionConfigRenderer } from "./action-config-renderer";

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
  const categoryMap = useMemo(() => getActionsByCategory(), []);
  const categories = useMemo(() => [...categoryMap.keys()], [categoryMap]);

  const currentAction =
    typeof config.actionType === "string"
      ? getAction(config.actionType)
      : undefined;

  const [selectedCategory, setSelectedCategory] = useState(
    () => currentAction?.category ?? categories[0] ?? "System",
  );

  const actionsInCategory = useMemo(
    () => categoryMap.get(selectedCategory) ?? [],
    [categoryMap, selectedCategory],
  );

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
              {actionsInCategory.map((action) => (
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
