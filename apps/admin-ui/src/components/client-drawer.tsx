// Client detail drawer with appointment history

import { useState } from "react";
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
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

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
  onOpenChange: (open: boolean) => void;
  onBookAppointment?: (clientId: string) => void;
}

export function ClientDrawer({
  client,
  open,
  onOpenChange,
  onBookAppointment,
}: ClientDrawerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch appointments for this client
  const { data: appointmentsData } = useQuery({
    ...orpc.appointments.list.queryOptions({
      input: { clientId: client?.id ?? "", limit: 20 },
    }),
    enabled: !!client?.id && activeTab === "history",
  });

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
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        setShowDeleteDialog(false);
        onOpenChange(false);
        toast.success("Client deleted");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete client");
      },
    }),
  );

  const appointments = appointmentsData?.items ?? [];
  const now = new Date();

  // Separate upcoming and past appointments
  const upcomingAppointments = appointments.filter(
    (apt) => new Date(apt.startAt) >= now && apt.status !== "cancelled",
  );
  const pastAppointments = appointments.filter(
    (apt) => new Date(apt.startAt) < now || apt.status === "cancelled",
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

  // Reset form when client changes
  useState(() => {
    if (client) {
      form.reset({
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
      });
    }
  });

  if (!client) return null;

  const handleSave = (data: CreateClientInput) => {
    updateMutation.mutate({
      id: client.id,
      data,
    });
  };

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
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent width="md">
          <DrawerHeader onClose={() => onOpenChange(false)}>
            <DrawerTitle>
              {client.firstName} {client.lastName}
            </DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={setActiveTab}>
            <DrawerTab value="details">Details</DrawerTab>
            <DrawerTab value="history">
              Appointments ({appointments.length})
            </DrawerTab>
          </DrawerTabs>

          <DrawerBody>
            {activeTab === "details" && (
              <form
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-5"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
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
                  </div>
                  <div className="space-y-2">
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
                  </div>
                </div>

                <div className="space-y-2">
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
                </div>

                <div className="space-y-2">
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
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
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
                {/* Upcoming Appointments */}
                {upcomingAppointments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Upcoming
                    </h3>
                    <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                      {upcomingAppointments.map((apt) => (
                        <div key={apt.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">
                                {formatDateTime(apt.startAt)}
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
                      <Link to="/appointments" search={{ clientId: client.id }}>
                        View all
                        <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                      </Link>
                    </Button>
                  </div>

                  {pastAppointments.length === 0 ? (
                    <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
                      No past appointments
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                      {pastAppointments.slice(0, 5).map((apt) => (
                        <div key={apt.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(apt.status)}
                              <div>
                                <div className="font-medium">
                                  {formatDateTime(apt.startAt)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {apt.appointmentType?.name}
                                </div>
                              </div>
                            </div>
                            <Badge
                              variant={
                                apt.status === "completed"
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
