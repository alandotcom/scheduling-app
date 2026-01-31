// Compact sub-tabs for availability editor navigation

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
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
            value === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
