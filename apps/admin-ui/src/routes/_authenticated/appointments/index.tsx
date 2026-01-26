// Appointments list page with filters and status management

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Cancel01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function AppointmentsPage() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    calendarId: "",
    appointmentTypeId: "",
    status: "",
    startDate: "",
    endDate: "",
  });

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [noShowId, setNoShowId] = useState<string | null>(null);

  // Fetch appointments with filters
  const { data, isLoading, error } = useQuery(
    orpc.appointments.list.queryOptions({
      input: {
        limit: 50,
        ...(filters.calendarId && { calendarId: filters.calendarId }),
        ...(filters.appointmentTypeId && {
          appointmentTypeId: filters.appointmentTypeId,
        }),
        ...(filters.status && {
          status: filters.status as
            | "scheduled"
            | "confirmed"
            | "cancelled"
            | "no_show",
        }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      },
    }),
  );

  // Fetch calendars for filter
  const { data: calendarsData } = useQuery(
    orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Fetch appointment types for filter
  const { data: typesData } = useQuery(
    orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Cancel mutation
  const cancelMutation = useMutation(
    orpc.appointments.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setCancellingId(null);
        toast.success("Appointment cancelled");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel appointment");
      },
    }),
  );

  // No-show mutation
  const noShowMutation = useMutation(
    orpc.appointments.noShow.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.appointments.key() });
        setNoShowId(null);
        toast.success("Appointment marked as no-show");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to mark as no-show");
      },
    }),
  );

  const calendars = calendarsData?.items ?? [];
  const appointmentTypes = typesData?.items ?? [];

  const selectedCalendar = calendars.find((c) => c.id === filters.calendarId);
  const selectedType = appointmentTypes.find(
    (t) => t.id === filters.appointmentTypeId,
  );

  const formatDateTime = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleCancel = () => {
    if (!cancellingId) return;
    cancelMutation.mutate({ id: cancellingId });
  };

  const handleNoShow = () => {
    if (!noShowId) return;
    noShowMutation.mutate({ id: noShowId });
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "scheduled":
        return "secondary";
      case "confirmed":
        return "success";
      case "cancelled":
        return "destructive";
      case "no_show":
        return "warning";
      default:
        return "secondary";
    }
  };

  return (
    <div className="p-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Appointments
          </h1>
          <p className="mt-2 text-muted-foreground">
            View and manage all appointments.
          </p>
        </div>
        <Button asChild>
          <Link to="/appointments/new">
            <Icon icon={Add01Icon} className="mr-2" />
            New Appointment
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-8 grid grid-cols-1 gap-5 rounded-xl border border-border/50 bg-card p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2.5">
          <Label>Calendar</Label>
          <Select
            value={filters.calendarId || "all"}
            onValueChange={(value) =>
              value &&
              setFilters((f) => ({
                ...f,
                calendarId: value === "all" ? "" : value,
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All calendars">
                {selectedCalendar?.name ?? "All calendars"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All calendars</SelectItem>
              {calendars.map((cal) => (
                <SelectItem key={cal.id} value={cal.id}>
                  {cal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2.5">
          <Label>Type</Label>
          <Select
            value={filters.appointmentTypeId || "all"}
            onValueChange={(value) =>
              value &&
              setFilters((f) => ({
                ...f,
                appointmentTypeId: value === "all" ? "" : value,
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All types">
                {selectedType?.name ?? "All types"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {appointmentTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2.5">
          <Label>Status</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) =>
              value &&
              setFilters((f) => ({
                ...f,
                status: value === "all" ? "" : value,
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All statuses">
                {filters.status
                  ? ({
                      scheduled: "Scheduled",
                      confirmed: "Confirmed",
                      cancelled: "Cancelled",
                      no_show: "No Show",
                    }[filters.status] ?? "All statuses")
                  : "All statuses"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2.5">
          <Label>From Date</Label>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) =>
              setFilters((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2.5">
          <Label>To Date</Label>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) =>
              setFilters((f) => ({ ...f, endDate: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Appointments Table */}
      <div className="mt-8">
        {isLoading ? (
          <div
            className="text-center text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Loading...
          </div>
        ) : error ? (
          <div className="text-center text-destructive">
            Error loading appointments
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            No appointments found. Create your first appointment or adjust
            filters.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Calendar</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell className="font-medium">
                      {formatDateTime(appointment.startAt)}
                    </TableCell>
                    <TableCell>
                      {appointment.appointmentType?.name ?? "-"}
                    </TableCell>
                    <TableCell>{appointment.calendar?.name ?? "-"}</TableCell>
                    <TableCell>
                      {appointment.client
                        ? `${appointment.client.firstName} ${appointment.client.lastName}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(appointment.status)}>
                        {appointment.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {appointment.status === "scheduled" ||
                      appointment.status === "confirmed" ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Mark as no-show"
                            aria-label="Mark as no-show"
                            onClick={() => setNoShowId(appointment.id)}
                          >
                            <Icon icon={Clock01Icon} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Cancel appointment"
                            aria-label="Cancel appointment"
                            onClick={() => setCancellingId(appointment.id)}
                          >
                            <Icon icon={Cancel01Icon} />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Cancel Confirmation */}
      <AlertDialog
        open={!!cancellingId}
        onOpenChange={() => setCancellingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? The client will
              be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending
                ? "Cancelling..."
                : "Cancel Appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-Show Confirmation */}
      <AlertDialog open={!!noShowId} onOpenChange={() => setNoShowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as No-Show</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this appointment as a no-show?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNoShow}>
              {noShowMutation.isPending ? "Saving..." : "Mark as No-Show"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/appointments/")({
  component: AppointmentsPage,
});
