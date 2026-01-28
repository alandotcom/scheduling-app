// Calendars management page with drawer and context menus

import { useCallback, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  PencilEdit01Icon,
  Delete01Icon,
  Clock01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { createCalendarSchema } from "@scheduling/dto";
import type { CreateCalendarInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import {
  useFocusZones,
  useListNavigation,
  FOCUS_ZONES,
} from "@/hooks/use-keyboard-shortcuts";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  SplitPaneLayout,
} from "@/components/split-pane";

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
import { cn } from "@/lib/utils";

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

type DetailTabValue = "details" | "availability" | "appointments";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "availability" || value === "appointments";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab ?? "details";
  const detailOpen = !!selectedId;

  // Fetch calendars (moved up for keyboard navigation)
  const { data, isLoading, error } = useQuery(
    orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  const calendars = data?.items ?? [];
  const selectedIndex = selectedId
    ? calendars.findIndex((c) => c.id === selectedId)
    : -1;

  const openDetails = useCallback(
    (calendarId: string, tab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: calendarId,
          tab,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    navigate({
      search: () => ({
        selected: undefined,
        tab: undefined,
      }),
    });
  }, [navigate]);

  const setActiveTab = useCallback(
    (value: string) => {
      if (!selectedId || !isDetailTab(value)) return;
      navigate({
        search: (prev) => ({
          ...prev,
          selected: selectedId,
          tab: value,
        }),
      });
    },
    [navigate, selectedId],
  );

  // Keyboard shortcuts for focus zones (Cmd+L, Cmd+D, Escape)
  useFocusZones({
    onEscape: clearDetails,
    detailOpen,
  });

  // Keyboard shortcuts for list navigation (j/k/arrows, Enter)
  useListNavigation({
    items: calendars,
    selectedIndex,
    onSelect: (index) => {
      const calendar = calendars[index];
      if (calendar) {
        openDetails(calendar.id, "details");
      }
    },
    onOpen: (calendar) => {
      openDetails(calendar.id, "details");
    },
    enabled: !crud.isFormOpen, // Disable when editing
  });

  // Fetch locations for the dropdown
  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  const { data: availabilityData } = useQuery({
    ...orpc.availability.rules.list.queryOptions({
      input: { calendarId: selectedId ?? "", limit: 100 },
    }),
    enabled: !!selectedId,
  });

  const { data: appointmentsData } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        calendarId: selectedId ?? "",
        limit: 5,
        startDate: new Date().toISOString().split("T")[0],
      },
    }),
    enabled: !!selectedId && activeTab === "appointments",
  });

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
        const deletedId = crud.deletingItemId;
        crud.closeDelete();
        if (deletedId && deletedId === selectedId) {
          clearDetails();
        }
        toast.success("Calendar deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete calendar");
      },
    }),
  );

  const locations = locationsData?.items ?? [];
  const availabilityRules = availabilityData?.items ?? [];
  const appointments = appointmentsData?.items ?? [];
  const selectedCalendar =
    data?.items.find((calendar) => calendar.id === selectedId) ?? null;

  const detailForm = useForm<CreateCalendarInput>({
    resolver: zodResolver(createCalendarSchema),
    defaultValues: {
      name: selectedCalendar?.name ?? "",
      timezone: selectedCalendar?.timezone ?? "America/New_York",
      locationId: selectedCalendar?.locationId ?? undefined,
    },
  });

  useEffect(() => {
    if (!selectedCalendar) return;
    detailForm.reset({
      name: selectedCalendar.name,
      timezone: selectedCalendar.timezone,
      locationId: selectedCalendar.locationId ?? undefined,
    });
  }, [detailForm, selectedCalendar]);

  useEffect(() => {
    if (!selectedId || !data?.items) return;
    const exists = data.items.some((calendar) => calendar.id === selectedId);
    if (!exists) clearDetails();
  }, [clearDetails, data?.items, selectedId]);

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

  const handleDetailUpdate = (formData: CreateCalendarInput) => {
    if (!selectedCalendar) return;
    updateMutation.mutate({
      id: selectedCalendar.id,
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

  const detailLocationLabel = selectedCalendar?.locationId
    ? getLocationName(selectedCalendar.locationId)
    : null;

  const detailTimezone = detailForm.watch("timezone");
  const detailLocationId = detailForm.watch("locationId");
  const selectedDetailLocation = locations.find(
    (location) => location.id === detailLocationId,
  );

  const weekdayAvailability = WEEKDAYS.map((day, index) => {
    const rules = availabilityRules.filter((rule) => rule.weekday === index);
    if (rules.length === 0)
      return { day, available: false, times: [] as string[] };
    return {
      day,
      available: true,
      times: rules.map((rule) => `${rule.startTime}-${rule.endTime}`),
    };
  });

  const formatDateTime = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getContextMenuItems = useCallback(
    (calendar: CalendarItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDetails(calendar.id, "details"),
      },
      {
        label: "Manage Availability",
        icon: Clock01Icon,
        onClick: () => openDetails(calendar.id, "availability"),
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
    [crud, openDetails],
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

      <SplitPaneLayout className="mt-6 min-h-[600px]">
        <ListPanel id={FOCUS_ZONES.LIST} className="flex flex-col gap-6">
          {/* Create Form */}
          {crud.showCreateForm && (
            <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
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
            <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
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
          <div>
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
                    {data.items.map((calendar) => {
                      const isSelected = calendar.id === selectedId;
                      return (
                        <ContextMenu
                          key={calendar.id}
                          items={getContextMenuItems(calendar as CalendarItem)}
                        >
                          <TableRow
                            className={cn(
                              "cursor-pointer transition-colors hover:bg-muted/50",
                              isSelected && "bg-muted/60",
                            )}
                            aria-selected={isSelected}
                            onClick={() => openDetails(calendar.id, "details")}
                          >
                            <TableCell className="font-medium">
                              {calendar.name}
                            </TableCell>
                            <TableCell>{calendar.timezone}</TableCell>
                            <TableCell>
                              {getLocationName(calendar.locationId)}
                            </TableCell>
                            <TableCell>
                              {new Date(
                                calendar.createdAt,
                              ).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        </ContextMenu>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </ListPanel>

        {/* NOTE: Split-pane detail panel replaces CalendarDrawer for list/detail UX. */}
        <DetailPanel
          id={FOCUS_ZONES.DETAIL}
          open={detailOpen}
          onOpenChange={(open) => {
            if (!open) clearDetails();
          }}
          sheetTitle={selectedCalendar?.name ?? "Calendar details"}
          sheetDescription={
            selectedCalendar
              ? [selectedCalendar.timezone, detailLocationLabel]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          bodyClassName="p-0"
        >
          {detailOpen && !selectedCalendar ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Loading calendar...
            </div>
          ) : selectedCalendar ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {selectedCalendar.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[selectedCalendar.timezone, detailLocationLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      crud.openEdit({
                        id: selectedCalendar.id,
                        name: selectedCalendar.name,
                        timezone: selectedCalendar.timezone,
                        locationId: selectedCalendar.locationId ?? undefined,
                        createdAt: selectedCalendar.createdAt,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" asChild>
                    <Link
                      to="/calendars/$calendarId/availability"
                      params={{ calendarId: selectedCalendar.id }}
                    >
                      Manage Availability
                      <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>
              </div>

              <DetailTabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value)}
              >
                <DetailTab value="details">Details</DetailTab>
                <DetailTab value="availability">Availability</DetailTab>
                <DetailTab value="appointments">Appointments</DetailTab>
              </DetailTabs>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {activeTab === "details" && (
                  <form
                    onSubmit={detailForm.handleSubmit(handleDetailUpdate)}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="detail-name">Name</Label>
                      <Input
                        id="detail-name"
                        {...detailForm.register("name")}
                        disabled={updateMutation.isPending}
                      />
                      {detailForm.formState.errors.name && (
                        <p className="text-sm text-destructive">
                          {detailForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select
                        value={detailTimezone}
                        onValueChange={(value) =>
                          value && detailForm.setValue("timezone", value)
                        }
                        disabled={updateMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {detailForm.formState.errors.timezone && (
                        <p className="text-sm text-destructive">
                          {detailForm.formState.errors.timezone.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Location (optional)</Label>
                      <Select
                        value={detailLocationId ?? "none"}
                        onValueChange={(value) =>
                          value &&
                          detailForm.setValue(
                            "locationId",
                            value === "none" ? undefined : value,
                          )
                        }
                        disabled={updateMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {selectedDetailLocation?.name ?? "No location"}
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

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending
                          ? "Saving..."
                          : "Save Changes"}
                      </Button>
                    </div>

                    <div className="mt-6 border-t border-border/50 pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => crud.openDelete(selectedCalendar.id)}
                      >
                        <Icon icon={Delete01Icon} data-icon="inline-start" />
                        Delete Calendar
                      </Button>
                    </div>
                  </form>
                )}

                {activeTab === "availability" && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          Weekly Hours
                        </h3>
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            to="/calendars/$calendarId/availability"
                            params={{ calendarId: selectedCalendar.id }}
                          >
                            Edit
                            <Icon
                              icon={ArrowRight02Icon}
                              data-icon="inline-end"
                            />
                          </Link>
                        </Button>
                      </div>
                      <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                        {weekdayAvailability.map((day) => (
                          <div
                            key={day.day}
                            className="flex items-center justify-between px-4 py-2.5"
                          >
                            <span className="text-sm font-medium w-12">
                              {day.day}
                            </span>
                            {day.available ? (
                              <div className="flex items-center gap-2 text-sm">
                                <Icon
                                  icon={CheckmarkCircle01Icon}
                                  className="text-green-600 size-4"
                                />
                                <span>{day.times.join(", ")}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Unavailable
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        asChild
                      >
                        <Link
                          to="/calendars/$calendarId/availability"
                          params={{ calendarId: selectedCalendar.id }}
                          search={{ tab: "overrides" }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon icon={Calendar03Icon} />
                            <span>Date Overrides</span>
                          </div>
                          <Icon icon={ArrowRight02Icon} />
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        asChild
                      >
                        <Link
                          to="/calendars/$calendarId/availability"
                          params={{ calendarId: selectedCalendar.id }}
                          search={{ tab: "blocked" }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon icon={Clock01Icon} />
                            <span>Blocked Time</span>
                          </div>
                          <Icon icon={ArrowRight02Icon} />
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}

                {activeTab === "appointments" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Upcoming Appointments
                      </h3>
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/appointments"
                          search={{ calendarId: selectedCalendar.id }}
                        >
                          View all
                          <Icon
                            icon={ArrowRight02Icon}
                            data-icon="inline-end"
                          />
                        </Link>
                      </Button>
                    </div>

                    {appointments.length === 0 ? (
                      <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
                        No upcoming appointments
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                        {appointments.map((apt) => (
                          <div key={apt.id} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium">
                                  {formatDateTime(apt.startAt)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {apt.appointmentType?.name}
                                  {apt.client &&
                                    ` - ${apt.client.firstName} ${apt.client.lastName}`}
                                </div>
                              </div>
                              <Badge
                                variant={
                                  apt.status === "confirmed"
                                    ? "success"
                                    : "secondary"
                                }
                              >
                                {apt.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DetailPanel>
      </SplitPaneLayout>

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
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: DetailTabValue } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  },
  component: CalendarsPage,
});
