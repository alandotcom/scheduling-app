// Appointment Types management page with modal-based CRUD

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EntityModal } from "@/components/entity-modal";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
import { useCrudState } from "@/hooks/use-crud-state";
import { useAppointmentTypeMutations } from "@/hooks/use-appointment-type-mutations";
import { formatDisplayDate } from "@/lib/date-utils";
import { getQueryClient, orpc } from "@/lib/query";
import { CalendarsTab } from "./-components/calendars-tab";
import { ResourcesTab } from "./-components/resources-tab";

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

type ManageTab = "details" | "calendars" | "resources";

function AppointmentTypesPage() {
  const [manageTypeId, setManageTypeId] = useState<string | null>(null);
  const [manageTab, setManageTab] = useState<ManageTab>("details");

  const { data, isLoading, error } = useQuery({
    ...orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type AppointmentTypeItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<AppointmentTypeItem>();

  const appointmentTypes = data?.items ?? [];
  const manageType = useMemo(
    () => appointmentTypes.find((item) => item.id === manageTypeId) ?? null,
    [appointmentTypes, manageTypeId],
  );
  const [closingManageTypeSnapshot, setClosingManageTypeSnapshot] =
    useState<AppointmentTypeItem | null>(null);

  useEffect(() => {
    if (!manageType) return;
    setClosingManageTypeSnapshot(manageType);
  }, [manageType]);

  const displayManageType = manageType ?? closingManageTypeSnapshot;

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
    onCreateSuccess: crud.closeCreate,
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
    [crud],
  );

  const closeManageModal = () => {
    setManageTypeId(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Appointment Types
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Configure the types of appointments that can be booked
          </p>
        </div>
        <Button className="shrink-0" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          <span className="hidden sm:inline">Add Type</span>
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
            Error loading appointment types
          </div>
        ) : !appointmentTypes.length ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
            No appointment types yet. Create your first appointment type to get
            started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Padding</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Relationships</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointmentTypes.map((type) => (
                  <ContextMenu key={type.id} items={getContextMenuItems(type)}>
                    <TableRow
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      tabIndex={0}
                      onClick={() => {
                        setManageTypeId(type.id);
                        setManageTab("details");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setManageTypeId(type.id);
                          setManageTab("details");
                        }
                      }}
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
                        <div className="flex flex-wrap gap-1">
                          <RelationshipCountBadge
                            count={type.relationshipCounts?.calendars ?? 0}
                            singular="calendar"
                          />
                          <RelationshipCountBadge
                            count={type.relationshipCounts?.resources ?? 0}
                            singular="resource"
                          />
                          <RelationshipCountBadge
                            count={type.relationshipCounts?.appointments ?? 0}
                            singular="appointment"
                          />
                        </div>
                      </TableCell>
                      <TableCell>{formatDisplayDate(type.createdAt)}</TableCell>
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
        title="New Appointment Type"
      >
        <AppointmentTypeForm
          onSubmit={handleCreate}
          onCancel={crud.closeCreate}
          isSubmitting={createMutation.isPending}
        />
      </EntityModal>

      <EntityModal
        open={!!manageType}
        onOpenChange={(open) => {
          if (!open) closeManageModal();
        }}
        title={displayManageType?.name ?? ""}
        className="max-w-4xl"
      >
        {displayManageType ? (
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
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/appointment-types/")({
  loader: async () => {
    const queryClient = getQueryClient();
    await queryClient.ensureQueryData(
      orpc.appointmentTypes.list.queryOptions({
        input: { limit: 100 },
      }),
    );
  },
  component: AppointmentTypesPage,
});
