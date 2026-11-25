import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { DashboardMode } from "@/types/dashboard";
import { s3Service, S3FileObject, S3Config } from "@/lib/s3/s3-service";
import { cloudClient, FolderListItem } from "@/lib/cloud/cloud-client";
import { CloudFileObject } from "@/lib/shared/types";
import { useUser } from "@clerk/react-router";
import type { PageSize, SortField, SortDirection } from "@/components/dashboard/shared/Pagination";
import { useCloudFolderListing } from "./useCloudFolderListing";

// Simple cache for dev mode files per bucket (keyed by bucketName-region-endpoint)
interface DevFilesCache {
  [bucketKey: string]: {
    files: S3FileObject[];
    timestamp: number;
  };
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper to generate unique cache key for a bucket config
function getBucketCacheKey(config: S3Config): string {
  return `${config.bucketName}-${config.region}-${config.endpoint || 'aws-default'}`;
}

export type { PageSize, SortField, SortDirection };

export interface PaginationState {
  enabled: boolean;
  /** "server" → the `files` array is already the current page (cloud mode);
   *  "client" → the `files` array is the full set and FileList should slice it (dev mode). */
  mode: "server" | "client";
  currentPage: number;
  totalPages: number;
  pageSize: PageSize;
  /** Total file count (folders are not counted; they always show at the top of every page). */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  loading: boolean;
  loadingMore: boolean;
  /** Server-driven sort (cloud mode). When present, FileList drives sort through the
   *  server instead of re-sorting the current page locally. Absent in dev mode. */
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
}

/** Synthetic entry that lets FileList render a folder via its existing
 *  trailing-slash-key code path (it treats any key ending in "/" as a directory). */
function folderEntry(f: FolderListItem): CloudFileObject {
  return {
    key: f.path,
    size: 0,
    lastModified: f.createdAt,
    hasThumbnail: false,
    mimeType: null,
    isStarred: false,
  };
}

/**
 * Manages file operations: loading, downloading, viewing, sharing, folder creation
 * Handles both Cloud and Dev modes with pagination support
 */
export function useFileOperations(
  mode: DashboardMode | "profile",
  config: S3Config | null,  // Now actually used!
  currentPath: string = "",
  viewFilter: "all" | "recent" | "starred" = "all"
) {
  const { isLoaded } = useUser();

  // Cloud sort state (drives the server query). FileList's "lastModified" maps to the
  // endpoint's "modified" (updated_at); name/size pass through.
  const [cloudSortField, setCloudSortField] = useState<SortField>("name");
  const [cloudSortDirection, setCloudSortDirection] = useState<SortDirection>("asc");
  const handleCloudSortChange = useCallback((field: SortField, direction: SortDirection) => {
    setCloudSortField(field);
    setCloudSortDirection(direction);
  }, []);
  // Recent's sort is locked to modified-desc; this stable no-op swallows header clicks
  // there (so they don't mutate cloudSortField and leak into the All/Starred views).
  const lockedSortChange = useCallback(() => {}, []);

  // Recent is a fixed most-recently-modified window: its sort is locked to modified-desc.
  const isRecent = mode === "cloud" && viewFilter === "recent";
  const effSortField: SortField = isRecent ? "lastModified" : cloudSortField;
  const effSortDirection: SortDirection = isRecent ? "desc" : cloudSortDirection;

  // Folder-scoped, offset-paginated cloud listing (DB-backed). Idle when not in cloud mode.
  // Starred/Recent are global, cross-folder flat views — the server ignores `path`.
  const cloudListing = useCloudFolderListing({
    path: currentPath,
    enabled: mode === "cloud",
    sort: effSortField === "lastModified" ? "modified" : effSortField,
    order: effSortDirection,
    starred: viewFilter === "starred",
    recent: isRecent,
  });

  const [devFiles, setDevFiles] = useState<S3FileObject[] | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User storage stats - fetched separately for non-cloud modes
  const [userStats, setUserStats] = useState<{ used: number; limit: number; plan: string } | null>(null);

  // Cache refs for fast tab switching
  const devFilesCacheRef = useRef<DevFilesCache>({});
  const cloudConnectedRef = useRef(false);

  // Track current config to prevent race conditions
  const currentConfigRef = useRef<string | null>(null);

  // Dev mode pagination state (client-side only)
  const [devCurrentPage, setDevCurrentPage] = useState(1);
  const [devPageSize, setDevPageSize] = useState<PageSize>(25);

  // Reset pagination when switching buckets (called externally).
  // Cloud listing resets implicitly when `currentPath` changes; nothing to do here.
  const resetPagination = useCallback(() => {
    setDevCurrentPage(1);
  }, []);

  // Sync cloud listing error with local error state.
  useEffect(() => {
    if (cloudListing.error) {
      setError(cloudListing.error);
    }
  }, [cloudListing.error]);

  // Reset pagination and error when mode changes
  useEffect(() => {
    setError(null);
    setDevCurrentPage(1);
  }, [mode]);

  // Fetch user storage stats on mount and when mode changes
  // This ensures the sidebar shows current storage when switching tabs
  // (especially after S3 API uploads via CLI/SDK)
  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        const res = await fetch("/api/user/plan");
        if (res.ok) {
          const data = await res.json();
          setUserStats({
            used: data.storageUsage || 0,
            limit: data.storageLimit || 0,
            plan: data.plan || "free",
          });
        }
      } catch (err) {
        console.error("Failed to fetch user stats:", err);
      }
    };
    fetchUserStats();
  }, [mode]);

  // CRITICAL: Clear devFiles and reset state when config changes (bucket switch)
  useEffect(() => {
    if (mode === "dev") {
      const newConfigKey = config ? getBucketCacheKey(config) : null;

      // If config changed, clear current files to show loading state
      if (currentConfigRef.current !== newConfigKey) {
        currentConfigRef.current = newConfigKey;

        // Check cache for the new bucket
        if (newConfigKey && devFilesCacheRef.current[newConfigKey]) {
          const cached = devFilesCacheRef.current[newConfigKey];
          if (Date.now() - cached.timestamp < CACHE_TTL) {
            // Use cached files immediately
            setDevFiles(cached.files);
            setConnected(true);
            return;
          }
        }

        // No cache or stale - clear files to trigger reload
        setDevFiles(null);
        setConnected(false);
      }
    }
  }, [mode, config]);

  // Cloud mode: folders + (current-page slice of) files merged into one array.
  // Folder entries end in "/", which is how FileList already detects directories.
  const cloudCombinedFiles = useMemo(
    () => [...cloudListing.folders.map(folderEntry), ...cloudListing.pageFiles],
    [cloudListing.folders, cloudListing.pageFiles],
  );

  const files = mode === "cloud"
    ? cloudCombinedFiles
    : mode === "dev"
      ? devFiles || []
      : [];

  // Get loading state based on mode
  const loading = mode === "cloud" ? cloudListing.loading : devLoading;

  // Get usage stats for all modes except dev (external buckets don't use user quota)
  // Cloud, S3 API, and Teams all share the same user storage quota
  // Use cloud listing stats if available, otherwise fall back to userStats
  const usageStats = mode !== "dev"
    ? (cloudListing.usageStats || userStats)
    : null;

  // Dev mode pagination handlers
  const handleDevPageChange = useCallback((page: number) => {
    setDevCurrentPage(page);
  }, []);

  const handleDevPageSizeChange = useCallback((size: PageSize) => {
    setDevPageSize(size);
    setDevCurrentPage(1); // Reset to first page when changing page size
  }, []);

  // Pagination state — numbered pagination for both cloud (server-side, with
  // 100-item prefetch buffer) and dev (client-side over the loaded flat list).
  const pagination: PaginationState = mode === "cloud"
    ? {
        enabled: true,
        mode: "server",
        currentPage: cloudListing.currentPage,
        totalPages: cloudListing.totalPages,
        pageSize: cloudListing.pageSize,
        totalItems: cloudListing.totalItems,
        onPageChange: cloudListing.goToPage,
        onPageSizeChange: cloudListing.setPageSize,
        loading: cloudListing.loading,
        loadingMore: cloudListing.loadingMore,
        sortField: effSortField,
        sortDirection: effSortDirection,
        onSortChange: isRecent ? lockedSortChange : handleCloudSortChange,
      }
    : {
        enabled: mode === "dev",
        mode: "client",
        currentPage: devCurrentPage,
        totalPages: 1, // FileList computes the actual count from its filtered items
        pageSize: devPageSize,
        totalItems: devFiles?.length || 0,
        onPageChange: handleDevPageChange,
        onPageSizeChange: handleDevPageSizeChange,
        loading: devLoading,
        loadingMore: false,
      };

  // Load cloud files (wrapper for the cloud listing's refresh).
  const loadCloudFiles = useCallback(
    async (_forceLoading = false) => {
      try {
        setError(null);
        await cloudListing.refresh();
        setConnected(true);
        cloudConnectedRef.current = true;
      } catch {
        setError("Unable to load your files. Please try again.");
        setConnected(false);
        cloudConnectedRef.current = false;
      }
    },
    [cloudListing]
  );

  // Load dev files with caching and race condition prevention
  const loadDevFiles = useCallback(
    async (forceLoading = false) => {
      // Use the config from props, not s3Service singleton
      const currentConfig = s3Service.getConfig();

      try {
        if (forceLoading || !devFiles) {
          setDevLoading(true);
        }
        setError(null);

        if (!currentConfig) {
          setDevFiles([]);
          setConnected(false);
          return;
        }

        // Store the config key we're loading for
        const loadingConfigKey = getBucketCacheKey(currentConfig);

        const fileList = await s3Service.listFiles();

        // RACE CONDITION CHECK: Verify config hasn't changed during async operation
        const afterLoadConfig = s3Service.getConfig();
        if (!afterLoadConfig || getBucketCacheKey(afterLoadConfig) !== loadingConfigKey) {
          // Config changed while we were loading - discard these results
          console.log("Config changed during file load, discarding stale results");
          return;
        }

        setDevFiles(fileList);
        setConnected(true);

        // Cache the files for fast switching (with proper key including endpoint)
        devFilesCacheRef.current[loadingConfigKey] = {
          files: fileList,
          timestamp: Date.now(),
        };
      } catch {
        setError("Unable to load your files. Please check your bucket configuration.");
        setDevFiles([]);
        setConnected(false);
      } finally {
        setDevLoading(false);
      }
    },
    [devFiles]
  );

  // Load files (mode-aware dispatcher)
  const loadFiles = useCallback(
    (forceLoading: unknown = false) => {
      const isForced = typeof forceLoading === "boolean" ? forceLoading : true;

      if (mode === "cloud") {
        loadCloudFiles(isForced);
      } else {
        loadDevFiles(isForced);
      }
    },
    [mode, loadCloudFiles, loadDevFiles]
  );

  // Test connection - uses cache for instant loading on tab switch
  const testConnection = useCallback(async () => {
    if (mode === "cloud") {
      // The cloud listing hook auto-fetches on mount / path change. If we already
      // have folders or files (or were previously connected), mark connected immediately;
      // otherwise wait for the next refresh to resolve.
      const hasCached = cloudListing.folders.length > 0 || cloudListing.totalItems > 0;
      if (hasCached || cloudConnectedRef.current) {
        setConnected(true);
        cloudConnectedRef.current = true;
        return;
      }
      await loadCloudFiles();
      return;
    }

    // Dev mode - check if we have cached files for current bucket
    const currentConfig = s3Service.getConfig();
    if (!currentConfig) {
      setConnected(false);
      return;
    }

    const bucketKey = getBucketCacheKey(currentConfig);
    const cached = devFilesCacheRef.current[bucketKey];

    // If we have fresh cached files, use them immediately
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setDevFiles(cached.files);
      setConnected(true);
      return;
    }

    // If we have devFiles in state for this bucket, we're already connected
    if (devFiles && devFiles.length > 0 && currentConfigRef.current === bucketKey) {
      setConnected(true);
      return;
    }

    try {
      setError(null);
      const isConnected = await s3Service.testConnection();
      setConnected(isConnected);

      if (isConnected) {
        await loadDevFiles();
      }
    } catch {
      setConnected(false);
      setError("Unable to connect. Please check your configuration.");
    }
  }, [mode, loadCloudFiles, loadDevFiles, cloudListing.folders.length, cloudListing.totalItems, devFiles]);

  // Download file
  const handleDownload = useCallback(
    async (key: string) => {
      try {
        setError(null);
        let url: string;

        if (mode === "cloud") {
          url = cloudClient.getDownloadUrl(key);
        } else {
          url = await s3Service.getDownloadUrl(key);
        }

        const link = document.createElement("a");
        link.href = url;
        link.download = key.split("/").pop() || key;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        setError("Unable to download file. Please try again.");
      }
    },
    [mode]
  );

  // Bulk download with ZIP support for multiple files
  const handleBulkDownload = useCallback(
    async (keys: string[]) => {
      setError(null);

      // If downloading multiple files, create a ZIP
      if (keys.length > 1) {
        try {
          // Dynamically import JSZip
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();

          // Download all files and add to ZIP
          for (const key of keys) {
            try {
              let url: string;

              if (mode === "cloud") {
                url = cloudClient.getDownloadUrl(key);
              } else {
                url = await s3Service.getDownloadUrl(key);
              }

              // Fetch file content
              const response = await fetch(url);
              const blob = await response.blob();

              // Add to ZIP with full path preserved
              zip.file(key, blob);
            } catch (error) {
              console.error(`Failed to download ${key}:`, error);
              setError("Failed to download some files. Please try again.");
            }
          }

          // Generate ZIP and download
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const zipUrl = URL.createObjectURL(zipBlob);
          const link = document.createElement("a");
          link.href = zipUrl;
          link.download = `download-${Date.now()}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(zipUrl);
        } catch (error) {
          console.error("Failed to create ZIP:", error);
          setError("Failed to create download archive. Please try again.");
        }
      } else if (keys.length === 1) {
        // Single file: direct download
        try {
          let url: string;

          if (mode === "cloud") {
            url = cloudClient.getDownloadUrl(keys[0]);
          } else {
            url = await s3Service.getDownloadUrl(keys[0]);
          }

          const link = document.createElement("a");
          link.href = url;
          link.download = keys[0].split("/").pop() || keys[0];
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (error) {
          console.error(`Failed to download ${keys[0]}:`, error);
          setError("Failed to download file. Please try again.");
        }
      }
    },
    [mode]
  );

  // Get preview URL
  const handleGetPreviewUrl = useCallback(
    async (key: string) => {
      if (mode === "cloud") {
        return `/api/cloud/view?key=${encodeURIComponent(key)}`;
      } else {
        return s3Service.getViewUrl(key);
      }
    },
    [mode]
  );

  // Create folder
  const handleCreateFolder = useCallback(
    async (folderName: string, currentPath: string) => {
      try {
        setError(null);
        const fullPath = currentPath + folderName;

        if (mode === "cloud") {
          // Use dedicated folder creation endpoint (no encryption, 0-byte object)
          await cloudClient.createFolder(fullPath);
        } else {
          await s3Service.createFolder(fullPath);
        }

        await loadFiles();
      } catch (error) {
        throw error;
      }
    },
    [mode, loadFiles]
  );

  // Share file (cloud only)
  const handleCreateShareLink = useCallback(
    async (
      key: string,
      expiresInHours?: number,
      accessType?: string,
      allowDownload?: boolean,
      allowAddToDrive?: boolean,
      targetType?: "file" | "folder"
    ) => {
      return await cloudClient.createShareLink(key, expiresInHours, accessType, allowDownload, allowAddToDrive, targetType);
    },
    []
  );

  const handleRevokeShareLink = useCallback(async (linkId: string) => {
    await cloudClient.revokeShareLink(linkId);
  }, []);

  // Refresh user stats (can be called after S3 API operations)
  const refreshUserStats = useCallback(async () => {
    try {
      const res = await fetch("/api/user/plan");
      if (res.ok) {
        const data = await res.json();
        setUserStats({
          used: data.storageUsage || 0,
          limit: data.storageLimit || 0,
          plan: data.plan || "free",
        });
      }
    } catch (err) {
      console.error("Failed to refresh user stats:", err);
    }
  }, []);

  return {
    // State
    files,
    loading,
    connected,
    usageStats,
    error,
    setError,
    isLoaded,

    // Pagination (cloud and dev modes)
    pagination,
    resetPagination,

    // Actions
    loadFiles,
    testConnection,
    handleDownload,
    handleBulkDownload,
    handleGetPreviewUrl,
    handleCreateFolder,
    handleCreateShareLink,
    handleRevokeShareLink,
    refreshUserStats,
  };
}
