// Client detail drawer with appointment history

import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import {
  Calendar03Icon,
  ArrowRight02Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";
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
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useResetFormOnOpen } from "@/hooks/use-reset-form-on-open";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { formatDisplayDateTime } from "@/lib/date-utils";

interface ClientDrawerProps {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    createdAt: string | Date;
  } | null;
  open: boolean;
  onClose: () => void;
  activeTab: "details" | "history";
  onTabChange: (tab: string) => void;
  onBookAppointment?: (clientId: string) => void;
}

export function ClientDrawer({
  client,
  open,
  onClose,
  activeTab,
  onTabChange,
  onBookAppointment,
}: ClientDrawerProps) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Fetch appointments for this client
  const { data: appointmentsData, isLoading: isLoadingAppointments } = useQuery(
    {
      ...orpc.appointments.list.queryOptions({
        input: { clientId: client?.id ?? "", limit: 20 },
      }),
      enabled: !!client?.id && activeTab === "history",
    },
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.clients.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        toast.success("Client updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update client");
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.clients.remove.mutationOptions({
      onSuccess: () => {
        setShowDeleteDialog(false);
        onClose();
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        toast.success("Client deleted");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete client");
      },
    }),
  );

  const appointments = appointmentsData?.items ?? [];
  const now = DateTime.now();
  const toDateTime = (value: string | Date) =>
    typeof value === "string"
      ? DateTime.fromISO(value, { setZone: true })
      : DateTime.fromJSDate(value);

  // Separate upcoming and past appointments
  const upcomingAppointments = appointments.filter(
    (apt) => toDateTime(apt.startAt) >= now && apt.status !== "cancelled",
  );
  const pastAppointments = appointments.filter(
    (apt) => toDateTime(apt.startAt) < now || apt.status === "cancelled",
  );

  // Form for details tab
  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      firstName: client?.firstName ?? "",
      lastName: client?.lastName ?? "",
      email: client?.email ?? undefined,
      phone: client?.phone ?? undefined,
    },
  });

  useResetFormOnOpen({
    open,
    entityKey: client?.id,
    values: client
      ? {
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email ?? undefined,
          phone: client.phone ?? undefined,
        }
      : null,
    reset: (values) => {
      form.reset(values);
    },
  });

  if (!client) return null;

  const handleSave = (data: CreateClientInput) => {
    updateMutation.mutate({
      id: client.id,
      data,
    });
  };

  useSubmitShortcut({
    enabled: open && activeTab === "details" && !updateMutation.isPending,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: open && activeTab === "details",
    fields: [
      { id: "first-name", key: "f", description: "Focus first name" },
      { id: "last-name", key: "l", description: "Focus last name" },
      { id: "email", key: "e", description: "Focus email" },
      { id: "phone", key: "p", description: "Focus phone" },
    ],
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Icon
            icon={CheckmarkCircle01Icon}
            className="text-green-600 size-4"
          />
        );
      case "cancelled":
      case "no_show":
        return <Icon icon={Cancel01Icon} className="text-destructive size-4" />;
      default:
        return (
          <Icon
            icon={Calendar03Icon}
            className="text-muted-foreground size-4"
          />
        );
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DrawerContent width="md">
          <DrawerHeader onClose={onClose}>
            <DrawerTitle>
              {client.firstName} {client.lastName}
            </DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={onTabChange}>
            <DrawerTab value="details">Details</DrawerTab>
            <DrawerTab value="history">
              Appointments ({appointments.length})
            </DrawerTab>
          </DrawerTabs>

          <DrawerBody>
            {activeTab === "details" && (
              <form
                ref={formRef}
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-5"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className="space-y-2 relative"
                    ref={registerField("first-name")}
                  >
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      {...form.register("firstName")}
                      disabled={updateMutation.isPending}
                    />
                    {form.formState.errors.firstName && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.firstName.message}
                      </p>
                    )}
                    <FieldShortcutHint shortcut="f" visible={hintsVisible} />
                  </div>
                  <div
                    className="space-y-2 relative"
                    ref={registerField("last-name")}
                  >
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      {...form.register("lastName")}
                      disabled={updateMutation.isPending}
                    />
                    {form.formState.errors.lastName && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.lastName.message}
                      </p>
                    )}
                    <FieldShortcutHint shortcut="l" visible={hintsVisible} />
                  </div>
                </div>

                <div
                  className="space-y-2 relative"
                  ref={registerField("email")}
                >
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="client@example.com"
                    {...form.register("email")}
                    disabled={updateMutation.isPending}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                  <FieldShortcutHint shortcut="e" visible={hintsVisible} />
                </div>

                <div
                  className="space-y-2 relative"
                  ref={registerField("phone")}
                >
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    {...form.register("phone")}
                    disabled={updateMutation.isPending}
                  />
                  {form.formState.errors.phone && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                  <FieldShortcutHint shortcut="p" visible={hintsVisible} />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    <ShortcutBadge
                      shortcut="meta+enter"
                      className="ml-2 hidden sm:inline-flex"
                    />
                  </Button>
                  {onBookAppointment && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onBookAppointment(client.id)}
                    >
                      <Icon icon={Calendar03Icon} data-icon="inline-start" />
                      Book Appointment
                    </Button>
                  )}
                </div>
              </form>
            )}

            {activeTab === "history" && (
              <div className="space-y-6">
                {isLoadingAppointments ? (
                  <div className="text-center text-muted-foreground py-6">
                    Loading appointments...
                  </div>
                ) : (
                  <>
                    {/* Upcoming Appointments */}
                    {upcomingAppointments.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                          Upcoming
                        </h3>
                        <div className="rounded-lg border border-border divide-y divide-border/50">
                          {upcomingAppointments.map((apt) => (
                            <div key={apt.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium">
                                    {formatDisplayDateTime(apt.startAt)}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {apt.appointmentType?.name}
                                    {apt.calendar && ` - ${apt.calendar.name}`}
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
                      </div>
                    )}

                    {/* Past Appointments */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          Past Appointments
                        </h3>
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            to="/appointments"
                            search={{ clientId: client.id }}
                          >
                            View all
                            <Icon
                              icon={ArrowRight02Icon}
                              data-icon="inline-end"
                            />
                          </Link>
                        </Button>
                      </div>

                      {pastAppointments.length === 0 ? (
                        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                          No past appointments
                        </div>
                      ) : (
                        <div className="rounded-lg border border-border divide-y divide-border/50">
                          {pastAppointments.slice(0, 5).map((apt) => (
                            <div key={apt.id} className="px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(apt.status)}
                                  <div>
                                    <div className="font-medium">
                                      {formatDisplayDateTime(apt.startAt)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {apt.appointmentType?.name}
                                    </div>
                                  </div>
                                </div>
                                <Badge
                                  variant={
                                    apt.status === "confirmed"
                                      ? "success"
                                      : apt.status === "cancelled" ||
                                          apt.status === "no_show"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {apt.status === "no_show"
                                    ? "No Show"
                                    : apt.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Book Button */}
                    {onBookAppointment && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => onBookAppointment(client.id)}
                      >
                        <Icon icon={Calendar03Icon} data-icon="inline-start" />
                        Book New Appointment
                      </Button>
                    )}
                  </>
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
              Delete Client
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={() => deleteMutation.mutate({ id: client.id })}
        title="Delete Client"
        description="Are you sure you want to delete this client? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
