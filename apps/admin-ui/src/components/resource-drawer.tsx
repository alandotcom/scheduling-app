// Resource detail drawer

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { orpc } from "@/lib/query";
import { resolveSelectValueLabel } from "@/lib/select-value-label";
import type { CreateResourceInput } from "@scheduling/dto";
import { resourceFormSchema } from "@/routes/_authenticated/resources";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
} from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
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

interface ResourceDrawerProps {
  resource: {
    id: string;
    name: string;
    quantity: number;
    locationId?: string | null;
    createdAt: string | Date;
  } | null;
  open: boolean;
  onClose: () => void;
}

export function ResourceDrawer({
  resource,
  open,
  onClose,
}: ResourceDrawerProps) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
        setShowDeleteDialog(false);
        onClose();
        queryClient.invalidateQueries({ queryKey: orpc.resources.key() });
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

  useResetFormOnOpen({
    open,
    entityKey: resource?.id,
    values: resource
      ? {
          name: resource.name,
          quantity: resource.quantity,
          locationId: resource.locationId ?? undefined,
        }
      : null,
    reset: (values) => {
      form.reset(values);
    },
  });

  const handleSave = (data: CreateResourceInput) => {
    if (!resource) {
      return;
    }

    updateMutation.mutate({
      id: resource.id,
      data,
    });
  };

  useSubmitShortcut({
    enabled: open && !updateMutation.isPending,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  const locationId = form.watch("locationId");
  const locationSelectLabel = resolveSelectValueLabel({
    value: locationId ?? "none",
    options: locations,
    getOptionValue: (location) => location.id,
    getOptionLabel: (location) => location.name,
    noneLabel: "No location",
    unknownLabel: "Unknown location",
  });

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: open,
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

  if (!resource) return null;

  return (
    <>
      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DrawerContent width="md">
          <DrawerHeader onClose={onClose}>
            <DrawerTitle>{resource.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerBody>
            <form
              ref={formRef}
              onSubmit={form.handleSubmit(handleSave)}
              className="space-y-5"
            >
              <div className="space-y-2 relative" ref={registerField("name")}>
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
                <FieldShortcutHint shortcut="n" visible={hintsVisible} />
              </div>

              <div
                className="space-y-2 relative"
                ref={registerField("quantity")}
              >
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
                <FieldShortcutHint shortcut="q" visible={hintsVisible} />
              </div>

              <div
                className="space-y-2 relative"
                ref={registerField("location")}
              >
                <Label>Location (optional)</Label>
                <Select
                  value={locationId ?? "none"}
                  onValueChange={(v) =>
                    v &&
                    form.setValue("locationId", v === "none" ? undefined : v)
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue>{locationSelectLabel}</SelectValue>
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

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  <ShortcutBadge
                    shortcut="meta+enter"
                    className="ml-2 hidden sm:inline-flex"
                  />
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
