// Locations management page with modal-based CRUD and details

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { Label } from "@/components/ui/label";
import { LocationsListPresentation } from "@/components/locations/locations-list-presentation";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrudState } from "@/hooks/use-crud-state";
import { useCreateDraft, useResetCreateDraft } from "@/hooks/use-create-draft";
import { useCreateIntentTrigger } from "@/hooks/use-create-intent";
import {
  useKeyboardShortcuts,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import { TIMEZONES } from "@/lib/constants";
import {
  formatDisplayDate,
  formatTimezonePickerLabel,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

const LOCATION_CREATE_DRAFT_KEY = "locations:create";

interface LocationFormProps {
  defaultValues?: { name: string; timezone: string };
  onSubmit: (data: CreateLocationInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  footerStart?: ReactNode;
  onDraftChange?: (data: CreateLocationInput) => void;
  onDiscardDraft?: () => void;
  showDiscardAction?: boolean;
  formId?: string;
  showActions?: boolean;
  disableSubmitWhenPristine?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

function LocationForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  footerStart,
  onDraftChange,
  onDiscardDraft,
  showDiscardAction = false,
  formId,
  showActions = true,
  disableSubmitWhenPristine = false,
  onDirtyChange,
}: LocationFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
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
    getOptionLabel: (tz) => formatTimezonePickerLabel(tz),
    unknownLabel: "Unknown timezone",
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: true,
    fields: [
      { id: "name", key: "n", description: "Focus name" },
      {
        id: "timezone",
        key: "t",
        description: "Focus timezone",
        openOnFocus: true,
      },
    ],
  });

  useSubmitShortcut({
    enabled: !isSubmitting && (!disableSubmitWhenPristine || isDirty),
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = watch((values) => {
      onDraftChange({
        name: values.name ?? "",
        timezone: values.timezone ?? "America/New_York",
      });
    });
    return () => subscription.unsubscribe();
  }, [onDraftChange, watch]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <form
      id={formId}
      ref={formRef}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
    >
      <div className="space-y-2.5 relative" ref={registerField("name")}>
        <Label htmlFor="name">Name *</Label>
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
        <FieldShortcutHint shortcut="n" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("timezone")}>
        <Label htmlFor="timezone">Timezone *</Label>
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
                {formatTimezonePickerLabel(tz)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p className="text-sm text-destructive">{errors.timezone.message}</p>
        )}
        <FieldShortcutHint shortcut="t" visible={hintsVisible} />
      </div>

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {footerStart ? <div>{footerStart}</div> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {showDiscardAction && onDiscardDraft ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDiscardDraft}
                disabled={isSubmitting}
              >
                Discard Draft
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || (disableSubmitWhenPristine && !isDirty)}
            >
              {isSubmitting ? "Saving..." : "Save"}
              <ShortcutBadge
                shortcut="meta+enter"
                className="ml-2 hidden sm:inline-flex"
              />
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

interface CreateLocationFormProps {
  onSubmit: (data: CreateLocationInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function CreateLocationForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: CreateLocationFormProps) {
  const initialValues = useMemo<CreateLocationInput>(
    () => ({
      name: "",
      timezone: "America/New_York",
    }),
    [],
  );
  const { draft, setDraft, resetDraft, hasDraft } = useCreateDraft({
    key: LOCATION_CREATE_DRAFT_KEY,
    initialValues,
  });
  const handleDiscardDraft = useCallback(() => {
    resetDraft();
    onCancel();
  }, [onCancel, resetDraft]);

  return (
    <LocationForm
      defaultValues={draft}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      onDraftChange={setDraft}
      onDiscardDraft={handleDiscardDraft}
      showDiscardAction={hasDraft}
    />
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
  const [isDetailFormDirty, setIsDetailFormDirty] = useState(false);
  const detailFormId = "location-detail-form";

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type LocationItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<LocationItem>();
  const resetCreateDraft = useResetCreateDraft(LOCATION_CREATE_DRAFT_KEY);

  useCreateIntentTrigger("locations", crud.openCreate);

  const locations = data?.items ?? [];
  const isSelectionDataResolved = !isLoading && !isFetching && !error;
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
      replace: true,
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

  useValidateSelection({
    items: locations,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

  const selectedIndex = selectedId
    ? locations.findIndex((location) => location.id === selectedId)
    : -1;

  useListNavigation({
    items: locations,
    selectedIndex,
    onSelect: (index) => {
      const location = locations[index];
      if (location) openDetails(location.id);
    },
    onOpen: (location) => openDetails(location.id),
    enabled: locations.length > 0 && !crud.showCreateForm && !detailModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create location",
      },
      {
        key: "escape",
        action: clearDetails,
        description: "Close details",
        ignoreInputs: false,
      },
    ],
    enabled: !crud.showCreateForm && !detailModalOpen,
  });

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
      onSuccess: (createdLocation) => {
        resetCreateDraft();
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeCreate();
        openDetails(createdLocation.id, "details");
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to create location");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.locations.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update location");
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
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to delete location");
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
      ...formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  return (
    <PageScaffold className="pb-24 sm:pb-6">
      <div className="mt-6">
        {isLoading ? (
          <EntityListLoadingState rows={5} cols={5} />
        ) : error ? (
          <div className="py-10 text-center text-destructive">
            Error loading locations
          </div>
        ) : !locations.length ? (
          <EntityListEmptyState
            actionLabel="Create Location"
            onAction={crud.openCreate}
          >
            No locations yet. Create your first location to get started.
          </EntityListEmptyState>
        ) : (
          <LocationsListPresentation
            locations={locations}
            onOpen={openDetails}
            onDelete={crud.openDelete}
          />
        )}
      </div>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(isOpen) => {
          if (!isOpen) crud.closeCreate();
        }}
        title="New Location"
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <CreateLocationForm
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={detailModalOpen && !!displayLocation}
        onOpenChange={(isOpen) => {
          if (!isOpen) clearDetails();
        }}
        headerActions={
          displayLocation ? (
            <CopyIdHeaderAction
              id={displayLocation.id}
              entityLabel="location"
            />
          ) : null
        }
        title={displayLocation?.name ?? ""}
        description={
          displayLocation
            ? formatTimezoneShort(displayLocation.timezone)
            : undefined
        }
        footer={
          activeTab === "details" && displayLocation ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => crud.openDelete(displayLocation.id)}
                disabled={updateMutation.isPending}
              >
                <Icon icon={Delete01Icon} data-icon="inline-start" />
                Delete Location
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearDetails}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  form={detailFormId}
                  disabled={updateMutation.isPending || !isDetailFormDirty}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {displayLocation ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
                      formId={detailFormId}
                      showActions={false}
                      defaultValues={{
                        name: displayLocation.name,
                        timezone: displayLocation.timezone,
                      }}
                      onSubmit={handleUpdate}
                      onCancel={clearDetails}
                      isSubmitting={updateMutation.isPending}
                      disableSubmitWhenPristine
                      onDirtyChange={setIsDetailFormDirty}
                    />
                  </div>
                )}

                {activeTab === "calendars" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Calendars ({calendarsAtLocation.length})
                      </h3>
                      <Link
                        to="/calendars"
                        search={{}}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        View all
                        <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                      </Link>
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
                      <Link
                        to="/resources"
                        search={{}}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        View all
                        <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                      </Link>
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Location
        </Button>
      </div>
    </PageScaffold>
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
    await swallowIgnorableRouteLoaderError(
      queryClient.ensureQueryData(
        orpc.locations.list.queryOptions({
          input: { limit: 100 },
        }),
      ),
    );
  },
  component: LocationsPage,
});
