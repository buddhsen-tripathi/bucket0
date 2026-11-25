import { useState, useCallback, useRef } from "react";

export interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  file?: File;
}

/**
 * Manages team file upload lifecycle
 * Handles: upload progress, cancellation, error handling, retry
 * Preserves folder structure via webkitRelativePath
 */
export function useTeamUploadState(
  teamId: string,
  onUploadComplete: () => void,
  currentPath: string = ""
) {
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);

  // Track active uploads for cancellation
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Upload a single file
  const uploadFile = useCallback(
    async (file: File, uploadId: string, filePath: string): Promise<void> => {
      const controller = new AbortController();
      abortControllersRef.current.set(uploadId, controller);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("filename", filePath);

      try {
        // Use XMLHttpRequest for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 100;
              setUploadItems((prev) =>
                prev.map((item) =>
                  item.id === uploadId ? { ...item, progress } : item
                )
              );
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || "Upload failed"));
              } catch {
                reject(new Error(`Upload failed (${xhr.status})`));
              }
            }
          };

          xhr.onerror = () => reject(new Error("Network error"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));

          // Handle abort signal
          controller.signal.addEventListener("abort", () => xhr.abort());

          xhr.open("POST", `/api/teams/${teamId}/files/upload`);
          xhr.send(formData);
        });

        // Mark as success
        setUploadItems((prev) =>
          prev.map((item) =>
            item.id === uploadId
              ? { ...item, progress: 100, status: "success" as const }
              : item
          )
        );
      } catch (error) {
        if ((error as Error).message === "Upload cancelled") {
          // Remove cancelled uploads from list
          setUploadItems((prev) => prev.filter((item) => item.id !== uploadId));
        } else {
          // Mark as error
          const errorMessage = error instanceof Error ? error.message : "Upload failed";
          setUploadItems((prev) =>
            prev.map((item) =>
              item.id === uploadId
                ? { ...item, status: "error" as const, error: errorMessage }
                : item
            )
          );
        }
        throw error;
      } finally {
        abortControllersRef.current.delete(uploadId);
      }
    },
    [teamId]
  );

  // Log batch activity after uploads complete
  const logBatchActivity = useCallback(
    async (uploadedFiles: { name: string; size: number }[]) => {
      if (uploadedFiles.length === 0) return;

      try {
        await fetch(`/api/teams/${teamId}/activity/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileNames: uploadedFiles.map((f) => f.name),
            totalSize: uploadedFiles.reduce((sum, f) => sum + f.size, 0),
          }),
        });
      } catch (err) {
        console.error("[TEAM-UPLOAD] Failed to log batch activity:", err);
      }
    },
    [teamId]
  );

  // Handle file upload with concurrency limiting
  const handleUpload = useCallback(
    async (fileList: FileList | File[]) => {
      const MAX_CONCURRENT = 3;
      const fileArray = Array.from(fileList);
      if (fileArray.length === 0) return;

      // Track successfully uploaded files for batch activity logging
      const uploadedFiles: { name: string; size: number }[] = [];

      try {
        setUploading(true);

        // Initialize upload items with proper display names
        const newUploadItems: UploadItem[] = fileArray.map((file) => {
          const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
            name: relativePath,
            progress: 0,
            status: "uploading" as const,
            file,
          };
        });
        setUploadItems((prev) => [...prev, ...newUploadItems]);

        // Upload single file worker
        const uploadOne = async (index: number): Promise<void> => {
          const file = fileArray[index];
          const uploadId = newUploadItems[index].id;
          const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          const fullPath = currentPath + relativePath;

          try {
            await uploadFile(file, uploadId, fullPath);
            uploadedFiles.push({ name: fullPath, size: file.size });
          } catch {
            // Continue with next file even if one fails
          }
        };

        // Concurrency-limited execution
        for (let i = 0; i < fileArray.length; i += MAX_CONCURRENT) {
          const batch = [];
          for (let j = 0; j < MAX_CONCURRENT && i + j < fileArray.length; j++) {
            batch.push(uploadOne(i + j));
          }
          await Promise.all(batch);
        }

        // Log batch activity for all successfully uploaded files
        await logBatchActivity(uploadedFiles);

        // Refresh file list after all uploads
        await onUploadComplete();
      } finally {
        setUploading(false);
      }
    },
    [uploadFile, onUploadComplete, currentPath, logBatchActivity]
  );

  // Cancel a single upload
  const handleCancelUpload = useCallback((uploadId: string) => {
    const controller = abortControllersRef.current.get(uploadId);
    if (controller) {
      controller.abort();
    }
    // Also remove from list in case abort doesn't trigger
    setUploadItems((prev) => prev.filter((item) => item.id !== uploadId));
  }, []);

  // Cancel all uploads
  const handleCancelAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    setUploadItems([]);
    setUploading(false);
  }, []);

  // Retry a failed upload
  const handleRetryUpload = useCallback(
    async (uploadId: string) => {
      const upload = uploadItems.find((item) => item.id === uploadId);
      if (!upload || upload.status !== "error" || !upload.file) return;

      // Reset status
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
        // Preserve the original path from the upload name
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const fullPath = currentPath + relativePath;

        await uploadFile(file, uploadId, fullPath);
        await onUploadComplete();
      } finally {
        setUploading(false);
      }
    },
    [uploadItems, uploadFile, onUploadComplete, currentPath]
  );

  // Clear completed/failed uploads
  const handleClearCompleted = useCallback(() => {
    setUploadItems((prev) => prev.filter((item) => item.status === "uploading"));
  }, []);

  return {
    uploading,
    uploadItems,
    handleUpload,
    handleCancelUpload,
    handleCancelAll,
    handleRetryUpload,
    handleClearCompleted,
  };
}
