import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudClient, FolderListItem } from "@/lib/cloud/cloud-client";
import { CloudFileObject } from "@/lib/shared/types";
import type { PageSize } from "@/components/dashboard/shared/Pagination";

/**
 * Folder-scoped, offset-paginated cloud listing for the dashboard.
 * Backed by GET /api/cloud/files/list (DB-driven, catalog-based).
 *
 * Behaviour:
 *   - Numbered pagination over files; folders are always returned in full.
 *   - Keeps a contiguous buffer of files from offset 0 that grows as the user
 *     navigates. Maintains an invariant of `currentPage * pageSize + PREFETCH_AHEAD`
 *     items loaded so flipping pages is usually instant.
 *   - Re-fetches from scratch when `path` or `sort`/`order` changes.
 *   - Latest-request guard so fast navigation can't apply stale results.
 */

export type FolderSort = "name" | "size" | "modified";
export type FolderOrder = "asc" | "desc";

const PREFETCH_AHEAD = 100; // items to keep loaded beyond the current page's last item
const FETCH_CHUNK = 100;    // minimum items to request per server fetch

interface UsageStats {
  used: number;
  limit: number;
  plan: string;
}

interface UseCloudFolderListingOptions {
  /** "" for the drive root, "maskG/" for a sub-folder. */
  path?: string;
  /** Set to false outside cloud mode so the hook stays idle. */
  enabled?: boolean;
  sort?: FolderSort;
  order?: FolderOrder;
  /** Global flat view of all starred files (the Starred sub-view); `path` is ignored. */
  starred?: boolean;
  /** Global flat view of the most-recently-modified files (the Recent sub-view); `path` is ignored. */
  recent?: boolean;
  /** Initial page size. Can be changed at runtime via setPageSize(). */
  initialPageSize?: PageSize;
}

interface UseCloudFolderListingReturn {
  folders: FolderListItem[];
  /** The slice of files for the current page (may be empty while loading). */
  pageFiles: CloudFileObject[];
  /** Total file count for the current path (folders are not included). */
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: PageSize;
  loading: boolean;       // initial load / page miss (UI should show a spinner)
  loadingMore: boolean;   // background prefetch (UI may show a subtle indicator)
  error: string | null;
  setError: (e: string | null) => void;
  usageStats: UsageStats | null;
  goToPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  refresh: () => Promise<void>;
}

export function useCloudFolderListing(
  options: UseCloudFolderListingOptions = {},
): UseCloudFolderListingReturn {
  const { path = "", enabled = true, sort = "name", order = "asc", starred = false, recent = false, initialPageSize = 25 } = options;

  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [bufferFiles, setBufferFiles] = useState<CloudFileObject[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(initialPageSize);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);
  const lastPathRef = useRef<string | null>(null);

  // Stable key per "context" — when this changes we re-fetch from page 1.
  // Flat views (starred/recent) are cross-folder, so `path` is excluded from their key.
  const contextKey = recent
    ? `recent ${sort} ${order}`
    : starred
    ? `starred ${sort} ${order}`
    : `${path} ${sort} ${order}`;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // kind:
  //   "initial" — replace the buffer with page 1 AND blank the list (folder change / first load)
  //   "soft"    — replace the buffer with page 1 but keep the current list visible (sort/order change, refresh)
  //   "more"    — append the next page (prefetch); respects the in-flight lock
  const fetchChunk = useCallback(
    async (offset: number, kind: "initial" | "soft" | "more", opts: { retryFailedThumbnails?: boolean } = {}) => {
      // A prefetch must not pile on top of an in-flight request, but initial/soft
      // reloads must always supersede whatever's running.
      if (kind === "more" && inFlightRef.current) return;
      // Bump the request id BEFORE anything else, so any in-flight request is
      // immediately marked stale and can't write its result into the new context.
      const reqId = ++reqIdRef.current;
      inFlightRef.current = true;
      if (kind === "initial") setLoading(true);
      else setLoadingMore(true); // soft + more use the subtle indicator (no list blanking)
      setError(null);
      try {
        const res = await cloudClient.listFolder(path, {
          offset,
          limit: FETCH_CHUNK,
          sort,
          order,
          starred,
          recent,
          retryFailedThumbnails: opts.retryFailedThumbnails,
        });
        if (reqIdRef.current !== reqId) return; // superseded by a newer request
        if (kind === "more") {
          // Append at `offset` (which equals the current bufferFiles.length).
          setBufferFiles((prev) => {
            if (prev.length !== offset) return prev; // buffer moved under us; ignore
            return [...prev, ...res.files];
          });
        } else {
          // initial / soft → replace (atomic swap; for "soft" the old list stays
          // on screen right up until this swap, so there's no full refresh).
          setFolders(res.folders);
          setBufferFiles(res.files);
        }
        setTotalItems(res.pagination.totalItems);
        setUsageStats({ used: res.usage, limit: res.limit, plan: res.plan });
      } catch (e) {
        if (reqIdRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Failed to load files");
      } finally {
        // Only the latest request clears the lock + loading flags, so a superseded
        // request resolving late can't unlock or hide the spinner for the live one.
        if (reqIdRef.current === reqId) {
          inFlightRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [path, sort, order, starred, recent],
  );

  // (Re)load when context changes; otherwise extend the buffer to satisfy
  // `currentPage * pageSize + PREFETCH_AHEAD`.
  useEffect(() => {
    if (!enabled) return;
    if (lastKeyRef.current !== contextKey) {
      const pathChanged = lastPathRef.current !== path;
      lastKeyRef.current = contextKey;
      lastPathRef.current = path;
      setCurrentPage(1);
      if (pathChanged) {
        // Entering a different folder (or first load): blanking + spinner is expected.
        setFolders([]);
        setBufferFiles([]);
        setTotalItems(0);
        fetchChunk(0, "initial");
      } else {
        // Same folder, sort/order changed: reorder in place — keep the current list
        // visible until the new order arrives (no full-dashboard refresh).
        fetchChunk(0, "soft");
      }
      return;
    }
    const endNeeded = Math.min(currentPage * pageSize + PREFETCH_AHEAD, totalItems || Infinity);
    if (bufferFiles.length < endNeeded && !inFlightRef.current) {
      fetchChunk(bufferFiles.length, "more");
    }
  }, [enabled, contextKey, path, currentPage, pageSize, bufferFiles.length, totalItems, fetchChunk]);

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(clamped);
    },
    [totalPages],
  );

  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    // Keep approximately the same position in the list across page-size changes.
    setCurrentPage((prev) => Math.max(1, Math.floor(((prev - 1) * pageSize) / size) + 1));
  }, [pageSize]);

  const refresh = useCallback(async () => {
    setCurrentPage(1);
    // Soft reload — keep the current list visible until the new page swaps in (no blank).
    // Also asks the server to retry thumbnails that failed a prior attempt for page 1.
    // "soft" supersedes any in-flight prefetch via the request-id bump in fetchChunk.
    await fetchChunk(0, "soft", { retryFailedThumbnails: true });
  }, [fetchChunk]);

  const pageFiles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return bufferFiles.slice(start, start + pageSize);
  }, [bufferFiles, currentPage, pageSize]);

  return useMemo(
    () => ({
      folders,
      pageFiles,
      totalItems,
      totalPages,
      currentPage,
      pageSize,
      loading,
      loadingMore,
      error,
      setError,
      usageStats,
      goToPage,
      setPageSize,
      refresh,
    }),
    [folders, pageFiles, totalItems, totalPages, currentPage, pageSize, loading, loadingMore, error, usageStats, goToPage, setPageSize, refresh],
  );
}
