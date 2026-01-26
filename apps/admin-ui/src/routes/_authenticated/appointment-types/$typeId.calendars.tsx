// Link calendars to appointment type

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

import { orpc } from "@/lib/query";
import { Icon } from "@/components/ui/icon";
import { Breadcrumb } from "@/components/breadcrumb";

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
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        setSelectedCalendarId("");
      },
    }),
  );

  // Remove calendar mutation
  const removeMutation = useMutation(
    orpc.appointmentTypes.calendars.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
      },
    }),
  );

  const isLoading = typeLoading || linkedLoading;

  // Filter out already linked calendars
  const linkedIds = new Set(linkedCalendars?.map((c) => c.calendarId) ?? []);
  const availableCalendars =
    allCalendars?.items.filter((c) => !linkedIds.has(c.id)) ?? [];
  const selectedCalendar = availableCalendars.find(
    (c) => c.id === selectedCalendarId,
  );

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
    <div className="p-10">
      <Breadcrumb
        items={[
          { label: "Appointment Types", to: "/appointment-types" },
          { label: appointmentType?.name ?? "..." },
          { label: "Calendars" },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {appointmentType?.name ?? "Appointment Type"} - Calendars
        </h1>
        <p className="mt-2 text-muted-foreground">
          Select which calendars can offer this appointment type.
        </p>
      </div>

      <Separator className="my-8" />

      {/* Add Calendar */}
      <div className="flex gap-4">
        <Select
          value={selectedCalendarId}
          onValueChange={(v) => v && setSelectedCalendarId(v)}
        >
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select a calendar to add">
              {selectedCalendar?.name}
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
          onClick={handleAdd}
          disabled={!selectedCalendarId || addMutation.isPending}
        >
          <Icon icon={Add01Icon} className="mr-2" />
          {addMutation.isPending ? "Adding..." : "Add Calendar"}
        </Button>
      </div>

      {/* Linked Calendars */}
      <div className="mt-8">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : !linkedCalendars?.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            No calendars linked yet. Add a calendar to make this appointment
            type available.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
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
                    <TableCell className="font-medium">
                      {link.calendar.name}
                    </TableCell>
                    <TableCell>{link.calendar.timezone}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemove(link.calendarId)}
                        disabled={removeMutation.isPending}
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
    </div>
  );
}

export const Route = createFileRoute(
  "/_authenticated/appointment-types/$typeId/calendars",
)({
  component: AppointmentTypeCalendarsPage,
});
