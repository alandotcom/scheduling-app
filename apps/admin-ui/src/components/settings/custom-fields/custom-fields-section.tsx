import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Add01Icon } from "@hugeicons/core-free-icons";
import type {
  CustomAttributeDefinitionResponse,
  CustomAttributeType,
} from "@scheduling/dto";

import { orpc } from "@/lib/query";
import { EntityModal } from "@/components/entity-modal";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useCrudState } from "@/hooks/use-crud-state";
import { CustomFieldsList } from "./custom-fields-list";
import { CustomFieldForm } from "./custom-field-form";
import { SlotUsageDisplay } from "./slot-usage-display";

export function CustomFieldsSection() {
  const queryClient = useQueryClient();

  const { data: definitions, isLoading } = useQuery(
    orpc.customAttributes.listDefinitions.queryOptions({}),
  );

  const { data: slotUsage } = useQuery(
    orpc.customAttributes.getSlotUsage.queryOptions({}),
  );

  const crud = useCrudState<CustomAttributeDefinitionResponse>();

  const createMutation = useMutation(
    orpc.customAttributes.createDefinition.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.customAttributes.key(),
        });
        crud.closeCreate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create custom field");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.customAttributes.updateDefinition.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.customAttributes.key(),
        });
        crud.closeEdit();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update custom field");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.customAttributes.deleteDefinition.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.customAttributes.key(),
        });
        crud.closeDelete();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete custom field");
      },
    }),
  );

  const listQueryKey = orpc.customAttributes.listDefinitions.queryOptions(
    {},
  ).queryKey;

  const reorderMutation = useMutation(
    orpc.customAttributes.reorderDefinitions.mutationOptions({
      onMutate: async ({ orderedIds }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const previous = queryClient.getQueryData(listQueryKey);
        queryClient.setQueryData(listQueryKey, (old: typeof definitions) => {
          if (!old) return old;
          const byId = new Map(old.map((d) => [d.id, d]));
          const reordered: typeof old = [];
          for (let i = 0; i < orderedIds.length; i++) {
            const id = orderedIds[i];
            if (!id) continue;
            const def = byId.get(id);
            if (def) reordered.push({ ...def, displayOrder: i });
          }
          return reordered;
        });
        return { previous };
      },
      onError: (error, _vars, ctx) => {
        if (ctx?.previous) {
          queryClient.setQueryData(listQueryKey, ctx.previous);
        }
        toast.error(error.message || "Failed to reorder custom fields");
      },
      onSettled: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.customAttributes.key(),
        });
      },
    }),
  );

  const handleCreate = (data: {
    fieldKey?: string;
    label: string;
    type?: CustomAttributeType;
    required: boolean;
    options?: string[];
  }) => {
    if (!data.fieldKey || !data.type) return;
    createMutation.mutate({
      fieldKey: data.fieldKey,
      label: data.label,
      type: data.type,
      required: data.required,
      options: data.options,
    });
  };

  const handleUpdate = (data: {
    label: string;
    required: boolean;
    options?: string[];
  }) => {
    if (!crud.editingItem) return;
    updateMutation.mutate({
      id: crud.editingItem.id,
      label: data.label,
      required: data.required,
      options: data.options,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const handleReorder = (orderedIds: string[]) => {
    reorderMutation.mutate({ orderedIds });
  };

  const definitionItems = definitions ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Custom Fields</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define custom attributes for your clients. Drag to reorder.
        </p>
      </div>

      {slotUsage ? <SlotUsageDisplay slotUsage={slotUsage} /> : null}

      <div className="flex justify-end">
        <Button type="button" onClick={crud.openCreate}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          Add field
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">
          Loading custom fields...
        </div>
      ) : (
        <CustomFieldsList
          definitions={definitionItems}
          onEdit={crud.openEdit}
          onDelete={crud.openDelete}
          onReorder={handleReorder}
        />
      )}

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="Create Custom Field"
        description="Add a new custom attribute for clients."
      >
        <div className="p-6">
          <CustomFieldForm
            mode="create"
            slotUsage={slotUsage}
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={!!crud.editingItem}
        onOpenChange={(open) => {
          if (!open) crud.closeEdit();
        }}
        title="Edit Custom Field"
      >
        {crud.editingItem ? (
          <div className="p-6">
            <CustomFieldForm
              mode="edit"
              defaultValues={{
                fieldKey: crud.editingItem.fieldKey,
                label: crud.editingItem.label,
                type: crud.editingItem.type,
                required: crud.editingItem.required,
                options: crud.editingItem.options,
              }}
              slotUsage={slotUsage}
              onSubmit={handleUpdate}
              onCancel={crud.closeEdit}
              isSubmitting={updateMutation.isPending}
            />
          </div>
        ) : null}
      </EntityModal>

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Custom Field"
        description="All client values for this field will be permanently removed. This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
