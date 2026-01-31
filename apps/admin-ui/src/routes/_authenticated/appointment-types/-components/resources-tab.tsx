// Resources tab for linking resources to appointment types

import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/query";

interface ResourcesTabProps {
  appointmentTypeId: string;
  onAddResource: (resourceId: string, quantityRequired: number) => void;
  onUpdateQuantity: (resourceId: string, quantityRequired: number) => void;
  onRemoveResource: (resourceId: string) => void;
  isAddPending: boolean;
  isUpdatePending: boolean;
  isRemovePending: boolean;
}

export function ResourcesTab({
  appointmentTypeId,
  onAddResource,
  onUpdateQuantity,
  onRemoveResource,
  isAddPending,
  isUpdatePending,
  isRemovePending,
}: ResourcesTabProps) {
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [quantityRequired, setQuantityRequired] = useState<number>(1);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fetch required resources for this type
  const { data: requiredResourcesData } = useQuery({
    ...orpc.appointmentTypes.resources.list.queryOptions({
      input: { appointmentTypeId },
    }),
    enabled: !!appointmentTypeId,
  });

  // Fetch all resources for dropdown
  const { data: allResourcesData } = useQuery({
    ...orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
    enabled: !!appointmentTypeId,
  });

  const requiredResources = requiredResourcesData ?? [];

  // Memoize derived state
  const { availableResources, selectedResource } = useMemo(() => {
    const linkedResourceIds = new Set(
      requiredResources.map((r) => r.resourceId),
    );
    const available =
      allResourcesData?.items.filter((r) => !linkedResourceIds.has(r.id)) ?? [];
    const selected = available.find((r) => r.id === selectedResourceId);
    return { availableResources: available, selectedResource: selected };
  }, [requiredResources, allResourcesData?.items, selectedResourceId]);

  const handleAdd = () => {
    if (!selectedResourceId) return;
    onAddResource(selectedResourceId, quantityRequired);
    setSelectedResourceId("");
    setQuantityRequired(1);
  };

  // Debounced quantity update
  const handleQuantityChange = useCallback(
    (resourceId: string, newQty: number, maxQty: number) => {
      if (newQty < 1 || newQty > maxQty) return;

      // Clear existing timer
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set new timer for 500ms
      debounceRef.current = setTimeout(() => {
        onUpdateQuantity(resourceId, newQty);
      }, 500);
    },
    [onUpdateQuantity],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={selectedResourceId}
          onValueChange={(v) => v && setSelectedResourceId(v)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a resource to add">
              {selectedResource
                ? `${selectedResource.name} (Qty: ${selectedResource.quantity})`
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableResources.length === 0 ? (
              <SelectItem value="none" disabled>
                No available resources
              </SelectItem>
            ) : (
              availableResources.map((resource) => (
                <SelectItem key={resource.id} value={resource.id}>
                  {resource.name} (Qty: {resource.quantity})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          className="w-[80px]"
          value={quantityRequired}
          onChange={(e) =>
            setQuantityRequired(parseInt(e.target.value, 10) || 1)
          }
          placeholder="Qty"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedResourceId || isAddPending}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          {isAddPending ? "Adding..." : "Add"}
        </Button>
      </div>

      {requiredResources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No resources required. Add resources if this appointment type requires
          specific equipment or rooms.
        </p>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Required</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requiredResources.map((req) => (
                <TableRow key={req.resourceId}>
                  <TableCell className="font-medium">
                    {req.resource.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {req.resource.quantity}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      max={req.resource.quantity}
                      className="w-[70px] h-8"
                      defaultValue={req.quantityRequired}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value, 10);
                        handleQuantityChange(
                          req.resourceId,
                          newQty,
                          req.resource.quantity,
                        );
                      }}
                      disabled={isUpdatePending}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemoveResource(req.resourceId)}
                      disabled={isRemovePending}
                    >
                      <Icon icon={Delete01Icon} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
