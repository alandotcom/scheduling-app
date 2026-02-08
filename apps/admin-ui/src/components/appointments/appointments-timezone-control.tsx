import { TIMEZONES } from "@/lib/constants";
import {
  formatTimezonePath,
  formatTimezonePickerLabel,
} from "@/lib/date-utils";
import type { SchedulingTimezoneMode } from "@/lib/scheduling-timezone";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AppointmentsTimezoneControlProps {
  timezoneMode: SchedulingTimezoneMode;
  displayTimezone: string;
  displayTimezoneShort: string;
  selectedCalendarTimezone?: string;
  onTimezoneChange: (timezone: string) => void;
  className?: string;
}

export function AppointmentsTimezoneControl({
  timezoneMode,
  displayTimezone,
  displayTimezoneShort,
  selectedCalendarTimezone,
  onTimezoneChange,
  className,
}: AppointmentsTimezoneControlProps) {
  const isEditable =
    timezoneMode === "calendar" && typeof selectedCalendarTimezone !== "string";
  const timezoneOptions = TIMEZONES.some(
    (timezone) => timezone === displayTimezone,
  )
    ? TIMEZONES
    : [displayTimezone, ...TIMEZONES];

  return (
    <div
      data-slot="appointments-timezone-control"
      className={cn("w-full shrink-0 sm:w-[240px]", className)}
    >
      {isEditable ? (
        <Select
          value={displayTimezone}
          onValueChange={(value) => {
            if (!value) return;
            onTimezoneChange(value);
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Timezone">
            <SelectValue>
              {formatTimezonePickerLabel(displayTimezone)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((timezone) => (
              <SelectItem key={timezone} value={timezone}>
                {formatTimezonePickerLabel(timezone)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div
          className="flex h-8 items-center rounded-md border border-border bg-muted/30 px-3 text-sm"
          title={formatTimezonePath(displayTimezone)}
        >
          <span className="truncate">
            <span className="text-muted-foreground">
              {timezoneMode === "viewer" ? "My time" : "Calendar timezone"}
            </span>
            <span className="mx-1 text-muted-foreground">·</span>
            <span>{displayTimezoneShort}</span>
          </span>
        </div>
      )}
    </div>
  );
}
