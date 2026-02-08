// Mutations hook for appointment type CRUD and linking operations

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/lib/query";

interface UseAppointmentTypeMutationsOptions {
  onCreateSuccess?: (createdAppointmentTypeId: string) => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: () => void;
  onAddCalendarSuccess?: () => void;
  onRemoveCalendarSuccess?: () => void;
  onAddResourceSuccess?: () => void;
  onUpdateResourceSuccess?: () => void;
  onRemoveResourceSuccess?: () => void;
}

export function useAppointmentTypeMutations(
  options: UseAppointmentTypeMutationsOptions = {},
) {
  const queryClient = useQueryClient();

  const invalidateAppointmentTypes = () => {
    queryClient.invalidateQueries({
      queryKey: orpc.appointmentTypes.key(),
    });
  };

  const createMutation = useMutation(
    orpc.appointmentTypes.create.mutationOptions({
      onSuccess: (createdAppointmentType) => {
        invalidateAppointmentTypes();
        options.onCreateSuccess?.(createdAppointmentType.id);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create appointment type");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.appointmentTypes.update.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        toast.success("Appointment type updated successfully");
        options.onUpdateSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update appointment type");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.appointmentTypes.remove.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        toast.success("Appointment type deleted successfully");
        options.onDeleteSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete appointment type");
      },
    }),
  );

  const addCalendarMutation = useMutation(
    orpc.appointmentTypes.calendars.add.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        toast.success("Calendar linked successfully");
        options.onAddCalendarSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to link calendar");
      },
    }),
  );

  const removeCalendarMutation = useMutation(
    orpc.appointmentTypes.calendars.remove.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        toast.success("Calendar unlinked successfully");
        options.onRemoveCalendarSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to unlink calendar");
      },
    }),
  );

  const addResourceMutation = useMutation(
    orpc.appointmentTypes.resources.add.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        toast.success("Resource linked successfully");
        options.onAddResourceSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to link resource");
      },
    }),
  );

  const updateResourceMutation = useMutation(
    orpc.appointmentTypes.resources.update.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        options.onUpdateResourceSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update resource");
      },
    }),
  );

  const removeResourceMutation = useMutation(
    orpc.appointmentTypes.resources.remove.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        toast.success("Resource unlinked successfully");
        options.onRemoveResourceSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to unlink resource");
      },
    }),
  );

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    addCalendarMutation,
    removeCalendarMutation,
    addResourceMutation,
    updateResourceMutation,
    removeResourceMutation,
  };
}
