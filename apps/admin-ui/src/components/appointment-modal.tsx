// Appointment booking modal with availability calendar

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Calendar03Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import {
  formatDisplayDateTime,
  formatTimezoneShort,
  getUserTimezone,
} from "@/lib/date-utils";
import {
  DEFAULT_SCHEDULING_TIMEZONE_MODE,
  resolveEffectiveSchedulingTimezone,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";
import { STANDARD_MODAL_MAX_WIDTH_CLASS } from "@/lib/modal";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { cn } from "@/lib/utils";
import { AvailabilityCalendarPicker } from "@/components/appointments/availability-calendar-picker";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvailabilityManageModal } from "@/components/availability/availability-manage-modal";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCalendarId?: string;
  defaultCalendarName?: string;
  defaultTypeId?: string;
  defaultClientId?: string;
  defaultClientName?: string;
  timezoneMode?: SchedulingTimezoneMode;
  onTimezoneModeChange?: (mode: SchedulingTimezoneMode) => void;
  displayTimezone?: string;
  defaultTimezone?: string;
  onCreated?: (appointmentId: string) => void;
}

export function AppointmentModal({
  open,
  onOpenChange,
  defaultCalendarId,
  defaultCalendarName,
  defaultTypeId,
  defaultClientId,
  defaultClientName,
  timezoneMode: controlledTimezoneMode,
  onTimezoneModeChange,
  displayTimezone,
  defaultTimezone,
  onCreated,
}: AppointmentModalProps) {
  const queryClient = useQueryClient();
  const viewerTimezone = getUserTimezone();
  const [localTimezoneMode, setLocalTimezoneMode] =
    useState<SchedulingTimezoneMode>(DEFAULT_SCHEDULING_TIMEZONE_MODE);
  const [selectedTypeId, setSelectedTypeId] = useState(defaultTypeId ?? "");
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    defaultCalendarId ?? "",
  );
  const [selectedDate, setSelectedDate] = useState<DateTime | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [clientSearch, setClientSearch] = useState(defaultClientName ?? "");
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultClientId ?? "",
  );
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const timezoneMode = controlledTimezoneMode ?? localTimezoneMode;
  const selectedDisplayTimezone = displayTimezone ?? defaultTimezone;

  useEffect(() => {
    if (!open) return;
    setClientSearch(defaultClientName ?? "");
    setSelectedClientId(defaultClientId ?? "");
  }, [open, defaultClientId, defaultClientName]);

  // Current month for calendar
  const [viewMonth, setViewMonth] = useState(() => {
    return DateTime.now().startOf("month");
  });

  // Fetch appointment types
  const { data: typesData } = useQuery({
    ...orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: open,
  });

  // Fetch calendars linked to the selected type
  const { data: linkedCalendars, isLoading: calendarsLoading } = useQuery({
    ...orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId: selectedTypeId },
    }),
    enabled: open && !!selectedTypeId,
  });
  const calendars = linkedCalendars?.map((l) => l.calendar) ?? [];
  const selectedCalendar = calendars.find((calendar) => {
    return calendar.id === selectedCalendarId;
  });
  const effectiveTimezone = resolveEffectiveSchedulingTimezone({
    mode: timezoneMode,
    calendarTimezone: selectedCalendar?.timezone,
    selectedTimezone: selectedDisplayTimezone,
    fallbackTimezone: defaultTimezone,
    viewerTimezone,
  });
  // Business logic (availability + booking validation) must stay in calendar time.
  const schedulingTimezone = selectedCalendar?.timezone ?? effectiveTimezone;
  const timezoneShortLabel = formatTimezoneShort(
    effectiveTimezone,
    selectedTime,
  );

  // Fetch clients for search
  const { data: clientsData } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: clientSearch, limit: 10 },
    }),
    enabled: open && clientSearch.length >= 2,
  });

  // Fetch available time slots for visible month
  const monthStartDateStr = viewMonth.startOf("month").toISODate() ?? "";
  const monthEndDateStr = viewMonth.endOf("month").toISODate() ?? "";
  const {
    data: slotsData,
    isLoading: slotsLoading,
    refetch: refetchSlots,
  } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: selectedTypeId,
        calendarIds: [selectedCalendarId],
        startDate: monthStartDateStr,
        endDate: monthEndDateStr,
        timezone: schedulingTimezone,
      },
    }),
    enabled:
      open &&
      !!selectedTypeId &&
      !!selectedCalendarId &&
      !!selectedCalendar &&
      !!monthStartDateStr &&
      !!monthEndDateStr,
  });

  // Create appointment mutation
  const createMutation = useMutation(
    orpc.appointments.create.mutationOptions({
      onSuccess: (createdAppointment) => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        const createdId =
          typeof createdAppointment?.id === "string"
            ? createdAppointment.id
            : undefined;
        handleClose();
        if (createdId) onCreated?.(createdId);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to book appointment");
      },
    }),
  );

  const appointmentTypes = typesData?.items ?? [];
  const clients = clientsData?.items ?? [];
  const monthSlots = slotsData?.slots ?? [];

  const appointmentTypeSelectLabel = resolveSelectValueLabel({
    value: selectedTypeId,
    options: appointmentTypes,
    getOptionValue: (type) => type.id,
    getOptionLabel: (type) => `${type.name} (${type.durationMin} min)`,
    unknownLabel: "Unknown appointment type",
  });
  const calendarSelectLabel = resolveSelectValueLabel({
    value: selectedCalendarId,
    options: calendars,
    getOptionValue: (calendar) => calendar.id,
    getOptionLabel: (calendar) => calendar.name,
    unknownLabel: defaultCalendarName ?? "Unknown calendar",
  });

  const handleClose = () => {
    setAvailabilityModalOpen(false);
    setSelectedTypeId(defaultTypeId ?? "");
    setSelectedCalendarId(defaultCalendarId ?? "");
    setSelectedDate(null);
    setSelectedTime("");
    setNotes("");
    setClientSearch("");
    setSelectedClientId("");
    onOpenChange(false);
  };

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    setSelectedDate(null);
    setSelectedTime("");
  };

  const handleCalendarChange = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSelectedDate(null);
    setSelectedTime("");
  };

  const handleDateSelect = (date: DateTime) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleSubmit = () => {
    if (!selectedTime) return;

    createMutation.mutate({
      calendarId: selectedCalendarId,
      appointmentTypeId: selectedTypeId,
      startTime: DateTime.fromISO(selectedTime, { setZone: true }).toJSDate(),
      timezone: schedulingTimezone,
      notes: notes || undefined,
      clientId: selectedClientId || undefined,
    });
  };

  const openCalendarAvailability = (calendarId: string) => {
    if (!calendarId) return;
    setAvailabilityModalOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    setSelectedTime("");
  }, [open, timezoneMode]);

  useEffect(() => {
    if (open) return;
    setAvailabilityModalOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDate || !selectedTime || slotsLoading) return;

    const stillAvailable = monthSlots.some((slot) => {
      return slot.start === selectedTime;
    });
    if (!stillAvailable) {
      setSelectedTime("");
    }
  }, [monthSlots, open, selectedDate, selectedTime, slotsLoading]);

  useEffect(() => {
    if (!open || !selectedTypeId || calendarsLoading) return;

    const hasSelectedCalendar = calendars.some(
      (calendar) => calendar.id === selectedCalendarId,
    );
    if (selectedCalendarId && !hasSelectedCalendar) {
      setSelectedCalendarId("");
      setSelectedDate(null);
      setSelectedTime("");
      return;
    }

    if (!selectedCalendarId && defaultCalendarId) {
      const hasDefaultCalendar = calendars.some(
        (calendar) => calendar.id === defaultCalendarId,
      );
      if (hasDefaultCalendar) {
        setSelectedCalendarId(defaultCalendarId);
      }
    }
  }, [
    calendars,
    calendarsLoading,
    defaultCalendarId,
    open,
    selectedCalendarId,
    selectedTypeId,
  ]);

  const formatSelectedDateTime = () => {
    if (!selectedTime) return "";
    return formatDisplayDateTime(selectedTime, effectiveTimezone);
  };

  const canBook = selectedTypeId && selectedCalendarId && selectedTime;

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: open,
    fields: [
      {
        id: "appointment-type",
        key: "t",
        description: "Focus appointment type",
        openOnFocus: true,
      },
      {
        id: "calendar",
        key: "c",
        description: "Focus calendar",
        openOnFocus: true,
      },
      {
        id: "date-time",
        key: "d",
        description: "Focus date and time",
        disabled: !selectedCalendarId,
      },
      {
        id: "client",
        key: "l",
        description: "Focus client search",
      },
      {
        id: "notes",
        key: "n",
        description: "Focus notes",
      },
    ],
  });

  useSubmitShortcut({
    enabled: open && !!canBook && !createMutation.isPending,
    onSubmit: handleSubmit,
  });

  return (
    <>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        modal="trap-focus"
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            data-slot="appointment-modal-backdrop"
            className={cn(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "duration-200",
            )}
          />
          <DialogPrimitive.Popup
            data-slot="appointment-modal-content"
            className={cn(
              "fixed left-1/2 top-2 z-50 w-[calc(100vw-1rem)] -translate-x-1/2 sm:top-8 sm:w-full",
              STANDARD_MODAL_MAX_WIDTH_CLASS,
              "rounded-xl border border-border bg-background shadow-xl",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "data-closed:zoom-out-95 data-open:zoom-in-95",
              "duration-200",
              "max-h-[calc(100dvh-1rem)] overflow-hidden flex flex-col sm:h-[min(86dvh,52rem)] sm:max-h-[calc(100dvh-4rem)] sm:min-h-[36rem]",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
              <DialogPrimitive.Title className="text-lg font-medium">
                New Appointment
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <span className="sr-only">Close</span>
                <Icon icon={Cancel01Icon} />
              </DialogPrimitive.Close>
            </div>

            {/* Content */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
              {/* Type, Calendar, and Time Display */}
              <div className="mb-5 grid grid-cols-1 gap-4 sm:mb-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Appointment Type</Label>
                    <div
                      className="relative"
                      ref={registerField("appointment-type")}
                    >
                      <Select
                        value={selectedTypeId}
                        onValueChange={(v) => v && handleTypeChange(v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type">
                            {appointmentTypeSelectLabel}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {appointmentTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name} ({type.durationMin} min)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldShortcutHint
                        shortcut="t"
                        label="Type"
                        visible={hintsVisible}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Calendar</Label>
                    <div className="relative" ref={registerField("calendar")}>
                      <Select
                        value={selectedCalendarId}
                        onValueChange={(v) => v && handleCalendarChange(v)}
                        disabled={!selectedTypeId || calendarsLoading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              calendarsLoading
                                ? "Loading..."
                                : "Select calendar"
                            }
                          >
                            {calendarSelectLabel}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {calendars.map((cal) => (
                            <SelectItem key={cal.id} value={cal.id}>
                              {cal.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldShortcutHint
                        shortcut="c"
                        label="Calendar"
                        visible={hintsVisible}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="space-y-2">
                    <Label>Time Display</Label>
                    <TimeDisplayToggle
                      value={timezoneMode}
                      onValueChange={(value) => {
                        if (onTimezoneModeChange) {
                          onTimezoneModeChange(value);
                          return;
                        }
                        setLocalTimezoneMode(value);
                      }}
                      className="w-full sm:w-fit"
                    />
                    <p
                      className="text-sm text-muted-foreground"
                      title={effectiveTimezone}
                    >
                      Showing{" "}
                      {timezoneMode === "viewer" ? "your local" : "calendar"}{" "}
                      time ({timezoneShortLabel})
                    </p>
                  </div>
                </div>
              </div>

              {/* Calendar and Time Selection */}
              {selectedCalendarId && (
                <div className="relative" ref={registerField("date-time")}>
                  <AvailabilityCalendarPicker
                    viewMonth={viewMonth}
                    onViewMonthChange={setViewMonth}
                    selectedDate={selectedDate}
                    onSelectDate={handleDateSelect}
                    selectedTime={selectedTime}
                    onSelectTime={setSelectedTime}
                    monthSlots={monthSlots}
                    slotsLoading={slotsLoading}
                    schedulingTimezone={schedulingTimezone}
                    displayTimezone={effectiveTimezone}
                    onManageAvailability={
                      selectedCalendarId
                        ? () => openCalendarAvailability(selectedCalendarId)
                        : undefined
                    }
                  />
                  <FieldShortcutHint
                    shortcut="d"
                    label="Date/Time"
                    visible={hintsVisible}
                  />
                </div>
              )}

              <div
                className={cn(
                  "mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2",
                  selectedCalendarId && "lg:mt-auto",
                )}
              >
                {/* Client Search (optional) */}
                <div>
                  <Label>Client (optional)</Label>
                  <div
                    className="mt-2 space-y-2 relative"
                    ref={registerField("client")}
                  >
                    <Input
                      placeholder="Search by name or email..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                    <FieldShortcutHint
                      shortcut="l"
                      label="Client"
                      visible={hintsVisible}
                    />
                    {clients.length > 0 && (
                      <div className="rounded-md border border-border divide-y divide-border/50">
                        {clients.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              setSelectedClientId(client.id);
                              setClientSearch(
                                `${client.firstName} ${client.lastName}`,
                              );
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                              selectedClientId === client.id && "bg-muted",
                            )}
                          >
                            <div className="font-medium">
                              {client.firstName} {client.lastName}
                            </div>
                            {client.email && (
                              <div className="text-xs text-muted-foreground">
                                {client.email}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedClientId && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setSelectedClientId("");
                          setClientSearch("");
                        }}
                        className="text-muted-foreground"
                      >
                        Clear selection
                      </Button>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Notes (optional)</Label>
                  <div className="relative mt-2" ref={registerField("notes")}>
                    <Textarea
                      placeholder="Add any notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                    <FieldShortcutHint
                      shortcut="n"
                      label="Notes"
                      visible={hintsVisible}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-5 text-sm text-muted-foreground">
                  {selectedTime && (
                    <span className="flex items-center gap-2">
                      <Icon icon={Calendar03Icon} />
                      {formatSelectedDateTime()} ({timezoneShortLabel})
                    </span>
                  )}
                </div>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!canBook || createMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {createMutation.isPending
                      ? "Booking..."
                      : "Book Appointment"}
                    <ShortcutBadge
                      shortcut="meta+enter"
                      className="ml-2 hidden sm:inline-flex"
                    />
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <AvailabilityManageModal
        open={availabilityModalOpen && open && !!selectedCalendarId}
        onOpenChange={(nextOpen) => {
          setAvailabilityModalOpen(nextOpen);
          if (!nextOpen) {
            void refetchSlots();
          }
        }}
        calendarId={selectedCalendarId}
        calendarName={selectedCalendar?.name ?? defaultCalendarName}
        timezone={schedulingTimezone}
        initialTab="weekly"
      />
    </>
  );
}
