// Appointment booking modal with availability calendar

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Combobox } from "@base-ui/react/combobox";
import {
  ArrowDown01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
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
import { MOBILE_FIRST_MODAL_CONTENT_CLASS } from "@/lib/modal";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { cn } from "@/lib/utils";
import { AvailabilityCalendarPicker } from "@/components/appointments/availability-calendar-picker";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
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
  const skipClientClearRef = useRef(false);
  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);
  const [mobileClientPickerOpen, setMobileClientPickerOpen] = useState(false);
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

  // Fetch clients for appointment booking (sorted by recency in UI)
  const { data: clientsData } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { limit: 100, sort: "updated_at_desc" },
    }),
    enabled: open,
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
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
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
  const allClients = clientsData?.items ?? [];
  const monthSlots = slotsData?.slots ?? [];
  const clients = useMemo(() => {
    const normalizedSearch = clientSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return allClients.slice(0, 12);
    }
    return allClients
      .filter((client) => {
        const fullName = `${client.firstName} ${client.lastName}`.toLowerCase();
        const email = client.email?.toLowerCase() ?? "";
        return (
          fullName.includes(normalizedSearch) ||
          email.includes(normalizedSearch)
        );
      })
      .slice(0, 12);
  }, [allClients, clientSearch]);
  const selectedClient =
    allClients.find((client) => client.id === selectedClientId) ?? null;

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
    setClientComboboxOpen(false);
    setMobileClientPickerOpen(false);
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
    setClientComboboxOpen(false);
    setMobileClientPickerOpen(false);
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
              "fixed inset-0 z-50 bg-black/50 md:backdrop-blur-sm",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "duration-200",
            )}
          />
          <DialogPrimitive.Popup
            data-slot="appointment-modal-content"
            className={cn(
              MOBILE_FIRST_MODAL_CONTENT_CLASS,
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "data-closed:zoom-out-95 data-open:zoom-in-95",
              "duration-200",
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
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 sm:p-6">
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
                    {/* Mobile: button trigger → full-screen picker */}
                    <div className="md:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setClientSearch("");
                          setMobileClientPickerOpen(true);
                        }}
                        className="dark:bg-input/30 border-input h-11 rounded-lg border bg-transparent px-3 py-2 text-base w-full text-left text-muted-foreground/70"
                      >
                        {selectedClient ? (
                          <span className="text-foreground">
                            {selectedClient.firstName} {selectedClient.lastName}
                          </span>
                        ) : (
                          "Search by name or email..."
                        )}
                      </button>

                      <DialogPrimitive.Root
                        open={mobileClientPickerOpen}
                        onOpenChange={(open) => {
                          setMobileClientPickerOpen(open);
                          if (!open) {
                            // Restore clientSearch to match selection (for desktop combobox sync)
                            setClientSearch(
                              selectedClient
                                ? `${selectedClient.firstName} ${selectedClient.lastName}`
                                : "",
                            );
                          }
                        }}
                      >
                        <DialogPrimitive.Portal>
                          <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/50" />
                          <DialogPrimitive.Popup
                            className="fixed inset-0 z-[60] flex flex-col bg-background"
                            onKeyDown={(e) => {
                              // Prevent Escape from bubbling to the parent appointment modal
                              if (e.key === "Escape") e.stopPropagation();
                            }}
                          >
                            {/* Header */}
                            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                              <DialogPrimitive.Title className="text-lg font-medium">
                                Select Client
                              </DialogPrimitive.Title>
                              <DialogPrimitive.Close
                                render={
                                  <Button variant="ghost" size="icon-sm" />
                                }
                              >
                                <span className="sr-only">Close</span>
                                <Icon icon={Cancel01Icon} />
                              </DialogPrimitive.Close>
                            </div>

                            {/* Search input */}
                            <div className="border-b border-border px-4 py-3">
                              <div className="relative">
                                <Icon
                                  icon={Search01Icon}
                                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                                />
                                <input
                                  autoFocus
                                  placeholder="Search by name or email..."
                                  value={clientSearch}
                                  onChange={(e) => {
                                    setClientSearch(e.target.value);
                                    if (!e.target.value.trim()) {
                                      setSelectedClientId("");
                                    }
                                  }}
                                  className="h-11 w-full rounded-lg border border-input bg-transparent pl-10 pr-3 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
                                />
                              </div>
                            </div>

                            {/* Scrollable client list */}
                            <div className="flex-1 overflow-y-auto">
                              {clients.length === 0 ? (
                                <p className="px-4 py-6 text-sm text-muted-foreground">
                                  No clients found.
                                </p>
                              ) : (
                                clients.map((client) => (
                                  <button
                                    key={client.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedClientId(client.id);
                                      setClientSearch(
                                        `${client.firstName} ${client.lastName}`,
                                      );
                                      setMobileClientPickerOpen(false);
                                    }}
                                    className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left active:bg-accent"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium">
                                        {client.firstName} {client.lastName}
                                      </div>
                                      {client.email && (
                                        <div className="text-xs text-muted-foreground">
                                          {client.email}
                                        </div>
                                      )}
                                    </div>
                                    {selectedClientId === client.id && (
                                      <Icon
                                        icon={Tick02Icon}
                                        className="size-5 text-primary"
                                      />
                                    )}
                                  </button>
                                ))
                              )}
                            </div>

                            {/* Bottom safe area */}
                            <div className="pb-[env(safe-area-inset-bottom)]" />
                          </DialogPrimitive.Popup>
                        </DialogPrimitive.Portal>
                      </DialogPrimitive.Root>
                    </div>

                    {/* Desktop: combobox with dropdown */}
                    <div className="hidden md:block">
                      <Combobox.Root
                        items={clients}
                        value={selectedClient}
                        inputValue={clientSearch}
                        open={clientComboboxOpen}
                        itemToStringLabel={(client) =>
                          `${client.firstName} ${client.lastName}`
                        }
                        itemToStringValue={(client) => client.id}
                        isItemEqualToValue={(item, selected) =>
                          item.id === selected.id
                        }
                        onOpenChange={setClientComboboxOpen}
                        onInputValueChange={(inputValue) => {
                          setClientSearch(inputValue);
                          if (skipClientClearRef.current) {
                            skipClientClearRef.current = false;
                            return;
                          }
                          if (!inputValue.trim()) {
                            setSelectedClientId("");
                          }
                        }}
                        onValueChange={(client) => {
                          if (!client) return;
                          skipClientClearRef.current = true;
                          setSelectedClientId(client.id);
                          setClientSearch(
                            `${client.firstName} ${client.lastName}`,
                          );
                          setClientComboboxOpen(false);
                        }}
                      >
                        <div className="relative">
                          <Combobox.Input
                            placeholder="Search by name or email..."
                            onFocus={() => {
                              setClientComboboxOpen(true);
                            }}
                            onPointerDown={() => {
                              if (!clientComboboxOpen) {
                                setClientComboboxOpen(true);
                              }
                            }}
                            className={cn(
                              "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-11 md:h-10 rounded-lg border bg-transparent pr-10 pl-3 py-2 text-base transition-all duration-200 ease-out focus-visible:ring-[3px] aria-invalid:ring-[3px] md:text-sm placeholder:text-muted-foreground/70 w-full min-w-0 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                            <Icon icon={ArrowDown01Icon} className="size-4" />
                          </span>
                        </div>

                        <Combobox.Portal keepMounted>
                          <Combobox.Positioner
                            positionMethod="fixed"
                            sideOffset={6}
                            align="start"
                            className="z-[120]"
                          >
                            <Combobox.Popup className="w-[min(var(--anchor-width),calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-background shadow-lg">
                              <Combobox.Empty className="px-3 py-3 text-sm text-muted-foreground">
                                No clients found.
                              </Combobox.Empty>
                              <Combobox.List className="max-h-72 overflow-y-auto p-1">
                                {(client) => (
                                  <Combobox.Item
                                    key={client.id}
                                    value={client}
                                    className="relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium">
                                        {client.firstName} {client.lastName}
                                      </div>
                                      {client.email ? (
                                        <div className="truncate text-xs text-muted-foreground">
                                          {client.email}
                                        </div>
                                      ) : null}
                                    </div>
                                    <Combobox.ItemIndicator>
                                      <Icon
                                        icon={Tick02Icon}
                                        className="size-4"
                                      />
                                    </Combobox.ItemIndicator>
                                  </Combobox.Item>
                                )}
                              </Combobox.List>
                            </Combobox.Popup>
                          </Combobox.Positioner>
                        </Combobox.Portal>
                      </Combobox.Root>
                    </div>
                    <FieldShortcutHint
                      shortcut="l"
                      label="Client"
                      visible={hintsVisible}
                    />
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
            <div className="mt-auto border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  className={cn(
                    "text-sm text-muted-foreground",
                    !selectedTime && "hidden min-h-5 sm:block",
                  )}
                >
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
