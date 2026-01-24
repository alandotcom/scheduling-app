// Appointment Types management page with CRUD operations

import { useState } from "react";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Link2, Calendar } from "lucide-react";

import { useAuth } from "@/contexts/auth";
import { orpc } from "@/lib/query";
import { createAppointmentTypeSchema } from "@scheduling/dto";
import type { CreateAppointmentTypeInput } from "@scheduling/dto";

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

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
    defaultValues: defaultValues ?? {
      name: "",
      durationMin: 30,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Consultation" {...register("name")} disabled={isSubmitting} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="durationMin">Duration (minutes)</Label>
          <Input
            id="durationMin"
            type="number"
            min={5}
            step={5}
            {...register("durationMin", { valueAsNumber: true })}
            disabled={isSubmitting}
          />
          {errors.durationMin && (
            <p className="text-sm text-destructive">{errors.durationMin.message}</p>
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
      <div className="grid grid-cols-2 gap-4">
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
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingType, setEditingType] = useState<{
    id: string;
    name: string;
    durationMin: number;
    paddingBeforeMin?: number;
    paddingAfterMin?: number;
    capacity?: number;
  } | null>(null);
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);

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
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
        setShowCreateForm(false);
      },
    }),
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.appointmentTypes.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
        setEditingType(null);
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.appointmentTypes.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
        setDeletingTypeId(null);
      },
    }),
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  const handleCreate = (formData: CreateAppointmentTypeInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateAppointmentTypeInput) => {
    if (!editingType) return;
    updateMutation.mutate({
      id: editingType.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!deletingTypeId) return;
    deleteMutation.mutate({ id: deletingTypeId });
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
        {!showCreateForm && !editingType && (
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Appointment Type
          </Button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">New Appointment Type</h2>
          <AppointmentTypeForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit Form */}
      {editingType && (
        <div className="mt-6 rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Edit Appointment Type</h2>
          <AppointmentTypeForm
            defaultValues={{
              name: editingType.name,
              durationMin: editingType.durationMin,
              paddingBeforeMin: editingType.paddingBeforeMin,
              paddingAfterMin: editingType.paddingAfterMin,
              capacity: editingType.capacity,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditingType(null)}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      {/* Appointment Types Table */}
      <div className="mt-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="text-center text-destructive">Error loading appointment types</div>
        ) : !data?.items.length ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No appointment types yet. Create your first appointment type to get started.
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
                          {type.paddingBeforeMin ?? 0} / {type.paddingAfterMin ?? 0} min
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{type.capacity ?? 1}</Badge>
                    </TableCell>
                    <TableCell>{new Date(type.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to="/appointment-types/$typeId/calendars"
                            params={{ typeId: type.id }}
                          >
                            <Calendar className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to="/appointment-types/$typeId/resources"
                            params={{ typeId: type.id }}
                          >
                            <Link2 className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditingType({
                              id: type.id,
                              name: type.name,
                              durationMin: type.durationMin,
                              paddingBeforeMin: type.paddingBeforeMin ?? undefined,
                              paddingAfterMin: type.paddingAfterMin ?? undefined,
                              capacity: type.capacity ?? undefined,
                            })
                          }
                          disabled={showCreateForm || editingType !== null}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingTypeId(type.id)}
                          disabled={showCreateForm || editingType !== null}
                        >
                          <Trash2 className="h-4 w-4" />
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
      <AlertDialog open={!!deletingTypeId} onOpenChange={() => setDeletingTypeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this appointment type? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/appointment-types")({
  component: AppointmentTypesPage,
});
