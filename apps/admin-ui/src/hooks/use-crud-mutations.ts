// Hook for creating CRUD mutations with auto-invalidation

import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface CrudMutationOptions {
  createMutation: {
    mutationOptions: (opts: {
      onSuccess?: () => void;
    }) => Parameters<typeof useMutation>[0];
  };
  updateMutation: {
    mutationOptions: (opts: {
      onSuccess?: () => void;
    }) => Parameters<typeof useMutation>[0];
  };
  deleteMutation: {
    mutationOptions: (opts: {
      onSuccess?: () => void;
    }) => Parameters<typeof useMutation>[0];
  };
  queryKey: () => readonly unknown[];
  onCreateSuccess?: () => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

export function useCrudMutations(options: CrudMutationOptions) {
  const queryClient = useQueryClient();
  const {
    createMutation,
    updateMutation,
    deleteMutation,
    queryKey,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
  } = options;

  const create = useMutation(
    createMutation.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKey() });
        onCreateSuccess?.();
      },
    }),
  );

  const update = useMutation(
    updateMutation.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKey() });
        onUpdateSuccess?.();
      },
    }),
  );

  const remove = useMutation(
    deleteMutation.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKey() });
        onDeleteSuccess?.();
      },
    }),
  );

  return { create, update, remove };
}
