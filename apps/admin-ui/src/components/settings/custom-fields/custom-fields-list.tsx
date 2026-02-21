import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DragDropIcon,
  PencilEdit01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { RowActions, type RowAction } from "@/components/row-actions";
import { getCustomAttributeTypeLabel } from "@/lib/custom-attribute-type-label";

function SortableRow({
  item,
  onEdit,
  onDelete,
}: {
  item: CustomAttributeDefinitionResponse;
  onEdit: (item: CustomAttributeDefinitionResponse) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const actions: RowAction[] = [
    {
      label: "Edit",
      icon: PencilEdit01Icon,
      onClick: () => onEdit(item),
    },
    {
      label: "Delete",
      icon: Delete01Icon,
      onClick: () => onDelete(item.id),
      variant: "destructive",
      separator: true,
    },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <Icon icon={DragDropIcon} className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="font-medium">{item.label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {item.fieldKey}
        </span>
        <Badge variant="secondary">
          {getCustomAttributeTypeLabel(item.type)}
        </Badge>
        {item.required ? <Badge variant="outline">Required</Badge> : null}
        {item.options && item.options.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {item.options.length} option{item.options.length !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <RowActions ariaLabel={`Actions for ${item.label}`} actions={actions} />
    </div>
  );
}

export function CustomFieldsList({
  definitions,
  onEdit,
  onDelete,
  onReorder,
}: {
  definitions: CustomAttributeDefinitionResponse[];
  onEdit: (item: CustomAttributeDefinitionResponse) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const itemIds = useMemo(() => definitions.map((d) => d.id), [definitions]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = definitions.findIndex((d) => d.id === active.id);
    const newIndex = definitions.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(definitions, oldIndex, newIndex);
    onReorder(reordered.map((d) => d.id));
  }

  if (definitions.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No custom fields defined yet.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {definitions.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
