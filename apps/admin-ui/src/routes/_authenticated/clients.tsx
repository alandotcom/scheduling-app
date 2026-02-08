// Clients management page with split list/detail view, modal-based create/edit, and appointment booking

import { useCallback, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  Delete01Icon,
  PencilEdit01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";
import { AppointmentModal } from "@/components/appointment-modal";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  WorkbenchLayout,
} from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { RowActions } from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
import { useCrudState } from "@/hooks/use-crud-state";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-utils";
import { getQueryClient, orpc } from "@/lib/query";

interface ClientFormProps {
  defaultValues?: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  onSubmit: (data: CreateClientInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ClientForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: ClientFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2.5">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            placeholder="John"
            aria-describedby={errors.firstName ? "firstName-error" : undefined}
            aria-invalid={!!errors.firstName}
            {...register("firstName")}
            disabled={isSubmitting}
          />
          {errors.firstName && (
            <p id="firstName-error" className="text-sm text-destructive">
              {errors.firstName.message}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            placeholder="Smith"
            aria-describedby={errors.lastName ? "lastName-error" : undefined}
            aria-invalid={!!errors.lastName}
            {...register("lastName")}
            disabled={isSubmitting}
          />
          {errors.lastName && (
            <p id="lastName-error" className="text-sm text-destructive">
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="email">Email (optional)</Label>
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
          disabled={isSubmitting}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="(555) 123-4567"
          aria-describedby={errors.phone ? "phone-error" : undefined}
          aria-invalid={!!errors.phone}
          {...register("phone")}
          disabled={isSubmitting}
        />
        {errors.phone && (
          <p id="phone-error" className="text-sm text-destructive">
            {errors.phone.message}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
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

type DetailTabValue = "details" | "history";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "history";

function ClientsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const detailOpen = !!selectedId;

  const [search, setSearch] = useState("");
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentModalClientPrefill, setAppointmentModalClientPrefill] =
    useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: search || undefined, limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type ClientItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ClientItem>();
  const clients = data?.items ?? [];
  const selectedClient =
    clients.find((client) => client.id === selectedId) ?? null;

  const openDetails = useCallback(
    (clientId: string, nextTab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: clientId,
          tab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
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
          tab: value,
        }),
      });
    },
    [navigate, selectedId],
  );

  useValidateSelection(clients, selectedId, clearDetails);

  const createMutation = useMutation(
    orpc.clients.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        crud.closeCreate();
        toast.success("Client created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create client");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.clients.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        crud.closeEdit();
        toast.success("Client updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update client");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.clients.remove.mutationOptions({
      onSuccess: () => {
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        crud.closeDelete();
        toast.success("Client deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete client");
      },
    }),
  );

  const handleCreate = (formData: CreateClientInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateClientInput) => {
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

  const handleBookAppointment = useCallback((client: ClientItem) => {
    setAppointmentModalClientPrefill({
      id: client.id,
      name: `${client.firstName} ${client.lastName}`,
    });
    setAppointmentModalOpen(true);
  }, []);

  const { data: appointmentsData, isLoading: isLoadingAppointments } = useQuery(
    {
      ...orpc.appointments.list.queryOptions({
        input: { clientId: selectedId ?? "", limit: 20 },
      }),
      enabled: !!selectedId && activeTab === "history",
    },
  );

  const appointments = appointmentsData?.items ?? [];

  const { upcomingAppointments, pastAppointments } = useMemo(() => {
    const now = DateTime.now();
    const toDateTime = (value: string | Date) =>
      typeof value === "string"
        ? DateTime.fromISO(value, { setZone: true })
        : DateTime.fromJSDate(value);

    return {
      upcomingAppointments: appointments.filter(
        (apt) => toDateTime(apt.startAt) >= now && apt.status !== "cancelled",
      ),
      pastAppointments: appointments.filter(
        (apt) => toDateTime(apt.startAt) < now || apt.status === "cancelled",
      ),
    };
  }, [appointments]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Clients
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage client records and contact information
          </p>
        </div>
        <Button className="shrink-0" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span className="hidden sm:inline">Add Client</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <WorkbenchLayout className="mt-6 min-h-[600px]">
        <ListPanel className="flex flex-col gap-6">
          <div className="max-w-sm">
            <div className="relative">
              <Icon
                icon={Search01Icon}
                className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            {isLoading ? (
              <div
                className="py-10 text-center text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                Loading...
              </div>
            ) : error ? (
              <div className="py-10 text-center text-destructive">
                Error loading clients
              </div>
            ) : !clients.length ? (
              <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
                {search
                  ? "No clients found matching your search."
                  : "No clients yet. Create your first client to get started."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Appointments</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        tabIndex={0}
                        onClick={() => openDetails(client.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetails(client.id);
                          }
                        }}
                      >
                        <TableCell className="font-medium">
                          {client.firstName} {client.lastName}
                        </TableCell>
                        <TableCell>
                          {client.email || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {client.phone || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RelationshipCountBadge
                            count={client.relationshipCounts?.appointments ?? 0}
                            singular="appointment"
                          />
                        </TableCell>
                        <TableCell>
                          {formatDisplayDate(client.createdAt)}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            ariaLabel={`Actions for ${client.firstName} ${client.lastName}`}
                            actions={[
                              {
                                label: "View",
                                onClick: () => openDetails(client.id),
                              },
                              {
                                label: "Book",
                                onClick: () => handleBookAppointment(client),
                              },
                              {
                                label: "Edit",
                                onClick: () => crud.openEdit(client),
                              },
                              {
                                label: "Delete",
                                onClick: () => crud.openDelete(client.id),
                                variant: "destructive",
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </ListPanel>

        <DetailPanel
          open={detailOpen}
          onOpenChange={(open) => {
            if (!open) clearDetails();
          }}
          sheetTitle={
            selectedClient
              ? `${selectedClient.firstName} ${selectedClient.lastName}`
              : "Client details"
          }
          sheetDescription={
            selectedClient?.email ?? selectedClient?.phone ?? undefined
          }
          bodyClassName="p-0"
        >
          {detailOpen && !selectedClient ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Loading client...
            </div>
          ) : selectedClient ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {selectedClient.firstName} {selectedClient.lastName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Client created {formatDisplayDate(selectedClient.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => crud.openEdit(selectedClient)}
                  >
                    <Icon icon={PencilEdit01Icon} data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBookAppointment(selectedClient)}
                  >
                    <Icon icon={Calendar03Icon} data-icon="inline-start" />
                    Book
                  </Button>
                </div>
              </div>

              <DetailTabs value={activeTab} onValueChange={setActiveTab}>
                <DetailTab value="details">Details</DetailTab>
                <DetailTab value="history">History</DetailTab>
              </DetailTabs>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {activeTab === "details" ? (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Email
                      </Label>
                      <p className="mt-1 text-sm">
                        {selectedClient.email ?? (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Phone
                      </Label>
                      <p className="mt-1 text-sm">
                        {selectedClient.phone ?? (
                          <span className="text-muted-foreground">Not set</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total Appointments
                      </Label>
                      <p className="mt-1 text-sm">
                        {selectedClient.relationshipCounts?.appointments ?? 0}
                      </p>
                    </div>
                    <div className="border-t border-border pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => crud.openDelete(selectedClient.id)}
                      >
                        <Icon icon={Delete01Icon} data-icon="inline-start" />
                        Delete Client
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {isLoadingAppointments ? (
                      <div className="text-center text-muted-foreground py-6">
                        Loading appointments...
                      </div>
                    ) : (
                      <>
                        <div>
                          <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Upcoming
                          </h3>
                          {upcomingAppointments.length === 0 ? (
                            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                              No upcoming appointments
                            </div>
                          ) : (
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
                                        {apt.calendar &&
                                          ` - ${apt.calendar.name}`}
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

                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              Past
                            </h3>
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                to="/appointments"
                                search={{ clientId: selectedClient.id }}
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
                            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                              No past appointments
                            </div>
                          ) : (
                            <div className="rounded-lg border border-border divide-y divide-border/50">
                              {pastAppointments.slice(0, 5).map((apt) => (
                                <div key={apt.id} className="px-4 py-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium">
                                        {formatDisplayDateTime(apt.startAt)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {apt.appointmentType?.name}
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
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DetailPanel>
      </WorkbenchLayout>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="New Client"
      >
        <ClientForm
          onSubmit={handleCreate}
          onCancel={crud.closeCreate}
          isSubmitting={createMutation.isPending}
        />
      </EntityModal>

      <EntityModal
        open={!!crud.editingItem}
        onOpenChange={(open) => {
          if (!open) crud.closeEdit();
        }}
        title="Edit Client"
      >
        {crud.editingItem ? (
          <ClientForm
            defaultValues={{
              firstName: crud.editingItem.firstName,
              lastName: crud.editingItem.lastName,
              email: crud.editingItem.email ?? undefined,
              phone: crud.editingItem.phone ?? undefined,
            }}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        ) : null}
      </EntityModal>

      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={(nextOpen) => {
          setAppointmentModalOpen(nextOpen);
          if (!nextOpen) {
            setAppointmentModalClientPrefill(null);
          }
        }}
        defaultClientId={appointmentModalClientPrefill?.id}
        defaultClientName={appointmentModalClientPrefill?.name}
      />

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Client"
        description="Are you sure you want to delete this client? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/clients")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: DetailTabValue } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await queryClient.ensureQueryData(
      orpc.clients.list.queryOptions({
        input: { limit: 100 },
      }),
    );
  },
  component: ClientsPage,
});
