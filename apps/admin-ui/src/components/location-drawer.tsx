// Location detail drawer with relationships

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Calendar03Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
import {
  formatTimezonePickerLabel,
  formatTimezoneShort,
} from "@/lib/date-utils";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import { createLocationSchema } from "@scheduling/dto";
import type { CreateLocationInput } from "@scheduling/dto";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
  DrawerTabs,
  DrawerTab,
} from "@/components/drawer";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useResetFormOnOpen } from "@/hooks/use-reset-form-on-open";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";

interface LocationDrawerProps {
  location: {
    id: string;
    name: string;
    timezone: string;
    createdAt: string | Date;
  } | null;
  open: boolean;
  onClose: () => void;
  activeTab: "details" | "calendars" | "resources";
  onTabChange: (tab: string) => void;
}

export function LocationDrawer({
  location,
  open,
  onClose,
  activeTab,
  onTabChange,
}: LocationDrawerProps) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = "location-details-form";

  // Fetch calendars at this location
  const { data: calendarsData } = useQuery({
    ...orpc.calendars.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!location?.id,
  });

  // Fetch resources at this location
  const { data: resourcesData } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!location?.id,
  });

  // Update mutation
  const updateMutation = useMutation(
    orpc.locations.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
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
        setShowDeleteDialog(false);
        onClose();
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete location");
      },
    }),
  );

  // Filter calendars and resources for this location
  const calendarsAtLocation =
    calendarsData?.items.filter((c) => c.locationId === location?.id) ?? [];
  const resourcesAtLocation =
    resourcesData?.items.filter((r) => r.locationId === location?.id) ?? [];

  // Form for details tab
  const form = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: {
      name: location?.name ?? "",
      timezone: location?.timezone ?? "America/New_York",
    },
  });

  useResetFormOnOpen({
    open,
    entityKey: location?.id,
    values: location
      ? {
          name: location.name,
          timezone: location.timezone,
        }
      : null,
    reset: (values) => {
      form.reset(values);
    },
  });

  const timezone = form.watch("timezone");
  const timezoneSelectLabel = resolveSelectValueLabel({
    value: timezone,
    options: TIMEZONES,
    getOptionValue: (tz) => tz,
    getOptionLabel: (tz) => formatTimezonePickerLabel(tz),
    unknownLabel: "Unknown timezone",
  });

  const handleSave = (data: CreateLocationInput) => {
    if (!location) {
      return;
    }

    updateMutation.mutate({
      id: location.id,
      ...data,
    });
  };

  useSubmitShortcut({
    enabled: open && activeTab === "details" && !updateMutation.isPending,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: open && activeTab === "details",
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

  if (!location) return null;

  return (
    <>
      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DrawerContent width="md">
          <DrawerHeader onClose={onClose}>
            <DrawerTitle>{location.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={onTabChange}>
            <DrawerTab value="details">Details</DrawerTab>
            <DrawerTab value="calendars">
              Calendars ({calendarsAtLocation.length})
            </DrawerTab>
            <DrawerTab value="resources">
              Resources ({resourcesAtLocation.length})
            </DrawerTab>
          </DrawerTabs>

          <DrawerBody>
            {activeTab === "details" && (
              <form
                id={formId}
                ref={formRef}
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-5"
              >
                <div className="space-y-2 relative" ref={registerField("name")}>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    {...form.register("name")}
                    disabled={updateMutation.isPending}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                  <FieldShortcutHint shortcut="n" visible={hintsVisible} />
                </div>

                <div
                  className="space-y-2 relative"
                  ref={registerField("timezone")}
                >
                  <Label>Timezone *</Label>
                  <Select
                    value={timezone}
                    onValueChange={(v) => v && form.setValue("timezone", v)}
                    disabled={updateMutation.isPending}
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
                  <FieldShortcutHint shortcut="t" visible={hintsVisible} />
                </div>
              </form>
            )}

            {activeTab === "calendars" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Calendars Using This Location
                  </h3>
                  <Link
                    to="/calendars"
                    search={{}}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    View all
                    <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                  </Link>
                </div>

                {calendarsAtLocation.length === 0 ? (
                  <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                    No calendars assigned to this location
                  </div>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border/50">
                    {calendarsAtLocation.map((calendar) => (
                      <div
                        key={calendar.id}
                        className="px-4 py-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            icon={Calendar03Icon}
                            className="text-muted-foreground size-4"
                          />
                          <span className="font-medium">{calendar.name}</span>
                        </div>
                        <Badge variant="secondary" title={calendar.timezone}>
                          {formatTimezoneShort(calendar.timezone)}
                        </Badge>
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
                    Resources at This Location
                  </h3>
                  <Link
                    to="/resources"
                    search={{}}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    View all
                    <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                  </Link>
                </div>

                {resourcesAtLocation.length === 0 ? (
                  <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                    No resources at this location
                  </div>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border/50">
                    {resourcesAtLocation.map((resource) => (
                      <div
                        key={resource.id}
                        className="px-4 py-3 flex items-center justify-between"
                      >
                        <span className="font-medium">{resource.name}</span>
                        <Badge variant="secondary">
                          Qty: {resource.quantity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DrawerBody>

          <DrawerFooter>
            <div className="flex w-full items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                Delete Location
              </Button>
              {activeTab === "details" && (
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form={formId}
                    size="sm"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={() => deleteMutation.mutate({ id: location.id })}
        title="Delete Location"
        description="Are you sure you want to delete this location? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
