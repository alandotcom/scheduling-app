// Mutations hook for appointment type CRUD and linking operations

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addCreatedToListCache } from "@/lib/list-cache";
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
        // Write the created type into the list cache from the mutation response
        // so the new row resolves in the same render the create form closes —
        // the detail modal then morphs open seamlessly instead of crossfading
        // via a separate Dialog instance.
        addCreatedToListCache(
          queryClient,
          orpc.appointmentTypes.list.key(),
          createdAppointmentType,
        );
        // Mark stale WITHOUT an active refetch (unlike the other mutations): an
        // immediate refetch that returned without the new row would null out
        // the selection and slam the modal shut mid-morph. The cache write
        // above is authoritative; the list reconciles on its next access.
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentTypes.key(),
          refetchType: "none",
        });
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
        options.onDeleteSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete appointment type");
      },
    }),
  );

  const addCalendarMutation = useMutation(
    orpc.appointmentTypes.calendarLinks.link.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        options.onAddCalendarSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to link calendar");
      },
    }),
  );

  const removeCalendarMutation = useMutation(
    orpc.appointmentTypes.calendarLinks.unlink.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        options.onRemoveCalendarSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to unlink calendar");
      },
    }),
  );

  const addResourceMutation = useMutation(
    orpc.appointmentTypes.resourceLinks.link.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
        options.onAddResourceSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to link resource");
      },
    }),
  );

  const updateResourceMutation = useMutation(
    orpc.appointmentTypes.resourceLinks.update.mutationOptions({
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
    orpc.appointmentTypes.resourceLinks.unlink.mutationOptions({
      onSuccess: () => {
        invalidateAppointmentTypes();
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
