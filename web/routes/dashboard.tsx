
import React, { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/sidebar/DashboardSidebar";
import FileList from "@/components/dashboard/shared/FileList";
import UploadProgress from "@/components/dashboard/shared/UploadProgress";
import FeedbackButton from "@/components/dashboard/shared/FeedbackButton";
import DashboardModals from "@/components/dashboard/DashboardModals";
import CloudWelcome from "@/components/dashboard/cloud/CloudWelcome";
import DevWelcome from "@/components/dashboard/buckets/DevWelcome";
import ProfileView from "@/components/dashboard/profile/ProfileView";
import TeamsView from "@/components/dashboard/teams/TeamsView";
import S3ApiView from "@/components/dashboard/s3api/S3ApiView";
import AgentStorageView from "@/components/dashboard/agent/AgentStorageView";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useBucketManagement } from "@/hooks/useBucketManagement";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useUploadState } from "@/hooks/useUploadState";
import { useDeleteState } from "@/hooks/useDeleteState";
import { nextMeta } from "@/web/compat/meta";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { auth } from "@/server/compat/clerk";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { constructMetadata } from "@/lib/shared/seo";

/**
 * Refactored Dashboard - Main orchestrator component
 * Reduced from 1,028 lines to ~350 lines by extracting hooks and components
 *
 * Architecture:
 * - useDashboardState: Mode, filters, navigation, modal states
 * - useBucketManagement: Bucket CRUD, config, active bucket
 * - useFileOperations: File loading, download, view, share
 * - useUploadState: Upload lifecycle, duplicates, progress
 * - useDeleteState: Delete operations, undo window
 * - DashboardModals: All modal rendering consolidated
 */
