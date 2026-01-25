// Appointment Types management page with CRUD operations

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  PencilEdit01Icon,
  Delete01Icon,
  Link01Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";
import { createAppointmentTypeSchema } from "@scheduling/dto";
import type { CreateAppointmentTypeInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

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
import { Badge } from "@/components/ui/badge";

interface AppointmentTypeItem {
  id: string;
  name: string;
  durationMin: number;
  paddingBeforeMin?: number;
  paddingAfterMin?: number;
  capacity?: number;
}

interface AppointmentTypeFormProps {
  defaultValues?: {
    name: string;
    durationMin: number;
    paddingBeforeMin?: number;
    paddingAfterMin?: number;
    capacity?: number;
  };
  onSubmit: (data: CreateAppointmentTypeInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function AppointmentTypeForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: AppointmentTypeFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAppointmentTypeInput>({
    resolver: zodResolver(createAppointmentTypeSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      name: "",
      durationMin: 30,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Consultation"
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="durationMin">Duration (minutes)</Label>
          <Input
            id="durationMin"
            type="number"
            min={5}
            step={5}
            aria-describedby={errors.durationMin ? "duration-error" : undefined}
            aria-invalid={!!errors.durationMin}
            {...register("durationMin", { valueAsNumber: true })}
            disabled={isSubmitting}
          />
          {errors.durationMin && (
            <p id="duration-error" className="text-sm text-destructive">
              {errors.durationMin.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity (optional)</Label>
          <Input
            id="capacity"
            type="number"
            min={1}
            placeholder="1"
            {...register("capacity", {
              setValueAs: (v) => (v === "" ? undefined : parseInt(v, 10)),
            })}
            disabled={isSubmitting}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="paddingBeforeMin">Padding Before (min)</Label>
          <Input
            id="paddingBeforeMin"
            type="number"
            min={0}
            step={5}
            placeholder="0"
            {...register("paddingBeforeMin", {
              setValueAs: (v) => (v === "" ? undefined : parseInt(v, 10)),
            })}
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paddingAfterMin">Padding After (min)</Label>
          <Input
            id="paddingAfterMin"
            type="number"
            min={0}
            step={5}
            placeholder="0"
            {...register("paddingAfterMin", {
              setValueAs: (v) => (v === "" ? undefined : parseInt(v, 10)),
            })}
            disabled={isSubmitting}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
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

function AppointmentTypesPage() {
  const queryClient = useQueryClient();
  const crud = useCrudState<AppointmentTypeItem>();

  // Fetch appointment types
  const { data, isLoading, error } = useQuery(
    orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Create mutation
  const createMutation = useMutation(
    orpc.appointmentTypes.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        crud.closeCreate();
        toast.success("Appointment type created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create appointment type");
      },
    }),
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.appointmentTypes.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        crud.closeEdit();
        toast.success("Appointment type updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update appointment type");
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.appointmentTypes.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        crud.closeDelete();
        toast.success("Appointment type deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete appointment type");
      },
    }),
  );

  const handleCreate = (formData: CreateAppointmentTypeInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateAppointmentTypeInput) => {
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointment Types</h1>
          <p className="mt-1 text-muted-foreground">
            Configure the types of appointments that can be booked.
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} className="mr-2" />
            Add Appointment Type
          </Button>
        )}
      </div>

      {/* Create Form */}
      {crud.showCreateForm && (
        <div className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">New Appointment Type</h2>
          <AppointmentTypeForm
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit Form */}
      {crud.editingItem && (
        <div className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Edit Appointment Type</h2>
          <AppointmentTypeForm
            defaultValues={{
              name: crud.editingItem.name,
              durationMin: crud.editingItem.durationMin,
              paddingBeforeMin: crud.editingItem.paddingBeforeMin,
              paddingAfterMin: crud.editingItem.paddingAfterMin,
              capacity: crud.editingItem.capacity,
            }}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      {/* Appointment Types Table */}
      <div className="mt-6">
        {isLoading ? (
          <div
            className="text-center text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Loading...
          </div>
        ) : error ? (
          <div className="text-center text-destructive">
            Error loading appointment types
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No appointment types yet. Create your first appointment type to get
            started.
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Padding</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell>{type.durationMin} min</TableCell>
                    <TableCell>
                      {type.paddingBeforeMin || type.paddingAfterMin ? (
                        <span className="text-muted-foreground">
                          {type.paddingBeforeMin ?? 0} /{" "}
                          {type.paddingAfterMin ?? 0} min
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{type.capacity ?? 1}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(type.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          aria-label="Manage calendars"
                        >
                          <Link
                            to="/appointment-types/$typeId/calendars"
                            params={{ typeId: type.id }}
                          >
                            <Icon icon={Calendar03Icon} />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          aria-label="Manage resources"
                        >
                          <Link
                            to="/appointment-types/$typeId/resources"
                            params={{ typeId: type.id }}
                          >
                            <Icon icon={Link01Icon} />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit appointment type"
                          onClick={() =>
                            crud.openEdit({
                              id: type.id,
                              name: type.name,
                              durationMin: type.durationMin,
                              paddingBeforeMin:
                                type.paddingBeforeMin ?? undefined,
                              paddingAfterMin:
                                type.paddingAfterMin ?? undefined,
                              capacity: type.capacity ?? undefined,
                            })
                          }
                          disabled={crud.isFormOpen}
                        >
                          <Icon icon={PencilEdit01Icon} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete appointment type"
                          onClick={() => crud.openDelete(type.id)}
                          disabled={crud.isFormOpen}
                        >
                          <Icon icon={Delete01Icon} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Appointment Type"
        description="Are you sure you want to delete this appointment type? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/appointment-types")({
  component: AppointmentTypesPage,
});
