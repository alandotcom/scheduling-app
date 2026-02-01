// Appointment Types management page with clickable rows and context menus

import { useCallback, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Add01Icon,
  PencilEdit01Icon,
  Delete01Icon,
  Link01Icon,
  Calendar03Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";
import { createAppointmentTypeSchema } from "@scheduling/dto";
import type { CreateAppointmentTypeInput } from "@scheduling/dto";
import { useAppointmentTypeMutations } from "@/hooks/use-appointment-type-mutations";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { CalendarsTab } from "./-components/calendars-tab";
import { ResourcesTab } from "./-components/resources-tab";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerTabs,
  DrawerTab,
  DrawerFooter,
} from "@/components/drawer";

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
import { Badge } from "@/components/ui/badge";

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
}

function AppointmentTypeForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: AppointmentTypeFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAppointmentTypeInput>({
    resolver: zodResolver(createAppointmentTypeSchema),
    mode: "onBlur",
    defaultValues: defaultValues ?? {
      name: "",
      durationMin: 30,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2.5">
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
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2.5">
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
        </div>
        <div className="space-y-2.5">
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
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2.5">
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
        </div>
        <div className="space-y-2.5">
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
        </div>
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

function AppointmentTypesPage() {
  // URL-driven state for all UI modes
  const navigate = useNavigate({ from: Route.fullPath });
  const { mode, id, selected, tab } = Route.useSearch();

  // Derived state from URL
  const isCreating = mode === "create";
  const editingId = mode === "edit" ? id : null;

  // Drawer state from URL
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab ?? "details";
  const drawerOpen = !!selectedId;

  // Delete uses local state (modal confirmation doesn't need URL persistence)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Fetch appointment types
  const { data, isLoading, error } = useQuery(
    orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Infer item type from query result
  type AppointmentTypeItem = NonNullable<typeof data>["items"][number];

  // Derive selected type from data
  const selectedType = useMemo(
    () => data?.items.find((t) => t.id === selectedId) ?? null,
    [data?.items, selectedId],
  );

  // Derive editing item from data
  const editingItem = useMemo(
    () =>
      editingId ? (data?.items.find((t) => t.id === editingId) ?? null) : null,
    [data?.items, editingId],
  );

  // URL navigation helpers
  const openCreate = useCallback(() => {
    navigate({ search: { mode: "create" } });
  }, [navigate]);

  const closeCreate = useCallback(() => {
    navigate({ search: {} });
  }, [navigate]);

  const openEdit = useCallback(
    (typeId: string) => {
      navigate({ search: { mode: "edit", id: typeId } });
    },
    [navigate],
  );

  const closeEdit = useCallback(() => {
    navigate({ search: {} });
  }, [navigate]);

  const openDetails = useCallback(
    (typeId: string, newTab: DetailTabValue = "details") => {
      navigate({
        search: { selected: typeId, tab: newTab },
      });
    },
    [navigate],
  );

  const closeDetails = useCallback(() => {
    navigate({ search: {} });
  }, [navigate]);

  const setActiveTabUrl = useCallback(
    (value: string) => {
      if (!selectedId || !isDetailTab(value)) return;
      navigate({
        search: { selected: selectedId, tab: value },
      });
    },
    [navigate, selectedId],
  );

  // Computed state
  const isFormOpen = isCreating || !!editingItem;

  // All mutations via custom hook
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
    onCreateSuccess: closeCreate,
    onUpdateSuccess: closeEdit,
    onDeleteSuccess: () => {
      setDeletingItemId(null);
      closeDetails();
    },
  });

  const handleCreate = (formData: CreateAppointmentTypeInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateAppointmentTypeInput) => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!deletingItemId) return;
    deleteMutation.mutate({ id: deletingItemId });
  };

  // Handlers for tab components
  const handleAddCalendar = useCallback(
    (calendarId: string) => {
      if (!selectedType) return;
      addCalendarMutation.mutate({
        appointmentTypeId: selectedType.id,
        data: { calendarId },
      });
    },
    [selectedType, addCalendarMutation],
  );

  const handleRemoveCalendar = useCallback(
    (calendarId: string) => {
      if (!selectedType) return;
      removeCalendarMutation.mutate({
        appointmentTypeId: selectedType.id,
        calendarId,
      });
    },
    [selectedType, removeCalendarMutation],
  );

  const handleAddResource = useCallback(
    (resourceId: string, quantityRequired: number) => {
      if (!selectedType) return;
      addResourceMutation.mutate({
        appointmentTypeId: selectedType.id,
        data: { resourceId, quantityRequired },
      });
    },
    [selectedType, addResourceMutation],
  );

  const handleUpdateResourceQuantity = useCallback(
    (resourceId: string, quantityRequired: number) => {
      if (!selectedType) return;
      updateResourceMutation.mutate({
        appointmentTypeId: selectedType.id,
        resourceId,
        data: { quantityRequired },
      });
    },
    [selectedType, updateResourceMutation],
  );

  const handleRemoveResource = useCallback(
    (resourceId: string) => {
      if (!selectedType) return;
      removeResourceMutation.mutate({
        appointmentTypeId: selectedType.id,
        resourceId,
      });
    },
    [selectedType, removeResourceMutation],
  );

  const getContextMenuItems = useCallback(
    (type: AppointmentTypeItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDetails(type.id, "details"),
      },
      {
        label: "Manage Calendars",
        icon: Calendar03Icon,
        onClick: () => openDetails(type.id, "calendars"),
      },
      {
        label: "Manage Resources",
        icon: Link01Icon,
        onClick: () => openDetails(type.id, "resources"),
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () => openEdit(type.id),
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => setDeletingItemId(type.id),
        variant: "destructive",
        separator: true,
      },
    ],
    [openDetails, openEdit],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Appointment Types
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Configure the types of appointments that can be booked
          </p>
        </div>
        {!isFormOpen && (
          <Button className="shrink-0" onClick={openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Type</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            New Appointment Type
          </h2>
          <AppointmentTypeForm
            onSubmit={handleCreate}
            onCancel={closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit Form */}
      {editingItem && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            Edit Appointment Type
          </h2>
          <AppointmentTypeForm
            defaultValues={{
              name: editingItem.name,
              durationMin: editingItem.durationMin,
              paddingBeforeMin: editingItem.paddingBeforeMin ?? undefined,
              paddingAfterMin: editingItem.paddingAfterMin ?? undefined,
              capacity: editingItem.capacity ?? undefined,
            }}
            onSubmit={handleUpdate}
            onCancel={closeEdit}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      {/* Appointment Types Table */}
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
            Error loading appointment types
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-xl border border-border/50 bg-card p-10 text-center text-muted-foreground shadow-sm">
            No appointment types yet. Create your first appointment type to get
            started.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Padding</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((type) => (
                  <ContextMenu key={type.id} items={getContextMenuItems(type)}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openDetails(type.id, "details")}
                    >
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell>{type.durationMin} min</TableCell>
                      <TableCell>
                        {type.paddingBeforeMin || type.paddingAfterMin ? (
                          <span className="text-muted-foreground">
                            {type.paddingBeforeMin ?? 0} /{" "}
                            {type.paddingAfterMin ?? 0} min
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{type.capacity ?? 1}</Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(type.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) closeDetails();
        }}
      >
        <DrawerContent width="md">
          <DrawerHeader onClose={closeDetails}>
            <DrawerTitle>{selectedType?.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={setActiveTabUrl}>
            <DrawerTab value="details">Details</DrawerTab>
            <DrawerTab value="calendars">Calendars</DrawerTab>
            <DrawerTab value="resources">Resources</DrawerTab>
          </DrawerTabs>

          <DrawerBody>
            {activeTab === "details" && selectedType && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </Label>
                  <p className="mt-1 font-medium">
                    {selectedType.durationMin} minutes
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Padding
                  </Label>
                  <p className="mt-1">
                    {selectedType.paddingBeforeMin ?? 0} min before,{" "}
                    {selectedType.paddingAfterMin ?? 0} min after
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Capacity
                  </Label>
                  <p className="mt-1">{selectedType.capacity ?? 1} per slot</p>
                </div>
              </div>
            )}

            {activeTab === "calendars" && selectedType && (
              <CalendarsTab
                appointmentTypeId={selectedType.id}
                onAddCalendar={handleAddCalendar}
                onRemoveCalendar={handleRemoveCalendar}
                isAddPending={addCalendarMutation.isPending}
                isRemovePending={removeCalendarMutation.isPending}
              />
            )}

            {activeTab === "resources" && selectedType && (
              <ResourcesTab
                appointmentTypeId={selectedType.id}
                onAddResource={handleAddResource}
                onUpdateQuantity={handleUpdateResourceQuantity}
                onRemoveResource={handleRemoveResource}
                isAddPending={addResourceMutation.isPending}
                isUpdatePending={updateResourceMutation.isPending}
                isRemovePending={removeResourceMutation.isPending}
              />
            )}
          </DrawerBody>

          <DrawerFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedType) {
                  openEdit(selectedType.id);
                }
              }}
            >
              <Icon icon={PencilEdit01Icon} data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (selectedType) {
                  setDeletingItemId(selectedType.id);
                  closeDetails();
                }
              }}
            >
              <Icon icon={Delete01Icon} data-icon="inline-start" />
              Delete
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingItemId}
        onOpenChange={(open) => {
          if (!open) setDeletingItemId(null);
        }}
        onConfirm={handleDelete}
        title="Delete Appointment Type"
        description="Are you sure you want to delete this appointment type? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

type DetailTabValue = "details" | "calendars" | "resources";
type ModeValue = "create" | "edit";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "calendars" || value === "resources";

const isMode = (value: string): value is ModeValue =>
  value === "create" || value === "edit";

interface SearchParams {
  mode?: ModeValue;
  id?: string;
  selected?: string;
  tab?: DetailTabValue;
}

export const Route = createFileRoute("/_authenticated/appointment-types/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const rawMode = typeof search.mode === "string" ? search.mode : "";
    const mode = isMode(rawMode) ? rawMode : undefined;
    const id = typeof search.id === "string" ? search.id : undefined;
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { mode, id, selected, tab };
  },
  component: AppointmentTypesPage,
});
