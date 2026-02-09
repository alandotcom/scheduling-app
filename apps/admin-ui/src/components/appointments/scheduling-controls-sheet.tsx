import type { SchedulingTimezoneMode } from "@/lib/scheduling-timezone";
import { cn } from "@/lib/utils";
import { ActiveFilters, FilterField } from "@/components/filter-popover";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { AppointmentsTimezoneControl } from "@/components/appointments/appointments-timezone-control";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ViewMode = "list" | "schedule";
type ListScope = "upcoming" | "history";

interface SchedulingControlsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentView: ViewMode;
  listScope: ListScope;
  onListScopeChange: (scope: ListScope) => void;
  timezoneMode: SchedulingTimezoneMode;
  onTimezoneModeChange: (mode: SchedulingTimezoneMode) => void;
  displayTimezone: string;
  displayTimezoneShort: string;
  selectedCalendarTimezone?: string;
  onTimezoneChange: (timezone: string) => void;
  filters: {
    calendarId: string;
    appointmentTypeId: string;
    status: string;
  };
  onFilterChange: (filters: {
    calendarId?: string;
    appointmentTypeId?: string;
    status?: string;
  }) => void;
  calendars: Array<{ id: string; name: string }>;
  appointmentTypes: Array<{ id: string; name: string }>;
  calendarFilterLabel?: string;
  typeFilterLabel?: string;
  statusFilterLabel?: string;
  activeFilterCount: number;
  activeFiltersDisplay: Array<{
    label: string;
    value: string;
    onRemove: () => void;
  }>;
  onClearAllFilters: () => void;
}

export function SchedulingControlsSheet({
  open,
  onOpenChange,
  currentView,
  listScope,
  onListScopeChange,
  timezoneMode,
  onTimezoneModeChange,
  displayTimezone,
  displayTimezoneShort,
  selectedCalendarTimezone,
  onTimezoneChange,
  filters,
  onFilterChange,
  calendars,
  appointmentTypes,
  calendarFilterLabel,
  typeFilterLabel,
  statusFilterLabel,
  activeFilterCount,
  activeFiltersDisplay,
  onClearAllFilters,
}: SchedulingControlsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[min(85dvh,48rem)] gap-0 rounded-t-2xl border-t border-border p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-base">Controls</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4">
          {currentView === "list" && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">List Scope</h3>
              <div className="inline-flex w-full items-center rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => onListScopeChange("upcoming")}
                  className={cn(
                    "h-10 flex-1 rounded-md px-3 text-sm font-medium transition-all duration-200",
                    listScope === "upcoming"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  onClick={() => onListScopeChange("history")}
                  className={cn(
                    "h-10 flex-1 rounded-md px-3 text-sm font-medium transition-all duration-200",
                    listScope === "history"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  History
                </button>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Time Display</h3>
            <TimeDisplayToggle
              value={timezoneMode}
              onValueChange={onTimezoneModeChange}
              className="w-full"
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Timezone</h3>
            <AppointmentsTimezoneControl
              timezoneMode={timezoneMode}
              displayTimezone={displayTimezone}
              displayTimezoneShort={displayTimezoneShort}
              selectedCalendarTimezone={selectedCalendarTimezone}
              onTimezoneChange={onTimezoneChange}
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Filters</h3>
              {activeFilterCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={onClearAllFilters}
                >
                  Clear all
                </Button>
              ) : null}
            </div>

            <FilterField label="Calendar">
              <Select
                value={filters.calendarId || "all"}
                onValueChange={(value) => {
                  if (!value) return;
                  onFilterChange({ calendarId: value === "all" ? "" : value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All calendars">
                    {calendarFilterLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All calendars</SelectItem>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      {cal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Type">
              <Select
                value={filters.appointmentTypeId || "all"}
                onValueChange={(value) => {
                  if (!value) return;
                  onFilterChange({
                    appointmentTypeId: value === "all" ? "" : value,
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All types">
                    {typeFilterLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {appointmentTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Status">
              <Select
                value={filters.status || "all"}
                onValueChange={(value) => {
                  if (!value) return;
                  onFilterChange({ status: value === "all" ? "" : value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses">
                    {statusFilterLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
          </section>

          {activeFiltersDisplay.length > 0 ? (
            <section className="space-y-2 pb-2">
              <h3 className="text-sm font-medium">Active Filters</h3>
              <ActiveFilters filters={activeFiltersDisplay} />
            </section>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetClose asChild>
            <Button className="w-full">Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
