// View toggle component for list/schedule views

import { Calendar03Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: "list" | "schedule";
  onViewChange: (view: "list" | "schedule") => void;
  size?: "sm" | "default";
}

export function ViewToggle({
  view,
  onViewChange,
  size = "default",
}: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
      <button
        type="button"
        onClick={() => onViewChange("list")}
        className={cn(
          "flex items-center gap-1.5 rounded-md font-medium transition-colors",
          size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3.5 text-sm",
          view === "list"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon icon={Menu01Icon} className="size-4" />
        List
      </button>
      <button
        type="button"
        onClick={() => onViewChange("schedule")}
        className={cn(
          "flex items-center gap-1.5 rounded-md font-medium transition-colors",
          size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3.5 text-sm",
          view === "schedule"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon icon={Calendar03Icon} className="size-4" />
        Schedule
      </button>
    </div>
  );
}
