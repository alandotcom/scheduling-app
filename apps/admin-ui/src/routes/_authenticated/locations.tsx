// Locations management page with drawer and context menus

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

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import { createLocationSchema } from "@scheduling/dto";
import type { CreateLocationInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { LocationDrawer } from "@/components/location-drawer";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";

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

interface LocationFormProps {
  defaultValues?: { name: string; timezone: string };
  onSubmit: (data: CreateLocationInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function LocationForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: LocationFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? { name: "", timezone: "America/New_York" },
  });

  const timezone = watch("timezone");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Main Office"
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
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={timezone}
          onValueChange={(value) => value && setValue("timezone", value)}
          disabled={isSubmitting}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
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

type LocationTabValue = "details" | "calendars" | "resources";

const isLocationTab = (value: string): value is LocationTabValue =>
  value === "details" || value === "calendars" || value === "resources";

function LocationsPage() {
  const queryClient = useQueryClient();

  // URL-driven drawer state
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();

  const selectedId = selected ?? null;
  const activeTab: LocationTabValue = tab ?? "details";
  const drawerOpen = !!selectedId;

  // Fetch locations
  const { data, isLoading, error } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Infer item type from query result
  type LocationItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<LocationItem>();

  // Create mutation
  const createMutation = useMutation(
    orpc.locations.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeCreate();
        toast.success("Location created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create location");
      },
    }),
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.locations.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeEdit();
        toast.success("Location updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update location");
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.locations.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeDelete();
        toast.success("Location deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete location");
      },
    }),
  );

  const handleCreate = (formData: CreateLocationInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateLocationInput) => {
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

  // Derive selected location from data
  const selectedLocation = useMemo(
    () => data?.items.find((l) => l.id === selectedId) ?? null,
    [data?.items, selectedId],
  );

  // URL navigation helpers
  const openDrawer = useCallback(
    (id: string, newTab: LocationTabValue = "details") => {
      navigate({ search: { selected: id, tab: newTab } });
    },
    [navigate],
  );

  const closeDrawer = useCallback(() => {
    navigate({ search: {} });
  }, [navigate]);

  const setActiveTabUrl = useCallback(
    (value: string) => {
      if (!selectedId || !isLocationTab(value)) return;
      navigate({ search: { selected: selectedId, tab: value } });
    },
    [navigate, selectedId],
  );

  const getContextMenuItems = useCallback(
    (location: LocationItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDrawer(location.id, "details"),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => crud.openEdit(location),
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(location.id),
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
            Locations
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage physical locations for your calendars
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button className="shrink-0" onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Location</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </div>

      {/* Create Form */}
      {crud.showCreateForm && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            New Location
          </h2>
          <LocationForm
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
            Edit Location
          </h2>
          <LocationForm
            defaultValues={{
              name: crud.editingItem.name,
              timezone: crud.editingItem.timezone,
            }}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      {/* Locations Table */}
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
            Error loading locations
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            No locations yet. Create your first location to get started.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Relationships</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((location) => (
                  <ContextMenu
                    key={location.id}
                    items={getContextMenuItems(location)}
                  >
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openDrawer(location.id)}
                    >
                      <TableCell className="font-medium">
                        {location.name}
                      </TableCell>
                      <TableCell>{location.timezone}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <RelationshipCountBadge
                            count={location.relationshipCounts?.calendars ?? 0}
                            singular="calendar"
                          />
                          <RelationshipCountBadge
                            count={location.relationshipCounts?.resources ?? 0}
                            singular="resource"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(location.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Location Drawer */}
      <LocationDrawer
        location={selectedLocation}
        open={drawerOpen}
        onClose={closeDrawer}
        activeTab={activeTab}
        onTabChange={setActiveTabUrl}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Location"
        description="Are you sure you want to delete this location? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

interface LocationsSearchParams {
  selected?: string;
  tab?: "details" | "calendars" | "resources";
}

export const Route = createFileRoute("/_authenticated/locations")({
  validateSearch: (search: Record<string, unknown>): LocationsSearchParams => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
    tab:
      typeof search.tab === "string" &&
      (search.tab === "details" ||
        search.tab === "calendars" ||
        search.tab === "resources")
        ? search.tab
        : undefined,
  }),
  component: LocationsPage,
});
