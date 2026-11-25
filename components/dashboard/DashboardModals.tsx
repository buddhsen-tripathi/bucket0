import React from "react";
import S3ConfigModal from "./buckets/S3Config";
import ManageBuckets from "./buckets/ManageBuckets";
import StoragePreference from "./buckets/StoragePreference";
import CreateFolderModal from "./shared/CreateFolderModal";
import DeleteConfirmationModal from "./shared/DeleteConfirmationModal";
import DeleteNotification, { DeleteItem } from "./shared/DeleteNotification";
import DuplicateFileModal from "./shared/DuplicateFileModal";
import FilePreview from "./shared/FilePreview";
import ShareModal from "./shared/ShareModal";
import { S3Config } from "@/lib/s3/s3-service";

interface Bucket extends S3Config {
  id: string;
  name: string;
  provider: "aws" | "r2" | "azure" | "digitalocean" | "backblaze" | "other";
}

interface DuplicateFileItem {
  originalName: string;
  suggestedName: string;
  file: File;
}

interface DashboardModalsProps {
  // Settings modal
  showSettings: boolean;
  onCloseSettings: () => void;
  onSaveConfig: (config: S3Config) => void;
  currentConfig?: S3Config;

  // Manage buckets modal
  showManageBuckets: boolean;
  onCloseManageBuckets: () => void;
  buckets: Bucket[];
  onAddBucket: (bucket: Omit<Bucket, "id">) => Promise<string> | string;
  onEditBucket: (id: string, bucket: Omit<Bucket, "id">) => Promise<void> | void;
  onDeleteBucket: (id: string) => Promise<void> | void;
  editBucketId: string | null;
  setEditBucketId: (id: string | null) => void;
  storagePreference: "local" | "cloud";
  onStoragePreferenceClick: () => void;

  // Storage preference modal
  showStoragePreference: boolean;
  onCloseStoragePreference: () => void;
  onSelectStoragePreference: (pref: "local" | "cloud") => void;

  // Create folder modal
  showCreateFolder: boolean;
  onCloseCreateFolder: () => void;
  onCreateFolder: (name: string) => Promise<void>;

  // File preview modal
  previewFile: { key: string; name: string } | null;
  onClosePreview: () => void;
  onDownload: (key: string) => void;
  getPreviewUrl: (key: string) => Promise<string>;
  previewMode?: "cloud" | "dev" | "teams";
  onShareFromPreview?: (key: string) => void;
  // Navigation between files in preview
  previewFiles?: Array<{ key: string; name: string }>;
  onPreviewNavigate?: (file: { key: string; name: string }) => void;

  // Delete confirmation modal (bulk)
  bulkDeleteKeys: string[];
  onCloseBulkDelete: () => void;
  onConfirmBulkDelete: () => Promise<void>;

  // Delete notification (undo window)
  pendingDeletes: DeleteItem[];
  onUndoDelete: () => void;
  onCompleteDelete: () => Promise<void>;

  // Duplicate file modal
  duplicateFiles: DuplicateFileItem[];
  onDuplicateRename: () => Promise<void>;
  onDuplicateReplace: () => Promise<void>;
  onDuplicateCancel: () => void;

  // Share modal
  shareFile: { key: string; name: string; targetType?: "file" | "folder" } | null;
  onCloseShare: () => void;
  onCreateShareLink: (
    key: string,
    expiresInHours?: number,
    accessType?: string,
    allowDownload?: boolean,
    allowAddToDrive?: boolean,
    targetType?: "file" | "folder"
  ) => Promise<{ url: string }>;
  onRevokeShareLink: (linkId: string) => Promise<void>;
}

/**
 * Consolidates all dashboard modals into a single component
 */
export default function DashboardModals({
  // Settings
  showSettings,
  onCloseSettings,
  onSaveConfig,
  currentConfig,

  // Manage buckets
  showManageBuckets,
  onCloseManageBuckets,
  buckets,
  onAddBucket,
  onEditBucket,
  onDeleteBucket,
  editBucketId,
  setEditBucketId,
  storagePreference,
  onStoragePreferenceClick,

  // Storage preference
  showStoragePreference,
  onCloseStoragePreference,
  onSelectStoragePreference,

  // Create folder
  showCreateFolder,
  onCloseCreateFolder,
  onCreateFolder,

  // Preview
  previewFile,
  onClosePreview,
  onDownload,
  getPreviewUrl,
  previewMode,
  onShareFromPreview,
  previewFiles,
  onPreviewNavigate,

  // Delete
  bulkDeleteKeys,
  onCloseBulkDelete,
  onConfirmBulkDelete,
  pendingDeletes,
  onUndoDelete,
  onCompleteDelete,

  // Duplicate
  duplicateFiles,
  onDuplicateRename,
  onDuplicateReplace,
  onDuplicateCancel,

  // Share
  shareFile,
  onCloseShare,
  onCreateShareLink,
  onRevokeShareLink,
}: DashboardModalsProps) {
  return (
    <>
      {/* Settings Modal */}
      <S3ConfigModal
        isOpen={showSettings}
        onClose={onCloseSettings}
        onSave={onSaveConfig}
        currentConfig={currentConfig}
      />

      {/* Manage Buckets Modal */}
      <ManageBuckets
        isOpen={showManageBuckets}
        onClose={() => {
          onCloseManageBuckets();
          setEditBucketId(null);
        }}
        buckets={buckets}
        onAddBucket={onAddBucket}
        onEditBucket={onEditBucket}
        onDeleteBucket={onDeleteBucket}
        storagePreference={storagePreference}
        onStoragePreferenceClick={onStoragePreferenceClick}
        editBucketId={editBucketId}
      />

      {/* Storage Preference Modal */}
      <StoragePreference
        isOpen={showStoragePreference}
        onClose={onCloseStoragePreference}
        currentPreference={storagePreference}
        onSelect={onSelectStoragePreference}
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={onCloseCreateFolder}
        onCreate={onCreateFolder}
      />

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreview
          isOpen={!!previewFile}
          onClose={onClosePreview}
          fileKey={previewFile.key}
          fileName={previewFile.name}
          onDownload={() => onDownload(previewFile.key)}
          getPreviewUrl={getPreviewUrl}
          mode={previewMode}
          onShare={onShareFromPreview ? () => onShareFromPreview(previewFile.key) : undefined}
          files={previewFiles}
          onNavigate={onPreviewNavigate}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={bulkDeleteKeys.length > 0}
        onClose={onCloseBulkDelete}
        onConfirm={onConfirmBulkDelete}
        itemName={
          bulkDeleteKeys.length === 1
            ? bulkDeleteKeys[0].split("/").pop() || ""
            : `${bulkDeleteKeys.length} items`
        }
        isDeleting={false}
      />

      {/* Delete Notification with Undo */}
      <DeleteNotification
        items={pendingDeletes}
        onUndo={onUndoDelete}
        onComplete={onCompleteDelete}
      />

      {/* Duplicate File Modal */}
      <DuplicateFileModal
        isOpen={duplicateFiles.length > 0}
        duplicates={duplicateFiles}
        onRenameAll={onDuplicateRename}
        onReplaceAll={onDuplicateReplace}
        onCancel={onDuplicateCancel}
      />

      {/* Share Modal */}
      {shareFile && (
        <ShareModal
          isOpen={!!shareFile}
          onClose={onCloseShare}
          fileName={shareFile.name}
          fileKey={shareFile.key}
          targetType={shareFile.targetType}
          onCreateLink={onCreateShareLink}
          onRevokeLink={onRevokeShareLink}
        />
      )}
    </>
  );
}
