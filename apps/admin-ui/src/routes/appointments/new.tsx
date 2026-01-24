// New appointment booking form with availability picker

import { useState } from "react";
import {
  createFileRoute,
  Navigate,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar } from "lucide-react";

import { useAuth } from "@/contexts/auth";
import { orpc } from "@/lib/query";

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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        navigate({ to: "/appointments" });
      },
    }),
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/appointments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Appointment</h1>
          <p className="mt-1 text-muted-foreground">
            Book a new appointment by selecting type, calendar, and time.
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      <div className="grid gap-6 lg:grid-cols-2">
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
              <Select value={selectedTypeId} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose appointment type" />
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
                    onValueChange={handleCalendarChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose calendar" />
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
            <CardContent className="space-y-4">
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
                  className="mt-1"
                />
              </div>

              <Separator />

              <Button
                onClick={handleSubmit}
                disabled={!selectedTime || createMutation.isPending}
                className="w-full"
              >
                <Calendar className="mr-2 h-4 w-4" />
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

export const Route = createFileRoute("/appointments/new")({
  component: NewAppointmentPage,
});
