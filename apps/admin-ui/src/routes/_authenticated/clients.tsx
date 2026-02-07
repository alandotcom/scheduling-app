// Clients management page with drawer and context menus

import { useState, useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  PencilEdit01Icon,
  Delete01Icon,
  ViewIcon,
  Calendar03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { getQueryClient, orpc } from "@/lib/query";
import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { AppointmentModal } from "@/components/appointment-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  WorkbenchLayout,
} from "@/components/workbench";
import {
  FOCUS_ZONES,
  useFocusZones,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useValidateSelection } from "@/hooks/use-selection-search-params";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <div className="grid grid-cols-2 gap-4">
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

type ClientTabValue = "details" | "history";

const isClientTab = (value: string): value is ClientTabValue =>
  value === "details" || value === "history";

function ClientsPage() {
  const queryClient = useQueryClient();

  // Search state
  const [search, setSearch] = useState("");

  // URL-driven drawer state
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();

  const selectedId = selected ?? null;
  const activeTab: ClientTabValue = tab ?? "details";
  const drawerOpen = !!selectedId;

  // Appointment modal state
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentModalClientPrefill, setAppointmentModalClientPrefill] =
    useState<{ id: string; name: string } | null>(null);

  // Fetch clients
  const { data, isLoading, error } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: search || undefined, limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  // Infer item type from query result
  type ClientItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ClientItem>();

  // Create mutation
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

  // Update mutation
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

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.clients.remove.mutationOptions({
      onSuccess: () => {
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

  // Derive selected client from data
  const selectedClient = useMemo(
    () => data?.items.find((c) => c.id === selectedId) ?? null,
    [data?.items, selectedId],
  );
  const clients = data?.items ?? [];
  const selectedIndex = selectedId
    ? clients.findIndex((client) => client.id === selectedId)
    : -1;

  // URL navigation helpers
  const openDrawer = useCallback(
    (id: string, newTab: ClientTabValue = "details") => {
      navigate({ search: { selected: id, tab: newTab } });
    },
    [navigate],
  );

  const closeDrawer = useCallback(() => {
    navigate({ search: {} });
  }, [navigate]);

  const setActiveTabUrl = useCallback(
    (value: string) => {
      if (!selectedId || !isClientTab(value)) return;
      navigate({ search: { selected: selectedId, tab: value } });
    },
    [navigate, selectedId],
  );

  useValidateSelection(data?.items, selectedId, closeDrawer);

  useListNavigation({
    items: clients,
    selectedIndex,
    onSelect: (index) => {
      const client = clients[index];
      if (client) openDrawer(client.id, "details");
    },
    onOpen: (client) => openDrawer(client.id, "details"),
    enabled: !crud.isFormOpen,
  });

  useFocusZones({
    onEscape: closeDrawer,
    detailOpen: drawerOpen,
  });

  const { data: appointmentsData, isLoading: isLoadingAppointments } = useQuery(
    {
      ...orpc.appointments.list.queryOptions({
        input: {
          clientId: selectedClient?.id ?? "",
          limit: 20,
        },
      }),
      enabled: !!selectedClient?.id && activeTab === "history",
    },
  );

  const handleBookAppointment = useCallback(
    (clientId: string) => {
      const client = data?.items.find((item) => item.id === clientId);
      setAppointmentModalClientPrefill(
        client
          ? {
              id: client.id,
              name: `${client.firstName} ${client.lastName}`,
            }
          : null,
      );
      setAppointmentModalOpen(true);
      closeDrawer();
    },
    [closeDrawer, data?.items],
  );

  const getContextMenuItems = useCallback(
    (client: ClientItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDrawer(client.id, "details"),
      },
      {
        label: "Book Appointment",
        icon: Calendar03Icon,
        onClick: () => handleBookAppointment(client.id),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => crud.openEdit(client),
        separator: true,
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(client.id),
        variant: "destructive",
      },
    ],
    [openDrawer, handleBookAppointment, crud],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Clients
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage client records and contact information
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button className="shrink-0" onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Client</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="mt-6 max-w-sm">
        <div className="relative">
          <Icon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4"
          />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Create Form */}
      {crud.showCreateForm && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            New Client
          </h2>
          <ClientForm
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
            Edit Client
          </h2>
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
        </div>
      )}

      <WorkbenchLayout className="mt-6 min-h-[600px]">
        <ListPanel id={FOCUS_ZONES.LIST}>
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
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
              {search
                ? "No clients found matching your search."
                : "No clients yet. Create your first client to get started."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/50 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Appointments</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((client) => (
                    <ContextMenu
                      key={client.id}
                      items={getContextMenuItems(client)}
                    >
                      <TableRow
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        tabIndex={0}
                        aria-selected={client.id === selectedId}
                        onClick={() => openDrawer(client.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDrawer(client.id);
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
                          {new Date(client.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    </ContextMenu>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ListPanel>

        <DetailPanel
          id={FOCUS_ZONES.DETAIL}
          open={drawerOpen}
          storageKey="clients"
          onOpenChange={(open) => {
            if (!open) closeDrawer();
          }}
          sheetTitle={
            selectedClient
              ? `${selectedClient.firstName} ${selectedClient.lastName}`
              : "Client Details"
          }
          bodyClassName="p-0"
        >
          {selectedClient ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {selectedClient.firstName} {selectedClient.lastName}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedClient.email || "No email"}
                    {selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => crud.openEdit(selectedClient)}
                  >
                    <Icon icon={PencilEdit01Icon} data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleBookAppointment(selectedClient.id)}
                  >
                    <Icon icon={Calendar03Icon} data-icon="inline-start" />
                    Book
                  </Button>
                </div>
              </div>

              <DetailTabs value={activeTab} onValueChange={setActiveTabUrl}>
                <DetailTab value="details">Details</DetailTab>
                <DetailTab value="history">History</DetailTab>
              </DetailTabs>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {activeTab === "details" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Email
                      </span>
                      <span className="text-sm font-medium">
                        {selectedClient.email || "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Phone
                      </span>
                      <span className="text-sm font-medium">
                        {selectedClient.phone || "Not set"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Appointments
                      </span>
                      <Badge variant="secondary">
                        {selectedClient.relationshipCounts?.appointments ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Created
                      </span>
                      <span className="text-sm font-medium">
                        {new Date(
                          selectedClient.createdAt,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ) : isLoadingAppointments ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Loading…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(appointmentsData?.items ?? []).map((appointment) => (
                      <div
                        key={appointment.id}
                        className="rounded-lg border border-border/50 px-4 py-3"
                      >
                        <div className="text-sm font-medium">
                          {new Date(appointment.startAt).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {appointment.appointmentType?.name ?? "Appointment"}
                        </div>
                      </div>
                    ))}
                    {(appointmentsData?.items ?? []).length === 0 ? (
                      <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
                        No appointment history yet.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DetailPanel>
      </WorkbenchLayout>

      {/* Appointment Modal */}
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

      {/* Delete Confirmation */}
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

interface ClientsSearchParams {
  selected?: string;
  tab?: "details" | "history";
}

export const Route = createFileRoute("/_authenticated/clients")({
  validateSearch: (search: Record<string, unknown>): ClientsSearchParams => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
    tab:
      typeof search.tab === "string" &&
      (search.tab === "details" || search.tab === "history")
        ? search.tab
        : undefined,
  }),
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
