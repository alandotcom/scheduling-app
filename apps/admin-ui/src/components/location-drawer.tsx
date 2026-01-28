// Location detail drawer with relationships

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Calendar03Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { TIMEZONES } from "@/lib/constants";
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
import { Button } from "@/components/ui/button";
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

interface LocationDrawerProps {
  location: {
    id: string;
    name: string;
    timezone: string;
    createdAt: string | Date;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationDrawer({
  location,
  open,
  onOpenChange,
}: LocationDrawerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
        toast.success("Location updated");
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
        queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
        setShowDeleteDialog(false);
        onOpenChange(false);
        toast.success("Location deleted");
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

  // Reset form when location changes
  useState(() => {
    if (location) {
      form.reset({
        name: location.name,
        timezone: location.timezone,
      });
    }
  });

  if (!location) return null;

  const handleSave = (data: CreateLocationInput) => {
    updateMutation.mutate({
      id: location.id,
      data,
    });
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent width="md">
          <DrawerHeader onClose={() => onOpenChange(false)}>
            <DrawerTitle>{location.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerTabs value={activeTab} onValueChange={setActiveTab}>
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
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
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
                </div>

                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={form.watch("timezone")}
                    onValueChange={(v) => v && form.setValue("timezone", v)}
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "calendars" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Calendars Using This Location
                  </h3>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/calendars" search={{}}>
                      View all
                      <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>

                {calendarsAtLocation.length === 0 ? (
                  <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
                    No calendars assigned to this location
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/50 divide-y divide-border/50">
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
                        <Badge variant="secondary">{calendar.timezone}</Badge>
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
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/resources">
                      View all
                      <Icon icon={ArrowRight02Icon} data-icon="inline-end" />
                    </Link>
                  </Button>
                </div>

                {resourcesAtLocation.length === 0 ? (
                  <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
                    No resources at this location
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/50 divide-y divide-border/50">
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Location
            </Button>
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
