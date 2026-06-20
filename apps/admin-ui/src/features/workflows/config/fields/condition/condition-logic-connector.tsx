import { cn } from "@/lib/utils";
import type { LogicOperator } from "./condition-types";

interface ConditionLogicConnectorProps {
  ariaLabel: string;
  disabled: boolean;
  onChange: (logic: LogicOperator) => void;
  orientation?: "vertical" | "horizontal";
  value: LogicOperator;
}

export function ConditionLogicConnector({
  ariaLabel,
  disabled,
  onChange,
  orientation = "vertical",
  value,
}: ConditionLogicConnectorProps) {
  return (
    <div
      className={cn(
        "flex items-center",
        orientation === "vertical" ? "flex-col gap-1" : "flex-row gap-2",
      )}
    >
      {orientation === "vertical" ? (
        <div className="h-2 w-px bg-border" />
      ) : null}
      <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5">
        <button
          aria-label={`${ariaLabel} AND`}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium text-xs transition-colors",
            value === "and"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          onClick={() => onChange("and")}
          type="button"
        >
          AND
        </button>
        <button
          aria-label={`${ariaLabel} OR`}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium text-xs transition-colors",
            value === "or"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          onClick={() => onChange("or")}
          type="button"
        >
          OR
        </button>
      </div>
      {orientation === "vertical" ? (
        <div className="h-2 w-px bg-border" />
      ) : null}
    </div>
  );
}
