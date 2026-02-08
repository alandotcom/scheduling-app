// Clients management page with modal-based CRUD and appointment booking

import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  Calendar03Icon,
  Delete01Icon,
  PencilEdit01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";
import { AppointmentModal } from "@/components/appointment-modal";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
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
import { formatDisplayDate } from "@/lib/date-utils";
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

function ClientsPage() {
  const queryClient = useQueryClient();
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

  const getContextMenuItems = useCallback(
    (client: ClientItem): ContextMenuItem[] => [
      {
        label: "Book Appointment",
        icon: Calendar03Icon,
        onClick: () => handleBookAppointment(client),
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
    [crud, handleBookAppointment],
  );

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

      <div className="mt-6 max-w-sm">
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

      <div className="mt-6">
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
                      onClick={() => crud.openEdit(client)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          crud.openEdit(client);
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
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
