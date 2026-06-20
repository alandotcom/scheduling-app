import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type {
  WorkflowFilterFieldOption,
  WorkflowFilterValueOption,
} from "../../../filter-builder-shared";
import { ConditionFilterConditionRow } from "./condition-filter-condition-row";
import { ConditionLogicConnector } from "./condition-logic-connector";
import {
  type ConditionFilterConditionDraft,
  type ConditionFilterGroupDraft,
  type LogicOperator,
  toConditionStableKey,
} from "./condition-types";

interface ConditionFilterGroupCardProps {
  defaultTimezone: string;
  disabled: boolean;
  fieldOptions: WorkflowFilterFieldOption[];
  group: ConditionFilterGroupDraft;
  groupIndex: number;
  onAddCondition: (groupIndex: number) => void;
  onConditionChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<ConditionFilterConditionDraft>,
  ) => void;
  onGroupLogicChange: (groupIndex: number, logic: LogicOperator) => void;
  onRemoveCondition: (groupIndex: number, conditionIndex: number) => void;
  onRemoveGroup: (groupIndex: number) => void;
  valueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}

export function ConditionFilterGroupCard({
  defaultTimezone,
  disabled,
  fieldOptions,
  group,
  groupIndex,
  onAddCondition,
  onConditionChange,
  onGroupLogicChange,
  onRemoveCondition,
  onRemoveGroup,
  valueOptionsByField,
}: ConditionFilterGroupCardProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">
            {groupIndex + 1}
          </div>
          <p className="font-medium text-sm">Condition group</p>
          <p className="text-muted-foreground text-xs">
            {group.conditions.length} condition
            {group.conditions.length === 1 ? "" : "s"}
          </p>
        </div>

        <Button
          aria-label={`Remove group ${groupIndex + 1}`}
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => onRemoveGroup(groupIndex)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon className="size-4" icon={Delete01Icon} />
        </Button>
      </div>

      <div className="space-y-2 p-3">
        {(() => {
          const conditionKeyCounts = new Map<string, number>();
          return group.conditions.map((condition, conditionIndex) => {
            const baseConditionKey = toConditionStableKey(condition);
            const conditionKeyIndex =
              conditionKeyCounts.get(baseConditionKey) ?? 0;
            conditionKeyCounts.set(baseConditionKey, conditionKeyIndex + 1);

            return (
              <div key={`${baseConditionKey}-${conditionKeyIndex}`}>
                <ConditionFilterConditionRow
                  canRemove={group.conditions.length > 1}
                  condition={condition}
                  conditionIndex={conditionIndex}
                  defaultTimezone={defaultTimezone}
                  disabled={disabled}
                  fieldOptions={fieldOptions}
                  groupIndex={groupIndex}
                  onChange={onConditionChange}
                  onRemove={onRemoveCondition}
                  valueOptionsByField={valueOptionsByField}
                />

                {conditionIndex < group.conditions.length - 1 ? (
                  <div className="flex justify-start pl-4 pt-1">
                    <ConditionLogicConnector
                      ariaLabel={`Group ${groupIndex + 1} condition connector`}
                      disabled={disabled}
                      value={group.logic}
                      onChange={(logic) =>
                        onGroupLogicChange(groupIndex, logic)
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          });
        })()}

        <div className="pt-2">
          <Button
            disabled={disabled}
            onClick={() => onAddCondition(groupIndex)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon className="size-4" icon={Add01Icon} />
            Add condition
          </Button>
        </div>
      </div>
    </div>
  );
}
