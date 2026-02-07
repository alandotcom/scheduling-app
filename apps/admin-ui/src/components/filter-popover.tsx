// Collapsible filter popover for tables

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { FilterIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface FilterPopoverProps {
  children: React.ReactNode;
  activeFilterCount?: number;
  onClear?: () => void;
}

export function FilterPopover({
  children,
  activeFilterCount = 0,
  onClear,
}: FilterPopoverProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button variant="outline" size="sm">
            <Icon icon={FilterIcon} data-icon="inline-start" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start">
          <Popover.Popup
            className={cn(
              "z-50 w-72 rounded-lg border border-border bg-background p-4 shadow-lg",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "data-closed:zoom-out-95 data-open:zoom-in-95",
              "duration-150",
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && onClear && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onClear}
                  className="text-muted-foreground"
                >
                  Clear all
                </Button>
              )}
            </div>
            <div className="space-y-4">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface FilterFieldProps {
  label: string;
  children: React.ReactNode;
}

export function FilterField({ label, children }: FilterFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

// Active filter badge display
interface ActiveFiltersProps {
  filters: Array<{
    label: string;
    value: string;
    onRemove: () => void;
  }>;
}

export function ActiveFilters({ filters }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter, index) => (
        <div
          key={index}
          className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium"
        >
          <span className="text-muted-foreground">{filter.label}:</span>
          <span>{filter.value}</span>
          <button
            type="button"
            onClick={filter.onRemove}
            className="ml-0.5 rounded-sm hover:bg-background p-0.5"
          >
            <Icon icon={Cancel01Icon} className="size-3" />
            <span className="sr-only">Remove filter</span>
          </button>
        </div>
      ))}
    </div>
  );
}
