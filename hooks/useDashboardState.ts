import { useState, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { DashboardMode } from "@/types/dashboard";

interface PreviewFile {
  key: string;
  name: string;
}

interface ShareFile {
  key: string;
  name: string;
  targetType?: "file" | "folder";
}

/**
 * Manages core dashboard state: mode, filters, navigation, and modal states
 * Persists mode and viewFilter to localStorage
 */
export function useDashboardState() {
  // Persisted state
  const [mode, setMode] = useLocalStorage<DashboardMode>("bucket0-active-mode", "cloud");
  const [viewFilter, setViewFilter] = useState<"all" | "recent" | "starred">("all");

  // Navigation state
  const [currentPath, setCurrentPath] = useState("");

  // Modal states
  const [showSettings, setShowSettings] = useState(false);
  const [showManageBuckets, setShowManageBuckets] = useState(false);
  const [editBucketId, setEditBucketId] = useState<string | null>(null);
  const [showStoragePreference, setShowStoragePreference] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  // File-related modal states
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [shareFile, setShareFile] = useState<ShareFile | null>(null);

  // Reset UI state when switching modes/tabs (but data is cached in hooks)
  useEffect(() => {
    // Reset navigation
    setCurrentPath("");

    // Close any open modals/previews
    setPreviewFile(null);
    setShareFile(null);
    setShowSettings(false);
    setShowManageBuckets(false);
    setEditBucketId(null);
    setShowStoragePreference(false);
    setShowCreateFolder(false);

    // Keep viewFilter - it's a user preference
  }, [mode]);

  return {
    // Mode & filters
    mode,
    setMode,
    viewFilter,
    setViewFilter,

    // Navigation
    currentPath,
    setCurrentPath,

    // Modal states
    showSettings,
    setShowSettings,
    showManageBuckets,
    setShowManageBuckets,
    editBucketId,
    setEditBucketId,
    showStoragePreference,
    setShowStoragePreference,
    showCreateFolder,
    setShowCreateFolder,

    // File modals
    previewFile,
    setPreviewFile,
    shareFile,
    setShareFile,
  };
}
