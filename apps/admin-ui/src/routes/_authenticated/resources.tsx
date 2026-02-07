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
import { getQueryClient, orpc } from "@/lib/query";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { createResourceSchema } from "@scheduling/dto";
import type { CreateResourceInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import {
  DetailPanel,
  ListPanel,
  WorkbenchLayout,
} from "@/components/workbench";
import {
  FOCUS_ZONES,
  useFocusZones,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useValidateSelection } from "@/hooks/use-selection-search-params";

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

  // URL-driven drawer state
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected } = Route.useSearch();

  const selectedId = selected ?? null;
  const drawerOpen = !!selectedId;

  // Fetch resources
  const { data, isLoading, error } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  // Infer item type from query result
  type ResourceItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ResourceItem>();

  // Fetch locations for the dropdown
  const { data: locationsData } = useQuery({
    ...orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

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
    () => data?.items.find((r) => r.id === selectedId) ?? null,
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

  const resources = data?.items ?? [];
  const selectedIndex = selectedId
    ? resources.findIndex((resource) => resource.id === selectedId)
    : -1;

  useValidateSelection(data?.items, selectedId, closeDrawer);

  useListNavigation({
    items: resources,
    selectedIndex,
    onSelect: (index) => {
      const resource = resources[index];
      if (resource) openDrawer(resource.id);
    },
    onOpen: (resource) => openDrawer(resource.id),
    enabled: !crud.isFormOpen,
  });

  useFocusZones({
    onEscape: closeDrawer,
    detailOpen: drawerOpen,
  });

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
    [openDrawer, crud],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Resources
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage resources like rooms, equipment, or staff
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button className="shrink-0" onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Resource</span>
            <span className="sm:hidden">Add</span>
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
              Error loading resources
            </div>
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
              No resources yet. Create your first resource to get started.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/50 shadow-sm">
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
                        aria-selected={resource.id === selectedId}
                        onClick={() => openDrawer(resource.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDrawer(resource.id);
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
                          {new Date(resource.createdAt).toLocaleDateString()}
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
          storageKey="resources"
          onOpenChange={(open) => {
            if (!open) closeDrawer();
          }}
          sheetTitle={selectedResource?.name ?? "Resource Details"}
          bodyClassName="p-0"
        >
          {selectedResource ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {selectedResource.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {getLocationName(selectedResource.locationId)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => crud.openEdit(selectedResource)}
                  >
                    <Icon icon={PencilEdit01Icon} data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => crud.openDelete(selectedResource.id)}
                  >
                    <Icon icon={Delete01Icon} data-icon="inline-start" />
                    Delete
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Quantity
                    </span>
                    <span className="text-sm font-medium">
                      {selectedResource.quantity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Location
                    </span>
                    <span className="text-sm font-medium">
                      {getLocationName(selectedResource.locationId)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Created
                    </span>
                    <span className="text-sm font-medium">
                      {new Date(
                        selectedResource.createdAt,
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DetailPanel>
      </WorkbenchLayout>

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
