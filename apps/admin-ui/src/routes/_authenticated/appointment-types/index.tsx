// Appointment Types management page with modal-based CRUD

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  Calendar03Icon,
  Delete01Icon,
  Link01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";

import { createAppointmentTypeSchema } from "@scheduling/dto";
import type { CreateAppointmentTypeInput } from "@scheduling/dto";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import type { ContextMenuItem } from "@/components/context-menu";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { AppointmentTypesListPresentation } from "@/components/appointment-types/appointment-types-list-presentation";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useCrudState } from "@/hooks/use-crud-state";
import { useCreateDraft, useResetCreateDraft } from "@/hooks/use-create-draft";
import { useCreateIntentTrigger } from "@/hooks/use-create-intent";
import {
  useKeyboardShortcuts,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useAppointmentTypeMutations } from "@/hooks/use-appointment-type-mutations";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import { CalendarsTab } from "./components/calendars-tab";
import { ResourcesTab } from "./components/resources-tab";

const APPOINTMENT_TYPE_CREATE_DRAFT_KEY = "appointment-types:create";

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
  onDraftChange?: (data: CreateAppointmentTypeInput) => void;
  onDiscardDraft?: () => void;
  showDiscardAction?: boolean;
}

function AppointmentTypeForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  onDraftChange,
  onDiscardDraft,
  showDiscardAction = false,
}: AppointmentTypeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateAppointmentTypeInput>({
    resolver: zodResolver(createAppointmentTypeSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      name: "",
      durationMin: 30,
    },
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: true,
    fields: [
      { id: "name", key: "n", description: "Focus name" },
      { id: "duration", key: "d", description: "Focus duration" },
      { id: "capacity", key: "c", description: "Focus capacity" },
      { id: "padding-before", key: "b", description: "Focus padding before" },
      { id: "padding-after", key: "a", description: "Focus padding after" },
    ],
  });

  useSubmitShortcut({
    enabled: !isSubmitting,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = watch((values) => {
      onDraftChange({
        name: values.name ?? "",
        durationMin: values.durationMin ?? 30,
        capacity: values.capacity,
        paddingBeforeMin: values.paddingBeforeMin,
        paddingAfterMin: values.paddingAfterMin,
      });
    });
    return () => subscription.unsubscribe();
  }, [onDraftChange, watch]);

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5 relative" ref={registerField("name")}>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Consultation"
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2.5 relative" ref={registerField("duration")}>
          <Label htmlFor="durationMin">Duration (minutes)</Label>
          <Input
            id="durationMin"
            type="number"
            min={5}
            step={5}
            aria-describedby={errors.durationMin ? "duration-error" : undefined}
            aria-invalid={!!errors.durationMin}
            {...register("durationMin", { valueAsNumber: true })}
            disabled={isSubmitting}
          />
          {errors.durationMin && (
            <p id="duration-error" className="text-sm text-destructive">
              {errors.durationMin.message}
            </p>
          )}
          <FieldShortcutHint shortcut="d" visible={hintsVisible} />
        </div>

        <div className="space-y-2.5 relative" ref={registerField("capacity")}>
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
          <FieldShortcutHint shortcut="c" visible={hintsVisible} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div
          className="space-y-2.5 relative"
          ref={registerField("padding-before")}
        >
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
          <FieldShortcutHint shortcut="b" visible={hintsVisible} />
        </div>

        <div
          className="space-y-2.5 relative"
          ref={registerField("padding-after")}
        >
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
          <FieldShortcutHint shortcut="a" visible={hintsVisible} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {showDiscardAction && onDiscardDraft ? (
          <Button
            type="button"
            variant="ghost"
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
    </form>
  );
}

