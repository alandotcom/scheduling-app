// Compact sub-tabs for availability editor navigation

import { cn } from "@/lib/utils";

import type { AvailabilitySubTabType } from "./constants";

interface AvailabilitySubTabsProps {
  value: AvailabilitySubTabType;
  onChange: (tab: AvailabilitySubTabType) => void;
  includeOverrides?: boolean;
}

const TABS: { id: AvailabilitySubTabType; label: string }[] = [
  { id: "weekly", label: "Weekly Schedule" },
  { id: "overrides", label: "Date Overrides" },
  { id: "blocked", label: "Blocked Time" },
  { id: "limits", label: "Scheduling Limits" },
];

export function AvailabilitySubTabs({
  value,
  onChange,
  includeOverrides = true,
}: AvailabilitySubTabsProps) {
  const visibleTabs = includeOverrides
    ? TABS
    : TABS.filter((tab) => tab.id !== "overrides");

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {visibleTabs.map((tab) => (
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
