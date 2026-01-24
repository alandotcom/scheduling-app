// Link resources to appointment type with quantity requirements

import { useState } from "react";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/contexts/auth";
import { orpc } from "@/lib/query";

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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function AppointmentTypeResourcesPage() {
  const { typeId } = Route.useParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [quantityRequired, setQuantityRequired] = useState<number>(1);

  // Fetch appointment type details
  const { data: appointmentType, isLoading: typeLoading } = useQuery(
    orpc.appointmentTypes.get.queryOptions({
      input: { id: typeId },
    }),
  );

  // Fetch linked resources
  const { data: linkedResources, isLoading: linkedLoading } = useQuery(
    orpc.appointmentTypes.resources.list.queryOptions({
      input: { appointmentTypeId: typeId },
    }),
  );

  // Fetch all resources for the dropdown
  const { data: allResources } = useQuery(
    orpc.resources.list.queryOptions({
      input: { limit: 100 },
    }),
  );

  // Add resource mutation
  const addMutation = useMutation(
    orpc.appointmentTypes.resources.add.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
        setSelectedResourceId("");
        setQuantityRequired(1);
      },
    }),
  );

  // Update resource mutation
  const updateMutation = useMutation(
    orpc.appointmentTypes.resources.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
      },
    }),
  );

  // Remove resource mutation
  const removeMutation = useMutation(
    orpc.appointmentTypes.resources.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["appointmentTypes"] });
      },
    }),
  );

  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  const isLoading = typeLoading || linkedLoading;

  // Filter out already linked resources
  const linkedIds = new Set(linkedResources?.map((r) => r.resourceId) ?? []);
  const availableResources =
    allResources?.items.filter((r) => !linkedIds.has(r.id)) ?? [];

  const handleAdd = () => {
    if (!selectedResourceId) return;
    addMutation.mutate({
      appointmentTypeId: typeId,
      data: {
        resourceId: selectedResourceId,
        quantityRequired,
      },
    });
  };

  const handleRemove = (resourceId: string) => {
    removeMutation.mutate({
      appointmentTypeId: typeId,
      resourceId,
    });
  };

  const handleUpdateQuantity = (resourceId: string, newQuantity: number) => {
    updateMutation.mutate({
      appointmentTypeId: typeId,
      resourceId,
      data: { quantityRequired: newQuantity },
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/appointment-types">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {appointmentType?.name ?? "Appointment Type"} - Resources
          </h1>
          <p className="mt-1 text-muted-foreground">
            Configure which resources are required for this appointment type.
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Add Resource */}
      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label>Resource</Label>
          <Select
            value={selectedResourceId}
            onValueChange={setSelectedResourceId}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select a resource to add" />
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
        </div>
        <div className="space-y-2">
          <Label>Quantity Required</Label>
          <Input
            type="number"
            min={1}
            className="w-[100px]"
            value={quantityRequired}
            onChange={(e) =>
              setQuantityRequired(parseInt(e.target.value, 10) || 1)
            }
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={!selectedResourceId || addMutation.isPending}
        >
          <Plus className="mr-2 h-4 w-4" />
          {addMutation.isPending ? "Adding..." : "Add Resource"}
        </Button>
      </div>

      {/* Linked Resources */}
      <div className="mt-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : !linkedResources?.length ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No resources linked yet. Add resources if this appointment type
            requires specific equipment or rooms.
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Available Quantity</TableHead>
                  <TableHead>Required Quantity</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedResources.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">
                      {link.resource.name}
                    </TableCell>
                    <TableCell>{link.resource.quantity}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        max={link.resource.quantity}
                        className="w-[80px]"
                        value={link.quantityRequired}
                        onChange={(e) => {
                          const newQty = parseInt(e.target.value, 10);
                          if (newQty >= 1 && newQty <= link.resource.quantity) {
                            handleUpdateQuantity(link.resourceId, newQty);
                          }
                        }}
                        disabled={updateMutation.isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(link.resourceId)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/appointment-types/$typeId/resources")({
  component: AppointmentTypeResourcesPage,
});
