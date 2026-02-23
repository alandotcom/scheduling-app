// Resources management page with modal-based CRUD and details

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import type { ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { z } from "zod/mini";
import { toast } from "sonner";

import { createResourceSchema } from "@scheduling/dto";
import type { CreateResourceInput } from "@scheduling/dto";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { EntityModal } from "@/components/entity-modal";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { ResourcesListPresentation } from "@/components/resources/resources-list-presentation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrudState } from "@/hooks/use-crud-state";
import { useBufferedPending } from "@/hooks/use-buffered-pending";
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
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import { resolveSelectValueLabel } from "@/lib/select-value-label";

export const resourceFormSchema = z.extend(createResourceSchema, {
  quantity: z.number().check(z.int(), z.positive()),
});
const RESOURCE_CREATE_DRAFT_KEY = "resources:create";
const RESOURCE_CREATE_FORM_ID = "resource-create-form";

interface ResourceFormProps {
  defaultValues?: { name: string; quantity: number; locationId?: string };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateResourceInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  footerStart?: ReactNode;
  onDraftChange?: (data: CreateResourceInput) => void;
  onDiscardDraft?: () => void;
  showDiscardAction?: boolean;
  formId?: string;
  showActions?: boolean;
  disableSubmitWhenPristine?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function ResourceForm({
  defaultValues,
  locations,
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
}: ResourceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const showSubmittingVisual = useBufferedPending(isSubmitting);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
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

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: true,
    fields: [
      { id: "name", key: "n", description: "Focus name" },
      { id: "quantity", key: "q", description: "Focus quantity" },
      {
        id: "location",
        key: "l",
        description: "Focus location",
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
        quantity: values.quantity ?? 1,
        locationId: values.locationId,
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
        <FieldShortcutHint shortcut="n" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("quantity")}>
        <Label htmlFor="quantity">Quantity *</Label>
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
        <FieldShortcutHint shortcut="q" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("location")}>
        <Label htmlFor="locationId">Location</Label>
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
        <FieldShortcutHint shortcut="l" visible={hintsVisible} />
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
              className={isSubmitting ? "disabled:opacity-100" : undefined}
            >
              {showSubmittingVisual ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

interface CreateResourceFormProps {
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateResourceInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  formId?: string;
  showActions?: boolean;
}

function CreateResourceForm({
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
  formId,
  showActions = true,
}: CreateResourceFormProps) {
  const initialValues = useMemo<CreateResourceInput>(
    () => ({
      name: "",
      quantity: 1,
      locationId: undefined,
    }),
    [],
  );
  const { draft, setDraft, resetDraft, hasDraft } = useCreateDraft({
    key: RESOURCE_CREATE_DRAFT_KEY,
    initialValues,
  });
  const handleDiscardDraft = useCallback(() => {
    resetDraft();
    onCancel();
  }, [onCancel, resetDraft]);

  return (
    <ResourceForm
      defaultValues={draft}
      locations={locations}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      onDraftChange={setDraft}
      onDiscardDraft={handleDiscardDraft}
      showDiscardAction={hasDraft}
      formId={formId}
      showActions={showActions}
    />
  );
}

function ResourcesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected } = Route.useSearch();
  const selectedId = selected ?? null;
  const [isDetailFormDirty, setIsDetailFormDirty] = useState(false);
  const detailFormId = "resource-detail-form";

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type ResourceItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ResourceItem>();
  const resetCreateDraft = useResetCreateDraft(RESOURCE_CREATE_DRAFT_KEY);

  useCreateIntentTrigger("resources", crud.openCreate);

  const { data: locationsData } = useQuery({
    ...orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  const locations = locationsData?.items ?? [];
  const resources = data?.items ?? [];
  const isSelectionDataResolved = !isLoading && !isFetching && !error;
  const selectedResource =
    resources.find((resource) => resource.id === selectedId) ?? null;
  const displayResource = useClosingSnapshot(selectedResource ?? undefined);
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedResource,
    });

  const openDetails = useCallback(
    (resourceId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: resourceId,
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
      }),
      replace: true,
    });
  }, [closeDetailModalNow, navigate]);

  useValidateSelection({
    items: resources,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

  const selectedIndex = selectedId
    ? resources.findIndex((resource) => resource.id === selectedId)
    : -1;

  useListNavigation({
    items: resources,
    selectedIndex,
    onSelect: (index) => {
      const resource = resources[index];
      if (resource) openDetails(resource.id);
    },
    onOpen: (resource) => openDetails(resource.id),
    enabled: resources.length > 0 && !crud.showCreateForm && !detailModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create resource",
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

  const createMutation = useMutation(
    orpc.resources.create.mutationOptions({
      onSuccess: (createdResource) => {
        resetCreateDraft();
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeCreate();
        openDetails(createdResource.id);
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to create resource");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.resources.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to update resource");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.resources.remove.mutationOptions({
      onSuccess: () => {
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        crud.closeDelete();
      },
      onError: (mutationError) => {
        toast.error(mutationError.message || "Failed to delete resource");
      },
    }),
  );
  const showCreatePendingVisual = useBufferedPending(createMutation.isPending);
  const showUpdatePendingVisual = useBufferedPending(updateMutation.isPending);

  const getLocationName = (locationId: string | null | undefined) => {
    if (!locationId) return "-";
    const location = locations.find((loc) => loc.id === locationId);
    return location?.name ?? "-";
  };

  const handleCreate = (formData: CreateResourceInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateResourceInput) => {
    if (!displayResource) return;
    updateMutation.mutate({
      id: displayResource.id,
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
            Error loading resources
          </div>
        ) : !resources.length ? (
          <EntityListEmptyState
            actionLabel="Create Resource"
            onAction={crud.openCreate}
          >
            No resources yet. Create your first resource to get started.
          </EntityListEmptyState>
        ) : (
          <ResourcesListPresentation
            resources={resources}
            getLocationName={getLocationName}
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
        title="New Resource"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={crud.closeCreate}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              form={RESOURCE_CREATE_FORM_ID}
              disabled={createMutation.isPending}
              className={
                createMutation.isPending ? "disabled:opacity-100" : undefined
              }
            >
              {showCreatePendingVisual ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <CreateResourceForm
            locations={locations}
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
            formId={RESOURCE_CREATE_FORM_ID}
            showActions={false}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={detailModalOpen && !!displayResource}
        onOpenChange={(isOpen) => {
          if (!isOpen) clearDetails();
        }}
        headerActions={
          displayResource ? (
            <CopyIdHeaderAction
              id={displayResource.id}
              entityLabel="resource"
            />
          ) : null
        }
        title={displayResource?.name ?? ""}
        description={
          displayResource
            ? getLocationName(displayResource.locationId)
            : undefined
        }
        footer={
          displayResource ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => crud.openDelete(displayResource.id)}
                disabled={updateMutation.isPending}
              >
                <Icon icon={Delete01Icon} data-icon="inline-start" />
                Delete Resource
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
                  className={
                    updateMutation.isPending
                      ? "disabled:opacity-100"
                      : undefined
                  }
                >
                  {showUpdatePendingVisual ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {displayResource ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <ResourceForm
                key={displayResource.id}
                formId={detailFormId}
                showActions={false}
                defaultValues={{
                  name: displayResource.name,
                  quantity: displayResource.quantity,
                  locationId: displayResource.locationId ?? undefined,
                }}
                locations={locations}
                onSubmit={handleUpdate}
                onCancel={clearDetails}
                isSubmitting={updateMutation.isPending}
                disableSubmitWhenPristine
                onDirtyChange={setIsDetailFormDirty}
              />
            </div>
          </div>
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Resource
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/resources")({
  validateSearch: (search: Record<string, unknown>): { selected?: string } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    return { selected };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(
          orpc.resources.list.queryOptions({ input: { limit: 100 } }),
        ),
        queryClient.ensureQueryData(
          orpc.locations.list.queryOptions({ input: { limit: 100 } }),
        ),
      ]),
    );
  },
  component: ResourcesPage,
});
