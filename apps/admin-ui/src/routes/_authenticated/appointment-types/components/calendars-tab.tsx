// Calendars tab for linking calendars to appointment types

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";
import { formatTimezoneShort } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/query";

interface CalendarsTabProps {
  appointmentTypeId: string;
  onAddCalendar: (calendarId: string) => void;
  onRemoveCalendar: (calendarId: string) => void;
  isAddPending: boolean;
  isRemovePending: boolean;
}

export function CalendarsTab({
  appointmentTypeId,
  onAddCalendar,
  onRemoveCalendar,
  isAddPending,
  isRemovePending,
}: CalendarsTabProps) {
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");

  // Fetch linked calendars for this type
  const { data: linkedCalendarsData } = useQuery({
    ...orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId },
    }),
    enabled: !!appointmentTypeId,
  });

  // Fetch all calendars for dropdown
  const { data: allCalendarsData } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!appointmentTypeId,
  });

  const linkedCalendars = linkedCalendarsData ?? [];

  // Memoize derived state
  const availableCalendars = useMemo(() => {
    const linkedCalendarIds = new Set(linkedCalendars.map((c) => c.calendarId));
    return (
      allCalendarsData?.items.filter(
        (calendar) => !linkedCalendarIds.has(calendar.id),
      ) ?? []
    );
  }, [linkedCalendars, allCalendarsData?.items]);
  const selectedCalendarLabel = resolveSelectValueLabel({
    value: selectedCalendarId,
    options: availableCalendars,
    getOptionValue: (calendar) => calendar.id,
    getOptionLabel: (calendar) => calendar.name,
    unknownLabel: "Unknown calendar",
  });

  const handleAdd = () => {
    if (!selectedCalendarId) return;
    onAddCalendar(selectedCalendarId);
    setSelectedCalendarId("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={selectedCalendarId}
          onValueChange={(v) => v && setSelectedCalendarId(v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a calendar to add">
              {selectedCalendarLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableCalendars.length === 0 ? (
              <SelectItem value="none" disabled>
                No available calendars
              </SelectItem>
            ) : (
              availableCalendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedCalendarId || isAddPending}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          {isAddPending ? "Adding..." : "Add"}
        </Button>
      </div>

      {linkedCalendars.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No calendars linked yet. Add a calendar to make this appointment type
          available.
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Calendar</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedCalendars.map((link) => (
                <TableRow key={link.calendarId}>
                  <TableCell className="font-medium">
                    {link.calendar.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span title={link.calendar.timezone}>
                      {formatTimezoneShort(link.calendar.timezone)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemoveCalendar(link.calendarId)}
                      disabled={isRemovePending}
                    >
                      <Icon icon={Delete01Icon} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
