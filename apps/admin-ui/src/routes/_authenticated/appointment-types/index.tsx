// Appointment Types management page with clickable rows and context menus

import { useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { orpc } from "@/lib/query";
import { createAppointmentTypeSchema } from "@scheduling/dto";
import type { CreateAppointmentTypeInput } from "@scheduling/dto";
import { useCrudState } from "@/hooks/use-crud-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
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

interface AppointmentTypeItem {
  id: string;
  name: string;
  durationMin: number;
  paddingBeforeMin?: number | null;
  paddingAfterMin?: number | null;
  capacity?: number | null;
  createdAt: string | Date;
}

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
  const queryClient = useQueryClient();
  const crud = useCrudState<AppointmentTypeItem>();

  // Drawer state
  const [selectedType, setSelectedType] = useState<AppointmentTypeItem | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Fetch appointment types
  const { data, isLoading, error } = useQuery(
    orpc.appointmentTypes.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Fetch linked calendars for selected type
  const { data: linkedCalendarsData } = useQuery({
    ...orpc.appointmentTypes.calendars.list.queryOptions({
      input: { appointmentTypeId: selectedType?.id ?? "" },
    }),
    enabled: !!selectedType?.id && drawerOpen,
  });

  // Fetch required resources for selected type
  const { data: requiredResourcesData } = useQuery({
    ...orpc.appointmentTypes.resources.list.queryOptions({
      input: { appointmentTypeId: selectedType?.id ?? "" },
    }),
    enabled: !!selectedType?.id && drawerOpen,
  });

  // Create mutation
  const createMutation = useMutation(
    orpc.appointmentTypes.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        crud.closeCreate();
        toast.success("Appointment type created successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create appointment type");
      },
    }),
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.appointmentTypes.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        crud.closeEdit();
        toast.success("Appointment type updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update appointment type");
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.appointmentTypes.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
        });
        crud.closeDelete();
        setDrawerOpen(false);
        toast.success("Appointment type deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete appointment type");
      },
    }),
  );

  const linkedCalendars = linkedCalendarsData ?? [];
  const requiredResources = requiredResourcesData ?? [];

  const handleCreate = (formData: CreateAppointmentTypeInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateAppointmentTypeInput) => {
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

  const openDrawer = useCallback((type: AppointmentTypeItem) => {
    setSelectedType(type);
    setActiveTab("details");
    setDrawerOpen(true);
  }, []);

  const getContextMenuItems = useCallback(
    (type: AppointmentTypeItem): ContextMenuItem[] => [
      {
        label: "View Details",
        icon: ViewIcon,
        onClick: () => openDrawer(type),
      },
      {
        label: "Manage Calendars",
        icon: Calendar03Icon,
        onClick: () => {
          setSelectedType(type);
          setActiveTab("calendars");
          setDrawerOpen(true);
        },
      },
      {
        label: "Manage Resources",
        icon: Link01Icon,
        onClick: () => {
          setSelectedType(type);
          setActiveTab("resources");
          setDrawerOpen(true);
        },
      },
      {
        label: "Edit",
        icon: PencilEdit01Icon,
        onClick: () =>
          crud.openEdit({
            id: type.id,
            name: type.name,
            durationMin: type.durationMin,
            paddingBeforeMin: type.paddingBeforeMin ?? undefined,
            paddingAfterMin: type.paddingAfterMin ?? undefined,
            capacity: type.capacity ?? undefined,
            createdAt: type.createdAt,
          }),
      },
      {
        label: "Delete",
        icon: Delete01Icon,
        onClick: () => crud.openDelete(type.id),
        variant: "destructive",
        separator: true,
      },
    ],
    [openDrawer, crud],
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Appointment Types
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the types of appointments that can be booked
          </p>
        </div>
        {!crud.isFormOpen && (
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Add Type
          </Button>
        )}
      </div>

      {/* Create Form */}
      {crud.showCreateForm && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">
            New Appointment Type
          </h2>
          <AppointmentTypeForm
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
            Edit Appointment Type
          </h2>
          <AppointmentTypeForm
            defaultValues={{
              name: crud.editingItem.name,
              durationMin: crud.editingItem.durationMin,
              paddingBeforeMin: crud.editingItem.paddingBeforeMin ?? undefined,
              paddingAfterMin: crud.editingItem.paddingAfterMin ?? undefined,
              capacity: crud.editingItem.capacity ?? undefined,
            }}
            onSubmit={handleUpdate}
            onCancel={crud.closeEdit}
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
                  <ContextMenu
                    key={type.id}
                    items={getContextMenuItems(type as AppointmentTypeItem)}
                  >
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openDrawer(type as AppointmentTypeItem)}
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
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent width="md">
          <DrawerHeader onClose={() => setDrawerOpen(false)}>
            <DrawerTitle>{selectedType?.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={setActiveTab}>
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Linked Calendars</h3>
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      to="/appointment-types/$typeId/calendars"
                      params={{ typeId: selectedType.id }}
                    >
                      Manage
                    </Link>
                  </Button>
                </div>
                {linkedCalendars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No calendars linked yet
                  </p>
                ) : (
                  <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                    {linkedCalendars.map((link) => (
                      <div key={link.calendarId} className="px-4 py-2.5">
                        <span className="font-medium">
                          {link.calendar.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "resources" && selectedType && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Required Resources</h3>
                  <Button variant="ghost" size="sm" asChild>
                    <Link
                      to="/appointment-types/$typeId/resources"
                      params={{ typeId: selectedType.id }}
                    >
                      Manage
                    </Link>
                  </Button>
                </div>
                {requiredResources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No resources required
                  </p>
                ) : (
                  <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                    {requiredResources.map((req) => (
                      <div
                        key={req.resourceId}
                        className="px-4 py-2.5 flex items-center justify-between"
                      >
                        <span className="font-medium">{req.resource.name}</span>
                        <Badge variant="secondary">
                          Qty: {req.quantityRequired}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DrawerBody>

          <DrawerFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedType) {
                  crud.openEdit({
                    id: selectedType.id,
                    name: selectedType.name,
                    durationMin: selectedType.durationMin,
                    paddingBeforeMin:
                      selectedType.paddingBeforeMin ?? undefined,
                    paddingAfterMin: selectedType.paddingAfterMin ?? undefined,
                    capacity: selectedType.capacity ?? undefined,
                    createdAt: selectedType.createdAt,
                  });
                  setDrawerOpen(false);
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
                  crud.openDelete(selectedType.id);
                  setDrawerOpen(false);
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
  component: AppointmentTypesPage,
});
