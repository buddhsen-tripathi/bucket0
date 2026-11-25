
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTeamUploadState } from "@/hooks/useTeamUploadState";
import FileList from "@/components/dashboard/shared/FileList";
import FilePreview from "@/components/dashboard/shared/FilePreview";
import UploadProgress from "@/components/dashboard/shared/UploadProgress";
import DeleteNotification, { DeleteItem } from "@/components/dashboard/shared/DeleteNotification";
import ShareModal from "@/components/dashboard/shared/ShareModal";
import { CloudFileObject } from "@/lib/shared/types";

// Module-level cache for team files (per team ID)
interface TeamFilesCache {
  files: TeamFile[];
  usage: number;
  fileCount: number;
  storageLimit: number;
  availableStorage: number;
  timestamp: number;
}
const teamFilesCache: Record<string, TeamFilesCache> = {};
const TEAM_FILES_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Export function to invalidate cache (called after uploads/deletes)
export function invalidateTeamFilesCache(teamId: string) {
  delete teamFilesCache[teamId];
}

interface TeamFilesProps {
  teamId: string;
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  canShare: boolean;
  isOwner: boolean;
}

interface TeamFile {
  key: string;
  size: number;
  lastModified: Date | string;
  hasThumbnail: boolean;
  mimeType: string | null;
  isStarred: boolean;
  uploadedBy: string;
  id: string;
}

