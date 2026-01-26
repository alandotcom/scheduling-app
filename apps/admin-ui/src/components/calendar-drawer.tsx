// Calendar detail drawer with tabs

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Clock01Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  ArrowRight02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { createCalendarSchema } from "@scheduling/dto";
import type { CreateCalendarInput } from "@scheduling/dto";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
  DrawerTabs,
  DrawerTab,
} from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

interface CalendarDrawerProps {
  calendar: {
    id: string;
    name: string;
    timezone: string;
    locationId?: string | null;
    createdAt: string | Date;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarDrawer({
  calendar,
  open,
  onOpenChange,
}: CalendarDrawerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch locations
  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Fetch availability rules for this calendar
  const { data: availabilityData } = useQuery({
    ...orpc.availability.rules.list.queryOptions({
      input: { calendarId: calendar?.id ?? "", limit: 100 },
    }),
    enabled: !!calendar?.id,
  });

  // Fetch upcoming appointments for this calendar
  const { data: appointmentsData } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: {
        calendarId: calendar?.id ?? "",
        limit: 5,
        startDate: new Date().toISOString().split("T")[0],
      },
    }),
    enabled: !!calendar?.id && activeTab === "appointments",
  });

  // Update mutation
  const updateMutation = useMutation(
    orpc.calendars.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.calendars.key() });
        toast.success("Calendar updated");
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
        setShowDeleteDialog(false);
        onOpenChange(false);
        toast.success("Calendar deleted");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete calendar");
      },
    }),
  );

  const locations = locationsData?.items ?? [];
  const availabilityRules = availabilityData?.items ?? [];
  const appointments = appointmentsData?.items ?? [];

  // Form for details tab
  const form = useForm<CreateCalendarInput>({
    resolver: zodResolver(createCalendarSchema),
    defaultValues: {
      name: calendar?.name ?? "",
      timezone: calendar?.timezone ?? "America/New_York",
      locationId: calendar?.locationId ?? undefined,
    },
  });

  // Reset form when calendar changes
  useState(() => {
    if (calendar) {
      form.reset({
        name: calendar.name,
        timezone: calendar.timezone,
        locationId: calendar.locationId ?? undefined,
      });
    }
  });

  if (!calendar) return null;

  const handleSave = (data: CreateCalendarInput) => {
    updateMutation.mutate({
      id: calendar.id,
      data,
    });
  };

  const selectedLocation = locations.find(
    (l) => l.id === form.watch("locationId"),
  );

  // Summarize weekly availability
  const weekdayAvailability = WEEKDAYS.map((day, index) => {
    const rules = availabilityRules.filter((r) => r.weekday === index);
    if (rules.length === 0) return { day, available: false, times: [] };
    return {
      day,
      available: true,
      times: rules.map((r) => `${r.startTime}-${r.endTime}`),
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

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent width="md">
          <DrawerHeader onClose={() => onOpenChange(false)}>
            <DrawerTitle>{calendar.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={setActiveTab}>
            <DrawerTab value="details">Details</DrawerTab>
            <DrawerTab value="availability">Availability</DrawerTab>
            <DrawerTab value="appointments">Appointments</DrawerTab>
          </DrawerTabs>

          <DrawerBody>
            {activeTab === "details" && (
              <form
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    {...form.register("name")}
                    disabled={updateMutation.isPending}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={form.watch("timezone")}
                    onValueChange={(v) => v && form.setValue("timezone", v)}
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
                </div>

                <div className="space-y-2">
                  <Label>Location (optional)</Label>
                  <Select
                    value={form.watch("locationId") ?? "none"}
                    onValueChange={(v) =>
                      v &&
                      form.setValue("locationId", v === "none" ? undefined : v)
                    }
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {selectedLocation?.name ?? "No location"}
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

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "availability" && (
              <div className="space-y-6">
                {/* Weekly Summary */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Weekly Hours
                    </h3>
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        to="/calendars/$calendarId/availability"
                        params={{ calendarId: calendar.id }}
                      >
                        Edit
                        <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
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

                {/* Quick Links */}
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    asChild
                  >
                    <Link
                      to="/calendars/$calendarId/availability"
                      params={{ calendarId: calendar.id }}
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
                      params={{ calendarId: calendar.id }}
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
                      search={{ calendarId: calendar.id }}
                    >
                      View all
                      <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
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
          </DrawerBody>

          <DrawerFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Calendar
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={() => deleteMutation.mutate({ id: calendar.id })}
        title="Delete Calendar"
        description="Are you sure you want to delete this calendar? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
