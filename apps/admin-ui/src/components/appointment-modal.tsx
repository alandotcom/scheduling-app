// Appointment booking modal with availability calendar

import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { cn } from "@/lib/utils";
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

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCalendarId?: string;
  defaultTypeId?: string;
  defaultClientId?: string;
  defaultClientName?: string;
}

export function AppointmentModal({
  open,
  onOpenChange,
  defaultCalendarId,
  defaultTypeId,
  defaultClientId,
  defaultClientName,
}: AppointmentModalProps) {
  const queryClient = useQueryClient();
  const [selectedTypeId, setSelectedTypeId] = useState(defaultTypeId ?? "");
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    defaultCalendarId ?? "",
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [clientSearch, setClientSearch] = useState(defaultClientName ?? "");
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultClientId ?? "",
  );
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!open) return;
    setClientSearch(defaultClientName ?? "");
    setSelectedClientId(defaultClientId ?? "");
  }, [open, defaultClientId, defaultClientName]);

  // Current month for calendar
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
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

  // Fetch clients for search
  const { data: clientsData } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: clientSearch, limit: 10 },
    }),
    enabled: open && clientSearch.length >= 2,
  });

  // Fetch available time slots for selected date
  const selectedDateStr = selectedDate?.toISOString().split("T")[0] ?? "";
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: selectedTypeId,
        calendarIds: [selectedCalendarId],
        startDate: selectedDateStr,
        endDate: selectedDateStr,
        timezone,
      },
    }),
    enabled:
      open && !!selectedTypeId && !!selectedCalendarId && !!selectedDateStr,
  });

  // Create appointment mutation
  const createMutation = useMutation(
    orpc.appointments.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        toast.success("Appointment booked successfully");
        handleClose();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to book appointment");
      },
    }),
  );

  const appointmentTypes = typesData?.items ?? [];
  const calendars = linkedCalendars?.map((l) => l.calendar) ?? [];
  const clients = clientsData?.items ?? [];
  const availableSlots = slotsData?.slots.filter((s) => s.available) ?? [];

  const selectedType = appointmentTypes.find((t) => t.id === selectedTypeId);
  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);
  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const days: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Previous month padding
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isPast: date < today,
      });
    }

    // Current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
        isPast: date < today,
      });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isPast: false,
      });
    }

    return days;
  }, [viewMonth]);

  const handleClose = () => {
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
    setSelectedCalendarId("");
    setSelectedDate(null);
    setSelectedTime("");
  };

  const handleCalendarChange = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSelectedDate(null);
    setSelectedTime("");
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  const handleSubmit = () => {
    if (!selectedTime) return;

    createMutation.mutate({
      calendarId: selectedCalendarId,
      appointmentTypeId: selectedTypeId,
      startTime: new Date(selectedTime),
      timezone,
      notes: notes || undefined,
      clientId: selectedClientId || undefined,
    });
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatSelectedDateTime = () => {
    if (!selectedTime) return "";
    const date = new Date(selectedTime);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const canBook = selectedTypeId && selectedCalendarId && selectedTime;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "duration-150",
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border/50 bg-background shadow-xl",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "data-closed:zoom-out-95 data-open:zoom-in-95",
            "duration-200",
            "max-h-[90vh] overflow-hidden flex flex-col",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
            <DialogPrimitive.Title className="text-lg font-medium">
              New Appointment
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <span className="sr-only">Close</span>
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Type & Calendar Selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <Label>Appointment Type</Label>
                <Select
                  value={selectedTypeId}
                  onValueChange={(v) => v && handleTypeChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type">
                      {selectedType
                        ? `${selectedType.name} (${selectedType.durationMin} min)`
                        : null}
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
              </div>

              <div className="space-y-2">
                <Label>Calendar</Label>
                <Select
                  value={selectedCalendarId}
                  onValueChange={(v) => v && handleCalendarChange(v)}
                  disabled={!selectedTypeId || calendarsLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        calendarsLoading ? "Loading..." : "Select calendar"
                      }
                    >
                      {selectedCalendar?.name}
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
              </div>
            </div>

            {/* Calendar and Time Selection */}
            {selectedCalendarId && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Calendar */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">
                      {viewMonth.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h3>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setViewMonth(
                            new Date(
                              viewMonth.getFullYear(),
                              viewMonth.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                      >
                        <Icon icon={ArrowLeft02Icon} className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setViewMonth(
                            new Date(
                              viewMonth.getFullYear(),
                              viewMonth.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                      >
                        <Icon icon={ArrowRight02Icon} className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                      <div
                        key={day}
                        className="p-2 text-xs font-medium text-muted-foreground"
                      >
                        {day}
                      </div>
                    ))}
                    {calendarDays.map((day, i) => {
                      const isSelected =
                        selectedDate?.toDateString() ===
                        day.date.toDateString();
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={day.isPast || !day.isCurrentMonth}
                          onClick={() => handleDateSelect(day.date)}
                          className={cn(
                            "p-2 text-sm rounded-md transition-colors",
                            day.isCurrentMonth
                              ? "text-foreground"
                              : "text-muted-foreground/50",
                            day.isPast && "opacity-50 cursor-not-allowed",
                            day.isToday && "ring-1 ring-primary",
                            isSelected && "bg-primary text-primary-foreground",
                            !isSelected &&
                              !day.isPast &&
                              day.isCurrentMonth &&
                              "hover:bg-muted",
                          )}
                        >
                          {day.date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Slots */}
                <div>
                  <h3 className="font-medium mb-4">
                    {selectedDate
                      ? selectedDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : "Select a date"}
                  </h3>
                  {!selectedDate ? (
                    <div className="text-sm text-muted-foreground">
                      Choose a date to see available times
                    </div>
                  ) : slotsLoading ? (
                    <div className="text-sm text-muted-foreground">
                      Loading times...
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No available times on this date
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {availableSlots.map((slot) => (
                        <Button
                          key={slot.start}
                          variant={
                            selectedTime === slot.start ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setSelectedTime(slot.start)}
                          className="justify-start"
                        >
                          <Icon icon={Clock01Icon} data-icon="inline-start" />
                          {formatTime(slot.start)}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Client Search (optional) */}
            <div className="mb-6">
              <Label>Client (optional)</Label>
              <div className="mt-2 space-y-2">
                <Input
                  placeholder="Search by name or email..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {clients.length > 0 && (
                  <div className="rounded-md border border-border/50 divide-y divide-border/50">
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
              <Textarea
                placeholder="Add any notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/50 px-6 py-4">
            <div className="text-sm text-muted-foreground">
              {selectedTime && (
                <span className="flex items-center gap-2">
                  <Icon icon={Calendar03Icon} />
                  {formatSelectedDateTime()}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canBook || createMutation.isPending}
              >
                {createMutation.isPending ? "Booking..." : "Book Appointment"}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
