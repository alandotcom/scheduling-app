// View toggle component for list/schedule views

import { Calendar03Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: "list" | "schedule";
  onViewChange: (view: "list" | "schedule") => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
      <button
        type="button"
        onClick={() => onViewChange("list")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
