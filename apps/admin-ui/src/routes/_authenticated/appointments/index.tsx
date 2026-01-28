// Appointments list page with filters, clickable rows, and context menus

import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Add01Icon,
  Cancel01Icon,
  Clock01Icon,
  CheckmarkCircle01Icon,
  TimeScheduleIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  FilterPopover,
  FilterField,
  ActiveFilters,
} from "@/components/filter-popover";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { AppointmentDrawer } from "@/components/appointment-drawer";
import { AppointmentModal } from "@/components/appointment-modal";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

type AppointmentWithRelations = {
  id: string;
  startAt: string | Date;
  endAt: string | Date;
  timezone: string;
  status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  notes: string | null;
  calendar?: { id: string; name: string; timezone: string } | null;
  appointmentType?: { id: string; name: string; durationMin: number } | null;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
};

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

  // Drawer state
  const [selectedAppointment, setSelectedAppointment] =
    useState<AppointmentWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);

  // Keyboard shortcut for new appointment
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+n", "ctrl+n"],
        action: () => setModalOpen(true),
        description: "New appointment",
      },
    ],
  });

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

  const formatDateTime = (dateString: string | Date, includeDate = true) => {
    const date = new Date(dateString);
    if (includeDate) {
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return date.toLocaleTimeString("en-US", {
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

  const openDrawer = useCallback((appointment: AppointmentWithRelations) => {
    setSelectedAppointment(appointment);
    setDrawerOpen(true);
  }, []);

  const getContextMenuItems = useCallback(
    (appointment: AppointmentWithRelations): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [
        {
          label: "View Details",
          icon: ViewIcon,
          onClick: () => openDrawer(appointment),
        },
      ];

      if (
        appointment.status === "scheduled" ||
        appointment.status === "confirmed"
      ) {
        if (appointment.status === "scheduled") {
          items.push({
            label: "Confirm",
            icon: CheckmarkCircle01Icon,
            onClick: () => {
              // Confirm logic would go here
              toast.info("Confirm feature coming soon");
            },
          });
        }

        items.push({
          label: "Reschedule",
          icon: TimeScheduleIcon,
          onClick: () => {
            toast.info("Reschedule feature coming soon");
          },
        });

        items.push({
          label: "Mark No-Show",
          icon: Clock01Icon,
          onClick: () => setNoShowId(appointment.id),
        });

        items.push({
          label: "Cancel",
          icon: Cancel01Icon,
          onClick: () => setCancellingId(appointment.id),
          variant: "destructive",
          separator: true,
        });
      }

      return items;
    },
    [openDrawer],
  );

  // Calculate active filter count
  const activeFilterCount = [
    filters.calendarId,
    filters.appointmentTypeId,
    filters.status,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;

  // Build active filters display
  const activeFilters = [
    filters.calendarId && {
      label: "Calendar",
      value: selectedCalendar?.name ?? "Unknown",
      onRemove: () => setFilters((f) => ({ ...f, calendarId: "" })),
    },
    filters.appointmentTypeId && {
      label: "Type",
      value: selectedType?.name ?? "Unknown",
      onRemove: () => setFilters((f) => ({ ...f, appointmentTypeId: "" })),
    },
    filters.status && {
      label: "Status",
      value: filters.status.replace("_", " "),
      onRemove: () => setFilters((f) => ({ ...f, status: "" })),
    },
    filters.startDate && {
      label: "From",
      value: filters.startDate,
      onRemove: () => setFilters((f) => ({ ...f, startDate: "" })),
    },
    filters.endDate && {
      label: "To",
      value: filters.endDate,
      onRemove: () => setFilters((f) => ({ ...f, endDate: "" })),
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    onRemove: () => void;
  }>;

  const clearAllFilters = () => {
    setFilters({
      calendarId: "",
      appointmentTypeId: "",
      status: "",
      startDate: "",
      endDate: "",
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Appointments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage all appointments
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Appointment
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-4">
        <FilterPopover
          activeFilterCount={activeFilterCount}
          onClear={clearAllFilters}
        >
          <FilterField label="Calendar">
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
          </FilterField>

          <FilterField label="Type">
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
          </FilterField>

          <FilterField label="Status">
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
          </FilterField>

          <FilterField label="From Date">
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, startDate: e.target.value }))
              }
            />
          </FilterField>

          <FilterField label="To Date">
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, endDate: e.target.value }))
              }
            />
          </FilterField>
        </FilterPopover>

        {activeFilters.length > 0 && <ActiveFilters filters={activeFilters} />}
      </div>

      {/* Appointments Table */}
      <div className="mt-6">
        {isLoading ? (
          <div
            className="text-center text-muted-foreground py-10"
            role="status"
            aria-live="polite"
          >
            Loading...
          </div>
        ) : error ? (
          <div className="text-center text-destructive py-10">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((appointment) => (
                  <ContextMenu
                    key={appointment.id}
                    items={getContextMenuItems(
                      appointment as AppointmentWithRelations,
                    )}
                  >
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        openDrawer(appointment as AppointmentWithRelations)
                      }
                    >
                      <TableCell className="font-medium">
                        <div>{formatDateTime(appointment.startAt)}</div>
                        {appointment.appointmentType?.durationMin && (
                          <div className="text-xs text-muted-foreground">
                            {appointment.appointmentType.durationMin} min
                          </div>
                        )}
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
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Appointment Drawer */}
      <AppointmentDrawer
        appointment={selectedAppointment}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedAppointment(null);
        }}
      />

      {/* Appointment Modal */}
      <AppointmentModal open={modalOpen} onOpenChange={setModalOpen} />

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

interface AppointmentsSearchParams {
  selected?: string;
  tab?: "details";
  view?: "list" | "schedule";
  date?: string;
  calendarId?: string;
  clientId?: string;
  appointmentTypeId?: string;
  status?: string;
}

export const Route = createFileRoute("/_authenticated/appointments/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): AppointmentsSearchParams => {
    return {
      selected:
        typeof search.selected === "string" ? search.selected : undefined,
      tab:
        typeof search.tab === "string" && search.tab === "details"
          ? "details"
          : undefined,
      view:
        typeof search.view === "string" &&
        (search.view === "list" || search.view === "schedule")
          ? search.view
          : undefined,
      date:
        typeof search.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(search.date)
          ? search.date
          : undefined,
      calendarId:
        typeof search.calendarId === "string" ? search.calendarId : undefined,
      clientId:
        typeof search.clientId === "string" ? search.clientId : undefined,
      appointmentTypeId:
        typeof search.appointmentTypeId === "string"
          ? search.appointmentTypeId
          : undefined,
      status: typeof search.status === "string" ? search.status : undefined,
    };
  },
  component: AppointmentsPage,
});
