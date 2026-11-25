import { useState, useCallback } from "react";
import { DashboardMode } from "@/types/dashboard";
import { s3Service } from "@/lib/s3/s3-service";
import { cloudClient } from "@/lib/cloud/cloud-client";

export interface DeleteItem {
  key: string;
  name: string;
}

/**
 * Manages delete operations with undo functionality
 * Provides 5-second undo window before permanent deletion
 */
export function useDeleteState(
  mode: DashboardMode | "profile",
  onDeleteComplete: () => void,
  onError: (error: string) => void
) {
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<DeleteItem[]>([]);
  const [bulkDeleteKeys, setBulkDeleteKeys] = useState<string[]>([]);

  // Handle single delete (no confirmation, direct to undo window)
  const handleDeleteClick = useCallback((key: string) => {
    const fileName = key.split("/").pop() || key;
    setPendingDeletes([{ key, name: fileName }]);
  }, []);

  // Handle bulk delete (with confirmation for multiple items)
  const handleBulkDelete = useCallback((keys: string[]) => {
    if (keys.length === 1) {
      // Single item: skip confirmation, go to undo window
      const deleteItems: DeleteItem[] = keys.map((key) => ({
        key,
        name: key.split("/").pop() || key,
      }));
      setPendingDeletes(deleteItems);
    } else {
      // Multiple items: show confirmation modal
      setBulkDeleteKeys(keys);
    }
  }, []);

  // Confirm bulk delete (after modal confirmation)
  const confirmBulkDelete = useCallback(async () => {
    const deleteItems: DeleteItem[] = bulkDeleteKeys.map((key) => ({
      key,
      name: key.split("/").pop() || key,
    }));
    setPendingDeletes(deleteItems);
    setBulkDeleteKeys([]);
  }, [bulkDeleteKeys]);

  // Execute delete after undo window expires
  const executeDelete = useCallback(async () => {
    const keysToDelete = pendingDeletes.map((item) => item.key);

    // Mark items as deleting
    setDeletingItems((prev) => {
      const next = new Set(prev);
      keysToDelete.forEach((key) => next.add(key));
      return next;
    });

    // Delete one by one
    for (const key of keysToDelete) {
      try {
        if (mode === "cloud") {
          await cloudClient.deleteFile(key);
        } else if (mode === "dev") {
          await s3Service.deleteFile(key);
        }
      } catch (error) {
        console.error(`Failed to delete ${key}:`, error);
        onError("Failed to delete some items. Please try again.");
      }
    }

    // Clear deleting state
    setDeletingItems((prev) => {
      const next = new Set(prev);
      keysToDelete.forEach((key) => next.delete(key));
      return next;
    });

    setPendingDeletes([]);
    await onDeleteComplete();
  }, [pendingDeletes, mode, onDeleteComplete, onError]);

  // Undo delete (cancel pending deletion)
  const undoDelete = useCallback(() => {
    setPendingDeletes([]);
  }, []);

  return {
    deletingItems,
    pendingDeletes,
    bulkDeleteKeys,
    setBulkDeleteKeys,
    handleDeleteClick,
    handleBulkDelete,
    confirmBulkDelete,
    executeDelete,
    undoDelete,
  };
}
