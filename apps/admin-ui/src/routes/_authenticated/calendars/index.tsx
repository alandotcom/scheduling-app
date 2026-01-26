// Calendars management page with drawer and context menus

import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  PencilEdit01Icon,
  Delete01Icon,
  Clock01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { createCalendarSchema } from "@scheduling/dto";
import type { CreateCalendarInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { CalendarDrawer } from "@/components/calendar-drawer";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CalendarItem {
  id: string;
  name: string;
  timezone: string;
  locationId?: string | null;
  createdAt: string | Date;
}

interface CalendarFormProps {
  defaultValues?: {
    name: string;
    timezone: string;
    locationId?: string;
  };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateCalendarInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function CalendarForm({
  defaultValues,
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
}: CalendarFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCalendarInput>({
    resolver: zodResolver(createCalendarSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      name: "",
      timezone: "America/New_York",
    },
  });

  const timezone = watch("timezone");
  const locationId = watch("locationId");
  const selectedLocation = locations.find((l) => l.id === locationId);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Dr. Smith's Calendar"
          aria-describedby={errors.name ? "name-error" : undefined}
          aria-invalid={!!errors.name}
          {...register("name")}
          disabled={isSubmitting}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="space-y-2.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={timezone}
          onValueChange={(value) => value && setValue("timezone", value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
        )}
      </div>
      <div className="space-y-2.5">
        <Label htmlFor="locationId">Location (optional)</Label>
        <Select
          value={locationId ?? "none"}
          onValueChange={(value) =>
            value &&
            setValue("locationId", value === "none" ? undefined : value)
          }
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select location">
              {selectedLocation?.name ?? (locationId ? null : "No location")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No location</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function CalendarsPage() {
  const queryClient = useQueryClient();
  const crud = useCrudState<CalendarItem>();

  // Drawer state
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarItem | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch calendars
  const { data, isLoading, error } = useQuery(
    orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Fetch locations for the dropdown
  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Create mutation
  const createMutation = useMutation(
    orpc.calendars.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        crud.closeCreate();
        toast.success("Calendar created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create calendar");
      },
    }),
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.calendars.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        crud.closeEdit();
        toast.success("Calendar updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update calendar");
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.calendars.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        crud.closeDelete();
        toast.success("Calendar deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete calendar");
      },
    }),
  );

  const locations = locationsData?.items ?? [];

  const handleCreate = (formData: CreateCalendarInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateCalendarInput) => {
    if (!crud.editingItem) return;
    updateMutation.mutate({
      id: crud.editingItem.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const getLocationName = (locationId: string | null | undefined) => {
    if (!locationId) return "-";
    const location = locations.find((l) => l.id === locationId);
    return location?.name ?? "-";
  };

  const openDrawer = useCallback((calendar: CalendarItem) => {
    setSelectedCalendar(calendar);
    setDrawerOpen(true);
  }, []);

  const getContextMenuItems = useCallback(
    (calendar: CalendarItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDrawer(calendar),
      },
      {
        label: "Manage Availability",
        icon: Clock01Icon,
        onClick: () => {
          // This would navigate, but for context menu we'll use the drawer
          openDrawer(calendar);
        },
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () =>
          crud.openEdit({
            id: calendar.id,
            name: calendar.name,
            timezone: calendar.timezone,
            locationId: calendar.locationId ?? undefined,
            createdAt: calendar.createdAt,
          }),
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(calendar.id),
        variant: "destructive",
        separator: true,
      },
    ],
    [openDrawer, crud],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage calendars and their availability
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add Calendar
          </Button>
        )}
      </div>

      {/* Create Form */}
      {crud.showCreateForm && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            New Calendar
          </h2>
          <CalendarForm
            locations={locations}
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit Form */}
      {crud.editingItem && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            Edit Calendar
          </h2>
          <CalendarForm
            defaultValues={{
              name: crud.editingItem.name,
              timezone: crud.editingItem.timezone,
              locationId: crud.editingItem.locationId ?? undefined,
            }}
            locations={locations}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      {/* Calendars Table */}
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
            Error loading calendars
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            No calendars yet. Create your first calendar to get started.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((calendar) => (
                  <ContextMenu
                    key={calendar.id}
                    items={getContextMenuItems(calendar as CalendarItem)}
                  >
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openDrawer(calendar as CalendarItem)}
                    >
                      <TableCell className="font-medium">
                        {calendar.name}
                      </TableCell>
                      <TableCell>{calendar.timezone}</TableCell>
                      <TableCell>
                        {getLocationName(calendar.locationId)}
                      </TableCell>
                      <TableCell>
                        {new Date(calendar.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Calendar Drawer */}
      <CalendarDrawer
        calendar={selectedCalendar}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedCalendar(null);
        }}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Calendar"
        description="Are you sure you want to delete this calendar? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/calendars/")({
  component: CalendarsPage,
});
