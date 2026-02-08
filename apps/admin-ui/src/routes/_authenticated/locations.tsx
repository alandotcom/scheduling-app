// Locations management page with modal-based CRUD

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
import { toast } from "sonner";

import { createLocationSchema } from "@scheduling/dto";
import type { CreateLocationInput } from "@scheduling/dto";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
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
import { TIMEZONES } from "@/lib/constants";
import { formatDisplayDate, formatTimezoneShort } from "@/lib/date-utils";
import { getQueryClient, orpc } from "@/lib/query";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

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
  const timezoneSelectLabel = resolveSelectValueLabel({
    value: timezone,
    options: TIMEZONES,
    getOptionValue: (tz) => tz,
    getOptionLabel: (tz) => tz,
    unknownLabel: "Unknown timezone",
  });

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
            <SelectValue placeholder="Select timezone">
              {timezoneSelectLabel}
            </SelectValue>
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

function LocationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    ...orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type LocationItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<LocationItem>();

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

  const getContextMenuItems = useCallback(
    (location: LocationItem): ContextMenuItem[] => [
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
    [crud],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Locations
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Manage physical locations for your calendars
          </p>
        </div>
        <Button className="shrink-0" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span className="hidden sm:inline">Add Location</span>
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
            Error loading locations
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
            No locations yet. Create your first location to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
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
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      tabIndex={0}
                      onClick={() => crud.openEdit(location)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          crud.openEdit(location);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {location.name}
                      </TableCell>
                      <TableCell title={location.timezone}>
                        {formatTimezoneShort(location.timezone)}
                      </TableCell>
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
                        {formatDisplayDate(location.createdAt)}
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
        title="New Location"
      >
        <LocationForm
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
        title="Edit Location"
      >
        {crud.editingItem ? (
          <LocationForm
            defaultValues={{
              name: crud.editingItem.name,
              timezone: crud.editingItem.timezone,
            }}
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
        title="Delete Location"
        description="Are you sure you want to delete this location? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/locations")({
  loader: async () => {
    const queryClient = getQueryClient();
    await queryClient.ensureQueryData(
      orpc.locations.list.queryOptions({
        input: { limit: 100 },
      }),
    );
  },
  component: LocationsPage,
});
