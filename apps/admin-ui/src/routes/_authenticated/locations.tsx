// Locations management page with modal-based CRUD and details

import { useCallback } from "react";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import type { ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  ArrowRight02Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { createLocationSchema } from "@scheduling/dto";
import type { CreateLocationInput } from "@scheduling/dto";
import { TableSkeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { RowActions } from "@/components/row-actions";
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
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import { TIMEZONES } from "@/lib/constants";
import { formatDisplayDate, formatTimezoneShort } from "@/lib/date-utils";
import { getQueryClient, orpc } from "@/lib/query";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

interface LocationFormProps {
  defaultValues?: { name: string; timezone: string };
  onSubmit: (data: CreateLocationInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  footerStart?: ReactNode;
}

function LocationForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  footerStart,
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

      <div className="flex items-center gap-3 pt-2">
        {footerStart ? <div>{footerStart}</div> : null}
        <div className="ml-auto flex gap-3">
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
      </div>
    </form>
  );
}

type DetailTabValue = "details" | "calendars" | "resources";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "calendars" || value === "resources";

function LocationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();

  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";

  const { data, isLoading, error } = useQuery({
    ...orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type LocationItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<LocationItem>();

  const locations = data?.items ?? [];
  const selectedLocation =
    locations.find((location) => location.id === selectedId) ?? null;
  const displayLocation = useClosingSnapshot(selectedLocation ?? undefined);
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedLocation,
    });

  const openDetails = useCallback(
    (locationId: string, nextTab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: locationId,
          tab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
      }),
    });
  }, [closeDetailModalNow, navigate]);

  const setActiveTab = useCallback(
    (value: string) => {
      if (!selectedId || !isDetailTab(value)) return;
      navigate({
        search: (prev) => ({
          ...prev,
          tab: value,
        }),
      });
    },
    [navigate, selectedId],
  );

  useValidateSelection(locations, selectedId, clearDetails);

  const { data: calendarsData } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!selectedId,
  });

  const { data: resourcesData } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!selectedId,
  });

  const calendarsAtLocation =
    calendarsData?.items.filter(
      (calendar) => calendar.locationId === selectedId,
    ) ?? [];
  const resourcesAtLocation =
    resourcesData?.items.filter(
      (resource) => resource.locationId === selectedId,
    ) ?? [];

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
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
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
    if (!displayLocation) return;
    updateMutation.mutate({
      id: displayLocation.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

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
          <div className="py-10" role="status" aria-live="polite">
            <TableSkeleton rows={5} cols={5} />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-destructive">
            Error loading locations
          </div>
        ) : !locations.length ? (
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((location) => (
                  <TableRow
                    key={location.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    tabIndex={0}
                    onClick={() => openDetails(location.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetails(location.id);
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
                    <TableCell>
                      <RowActions
                        ariaLabel={`Actions for ${location.name}`}
                        actions={[
                          {
                            label: "View",
                            onClick: () => openDetails(location.id),
                          },
                          {
                            label: "Edit",
                            onClick: () => openDetails(location.id, "details"),
                          },
                          {
                            label: "Delete",
                            onClick: () => crud.openDelete(location.id),
                            variant: "destructive",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
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
        open={detailModalOpen && !!displayLocation}
        onOpenChange={(open) => {
          if (!open) clearDetails();
        }}
        title={displayLocation?.name ?? ""}
        description={
          displayLocation
            ? formatTimezoneShort(displayLocation.timezone)
            : undefined
        }
        className="max-w-5xl"
      >
        {displayLocation ? (
          <div className="space-y-4">
            <DetailTabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="px-0"
            >
              <DetailTab value="details">Details</DetailTab>
              <DetailTab value="calendars">Calendars</DetailTab>
              <DetailTab value="resources">Resources</DetailTab>
            </DetailTabs>

            <div className="space-y-6">
              {activeTab === "details" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Created
                    </Label>
                    <p className="mt-1 text-sm">
                      {formatDisplayDate(displayLocation.createdAt)}
                    </p>
                  </div>
                  <LocationForm
                    key={displayLocation.id}
                    defaultValues={{
                      name: displayLocation.name,
                      timezone: displayLocation.timezone,
                    }}
                    onSubmit={handleUpdate}
                    onCancel={clearDetails}
                    isSubmitting={updateMutation.isPending}
                    footerStart={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => crud.openDelete(displayLocation.id)}
                      >
                        <Icon icon={Delete01Icon} data-icon="inline-start" />
                        Delete Location
                      </Button>
                    }
                  />
                </div>
              )}

              {activeTab === "calendars" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Calendars ({calendarsAtLocation.length})
                    </h3>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/calendars" search={{}}>
                        View all
                        <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                      </Link>
                    </Button>
                  </div>
                  {calendarsAtLocation.length === 0 ? (
                    <div className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
                      No calendars assigned to this location.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border/50">
                      {calendarsAtLocation.map((calendar) => (
                        <div key={calendar.id} className="px-4 py-3 text-sm">
                          <div className="font-medium">{calendar.name}</div>
                          <div
                            className="text-muted-foreground"
                            title={calendar.timezone}
                          >
                            {formatTimezoneShort(calendar.timezone)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "resources" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Resources ({resourcesAtLocation.length})
                    </h3>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/resources" search={{}}>
                        View all
                        <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                      </Link>
                    </Button>
                  </div>
                  {resourcesAtLocation.length === 0 ? (
                    <div className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
                      No resources assigned to this location.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border divide-y divide-border/50">
                      {resourcesAtLocation.map((resource) => (
                        <div key={resource.id} className="px-4 py-3 text-sm">
                          <div className="font-medium">{resource.name}</div>
                          <div className="text-muted-foreground">
                            Quantity: {resource.quantity}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
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
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: DetailTabValue } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  },
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