export default function Dashboard() {
  // Custom hooks for separated concerns
  const dashboardState = useDashboardState();

  // Storage preference for bucket credentials (default: cloud)
  const [storagePreference, setStoragePreference] = useLocalStorage<"local" | "cloud">(
    "bucket0-storage-preference",
    "cloud"
  );

  // Bucket management with storage preference
  const bucketOps = useBucketManagement(storagePreference);
  const fileOps = useFileOperations(dashboardState.mode, bucketOps.config, dashboardState.currentPath, dashboardState.viewFilter);

  // Upload state (depends on file operations)
  const uploadOps = useUploadState(
    dashboardState.mode,
    dashboardState.currentPath,
    fileOps.files,
    fileOps.connected,
    () => fileOps.loadFiles()
  );

  // Delete state (depends on mode and file operations)
  const deleteOps = useDeleteState(
    dashboardState.mode,
    () => fileOps.loadFiles(),
    (error) => fileOps.setError(error)
  );

  // File input refs for upload triggers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Feedback modal state
  const [showFeedback, setShowFeedback] = useState(false);

  // Teams state for sidebar
  const [sidebarTeams, setSidebarTeams] = useState<Array<{
    id: string;
    name: string;
    isOwner: boolean;
    memberCount: number;
  }>>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  // S3 API state for sidebar
  const [s3ApiBuckets, setS3ApiBuckets] = useState<Array<{
    id: string;
    name: string;
    storageUsedFormatted: string;
  }>>([]);
  const [activeS3ApiBucketId, setActiveS3ApiBucketId] = useState<string | null>(null);
  const [showS3ApiCredentialsModal, setShowS3ApiCredentialsModal] = useState(false);
  const [showCreateS3ApiBucketModal, setShowCreateS3ApiBucketModal] = useState(false);

  // Fetch teams for sidebar on initial load
  useEffect(() => {
    if (teamsLoaded) return;

    const fetchTeamsForSidebar = async () => {
      try {
        const response = await fetch("/api/teams");
        if (response.ok) {
          const data = await response.json();
          const teams = data.teams || [];
          setSidebarTeams(teams.map((t: { id: string; name: string; isOwner: boolean; memberCount: number }) => ({
            id: t.id,
            name: t.name,
            isOwner: t.isOwner,
            memberCount: t.memberCount,
          })));
          setTeamsLoaded(true);
        }
      } catch (err) {
        console.error("Error fetching teams for sidebar:", err);
      }
    };

    fetchTeamsForSidebar();
  }, [teamsLoaded]);

  // Test connection on mount and mode change
  useEffect(() => {
    if (!fileOps.isLoaded) return;

    // Dev mode: configure s3Service from localStorage
    if (dashboardState.mode === "dev") {
      const savedConfig = localStorage.getItem("s3-config");
      if (savedConfig) {
        try {
          const parsedConfig = JSON.parse(savedConfig);
          bucketOps.handleConfigSave(parsedConfig);
        } catch (error) {
          console.error("Failed to parse saved config:", error);
        }
      }
    }

    fileOps.testConnection();
  }, [dashboardState.mode, fileOps.isLoaded]);

  // Reload files when active bucket or config changes
  // Config is set async after activeBucketId, so we need to watch both
  useEffect(() => {
    if (dashboardState.mode === "dev" && bucketOps.activeBucketId && bucketOps.config) {
      // Reset path and pagination when switching buckets
      dashboardState.setCurrentPath("");
      fileOps.resetPagination();
      fileOps.loadFiles(true);
    }
  }, [bucketOps.activeBucketId, bucketOps.config]);

  // Keyboard shortcuts (Cmd+U / Ctrl+U for upload)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "u") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Drag and drop handlers
  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dropZone.contains(e.relatedTarget as Node)) {
        setIsDragging(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        try {
          await uploadOps.handleUpload(files);
        } catch (error) {
          console.error("Upload error:", error);
        }
      }
    };

    dropZone.addEventListener("dragenter", handleDragEnter);
    dropZone.addEventListener("dragover", handleDragOver);
    dropZone.addEventListener("dragleave", handleDragLeave);
    dropZone.addEventListener("drop", handleDrop);

    const handleWindowDragOver = (e: DragEvent) => e.preventDefault();
    const handleWindowDrop = (e: DragEvent) => e.preventDefault();

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      dropZone.removeEventListener("dragenter", handleDragEnter);
      dropZone.removeEventListener("dragover", handleDragOver);
      dropZone.removeEventListener("dragleave", handleDragLeave);
      dropZone.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [uploadOps.handleUpload]);

  // Handle share (cloud only)
  const handleShare = (key: string) => {
    if (dashboardState.mode !== "cloud") {
      fileOps.setError("Link sharing is available for Bucket0 Cloud files only.");
      return;
    }

    const isFolder = key.endsWith("/");
    const fileName = isFolder
      ? key.split("/").filter(Boolean).pop() || key
      : key.split("/").pop() || key;
    dashboardState.setShareFile({ key, name: fileName, targetType: isFolder ? "folder" : "file" });
  };

  // Handle view
  const handleView = (key: string) => {
    try {
      fileOps.setError(null);
      const fileName = key.split("/").pop() || key;
      dashboardState.setPreviewFile({ key, name: fileName });
    } catch {
      fileOps.setError("Unable to preview file. Please try again.");
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <DashboardSidebar
        mode={dashboardState.mode === "profile" ? "cloud" : dashboardState.mode}
        setMode={(newMode) => dashboardState.setMode(newMode)}
        storageUsed={fileOps.usageStats?.used}
        storageLimit={fileOps.usageStats?.limit}
        plan={fileOps.usageStats?.plan}
        onSubOptionChange={(subOption) =>
          dashboardState.setViewFilter(subOption as "all" | "recent" | "starred")
        }
        onProfileClick={() => dashboardState.setMode("profile")}
        onFeedbackClick={() => setShowFeedback(true)}
        buckets={bucketOps.buckets}
        activeBucketId={bucketOps.activeBucketId || undefined}
        onBucketSelect={bucketOps.handleBucketSelect}
        onManageBuckets={() => {
          dashboardState.setEditBucketId(null);
          dashboardState.setShowManageBuckets(true);
        }}
        onEditBucket={(bucketId) => {
          dashboardState.setEditBucketId(bucketId);
          dashboardState.setShowManageBuckets(true);
        }}
        // Teams props
        teams={sidebarTeams}
        activeTeamId={activeTeamId || undefined}
        onTeamSelect={(teamId) => {
          setActiveTeamId(teamId);
          dashboardState.setMode("teams");
        }}
        onCreateTeam={() => {
          dashboardState.setMode("teams");
          setShowCreateTeamModal(true);
        }}
        // S3 API props
        s3ApiBuckets={s3ApiBuckets}
        activeS3ApiBucketId={activeS3ApiBucketId || undefined}
        onS3ApiBucketSelect={(bucketId) => {
          setActiveS3ApiBucketId(bucketId);
          dashboardState.setMode("s3api");
        }}
        onManageS3ApiCredentials={() => {
          dashboardState.setMode("s3api");
          // Reset other modal first to prevent state conflicts
          setShowCreateS3ApiBucketModal(false);
          setShowS3ApiCredentialsModal(true);
        }}
        onCreateS3ApiBucket={() => {
          dashboardState.setMode("s3api");
          // Reset other modal first to prevent state conflicts
          setShowS3ApiCredentialsModal(false);
          setShowCreateS3ApiBucketModal(true);
        }}
      />

      {/* Main Content */}
      <div
        ref={dropZoneRef}
        className={`flex-1 flex flex-col overflow-auto relative ${
          isDragging ? "bg-primary/5 border-2 border-dashed border-primary" : ""
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
            <div className="bg-card border-2 border-dashed border-primary rounded-xl p-8 text-center">
              <p className="text-lg font-semibold text-primary mb-2">Drop files to upload</p>
              <p className="text-sm text-muted-foreground">Release to add files to your storage</p>
            </div>
          </div>
        )}

        <div className="px-6 py-6 lg:px-6 lg:py-6">
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadOps.handleUpload(e.target.files);
              }
              e.target.value = "";
            }}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            {...{ webkitdirectory: "", directory: "" }}
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadOps.handleUpload(e.target.files);
              }
              e.target.value = "";
            }}
            className="hidden"
          />

          {/* Error Message */}
          {fileOps.error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-sm p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertCircle className="text-destructive mt-0.5" size={16} />
                <div>
                  <p className="font-medium text-destructive">Error</p>
                  <p className="text-sm text-destructive/80 mt-1">{fileOps.error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="relative">
            {/* Profile View */}
            {dashboardState.mode === "profile" && (
              <div className="animate-in fade-in duration-500">
                <ProfileView />
              </div>
            )}

            {/* Teams View */}
            {dashboardState.mode === "teams" && (
              <div className="animate-in fade-in duration-500">
                <TeamsView
                  initialTeamId={activeTeamId}
                  onTeamsLoaded={(teams) => {
                    setSidebarTeams(teams.map(t => ({
                      id: t.id,
                      name: t.name,
                      isOwner: t.isOwner,
                      memberCount: t.memberCount,
                    })));
                    setTeamsLoaded(true);
                  }}
                  onTeamSelect={(teamId) => setActiveTeamId(teamId)}
                  onTeamDeleted={(deletedTeamId) => {
                    // Remove from sidebar and reset active team
                    setSidebarTeams(prev => prev.filter(t => t.id !== deletedTeamId));
                    setActiveTeamId(null);
                  }}
                  onCreateTeam={() => setShowCreateTeamModal(true)}
                  showCreateModal={showCreateTeamModal}
                  onCloseCreateModal={() => setShowCreateTeamModal(false)}
                />
              </div>
            )}

            {/* S3 API View */}
            {dashboardState.mode === "s3api" && (
              <div className="animate-in fade-in duration-500">
                <S3ApiView
                  initialBucketId={activeS3ApiBucketId}
                  onBucketsLoaded={(buckets) => {
                    setS3ApiBuckets(buckets.map(b => ({
                      id: b.id,
                      name: b.name,
                      storageUsedFormatted: b.storageUsedFormatted,
                    })));
                    // Refresh user stats when S3 API data is loaded/refreshed
                    fileOps.refreshUserStats();
                  }}
                  onBucketSelect={(bucketId) => setActiveS3ApiBucketId(bucketId)}
                  showCreateBucketModal={showCreateS3ApiBucketModal}
                  onCloseCreateBucketModal={() => setShowCreateS3ApiBucketModal(false)}
                  showCredentialsModal={showS3ApiCredentialsModal}
                  onCloseCredentialsModal={() => setShowS3ApiCredentialsModal(false)}
                />
              </div>
            )}

            {/* Agent Storage View */}
            {dashboardState.mode === "agent" && (
              <div className="animate-in fade-in duration-500">
                <AgentStorageView />
              </div>
            )}

            {/* Dev Mode Welcome */}
            {dashboardState.mode === "dev" && bucketOps.buckets.length === 0 && (
              <div className="animate-in fade-in duration-500">
                <DevWelcome
                  onConfigure={() => dashboardState.setShowManageBuckets(true)}
                  storagePreference={storagePreference}
                />
              </div>
            )}

            {/* Cloud Mode Welcome */}
            {dashboardState.mode === "cloud" && !fileOps.connected && (
              <div className="animate-in fade-in duration-500">
                <CloudWelcome error={fileOps.error} />
              </div>
            )}

            {/* File List (Main Dashboard) */}
            {((dashboardState.mode === "cloud" && fileOps.connected) ||
              (dashboardState.mode === "dev" && bucketOps.config)) && (
              <div className="animate-in fade-in duration-500">
                <FileList
                  files={fileOps.files}
                  isLoading={fileOps.loading}
                  onView={handleView}
                  onDownload={fileOps.handleDownload}
                  onDelete={deleteOps.handleDeleteClick}
                  onShare={handleShare}
                  onNavigate={dashboardState.setCurrentPath}
                  currentPath={dashboardState.currentPath}
                  onBulkDelete={deleteOps.handleBulkDelete}
                  onBulkDownload={fileOps.handleBulkDownload}
                  getPreviewUrl={fileOps.handleGetPreviewUrl}
                  deletingItems={deleteOps.deletingItems}
                  mode={dashboardState.mode}
                  onUploadFiles={() => fileInputRef.current?.click()}
                  onUploadFolder={() => folderInputRef.current?.click()}
                  onCreateFolder={() => dashboardState.setShowCreateFolder(true)}
                  onRefresh={() => fileOps.loadFiles(true)}
                  uploading={uploadOps.uploading}
                  connected={fileOps.connected}
                  viewFilter={dashboardState.viewFilter}
                  pagination={fileOps.pagination}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Progress Panel */}
      <UploadProgress
        uploads={uploadOps.uploadItems}
        onClose={() => uploadOps.handleClearCompleted()}
        onCancel={uploadOps.handleCancelUpload}
        onRetry={uploadOps.handleRetryUpload}
        onCancelAll={uploadOps.handleCancelAll}
      />

      {/* Feedback Modal (triggered from sidebar) */}
      <FeedbackButton
        hideButton
        externalOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />

      {/* All Modals */}
      <DashboardModals
        // Settings
        showSettings={dashboardState.showSettings}
        onCloseSettings={() => dashboardState.setShowSettings(false)}
        onSaveConfig={async (config) => {
          bucketOps.handleConfigSave(config);
          await fileOps.testConnection();
        }}
        currentConfig={bucketOps.config || undefined}
        // Manage buckets
        showManageBuckets={dashboardState.showManageBuckets}
        onCloseManageBuckets={() => dashboardState.setShowManageBuckets(false)}
        buckets={bucketOps.buckets}
        onAddBucket={async (bucket) => {
          try {
            const id = await bucketOps.handleAddBucket(bucket);
            dashboardState.setShowManageBuckets(false);
            fileOps.loadFiles(true);
            return id;
          } catch (error) {
            console.error("Failed to add bucket:", error);
            throw error;
          }
        }}
        onEditBucket={async (id, bucket) => {
          try {
            await bucketOps.handleEditBucket(id, bucket);
            dashboardState.setShowManageBuckets(false);
            if (bucketOps.activeBucketId === id) {
              fileOps.loadFiles(true);
            }
          } catch (error) {
            console.error("Failed to edit bucket:", error);
            throw error;
          }
        }}
        onDeleteBucket={bucketOps.handleDeleteBucket}
        editBucketId={dashboardState.editBucketId}
        setEditBucketId={dashboardState.setEditBucketId}
        storagePreference={storagePreference}
        onStoragePreferenceClick={() => dashboardState.setShowStoragePreference(true)}
        // Storage preference modal
        showStoragePreference={dashboardState.showStoragePreference}
        onCloseStoragePreference={() => dashboardState.setShowStoragePreference(false)}
        onSelectStoragePreference={setStoragePreference}
        // Create folder
        showCreateFolder={dashboardState.showCreateFolder}
        onCloseCreateFolder={() => dashboardState.setShowCreateFolder(false)}
        onCreateFolder={(name) => fileOps.handleCreateFolder(name, dashboardState.currentPath)}
        // Preview
        previewFile={dashboardState.previewFile}
        onClosePreview={() => dashboardState.setPreviewFile(null)}
        onDownload={fileOps.handleDownload}
        getPreviewUrl={fileOps.handleGetPreviewUrl}
        previewMode={dashboardState.mode === "profile" || dashboardState.mode === "s3api" || dashboardState.mode === "agent" ? "cloud" : dashboardState.mode}
        onShareFromPreview={(key) => {
          dashboardState.setPreviewFile(null);
          handleShare(key);
        }}
        previewFiles={(dashboardState.viewFilter !== "all"
          ? // Starred/Recent are flat cross-folder lists; navigate across all of it.
            fileOps.files.filter((f) => !f.key.endsWith("/"))
          : fileOps.files
              .filter((f) => !f.key.endsWith("/") && f.key.startsWith(dashboardState.currentPath))
              // Only include direct children of the current folder, not nested files.
              .filter((f) => !f.key.slice(dashboardState.currentPath.length).includes("/"))
        ).map((f) => ({ key: f.key, name: f.key.split("/").pop() || f.key }))}
        onPreviewNavigate={(file) => dashboardState.setPreviewFile(file)}
        // Delete
        bulkDeleteKeys={deleteOps.bulkDeleteKeys}
        onCloseBulkDelete={() => deleteOps.setBulkDeleteKeys([])}
        onConfirmBulkDelete={deleteOps.confirmBulkDelete}
        pendingDeletes={deleteOps.pendingDeletes}
        onUndoDelete={deleteOps.undoDelete}
        onCompleteDelete={deleteOps.executeDelete}
        // Duplicate
        duplicateFiles={uploadOps.duplicateFiles}
        onDuplicateRename={uploadOps.handleDuplicateRename}
        onDuplicateReplace={uploadOps.handleDuplicateReplace}
        onDuplicateCancel={uploadOps.handleDuplicateCancel}
        // Share
        shareFile={dashboardState.shareFile}
        onCloseShare={() => dashboardState.setShareFile(null)}
        onCreateShareLink={fileOps.handleCreateShareLink}
        onRevokeShareLink={fileOps.handleRevokeShareLink}
      />
    </div>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Dashboard",
  description: "Manage your files, S3 buckets, and cloud storage from one unified dashboard.",
  noIndex: true, // Dashboard should not be indexed
}));

export async function loader({ request }: LoaderFunctionArgs) {
  const { userId } = await auth();
  if (!userId) {
    const url = new URL(request.url);
    throw redirect(`/sign-in?redirect_url=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return null;
}

export function ErrorBoundary() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="text-center max-w-md">
        <div className="bg-destructive/10 p-4 rounded-sm w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-8">
          An error occurred while loading the dashboard. Please try again.
        </p>
        <Button onClick={() => window.location.reload()} className="rounded">
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Try again
          </span>
        </Button>
      </div>
    </main>
  );
}
