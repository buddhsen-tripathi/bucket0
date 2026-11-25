import { useState, useCallback } from "react";
import { DashboardMode } from "@/types/dashboard";
import { s3Service } from "@/lib/s3/s3-service";
import { cloudClient } from "@/lib/cloud/cloud-client";
import { BaseFileObject } from "@/lib/shared/types";
import { generateUniqueName } from "@/components/dashboard/shared/DuplicateFileModal";

interface FileWithPath extends File {
  readonly webkitRelativePath: string;
}

export interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  file?: File; // Keep file reference for retry
}

interface DuplicateFileItem {
  originalName: string;
  suggestedName: string;
  file: File;
}

/**
 * Manages file upload lifecycle
 * Handles: duplicate detection, upload progress, error handling
 */
export function useUploadState(
  mode: DashboardMode | "profile",
  currentPath: string,
  files: BaseFileObject[],
  connected: boolean,
  onUploadComplete: () => void
) {
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFileItem[]>([]);
  const [pendingUploads, setPendingUploads] = useState<{
    files: File[];
    onProgress?: (fileName: string, progress: number) => void;
  } | null>(null);

  // Perform actual upload with concurrency limiting
  const performUpload = useCallback(
    async (fileArray: File[], onProgress?: (fileName: string, progress: number) => void) => {
      const MAX_CONCURRENT = 3;

      try {
        setUploading(true);

        // Initialize upload items (keep file reference for retry)
        const newUploadItems: UploadItem[] = fileArray.map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
          name: file.name,
          progress: 0,
          status: "uploading" as const,
          file, // Store file for retry
        }));
        setUploadItems((prev) => [...prev, ...newUploadItems]);

        // Upload single file worker
        const uploadOne = async (index: number): Promise<void> => {
          const file = fileArray[index];
          const uploadId = newUploadItems[index].id;

          try {
            const filePath = (file as FileWithPath).webkitRelativePath || file.name;
            const path = currentPath + filePath;
            const renamedFile = new File([file], path, { type: file.type });

            if (mode === "cloud") {
              await cloudClient.uploadFile(renamedFile, (progress) => {
                setUploadItems((prev) =>
                  prev.map((item) => (item.id === uploadId ? { ...item, progress } : item))
                );
                onProgress?.(file.name, progress);
              });
            } else if (mode === "dev") {
              setUploadItems((prev) =>
                prev.map((item) => (item.id === uploadId ? { ...item, progress: 50 } : item))
              );
              await s3Service.uploadFile(renamedFile);
            }

            setUploadItems((prev) =>
              prev.map((item) =>
                item.id === uploadId ? { ...item, progress: 100, status: "success" as const } : item
              )
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Upload failed";
            setUploadItems((prev) =>
              prev.map((item) =>
                item.id === uploadId
                  ? { ...item, status: "error" as const, error: errorMessage }
                  : item
              )
            );
            throw error;
          }
        };

        // Concurrency-limited execution
        let hasError = false;
        for (let i = 0; i < fileArray.length; i += MAX_CONCURRENT) {
          const batch = [];
          for (let j = 0; j < MAX_CONCURRENT && i + j < fileArray.length; j++) {
            batch.push(
              uploadOne(i + j).catch((err) => {
                hasError = true;
                return err;
              })
            );
          }
          await Promise.all(batch);
        }

        await onUploadComplete();
        if (hasError) throw new Error("Some uploads failed");
      } catch (error) {
        throw error;
      } finally {
        setUploading(false);
      }
    },
    [mode, currentPath, onUploadComplete]
  );

  // Handle upload with duplicate detection
  const handleUpload = useCallback(
    async (fileList: FileList, onProgress?: (fileName: string, progress: number) => void) => {
      if (!connected && mode === "dev") {
        throw new Error("Not connected to storage");
      }

      // Get existing file names for duplicate detection
      const existingNames = new Set(files.map((f) => f.key));
      const fileArray = Array.from(fileList);

      // Check for duplicates
      const duplicates: DuplicateFileItem[] = [];
      const newFiles: File[] = [];

      for (const file of fileArray) {
        // Use webkitRelativePath for folder uploads, file.name for regular uploads
        const filePath = (file as FileWithPath).webkitRelativePath || file.name;
        const path = currentPath + filePath;
        if (existingNames.has(path)) {
          const suggestedName = generateUniqueName(filePath, existingNames);
          duplicates.push({
            originalName: filePath,
            suggestedName,
            file,
          });
          existingNames.add(currentPath + suggestedName);
        } else {
          newFiles.push(file);
          existingNames.add(path);
        }
      }

      // If duplicates found, show modal
      if (duplicates.length > 0) {
        setDuplicateFiles(duplicates);
        setPendingUploads({ files: newFiles, onProgress });
        return;
      }

      // No duplicates, proceed with upload
      await performUpload(fileArray, onProgress);
    },
    [mode, currentPath, files, connected, performUpload]
  );

  // Handle duplicate rename
  const handleDuplicateRename = useCallback(async () => {
    const renamedFiles = duplicateFiles.map((dup) => {
      return new File([dup.file], dup.suggestedName, {
        type: dup.file.type,
        lastModified: dup.file.lastModified,
      });
    });

    const allFiles = [...(pendingUploads?.files || []), ...renamedFiles];
    setDuplicateFiles([]);
    setPendingUploads(null);

    await performUpload(allFiles, pendingUploads?.onProgress);
  }, [duplicateFiles, pendingUploads, performUpload]);

  // Handle duplicate replace
  const handleDuplicateReplace = useCallback(async () => {
    const originalFiles = duplicateFiles.map((dup) => dup.file);
    const allFiles = [...(pendingUploads?.files || []), ...originalFiles];

    setDuplicateFiles([]);
    setPendingUploads(null);

    await performUpload(allFiles, pendingUploads?.onProgress);
  }, [duplicateFiles, pendingUploads, performUpload]);

  // Handle duplicate cancel
  const handleDuplicateCancel = useCallback(() => {
    setDuplicateFiles([]);
    setPendingUploads(null);
  }, []);

  // Cancel a single upload
  const handleCancelUpload = useCallback(
    (uploadId: string) => {
      const upload = uploadItems.find((item) => item.id === uploadId);
      if (!upload) return;

      // Cancel in cloud client (handles both regular and chunked uploads)
      if (mode === "cloud") {
        cloudClient.cancelUpload(upload.name);
      }

      // Remove from upload items
      setUploadItems((prev) => prev.filter((item) => item.id !== uploadId));
    },
    [uploadItems, mode]
  );

  // Cancel all uploads and clear queue
  const handleCancelAll = useCallback(() => {
    if (mode === "cloud") {
      cloudClient.cancelAllUploads();
    }
    setUploadItems([]);
    setUploading(false);
  }, [mode]);

  // Retry a failed upload
  const handleRetryUpload = useCallback(
    async (uploadId: string) => {
      const upload = uploadItems.find((item) => item.id === uploadId);
      if (!upload || upload.status !== "error" || !upload.file) return;

      // Reset status to uploading
      setUploadItems((prev) =>
        prev.map((item) =>
          item.id === uploadId
            ? { ...item, status: "uploading" as const, progress: 0, error: undefined }
            : item
        )
      );

      try {
        setUploading(true);
        const file = upload.file;
        const filePath = (file as FileWithPath).webkitRelativePath || file.name;
        const path = currentPath + filePath;
        const renamedFile = new File([file], path, { type: file.type });

        if (mode === "cloud") {
          await cloudClient.uploadFile(renamedFile, (progress) => {
            setUploadItems((prev) =>
              prev.map((item) => (item.id === uploadId ? { ...item, progress } : item))
            );
          });
        } else if (mode === "dev") {
          setUploadItems((prev) =>
            prev.map((item) => (item.id === uploadId ? { ...item, progress: 50 } : item))
          );
          await s3Service.uploadFile(renamedFile);
        }

        // Mark as success
        setUploadItems((prev) =>
          prev.map((item) =>
            item.id === uploadId ? { ...item, progress: 100, status: "success" as const } : item
          )
        );

        await onUploadComplete();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";
        setUploadItems((prev) =>
          prev.map((item) =>
            item.id === uploadId
              ? { ...item, status: "error" as const, error: errorMessage }
              : item
          )
        );
      } finally {
        setUploading(false);
      }
    },
    [uploadItems, mode, currentPath, onUploadComplete]
  );

  // Clear completed/failed uploads from the list
  const handleClearCompleted = useCallback(() => {
    setUploadItems((prev) => prev.filter((item) => item.status === "uploading"));
  }, []);

  return {
    uploading,
    uploadItems,
    setUploadItems,
    duplicateFiles,
    handleUpload,
    handleDuplicateRename,
    handleDuplicateReplace,
    handleDuplicateCancel,
    handleCancelUpload,
    handleCancelAll,
    handleRetryUpload,
    handleClearCompleted,
  };
}
