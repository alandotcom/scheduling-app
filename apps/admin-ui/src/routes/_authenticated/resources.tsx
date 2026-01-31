// Resources management page with drawer and context menus

import { useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  PencilEdit01Icon,
  Delete01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { z } from "zod/mini";
import { Icon } from "@/components/ui/icon";
import { toast } from "sonner";
import { orpc } from "@/lib/query";
import { createResourceSchema } from "@scheduling/dto";
import type { CreateResourceInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { ResourceDrawer } from "@/components/resource-drawer";

// Form schema with required quantity for better UX
export const resourceFormSchema = z.extend(createResourceSchema, {
  quantity: z.number().check(z.int(), z.positive()),
});

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ResourceItem {
  id: string;
  name: string;
  quantity: number;
  locationId?: string | null;
  createdAt: string | Date;
}

interface ResourceFormProps {
  defaultValues?: { name: string; quantity: number; locationId?: string };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateResourceInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ResourceForm({
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
  const selectedLocation = locations.find((l) => l.id === locationId);

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
              {selectedLocation?.name ?? (locationId ? null : "No location")}
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

function ResourcesPage() {
  const queryClient = useQueryClient();
  const crud = useCrudState<ResourceItem>();

  // URL-driven drawer state
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected } = Route.useSearch();

  const selectedId = selected ?? null;
  const drawerOpen = !!selectedId;

  // Fetch resources
  const { data, isLoading, error } = useQuery(
    orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Fetch locations for the dropdown
  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Create mutation
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

  // Update mutation
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

  // Delete mutation
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

  // Derive selected resource from data
  const selectedResource = useMemo(
    () =>
      (data?.items.find((r) => r.id === selectedId) as
        | ResourceItem
        | undefined) ?? null,
    [data?.items, selectedId],
  );

  // URL navigation helpers
  const openDrawer = useCallback(
    (id: string) => {
      navigate({ search: { selected: id } });
    },
    [navigate],
  );

  const closeDrawer = useCallback(() => {
    navigate({ search: {} });
  }, [navigate]);

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

  const getLocationName = (locationId: string | null | undefined) => {
    if (!locationId) return "-";
    const location = locations.find((l) => l.id === locationId);
    return location?.name ?? "-";
  };

  const getContextMenuItems = useCallback(
    (resource: ResourceItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDrawer(resource.id),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () =>
          crud.openEdit({
            id: resource.id,
            name: resource.name,
            quantity: resource.quantity,
            locationId: resource.locationId ?? undefined,
            createdAt: resource.createdAt,
          }),
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(resource.id),
        variant: "destructive",
        separator: true,
      },
    ],
    [openDrawer, crud],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage resources like rooms, equipment, or staff
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add Resource
          </Button>
        )}
      </div>

      {/* Create Form */}
      {crud.showCreateForm && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            New Resource
          </h2>
          <ResourceForm
            locations={locations}
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
            Edit Resource
          </h2>
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
        </div>
      )}

      {/* Resources Table */}
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
            Error loading resources
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            No resources yet. Create your first resource to get started.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
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
                    items={getContextMenuItems(resource as ResourceItem)}
                  >
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openDrawer(resource.id)}
                    >
                      <TableCell className="font-medium">
                        {resource.name}
                      </TableCell>
                      <TableCell>{resource.quantity}</TableCell>
                      <TableCell>
                        {getLocationName(resource.locationId)}
                      </TableCell>
                      <TableCell>
                        {new Date(resource.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Resource Drawer */}
      <ResourceDrawer
        resource={selectedResource}
        open={drawerOpen}
        onClose={closeDrawer}
      />

      {/* Delete Confirmation */}
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

interface ResourcesSearchParams {
  selected?: string;
}

export const Route = createFileRoute("/_authenticated/resources")({
  validateSearch: (search: Record<string, unknown>): ResourcesSearchParams => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
  }),
  component: ResourcesPage,
});
