// Resources management page with modal-based CRUD and details

import { useCallback, useEffect, useRef } from "react";
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
import { PageHeader, PageScaffold } from "@/components/layout/page-scaffold";
import { ResourcesListPresentation } from "@/components/resources/resources-list-presentation";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrudState } from "@/hooks/use-crud-state";
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

interface ResourceFormProps {
  defaultValues?: { name: string; quantity: number; locationId?: string };
  locations: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateResourceInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  footerStart?: ReactNode;
}

export function ResourceForm({
  defaultValues,
  locations,
  onSubmit,
  onCancel,
  isSubmitting,
  footerStart,
}: ResourceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
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
    enabled: !isSubmitting,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5 relative" ref={registerField("name")}>
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
        <FieldShortcutHint shortcut="n" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("quantity")}>
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
        <FieldShortcutHint shortcut="q" visible={hintsVisible} />
      </div>

      <div className="space-y-2.5 relative" ref={registerField("location")}>
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
        <FieldShortcutHint shortcut="l" visible={hintsVisible} />
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
            <ShortcutBadge
              shortcut="meta+enter"
              className="ml-2 hidden sm:inline-flex"
            />
          </Button>
        </div>
      </div>
    </form>
  );
}

function ResourcesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, create } = Route.useSearch();
  const selectedId = selected ?? null;

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type ResourceItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ResourceItem>();

  useEffect(() => {
    if (create !== "1") return;
    crud.openCreate();
    navigate({
      search: (prev) => ({
        ...prev,
        create: undefined,
      }),
      replace: true,
    });
  }, [create, crud, navigate]);

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
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        crud.closeCreate();
        openDetails(createdResource.id);
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
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        crud.closeDelete();
        toast.success("Resource deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete resource");
      },
    }),
  );

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
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  return (
    <PageScaffold>
      <PageHeader
        title="Resources"
        description="Manage resources like rooms, equipment, or staff"
        actions={
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Resource</span>
            <span className="sm:hidden">Add</span>
            <ShortcutBadge
              shortcut="c"
              className="ml-2 hidden md:inline-flex"
            />
          </Button>
        }
      />

      <div className="mt-6">
        {isLoading ? (
          <EntityListLoadingState rows={5} cols={5} />
        ) : error ? (
          <div className="py-10 text-center text-destructive">
            Error loading resources
          </div>
        ) : !resources.length ? (
          <EntityListEmptyState>
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
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="New Resource"
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <ResourceForm
            locations={locations}
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={detailModalOpen && !!displayResource}
        onOpenChange={(open) => {
          if (!open) clearDetails();
        }}
        title={displayResource?.name ?? ""}
        description={
          displayResource
            ? getLocationName(displayResource.locationId)
            : undefined
        }
      >
        {displayResource ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <ResourceForm
                key={displayResource.id}
                defaultValues={{
                  name: displayResource.name,
                  quantity: displayResource.quantity,
                  locationId: displayResource.locationId ?? undefined,
                }}
                locations={locations}
                onSubmit={handleUpdate}
                onCancel={clearDetails}
                isSubmitting={updateMutation.isPending}
                footerStart={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => crud.openDelete(displayResource.id)}
                  >
                    <Icon icon={Delete01Icon} data-icon="inline-start" />
                    Delete Resource
                  </Button>
                }
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
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/resources")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { create?: "1"; selected?: string } => {
    const create = search.create === "1" ? "1" : undefined;
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    return { create, selected };
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
