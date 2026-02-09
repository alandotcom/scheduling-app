// Compact sub-tabs for availability editor navigation

import { cn } from "@/lib/utils";

import type { AvailabilitySubTabType } from "./constants";

interface AvailabilitySubTabsProps {
  value: AvailabilitySubTabType;
  onChange: (tab: AvailabilitySubTabType) => void;
}

const TABS: { id: AvailabilitySubTabType; label: string }[] = [
  { id: "weekly", label: "Weekly Schedule" },
  { id: "overrides", label: "Date Overrides" },
  { id: "blocked", label: "Blocked Time" },
];

export function AvailabilitySubTabs({
  value,
  onChange,
}: AvailabilitySubTabsProps) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "h-10 rounded-md px-3 text-sm font-medium transition-colors md:h-8",
            value === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
