// Appointments list page with filters and status management

import { useState } from "react";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Clock } from "lucide-react";

import { useAuth } from "@/contexts/auth";
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

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-gray-100 text-gray-800",
};

function AppointmentsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        setCancellingId(null);
      },
    }),
  );

  // No-show mutation
  const noShowMutation = useMutation(
    orpc.appointments.noShow.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        setNoShowId(null);
      },
    }),
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  const calendars = calendarsData?.items ?? [];
  const appointmentTypes = typesData?.items ?? [];

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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="mt-1 text-muted-foreground">
            View and manage all appointments.
          </p>
        </div>
        <Button asChild>
          <Link to="/appointments/new">
            <Plus className="mr-2 h-4 w-4" />
            New Appointment
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-5 gap-4 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label>Calendar</Label>
          <Select
            value={filters.calendarId || "all"}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                calendarId: value === "all" ? "" : value,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All calendars" />
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
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={filters.appointmentTypeId || "all"}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                appointmentTypeId: value === "all" ? "" : value,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All types" />
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
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                status: value === "all" ? "" : value,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
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
        <div className="space-y-2">
          <Label>From Date</Label>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) =>
              setFilters((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
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
      <div className="mt-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="text-center text-destructive">
            Error loading appointments
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No appointments found. Create your first appointment or adjust
            filters.
          </div>
        ) : (
          <div className="rounded-lg border">
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
                      <Badge
                        className={STATUS_COLORS[appointment.status] ?? ""}
                        variant="secondary"
                      >
                        {appointment.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {appointment.status === "scheduled" ||
                      appointment.status === "confirmed" ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Mark as no-show"
                            onClick={() => setNoShowId(appointment.id)}
                          >
                            <Clock className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Cancel"
                            onClick={() => setCancellingId(appointment.id)}
                          >
                            <X className="h-4 w-4" />
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

export const Route = createFileRoute("/appointments")({
  component: AppointmentsPage,
});
