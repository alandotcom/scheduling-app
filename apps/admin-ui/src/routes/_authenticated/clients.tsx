// Clients management page with drawer and context menus

import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { orpc } from "@/lib/query";
import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { ClientDrawer } from "@/components/client-drawer";
import { AppointmentModal } from "@/components/appointment-modal";

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

interface ClientItem {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  createdAt: string | Date;
}

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

function ClientsPage() {
  const queryClient = useQueryClient();
  const crud = useCrudState<ClientItem>();

  // Search state
  const [search, setSearch] = useState("");

  // Drawer state
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Appointment modal state
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  // Fetch clients
  const { data, isLoading, error } = useQuery(
    orpc.clients.list.queryOptions({
      input: { search: search || undefined, limit: 100 },
    }),
  );

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

  const openDrawer = useCallback((client: ClientItem) => {
    setSelectedClient(client);
    setDrawerOpen(true);
  }, []);

  const handleBookAppointment = useCallback((_clientId: string) => {
    // TODO: Pre-fill client in appointment modal when client search is improved
    setAppointmentModalOpen(true);
    setDrawerOpen(false);
  }, []);

  const getContextMenuItems = useCallback(
    (client: ClientItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDrawer(client),
      },
      {
        label: "Book Appointment",
        icon: Calendar03Icon,
        onClick: () => handleBookAppointment(client.id),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () =>
          crud.openEdit({
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email ?? undefined,
            phone: client.phone ?? undefined,
            createdAt: client.createdAt,
          }),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage client records and contact information
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add Client
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

      {/* Clients Table */}
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
            Error loading clients
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            {search
              ? "No clients found matching your search."
              : "No clients yet. Create your first client to get started."}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((client) => (
                  <ContextMenu
                    key={client.id}
                    items={getContextMenuItems(client as ClientItem)}
                  >
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openDrawer(client as ClientItem)}
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
                        {new Date(client.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Client Drawer */}
      <ClientDrawer
        client={selectedClient}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedClient(null);
        }}
        onBookAppointment={handleBookAppointment}
      />

      {/* Appointment Modal */}
      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={setAppointmentModalOpen}
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

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});
