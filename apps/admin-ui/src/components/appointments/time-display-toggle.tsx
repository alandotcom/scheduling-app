import type { SchedulingTimezoneMode } from "@/lib/scheduling-timezone";
import { cn } from "@/lib/utils";

interface TimeDisplayToggleProps {
  value: SchedulingTimezoneMode;
  onValueChange: (mode: SchedulingTimezoneMode) => void;
  className?: string;
  size?: "sm" | "default";
}

export function TimeDisplayToggle({
  value,
  onValueChange,
  className,
  size = "default",
}: TimeDisplayToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onValueChange("calendar")}
        className={cn(
          "rounded-md font-medium transition-colors",
          size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3.5 text-sm",
          value === "calendar"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Calendar time
      </button>
      <button
        type="button"
        onClick={() => onValueChange("viewer")}
        className={cn(
          "rounded-md font-medium transition-colors",
          size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3.5 text-sm",
          value === "viewer"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        My time
      </button>
    </div>
  );
}
