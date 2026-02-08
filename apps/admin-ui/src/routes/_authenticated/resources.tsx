// Resources management page with modal-based CRUD

import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  Delete01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { z } from "zod/mini";
import { toast } from "sonner";

import { createResourceSchema } from "@scheduling/dto";
import type { CreateResourceInput } from "@scheduling/dto";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { resolveSelectValueLabel } from "@/lib/select-value-label";

export const resourceFormSchema = z.extend(createResourceSchema, {
  quantity: z.number().check(z.int(), z.positive()),
});

interface ResourceFormProps {
  defaultValues?: { name: string; quantity: number; locationId?: string };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateResourceInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ResourceForm({
  defaultValues,
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
}: ResourceFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateResourceInput>({
    resolver: zodResolver(resourceFormSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? { name: "", quantity: 1 },
  });

  const locationId = watch("locationId");
  const locationSelectLabel = resolveSelectValueLabel({
    value: locationId ?? "none",
    options: locations,
    getOptionValue: (location) => location.id,
    getOptionLabel: (location) => location.name,
    noneLabel: "No location",
    unknownLabel: "Unknown location",
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Meeting Room A"
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
        <Label htmlFor="quantity">Quantity</Label>
        <Input
          id="quantity"
          type="number"
          min={1}
          aria-describedby={errors.quantity ? "quantity-error" : undefined}
          aria-invalid={!!errors.quantity}
          {...register("quantity", { valueAsNumber: true })}
          disabled={isSubmitting}
        />
        {errors.quantity && (
          <p id="quantity-error" className="text-sm text-destructive">
            {errors.quantity.message}
          </p>
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
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select location">
              {locationSelectLabel}
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

function ResourcesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type ResourceItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ResourceItem>();

  const { data: locationsData } = useQuery({
    ...orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  const createMutation = useMutation(
    orpc.resources.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        crud.closeCreate();
        toast.success("Resource created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create resource");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.resources.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        crud.closeEdit();
        toast.success("Resource updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update resource");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.resources.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        crud.closeDelete();
        toast.success("Resource deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete resource");
      },
    }),
  );

  const locations = locationsData?.items ?? [];

  const getLocationName = (locationId: string | null | undefined) => {
    if (!locationId) return "-";
    const location = locations.find((l) => l.id === locationId);
    return location?.name ?? "-";
  };

  const handleCreate = (formData: CreateResourceInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateResourceInput) => {
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

  const getContextMenuItems = useCallback(
    (resource: ResourceItem): ContextMenuItem[] => [
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => crud.openEdit(resource),
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(resource.id),
        variant: "destructive",
        separator: true,
      },
    ],
    [crud],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Resources
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage resources like rooms, equipment, or staff
          </p>
        </div>
        <Button className="shrink-0" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span className="hidden sm:inline">Add Resource</span>
          <span className="sm:hidden">Add</span>
        </Button>
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
            Error loading resources
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
            No resources yet. Create your first resource to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((resource) => (
                  <ContextMenu
                    key={resource.id}
                    items={getContextMenuItems(resource)}
                  >
                    <TableRow
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      tabIndex={0}
                      onClick={() => crud.openEdit(resource)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          crud.openEdit(resource);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {resource.name}
                      </TableCell>
                      <TableCell>{resource.quantity}</TableCell>
                      <TableCell>
                        {getLocationName(resource.locationId)}
                      </TableCell>
                      <TableCell>
                        {formatDisplayDate(resource.createdAt)}
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
        title="New Resource"
      >
        <ResourceForm
          locations={locations}
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
        title="Edit Resource"
      >
        {crud.editingItem ? (
          <ResourceForm
            defaultValues={{
              name: crud.editingItem.name,
              quantity: crud.editingItem.quantity,
              locationId: crud.editingItem.locationId ?? undefined,
            }}
            locations={locations}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        ) : null}
      </EntityModal>

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Resource"
        description="Are you sure you want to delete this resource? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/resources")({
  loader: async () => {
    const queryClient = getQueryClient();
    await Promise.all([
      queryClient.ensureQueryData(
        orpc.resources.list.queryOptions({ input: { limit: 100 } }),
      ),
      queryClient.ensureQueryData(
        orpc.locations.list.queryOptions({ input: { limit: 100 } }),
      ),
    ]);
  },
  component: ResourcesPage,
});