export default function TeamFiles({
  teamId,
  canUpload,
  canDownload,
  canDelete,
  canShare,
  isOwner,
}: TeamFilesProps) {
  const [files, setFiles] = useState<TeamFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<DeleteItem[]>([]);
  const [previewFile, setPreviewFile] = useState<{ key: string; name: string } | null>(null);
  const [shareFile, setShareFile] = useState<{ key: string; name: string } | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");

  // Upload refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchFiles = useCallback(async (forceRefresh = false) => {
    // Check cache first
    const cached = teamFilesCache[teamId];
    if (!forceRefresh && cached && Date.now() - cached.timestamp < TEAM_FILES_CACHE_TTL) {
      setFiles(cached.files);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      if (forceRefresh) setLoading(true);
      const response = await fetch(`/api/teams/${teamId}/files?limit=100`);
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }
      const data = await response.json();
      const fetchedFiles = data.files || [];
      const fetchedUsage = data.usage || 0;
      const fetchedFileCount = data.fileCount || 0;
      const fetchedStorageLimit = data.storageLimit || 0;
      const fetchedAvailableStorage = data.availableStorage || 0;

      // Update state
      setFiles(fetchedFiles);

      // Update cache
      teamFilesCache[teamId] = {
        files: fetchedFiles,
        usage: fetchedUsage,
        fileCount: fetchedFileCount,
        storageLimit: fetchedStorageLimit,
        availableStorage: fetchedAvailableStorage,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error("Error fetching team files:", err);
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  // Upload state hook - invalidate cache on upload complete
  const uploadOps = useTeamUploadState(teamId, () => {
    invalidateTeamFilesCache(teamId);
    fetchFiles(true);
  }, currentPath);

  useEffect(() => {
    // Load from cache immediately if available
    const cached = teamFilesCache[teamId];
    if (cached && Date.now() - cached.timestamp < TEAM_FILES_CACHE_TTL) {
      setFiles(cached.files);
      setLoading(false);
      // Background refresh if cache is older than 30 seconds
      if (Date.now() - cached.timestamp > 30 * 1000) {
        fetchFiles(true);
      }
    } else {
      fetchFiles();
    }
  }, [fetchFiles, teamId]);

  const handleRefresh = () => {
    invalidateTeamFilesCache(teamId);
    fetchFiles(true);
  };

  const handleDownload = async (key: string) => {
    if (!canDownload && !isOwner) {
      toast("You don't have permission to download files", "error");
      return;
    }

    // Open download in new tab/trigger download
    const downloadUrl = `/api/teams/${teamId}/files/download?key=${encodeURIComponent(key)}`;

    // Create a temporary link and click it
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = key.split("/").pop() || key;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (key: string) => {
    if (!canDelete && !isOwner) {
      toast("You don't have permission to delete files", "error");
      return;
    }

    const fileName = key.split("/").pop() || key;

    // Mark as pending deletion (optimistic UI)
    setDeletingItems((prev) => new Set(prev).add(key));
    setPendingDelete([{ key, name: fileName }]);
  };

  // Bulk delete handler
  const handleBulkDelete = (keys: string[]) => {
    if (!canDelete && !isOwner) {
      toast("You don't have permission to delete files", "error");
      return;
    }

    const deleteItems: DeleteItem[] = keys.map((key) => ({
      key,
      name: key.split("/").pop() || key,
    }));

    // Mark all as pending deletion
    setDeletingItems((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => next.add(key));
      return next;
    });
    setPendingDelete(deleteItems);
  };

  // Bulk download handler
  const handleBulkDownload = (keys: string[]) => {
    if (!canDownload && !isOwner) {
      toast("You don't have permission to download files", "error");
      return;
    }

    // Download each file
    keys.forEach((key) => {
      const downloadUrl = `/api/teams/${teamId}/files/download?key=${encodeURIComponent(key)}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = key.split("/").pop() || key;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const handleUndoDelete = () => {
    // Restore items - just clear pending state
    pendingDelete.forEach((item) => {
      setDeletingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.key);
        return next;
      });
    });
    setPendingDelete([]);
  };

  const handleCompleteDelete = async () => {
    if (pendingDelete.length === 0) return;

    for (const item of pendingDelete) {
      try {
        const response = await fetch(`/api/teams/${teamId}/files/delete`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: item.key }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete file");
        }

        // Remove from local state - handle folders by removing all files with that prefix
        if (item.key.endsWith("/")) {
          // Folder deletion: remove all files starting with this prefix
          setFiles((prev) => prev.filter((f) => !f.key.startsWith(item.key)));
        } else {
          // Single file deletion
          setFiles((prev) => prev.filter((f) => f.key !== item.key));
        }
      } catch (err) {
        console.error("Error deleting file:", err);
        toast(err instanceof Error ? err.message : "Failed to delete file", "error");
      } finally {
        setDeletingItems((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
      }
    }

    setPendingDelete([]);
    // Invalidate cache and refresh to get updated counts
    invalidateTeamFilesCache(teamId);
    fetchFiles(true);
  };

  const handleView = async (key: string) => {
    if (!canDownload && !isOwner) {
      toast("You don't have permission to view files", "error");
      return;
    }

    // Open in-app preview modal
    const fileName = key.split("/").pop() || key;
    setPreviewFile({ key, name: fileName });
  };

  const getFilePreviewUrl = async (key: string): Promise<string> => {
    // Return the view URL for the file preview
    return `/api/teams/${teamId}/files/view?key=${encodeURIComponent(key)}`;
  };

  const handleShare = async (key: string) => {
    if (!canShare && !isOwner) {
      toast("You don't have permission to share files", "error");
      return;
    }

    const fileName = key.split("/").pop() || key;
    setShareFile({ key, name: fileName });
  };

  // Create share link
  const handleCreateShareLink = async (
    key: string,
    _expiresInHours?: number,
    accessType?: string,
    allowDownload?: boolean,
    allowAddToDrive?: boolean
  ): Promise<{ url: string }> => {
    const response = await fetch(`/api/teams/${teamId}/files/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        accessType,
        allowDownload: allowDownload !== false,
        allowAddToDrive: allowAddToDrive !== false,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create share link");
    }

    const data = await response.json();
    return { url: data.shareUrl };
  };

  // Revoke share link
  const handleRevokeShareLink = async (linkId: string): Promise<void> => {
    const response = await fetch(`/api/teams/${teamId}/files/share`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to revoke share link");
    }
  };

  const handleUploadFiles = () => {
    if (!canUpload && !isOwner) {
      toast("You don't have permission to upload files", "error");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleUploadFolder = () => {
    if (!canUpload && !isOwner) {
      toast("You don't have permission to upload files", "error");
      return;
    }
    folderInputRef.current?.click();
  };

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleCreateFolder = () => {
    setShowCreateFolderModal(true);
  };

  const handleCreateFolderSubmit = async () => {
    if (!newFolderName.trim()) return;

    try {
      setCreatingFolder(true);
      // Create a folder marker (0-byte object with trailing slash)
      const folderPath = currentPath + newFolderName.trim();

      const response = await fetch(`/api/teams/${teamId}/files/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create folder");
      }

      toast("Folder created successfully", "success");
      setShowCreateFolderModal(false);
      setNewFolderName("");
      invalidateTeamFilesCache(teamId);
      fetchFiles(true);
    } catch (err) {
      console.error("Error creating folder:", err);
      toast(err instanceof Error ? err.message : "Failed to create folder", "error");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    await uploadOps.handleUpload(selectedFiles);

    // Reset input
    e.target.value = "";
  };

  const getPreviewUrl = async (key: string): Promise<string> => {
    return `/api/teams/${teamId}/files/thumbnail?key=${encodeURIComponent(key)}`;
  };

  // Transform files to match FileList expected format
  const transformedFiles: CloudFileObject[] = files.map((file) => ({
    key: file.key,
    size: file.size,
    lastModified: typeof file.lastModified === "string"
      ? new Date(file.lastModified)
      : file.lastModified,
    etag: "",
    hasThumbnail: file.hasThumbnail,
    mimeType: file.mimeType,
    isStarred: file.isStarred,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
        <button
          onClick={() => fetchFiles(true)}
          className="mt-4 text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept="*/*"
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        {...{ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
      />

      {/* File list */}
      <FileList
        files={transformedFiles}
        isLoading={loading}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onView={handleView}
        onShare={(canShare || isOwner) ? handleShare : undefined}
        mode="teams"
        onUploadFiles={(canUpload || isOwner) ? handleUploadFiles : undefined}
        onUploadFolder={(canUpload || isOwner) ? handleUploadFolder : undefined}
        onCreateFolder={(canUpload || isOwner) ? handleCreateFolder : undefined}
        onRefresh={handleRefresh}
        deletingItems={deletingItems}
        getPreviewUrl={getPreviewUrl}
        onBulkDelete={(canDelete || isOwner) ? handleBulkDelete : undefined}
        onBulkDownload={(canDownload || isOwner) ? handleBulkDownload : undefined}
        currentPath={currentPath}
        onNavigate={setCurrentPath}
      />

      {/* Upload Progress (shared component) */}
      {uploadOps.uploadItems.length > 0 && (
        <UploadProgress
          uploads={uploadOps.uploadItems}
          onClose={uploadOps.handleClearCompleted}
          onCancel={uploadOps.handleCancelUpload}
          onRetry={uploadOps.handleRetryUpload}
          onCancelAll={uploadOps.handleCancelAll}
        />
      )}

      {/* Delete Notification with Undo */}
      <DeleteNotification
        items={pendingDelete}
        onUndo={handleUndoDelete}
        onComplete={handleCompleteDelete}
      />

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreview
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          fileKey={previewFile.key}
          fileName={previewFile.name}
          onDownload={() => handleDownload(previewFile.key)}
          getPreviewUrl={getFilePreviewUrl}
          mode="teams"
          onShare={(canShare || isOwner) ? () => {
            setPreviewFile(null);
            handleShare(previewFile.key);
          } : undefined}
          files={files
            .filter((f) => !f.key.endsWith("/") && f.key.startsWith(currentPath))
            .filter((f) => {
              // Only include direct children of current folder, not nested files
              const remaining = f.key.slice(currentPath.length);
              return !remaining.includes("/");
            })
            .map((f) => ({ key: f.key, name: f.key.split("/").pop() || f.key }))}
          onNavigate={(file) => setPreviewFile(file)}
        />
      )}

      {/* Share Modal */}
      {shareFile && (
        <ShareModal
          isOpen={!!shareFile}
          onClose={() => setShareFile(null)}
          fileName={shareFile.name}
          fileKey={shareFile.key}
          onCreateLink={handleCreateShareLink}
          onRevokeLink={handleRevokeShareLink}
          mode="teams"
          teamId={teamId}
        />
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creatingFolder) {
                  handleCreateFolderSubmit();
                }
                if (e.key === "Escape") {
                  setShowCreateFolderModal(false);
                  setNewFolderName("");
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowCreateFolderModal(false);
                  setNewFolderName("");
                }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                disabled={creatingFolder}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolderSubmit}
                disabled={!newFolderName.trim() || creatingFolder}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {creatingFolder ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
