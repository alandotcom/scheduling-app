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
    <div
      className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5"
      role="tablist"
      aria-label="View mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "list"}
        onClick={() => onViewChange("list")}
        className={cn(
          "flex items-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          size === "sm"
            ? "h-10 px-2.5 text-[13px] md:h-8"
            : "h-10 px-3.5 text-sm md:h-9",
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
        role="tab"
        aria-selected={view === "schedule"}
        onClick={() => onViewChange("schedule")}
        className={cn(
          "flex items-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          size === "sm"
            ? "h-10 px-2.5 text-[13px] md:h-8"
            : "h-10 px-3.5 text-sm md:h-9",
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
