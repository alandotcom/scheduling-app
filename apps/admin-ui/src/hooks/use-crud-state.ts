// Hook for managing CRUD UI state (forms, editing, deleting)

import { useState, useCallback } from "react";

export interface CrudState<T> {
  showCreateForm: boolean;
  editingItem: T | null;
  deletingItemId: string | null;
}

export interface CrudStateActions<T> {
  openCreate: () => void;
  closeCreate: () => void;
  openEdit: (item: T) => void;
  closeEdit: () => void;
  openDelete: (id: string) => void;
  closeDelete: () => void;
  isFormOpen: boolean;
}

export function useCrudState<T>(): CrudState<T> & CrudStateActions<T> {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setShowCreateForm(true);
    setEditingItem(null);
  }, []);

  const closeCreate = useCallback(() => {
    setShowCreateForm(false);
  }, []);

  const openEdit = useCallback((item: T) => {
    setEditingItem(item);
    setShowCreateForm(false);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingItem(null);
  }, []);

  const openDelete = useCallback((id: string) => {
    setDeletingItemId(id);
  }, []);

  const closeDelete = useCallback(() => {
    setDeletingItemId(null);
  }, []);

  const isFormOpen = showCreateForm || editingItem !== null;

  return {
    showCreateForm,
    editingItem,
    deletingItemId,
    openCreate,
    closeCreate,
    openEdit,
    closeEdit,
    openDelete,
    closeDelete,
    isFormOpen,
  };
}