interface CreateAppointmentTypeFormProps {
  onSubmit: (data: CreateAppointmentTypeInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function CreateAppointmentTypeForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: CreateAppointmentTypeFormProps) {
  const initialValues = useMemo<CreateAppointmentTypeInput>(
    () => ({
      name: "",
      durationMin: 30,
      capacity: undefined,
      paddingBeforeMin: undefined,
      paddingAfterMin: undefined,
    }),
    [],
  );
  const { draft, setDraft, resetDraft, hasDraft } = useCreateDraft({
    key: APPOINTMENT_TYPE_CREATE_DRAFT_KEY,
    initialValues,
  });
  const handleDiscardDraft = useCallback(() => {
    resetDraft();
    onCancel();
  }, [onCancel, resetDraft]);

  return (
    <AppointmentTypeForm
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

type ManageTab = "details" | "calendars" | "resources";

const isManageTab = (value: string): value is ManageTab =>
  value === "details" || value === "calendars" || value === "resources";

function AppointmentTypesPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab } = Route.useSearch();
  const manageTypeId = selected ?? null;
  const manageTab: ManageTab = tab && isManageTab(tab) ? tab : "details";

  const setManageTypeId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: id ?? undefined,
          tab: id ? prev.tab : undefined,
        }),
      });
    },
    [navigate],
  );

  const setManageTab = useCallback(
    (nextTab: ManageTab) => {
      navigate({
        search: (prev) => ({
          ...prev,
          tab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const { data, isLoading, error } = useQuery({
    ...orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type AppointmentTypeItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<AppointmentTypeItem>();
  const resetCreateDraft = useResetCreateDraft(
    APPOINTMENT_TYPE_CREATE_DRAFT_KEY,
  );

  useCreateIntentTrigger("appointment-types", crud.openCreate);

  const appointmentTypes = useMemo(() => data?.items ?? [], [data]);
  const manageType = useMemo(
    () => appointmentTypes.find((item) => item.id === manageTypeId) ?? null,
    [appointmentTypes, manageTypeId],
  );
  const displayManageType = useClosingSnapshot(manageType ?? undefined);
  const { isOpen: manageModalOpen, closeNow: closeManageModalNow } =
    useUrlDrivenModal({
      selectedId: manageTypeId,
      hasResolvedEntity: !!manageType,
    });

  const selectedIndex = manageTypeId
    ? appointmentTypes.findIndex((item) => item.id === manageTypeId)
    : -1;

  useListNavigation({
    items: appointmentTypes,
    selectedIndex,
    onSelect: (index) => {
      const item = appointmentTypes[index];
      if (item) setManageTypeId(item.id);
    },
    onOpen: (item) => setManageTypeId(item.id),
    enabled:
      appointmentTypes.length > 0 && !crud.showCreateForm && !manageModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create appointment type",
      },
      {
        key: "escape",
        action: () => setManageTypeId(null),
        description: "Close details",
        ignoreInputs: false,
      },
    ],
    enabled: !crud.showCreateForm && !manageModalOpen,
  });

  const {
    createMutation,
    updateMutation,
    deleteMutation,
    addCalendarMutation,
    removeCalendarMutation,
    addResourceMutation,
    updateResourceMutation,
    removeResourceMutation,
  } = useAppointmentTypeMutations({
    onCreateSuccess: (createdAppointmentTypeId) => {
      resetCreateDraft();
      crud.closeCreate();
      navigate({
        search: (prev) => ({
          ...prev,
          selected: createdAppointmentTypeId,
          tab: "details",
        }),
      });
    },
    onDeleteSuccess: () => {
      const removedId = crud.deletingItemId;
      crud.closeDelete();
      if (removedId && removedId === manageTypeId) {
        setManageTypeId(null);
      }
    },
  });

  const handleCreate = (formData: CreateAppointmentTypeInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateAppointmentTypeInput) => {
    if (!displayManageType) return;
    updateMutation.mutate({
      id: displayManageType.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const handleAddCalendar = useCallback(
    (calendarId: string) => {
      if (!manageType) return;
      addCalendarMutation.mutate({
        appointmentTypeId: manageType.id,
        data: { calendarId },
      });
    },
    [addCalendarMutation, manageType],
  );

  const handleRemoveCalendar = useCallback(
    (calendarId: string) => {
      if (!manageType) return;
      removeCalendarMutation.mutate({
        appointmentTypeId: manageType.id,
        calendarId,
      });
    },
    [manageType, removeCalendarMutation],
  );

  const handleAddResource = useCallback(
    (resourceId: string, quantityRequired: number) => {
      if (!manageType) return;
      addResourceMutation.mutate({
        appointmentTypeId: manageType.id,
        data: { resourceId, quantityRequired },
      });
    },
    [addResourceMutation, manageType],
  );

  const handleUpdateResourceQuantity = useCallback(
    (resourceId: string, quantityRequired: number) => {
      if (!manageType) return;
      updateResourceMutation.mutate({
        appointmentTypeId: manageType.id,
        resourceId,
        data: { quantityRequired },
      });
    },
    [manageType, updateResourceMutation],
  );

  const handleRemoveResource = useCallback(
    (resourceId: string) => {
      if (!manageType) return;
      removeResourceMutation.mutate({
        appointmentTypeId: manageType.id,
        resourceId,
      });
    },
    [manageType, removeResourceMutation],
  );

  const getContextMenuItems = useCallback(
    (type: AppointmentTypeItem): ContextMenuItem[] => [
      {
        label: "Manage Calendars",
        icon: Calendar03Icon,
        onClick: () => {
          setManageTypeId(type.id);
          setManageTab("calendars");
        },
      },
      {
        label: "Manage Resources",
        icon: Link01Icon,
        onClick: () => {
          setManageTypeId(type.id);
          setManageTab("resources");
        },
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => {
          setManageTypeId(type.id);
          setManageTab("details");
        },
        separator: true,
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(type.id),
        variant: "destructive",
      },
    ],
    [crud, setManageTab, setManageTypeId],
  );

  const closeManageModal = () => {
    closeManageModalNow();
    setManageTypeId(null);
  };

  return (
    <PageScaffold className="pb-24 sm:pb-6">
      <div className="flex justify-end">
        <Button className="hidden sm:inline-flex" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Type
          <ShortcutBadge shortcut="c" className="ml-2 hidden md:inline-flex" />
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <EntityListLoadingState rows={5} cols={7} />
        ) : error ? (
          <div className="py-10 text-center text-destructive">
            Error loading appointment types
          </div>
        ) : !appointmentTypes.length ? (
          <EntityListEmptyState>
            No appointment types yet. Create your first appointment type to get
            started.
          </EntityListEmptyState>
        ) : (
          <AppointmentTypesListPresentation
            appointmentTypes={appointmentTypes}
            getActions={getContextMenuItems}
            onOpen={(typeId, tabValue = "details") => {
              setManageTypeId(typeId);
              setManageTab(tabValue);
            }}
          />
        )}
      </div>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="New Appointment Type"
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <CreateAppointmentTypeForm
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={manageModalOpen && !!displayManageType}
        onOpenChange={(open) => {
          if (!open) closeManageModal();
        }}
        headerActions={
          displayManageType ? (
            <CopyIdHeaderAction
              id={displayManageType.id}
              entityLabel="appointment type"
            />
          ) : null
        }
        title={displayManageType?.name ?? ""}
      >
        {displayManageType ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 border-b border-border pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={manageTab === "details" ? "default" : "outline"}
                  onClick={() => setManageTab("details")}
                >
                  Details
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={manageTab === "calendars" ? "default" : "outline"}
                  onClick={() => setManageTab("calendars")}
                >
                  Calendars
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={manageTab === "resources" ? "default" : "outline"}
                  onClick={() => setManageTab("resources")}
                >
                  Resources
                </Button>
              </div>

              {manageTab === "details" && (
                <AppointmentTypeForm
                  key={displayManageType.id}
                  defaultValues={{
                    name: displayManageType.name,
                    durationMin: displayManageType.durationMin,
                    paddingBeforeMin:
                      displayManageType.paddingBeforeMin ?? undefined,
                    paddingAfterMin:
                      displayManageType.paddingAfterMin ?? undefined,
                    capacity: displayManageType.capacity ?? undefined,
                  }}
                  onSubmit={handleUpdate}
                  onCancel={closeManageModal}
                  isSubmitting={updateMutation.isPending}
                />
              )}

              {manageTab === "calendars" && (
                <CalendarsTab
                  appointmentTypeId={displayManageType.id}
                  onAddCalendar={handleAddCalendar}
                  onRemoveCalendar={handleRemoveCalendar}
                  isAddPending={addCalendarMutation.isPending}
                  isRemovePending={removeCalendarMutation.isPending}
                />
              )}

              {manageTab === "resources" && (
                <ResourcesTab
                  appointmentTypeId={displayManageType.id}
                  onAddResource={handleAddResource}
                  onUpdateQuantity={handleUpdateResourceQuantity}
                  onRemoveResource={handleRemoveResource}
                  isAddPending={addResourceMutation.isPending}
                  isUpdatePending={updateResourceMutation.isPending}
                  isRemovePending={removeResourceMutation.isPending}
                />
              )}
            </div>
          </div>
        ) : null}
      </EntityModal>

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Appointment Type"
        description="Are you sure you want to delete this appointment type? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add Type
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/appointment-types/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: ManageTab } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isManageTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      queryClient.ensureQueryData(
        orpc.appointmentTypes.list.queryOptions({
          input: { limit: 100 },
        }),
      ),
    );
  },
  component: AppointmentTypesPage,
});
