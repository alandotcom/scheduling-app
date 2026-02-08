// Reschedule appointment dialog with calendar and time slot picker

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { DateTime } from "luxon";
import { Calendar03Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AppointmentWithRelations } from "@scheduling/dto";

import { orpc } from "@/lib/query";
import { STANDARD_MODAL_MAX_WIDTH_CLASS } from "@/lib/modal";
import { cn } from "@/lib/utils";
import {
  formatDateWithWeekday,
  formatTimezoneShort,
  formatTimeDisplay,
  getUserTimezone,
} from "@/lib/date-utils";
import {
  DEFAULT_SCHEDULING_TIMEZONE_MODE,
  resolveEffectiveSchedulingTimezone,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";
import { AvailabilityCalendarPicker } from "@/components/appointments/availability-calendar-picker";
import { AvailabilityManageModal } from "@/components/availability/availability-manage-modal";
import { TimeDisplayToggle } from "@/components/appointments/time-display-toggle";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";

interface RescheduleDialogProps {
  appointment: AppointmentWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezoneMode?: SchedulingTimezoneMode;
  onTimezoneModeChange?: (mode: SchedulingTimezoneMode) => void;
  displayTimezone?: string;
  defaultTimezone?: string;
}

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
  timezoneMode: controlledTimezoneMode,
  onTimezoneModeChange,
  displayTimezone,
  defaultTimezone,
}: RescheduleDialogProps) {
  const queryClient = useQueryClient();
  const viewerTimezone = getUserTimezone();
  const [localTimezoneMode, setLocalTimezoneMode] =
    useState<SchedulingTimezoneMode>(DEFAULT_SCHEDULING_TIMEZONE_MODE);
  const [selectedDate, setSelectedDate] = useState<DateTime | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() =>
    DateTime.now().startOf("month"),
  );
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const timezoneMode = controlledTimezoneMode ?? localTimezoneMode;
  const selectedDisplayTimezone = displayTimezone ?? defaultTimezone;
  const calendarTimezone =
    appointment.calendar?.timezone ?? appointment.timezone;
  const effectiveTimezone = resolveEffectiveSchedulingTimezone({
    mode: timezoneMode,
    calendarTimezone,
    selectedTimezone: selectedDisplayTimezone,
    fallbackTimezone: defaultTimezone,
    viewerTimezone,
  });
  const timezoneShortLabel = formatTimezoneShort(
    effectiveTimezone,
    selectedTime ?? undefined,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedTime(null);
  }, [open, timezoneMode]);

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Reset to current month when opening
      setViewMonth(DateTime.now().startOf("month"));
    }
    if (!isOpen) {
      setSelectedDate(null);
      setSelectedTime(null);
      setAvailabilityModalOpen(false);
    }
    onOpenChange(isOpen);
  };

  // Reschedule mutation
  const rescheduleMutation = useMutation(
    orpc.appointments.reschedule.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        queryClient.invalidateQueries({ queryKey: orpc.audit.key() });
        handleOpenChange(false);
        toast.success("Appointment rescheduled");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to reschedule appointment");
      },
    }),
  );

  // Format date strings using Luxon to avoid timezone issues
  const monthStartDateStr = viewMonth.startOf("month").toISODate() ?? "";
  const monthEndDateStr = viewMonth.endOf("month").toISODate() ?? "";

  // Available time slots query for visible month
  const {
    data: slotsData,
    isLoading: slotsLoading,
    refetch: refetchSlots,
  } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: appointment.appointmentTypeId,
        calendarIds: [appointment.calendarId],
        startDate: monthStartDateStr,
        endDate: monthEndDateStr,
        timezone: calendarTimezone,
      },
    }),
    enabled: open && !!monthStartDateStr && !!monthEndDateStr,
  });

  const monthSlots = slotsData?.slots ?? [];

  const openCalendarAvailability = () => {
    setAvailabilityModalOpen(true);
  };

  useEffect(() => {
    if (!open || !selectedDate || !selectedTime || slotsLoading) return;

    const stillAvailable = monthSlots.some((slot) => {
      return slot.start === selectedTime;
    });
    if (!stillAvailable) {
      setSelectedTime(null);
    }
  }, [monthSlots, open, selectedDate, selectedTime, slotsLoading]);

  const canReschedule = !!selectedTime && !rescheduleMutation.isPending;
  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: open,
    fields: [
      {
        id: "time-display",
        key: "z",
        description: "Focus time display",
      },
      {
        id: "date-time",
        key: "d",
        description: "Focus date and time",
      },
    ],
  });

  useSubmitShortcut({
    enabled: open && canReschedule,
    onSubmit: () => {
      if (!selectedTime) return;
      rescheduleMutation.mutate({
        id: appointment.id,
        data: {
          newStartTime: DateTime.fromISO(selectedTime, {
            setZone: true,
          }).toJSDate(),
          timezone: calendarTimezone,
        },
      });
    },
  });

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            className={cn(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "duration-200",
            )}
          />
          <DialogPrimitive.Popup
            data-slot="reschedule-dialog-content"
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
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <DialogPrimitive.Title className="text-lg font-medium">
                Reschedule Appointment
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <span className="sr-only">Close</span>
                <Icon icon={Cancel01Icon} />
              </DialogPrimitive.Close>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Current Time */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Current Time
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Icon
                      icon={Calendar03Icon}
                      className="text-muted-foreground"
                    />
                    <span className="font-medium">
                      {formatDateWithWeekday(
                        appointment.startAt,
                        effectiveTimezone,
                      )}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      {formatTimeDisplay(
                        appointment.startAt,
                        effectiveTimezone,
                      )}{" "}
                      -{" "}
                      {formatTimeDisplay(appointment.endAt, effectiveTimezone)}{" "}
                      ({timezoneShortLabel})
                    </span>
                  </div>
                </div>

                <div
                  className="rounded-lg border border-border bg-muted/30 px-4 py-3 relative"
                  ref={registerField("time-display")}
                >
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
                  <FieldShortcutHint
                    shortcut="z"
                    label="Display"
                    visible={hintsVisible}
                  />
                </div>
              </div>

              {/* Calendar and Time Selection */}
              <div className="relative" ref={registerField("date-time")}>
                <AvailabilityCalendarPicker
                  viewMonth={viewMonth}
                  onViewMonthChange={setViewMonth}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setSelectedTime(null);
                  }}
                  selectedTime={selectedTime}
                  onSelectTime={setSelectedTime}
                  monthSlots={monthSlots}
                  slotsLoading={slotsLoading}
                  schedulingTimezone={calendarTimezone}
                  displayTimezone={effectiveTimezone}
                  onManageAvailability={openCalendarAvailability}
                />
                <FieldShortcutHint
                  shortcut="d"
                  label="Date/Time"
                  visible={hintsVisible}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedTime) {
                    rescheduleMutation.mutate({
                      id: appointment.id,
                      data: {
                        newStartTime: DateTime.fromISO(selectedTime, {
                          setZone: true,
                        }).toJSDate(),
                        timezone: calendarTimezone,
                      },
                    });
                  }
                }}
                disabled={!canReschedule}
              >
                {rescheduleMutation.isPending
                  ? "Rescheduling..."
                  : "Reschedule"}
                <ShortcutBadge
                  shortcut="meta+enter"
                  className="ml-2 hidden sm:inline-flex"
                />
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <AvailabilityManageModal
        open={availabilityModalOpen && open}
        onOpenChange={(nextOpen) => {
          setAvailabilityModalOpen(nextOpen);
          if (!nextOpen) {
            void refetchSlots();
          }
        }}
        calendarId={appointment.calendarId}
        calendarName={appointment.calendar?.name}
        timezone={calendarTimezone}
        initialTab="weekly"
      />
    </>
  );
}
