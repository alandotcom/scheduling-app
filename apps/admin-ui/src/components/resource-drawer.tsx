// Resource detail drawer

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/mini";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { createResourceSchema } from "@scheduling/dto";
import type { CreateResourceInput } from "@scheduling/dto";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

// Form schema with required quantity for better UX
const resourceFormSchema = z.extend(createResourceSchema, {
  quantity: z.number().check(z.int(), z.positive()),
});

interface ResourceDrawerProps {
  resource: {
    id: string;
    name: string;
    quantity: number;
    locationId?: string | null;
    createdAt: string | Date;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResourceDrawer({
  resource,
  open,
  onOpenChange,
}: ResourceDrawerProps) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch locations for dropdown
  const { data: locationsData } = useQuery(
    orpc.locations.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Update mutation
  const updateMutation = useMutation(
    orpc.resources.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        toast.success("Resource updated");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update resource");
      },
    }),
  );

  // Delete mutation
  const deleteMutation = useMutation(
    orpc.resources.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
        setShowDeleteDialog(false);
        onOpenChange(false);
        toast.success("Resource deleted");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete resource");
      },
    }),
  );

  const locations = locationsData?.items ?? [];

  // Form for details
  const form = useForm<CreateResourceInput>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: resource?.name ?? "",
      quantity: resource?.quantity ?? 1,
      locationId: resource?.locationId ?? undefined,
    },
  });

  // Reset form when resource changes
  useState(() => {
    if (resource) {
      form.reset({
        name: resource.name,
        quantity: resource.quantity,
        locationId: resource.locationId ?? undefined,
      });
    }
  });

  if (!resource) return null;

  const handleSave = (data: CreateResourceInput) => {
    updateMutation.mutate({
      id: resource.id,
      data,
    });
  };

  const selectedLocation = locations.find(
    (l) => l.id === form.watch("locationId"),
  );

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent width="md">
          <DrawerHeader onClose={() => onOpenChange(false)}>
            <DrawerTitle>{resource.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerBody>
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
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  {...form.register("quantity", { valueAsNumber: true })}
                  disabled={updateMutation.isPending}
                />
                {form.formState.errors.quantity && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Location (optional)</Label>
                <Select
                  value={form.watch("locationId") ?? "none"}
                  onValueChange={(v) =>
                    v &&
                    form.setValue("locationId", v === "none" ? undefined : v)
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {selectedLocation?.name ?? "No location"}
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
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DrawerBody>

          <DrawerFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Resource
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={() => deleteMutation.mutate({ id: resource.id })}
        title="Delete Resource"
        description="Are you sure you want to delete this resource? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
