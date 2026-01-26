// New appointment booking form with availability picker

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar03Icon } from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Breadcrumb } from "@/components/breadcrumb";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function NewAppointmentPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [_step, setStep] = useState<"select" | "time" | "confirm">("select");
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [timezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  // Fetch appointment types
  const { data: typesData } = useQuery(
    orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Fetch calendars linked to the selected type
  const { data: linkedCalendars, isLoading: calendarsLoading } = useQuery({
    ...orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId: selectedTypeId },
    }),
    enabled: !!selectedTypeId,
  });

  // Fetch available time slots
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    ...orpc.availability.engine.times.queryOptions({
      input: {
        appointmentTypeId: selectedTypeId,
        calendarIds: [selectedCalendarId],
        startDate: selectedDate,
        endDate: selectedDate,
        timezone,
      },
    }),
    enabled: !!selectedTypeId && !!selectedCalendarId && !!selectedDate,
  });

  // Create appointment mutation
  const createMutation = useMutation(
    orpc.appointments.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        navigate({ to: "/appointments" });
      },
    }),
  );

  const appointmentTypes = typesData?.items ?? [];
  const calendars = linkedCalendars?.map((l) => l.calendar) ?? [];
  const availableSlots = slotsData?.slots.filter((s) => s.available) ?? [];

  const selectedType = appointmentTypes.find((t) => t.id === selectedTypeId);
  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    setSelectedCalendarId("");
    setSelectedDate("");
    setSelectedTime("");
    setStep("select");
  };

  const handleCalendarChange = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    setSelectedDate("");
    setSelectedTime("");
    setStep("select");
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedTime("");
    setStep("time");
  };

  const handleTimeSelect = (startTime: string) => {
    setSelectedTime(startTime);
    setStep("confirm");
  };

  const handleSubmit = () => {
    if (!selectedTime) return;

    createMutation.mutate({
      calendarId: selectedCalendarId,
      appointmentTypeId: selectedTypeId,
      startTime: new Date(selectedTime),
      timezone,
      notes: notes || undefined,
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

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="p-10">
      <Breadcrumb
        items={[
          { label: "Appointments", to: "/appointments" },
          { label: "New Appointment" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          New Appointment
        </h1>
        <p className="mt-2 text-muted-foreground">
          Book a new appointment by selecting type, calendar, and time.
        </p>
      </div>

      <Separator className="my-8" />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Selection Form */}
        <div className="space-y-6">
          {/* Step 1: Select Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                1. Select Appointment Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedTypeId}
                onValueChange={(v) => v && handleTypeChange(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose appointment type">
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
            </CardContent>
          </Card>

          {/* Step 2: Select Calendar */}
          {selectedTypeId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Select Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                {calendarsLoading ? (
                  <div className="text-muted-foreground">
                    Loading calendars...
                  </div>
                ) : calendars.length === 0 ? (
                  <div className="text-muted-foreground">
                    No calendars available for this appointment type.
                  </div>
                ) : (
                  <Select
                    value={selectedCalendarId}
                    onValueChange={(v) => v && handleCalendarChange(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose calendar">
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
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Select Date */}
          {selectedCalendarId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">3. Select Date</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 4: Select Time */}
          {selectedDate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">4. Select Time</CardTitle>
              </CardHeader>
              <CardContent>
                {slotsLoading ? (
                  <div className="text-muted-foreground">
                    Loading available times...
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-muted-foreground">
                    No available times on this date. Please select another date.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.map((slot) => (
                      <Button
                        key={slot.start}
                        variant={
                          selectedTime === slot.start ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => handleTimeSelect(slot.start)}
                      >
                        {formatTime(slot.start)}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Confirmation */}
        <div>
          <Card className="sticky top-8">
            <CardHeader>
              <CardTitle className="text-lg">Booking Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {selectedType && (
                <div>
                  <Label className="text-muted-foreground">
                    Appointment Type
                  </Label>
                  <p className="font-medium">
                    {selectedType.name} ({selectedType.durationMin} min)
                  </p>
                </div>
              )}

              {selectedCalendar && (
                <div>
                  <Label className="text-muted-foreground">Calendar</Label>
                  <p className="font-medium">{selectedCalendar.name}</p>
                </div>
              )}

              {selectedTime && (
                <div>
                  <Label className="text-muted-foreground">Date & Time</Label>
                  <p className="font-medium">{formatDateTime(selectedTime)}</p>
                </div>
              )}

              <div>
                <Label htmlFor="notes" className="text-muted-foreground">
                  Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2"
                />
              </div>

              <Separator />

              <Button
                onClick={handleSubmit}
                disabled={!selectedTime || createMutation.isPending}
                className="w-full"
              >
                <Icon icon={Calendar03Icon} className="mr-2" />
                {createMutation.isPending ? "Booking..." : "Book Appointment"}
              </Button>

              {createMutation.error && (
                <p className="text-sm text-destructive">
                  {(createMutation.error as Error).message ??
                    "Failed to book appointment"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/appointments/new")({
  component: NewAppointmentPage,
});
