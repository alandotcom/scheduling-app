// Link calendars to appointment type

import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/contexts/auth";
import { orpc } from "@/lib/query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

function AppointmentTypeCalendarsPage() {
  const { typeId } = Route.useParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");

  // Fetch appointment type details
  const { data: appointmentType, isLoading: typeLoading } = useQuery(
    orpc.appointmentTypes.get.queryOptions({
      input: { id: typeId },
    }),
  );

  // Fetch linked calendars
  const { data: linkedCalendars, isLoading: linkedLoading } = useQuery(
    orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId: typeId },
    }),
  );

  // Fetch all calendars for the dropdown
  const { data: allCalendars } = useQuery(
    orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Add calendar mutation
  const addMutation = useMutation(
    orpc.appointmentTypes.calendars.add.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
        setSelectedCalendarId("");
      },
    }),
  );

  // Remove calendar mutation
  const removeMutation = useMutation(
    orpc.appointmentTypes.calendars.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
      },
    }),
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  const isLoading = typeLoading || linkedLoading;

  // Filter out already linked calendars
  const linkedIds = new Set(linkedCalendars?.map((c) => c.calendarId) ?? []);
  const availableCalendars = allCalendars?.items.filter((c) => !linkedIds.has(c.id)) ?? [];

  const handleAdd = () => {
    if (!selectedCalendarId) return;
    addMutation.mutate({
      appointmentTypeId: typeId,
      data: { calendarId: selectedCalendarId },
    });
  };

  const handleRemove = (calendarId: string) => {
    removeMutation.mutate({
      appointmentTypeId: typeId,
      calendarId,
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/appointment-types">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {appointmentType?.name ?? "Appointment Type"} - Calendars
          </h1>
          <p className="mt-1 text-muted-foreground">
            Select which calendars can offer this appointment type.
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Add Calendar */}
      <div className="flex gap-4">
        <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select a calendar to add" />
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
        <Button onClick={handleAdd} disabled={!selectedCalendarId || addMutation.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          {addMutation.isPending ? "Adding..." : "Add Calendar"}
        </Button>
      </div>

      {/* Linked Calendars */}
      <div className="mt-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : !linkedCalendars?.length ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No calendars linked yet. Add a calendar to make this appointment type available.
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Calendar</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedCalendars.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.calendar.name}</TableCell>
                    <TableCell>{link.calendar.timezone}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(link.calendarId)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/appointment-types/$typeId/calendars")({
  component: AppointmentTypeCalendarsPage,
});
