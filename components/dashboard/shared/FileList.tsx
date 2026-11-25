
import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { CloudFileObject, S3FileObject } from "@/lib/shared/types";

// FileList accepts both cloud and S3 files - use union type
type FileObject = CloudFileObject | S3FileObject;
import FileListToolbar from "./FileListToolbar";
import FileListBreadcrumbs from "./FileListBreadcrumbs";
import FileListTable from "./FileListTable";
import FileListGrid from "./FileListGrid";
import FileContextMenu, { DisplayItem } from "./FileContextMenu";
import { Pagination, type PageSize, type SortField, type SortDirection } from "./Pagination";
import { getFileType, type FileFilter } from "@/lib/shared/file-utils";
import EmptyState from "./EmptyState";

type ViewMode = "list" | "grid" | "compact";

interface PaginationConfig {
  enabled: boolean;
  /** "server" → the `files` prop is already the current page (cloud);
   *  "client" → the `files` prop is the full filtered set and FileList slices it (dev). */
  mode?: "server" | "client";
  currentPage: number;
  totalPages: number;
  pageSize: PageSize;
  /** Total file count for the current folder (folders are always shown on every page). */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  loading?: boolean;
  loadingMore?: boolean;
  // Server-driven sort (cloud mode). Present → FileList routes column-header clicks
  // to the server instead of re-sorting the current page locally.
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
}

interface FileListProps {
  files: FileObject[];
  onDelete: (key: string) => void;
  onDownload: (key: string) => void;
  onView: (key: string) => void;
  onShare?: (key: string) => void;
  isLoading: boolean;
  onNavigate?: (path: string) => void;
  currentPath?: string;
  onBulkDelete?: (keys: string[]) => void;
  onBulkDownload?: (keys: string[]) => void;
  getPreviewUrl?: (key: string) => Promise<string>;
  deletingItems?: Set<string>;
  mode?: "cloud" | "dev" | "teams";
  onUploadFiles?: () => void;
  onUploadFolder?: () => void;
  onCreateFolder?: () => void;
  onRefresh?: () => void;
  uploading?: boolean;
  connected?: boolean;
  viewFilter?: "all" | "recent" | "starred";
  pagination?: PaginationConfig;
}

export default function FileList({
  files,
  isLoading,
  onDownload,
  onDelete,
  onView,
  onShare,
  onNavigate,
  currentPath = "",
  onBulkDelete,
  onBulkDownload,
  getPreviewUrl,
  deletingItems = new Set(),
  mode,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  onRefresh,
  uploading,
  connected,
  viewFilter = "all",
  pagination,
}: FileListProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");

  // Pagination is owned by the parent (useFileOperations) — no local current-page
  // state any more. When the folder, search, or filter changes we ask the parent
  // to jump back to page 1.
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;
  useEffect(() => {
    paginationRef.current?.onPageChange(1);
  }, [currentPath, searchQuery, fileFilter, viewFilter]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: DisplayItem;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Local optimistic state for starred items
  const [optimisticStarred, setOptimisticStarred] = useState<Map<string, boolean>>(new Map());

  // Compute starred items from files + optimistic updates
  const starredItems = useMemo(() => {
    const starred = new Set(
      files
        .filter((file) => "isStarred" in file && file.isStarred)
        .map((file) => file.key)
    );
    // Apply optimistic updates
    optimisticStarred.forEach((isStarred, key) => {
      if (isStarred) {
        starred.add(key);
      } else {
        starred.delete(key);
      }
    });
    return starred;
  }, [files, optimisticStarred]);

  // Handle star toggle with optimistic update
  const handleStar = useCallback(
    async (key: string, starred: boolean) => {
      // Optimistic update
      setOptimisticStarred(prev => new Map(prev).set(key, starred));

      try {
        const response = await fetch("/api/cloud/star", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, starred }),
        });

        if (!response.ok) {
          // Revert on failure
          setOptimisticStarred(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
      } catch (error) {
        console.error("Error toggling star:", error);
        // Revert on error
        setOptimisticStarred(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // / to focus search
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Escape to clear search or deselect
      if (e.key === "Escape") {
        if (searchQuery) {
          setSearchQuery("");
        } else if (selectedItems.size > 0) {
          setSelectedItems(new Set());
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, selectedItems.size]);

  // Filter files based on current path
  const displayedItems = useMemo(() => {
    // Flat views (Starred / Recent) are global, cross-folder lists: every entry is a
    // file (from any folder), so skip folder reconstruction and show each as a leaf.
    if (viewFilter !== "all") {
      return files
        .filter((f) => f.key && typeof f.key === "string" && !f.key.endsWith("/"))
        .map((f): DisplayItem => ({ ...f, name: f.key.split("/").pop() || f.key, isDirectory: false }));
    }

    const items: DisplayItem[] = [];
    const processedFolders = new Set<string>();

    // In server-sort mode (cloud) `files` already arrives in the chosen order; preserve it.
    // In client mode (dev) sort by key as a stable base before the local sort step.
    const sortedFiles =
      pagination?.mode === "server" ? files : [...files].sort((a, b) => a.key.localeCompare(b.key));

    sortedFiles.forEach((file) => {
      if (!file.key || typeof file.key !== "string") {
        return;
      }

      if (!file.key.startsWith(currentPath)) return;

      // Skip folder markers (keys ending with /) - they're handled separately below
      if (file.key.endsWith("/")) return;

      const relativePath = file.key.slice(currentPath.length);
      const parts = relativePath.split("/").filter((p) => p !== "");

      if (parts.length === 1) {
        items.push({
          ...file,
          name: parts[0],
          isDirectory: false,
        });
        return;
      }

      if (parts.length > 1) {
        const folderName = parts[0];
        if (!processedFolders.has(folderName) && folderName !== "") {
          processedFolders.add(folderName);
          items.push({
            ...file,
            name: folderName,
            key: currentPath + folderName + "/",
            isDirectory: true,
            size: 0,
          });
        }
      }
    });

    files.forEach((file) => {
      if (
        file.key.endsWith("/") &&
        file.key.startsWith(currentPath) &&
        file.key !== currentPath
      ) {
        const relativePath = file.key.slice(currentPath.length);
        const parts = relativePath.split("/").filter((p) => p !== "");
        if (parts.length === 1) {
          const folderName = parts[0];
          if (!processedFolders.has(folderName)) {
            processedFolders.add(folderName);
            items.push({
              ...file,
              name: folderName,
              key: file.key,
              isDirectory: true,
            });
          }
        }
      }
    });

    return items;
  }, [files, currentPath, pagination?.mode, viewFilter]);

  // Filter by search and file type
  const filteredItems = useMemo(() => {
    let items = displayedItems;

    // Starred: the server returns the starred set, but still honor optimistic un-stars
    // (so a just-unstarred file disappears immediately). Recent: the server already
    // returns the recently-modified set in order, so no client-side filtering.
    if (viewFilter === "starred") {
      items = items.filter(
        (item) => !item.isDirectory && starredItems.has(item.key)
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(query));
    }

    // Apply file type filter
    if (fileFilter !== "all") {
      items = items.filter((item) => {
        if (item.isDirectory) return true; // Always show folders
        return getFileType(item.name) === fileFilter;
      });
    }

    return items;
  }, [
    displayedItems,
    searchQuery,
    fileFilter,
    viewFilter,
    starredItems,
  ]);

  // Sort items
  // In server-sort mode (cloud) the server already returns files in the chosen order
  // — and only the current page is loaded, so re-sorting here would only reorder the
  // page. Just keep folders first (stable) and preserve the server order for files.
  // In client mode (dev) we hold the whole list, so sort locally as before.
  const serverSort = pagination?.mode === "server" && !!pagination.onSortChange;
  const activeSortField: SortField = serverSort ? (pagination?.sortField ?? "name") : sortField;
  const activeSortDirection: SortDirection = serverSort ? (pagination?.sortDirection ?? "asc") : sortDirection;

  const sortedItems = useMemo(() => {
    if (serverSort) {
      // Stable partition: folders first, everything else in received (server) order.
      return [...filteredItems].sort((a, b) =>
        a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1,
      );
    }
    const sorted = [...filteredItems].sort((a, b) => {
      // Folders always first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "lastModified":
          comparison =
            new Date(a.lastModified).getTime() -
            new Date(b.lastModified).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [filteredItems, serverSort, sortField, sortDirection]);

  // Pagination model:
  //   - Folders always render at the top of every page (treated as outside pagination).
  //   - Files paginate. In server mode (cloud) the parent has already sliced; in client mode (dev) we slice here.
  const folderItemsSorted = useMemo(() => sortedItems.filter((i) => i.isDirectory), [sortedItems]);
  const fileItemsSorted = useMemo(() => sortedItems.filter((i) => !i.isDirectory), [sortedItems]);

  const filesActualTotal = pagination?.mode === "server"
    ? (pagination?.totalItems ?? fileItemsSorted.length)
    : fileItemsSorted.length;

  const actualTotalPages = pagination?.enabled
    ? Math.max(1, Math.ceil(filesActualTotal / pagination.pageSize))
    : 1;

  const currentPage = pagination?.currentPage ?? 1;

  const paginatedDisplayItems = useMemo(() => {
    if (!pagination?.enabled) return sortedItems;
    if (pagination.mode === "server") {
      // The parent gave us this page's files already.
      return [...folderItemsSorted, ...fileItemsSorted];
    }
    const start = (currentPage - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return [...folderItemsSorted, ...fileItemsSorted.slice(start, end)];
  }, [sortedItems, pagination?.enabled, pagination?.mode, pagination?.pageSize, currentPage, folderItemsSorted, fileItemsSorted]);

  const actualTotalItems = filesActualTotal;

  // Load file previews (use thumbnails when available)
  useEffect(() => {
    const loadPreviews = async () => {
      const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
      const videoExts = ["mp4", "webm", "mov"];
      const docExts = ["pdf"]; // Documents that support thumbnails

      const filesToLoad = sortedItems
        .filter((item) => {
          if (item.isDirectory) return false;
          const ext = item.name.split(".").pop()?.toLowerCase();
          if (!ext) return false;

          const isImage = imageExts.includes(ext);
          const isVideo = videoExts.includes(ext);
          const isDoc = docExts.includes(ext);

          // For videos and documents, only load if thumbnail exists
          if (isVideo || isDoc) {
            return !!item.hasThumbnail;
          }

          return isImage;
        });

      for (const item of filesToLoad) {
        if (filePreviews[item.key]) continue;

        try {
          let url: string;
          // Use thumbnail endpoint if thumbnail exists (for cloud mode)
          if (mode === "cloud" && item.hasThumbnail) {
            url = `/api/cloud/thumbnail?key=${encodeURIComponent(item.key)}`;
          } else if (getPreviewUrl) {
            url = await getPreviewUrl(item.key);
          } else {
            continue;
          }
          setFilePreviews((prev) => ({ ...prev, [item.key]: url }));
        } catch {
          // Ignore preview errors
        }
      }
    };

    loadPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedItems, getPreviewUrl, mode]);

  // Handlers
  const handleItemClick = (item: DisplayItem, e: React.MouseEvent) => {
    // Handle multi-select with Cmd/Ctrl
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSelectedItems((prev) => {
        const next = new Set(prev);
        if (next.has(item.key)) {
          next.delete(item.key);
        } else {
          next.add(item.key);
        }
        return next;
      });
      return;
    }

    // Handle shift-select for range (within current page when paginated)
    if (e.shiftKey && selectedItems.size > 0) {
      e.preventDefault();
      const itemsForSelection = pagination?.enabled ? paginatedDisplayItems : sortedItems;
      const lastSelected = Array.from(selectedItems).pop();
      const lastIndex = itemsForSelection.findIndex((i) => i.key === lastSelected);
      const currentIndex = itemsForSelection.findIndex((i) => i.key === item.key);
      const start = Math.min(lastIndex, currentIndex);
      const end = Math.max(lastIndex, currentIndex);

      const newSelection = new Set(selectedItems);
      for (let i = start; i <= end; i++) {
        newSelection.add(itemsForSelection[i].key);
      }
      setSelectedItems(newSelection);
      return;
    }

    // Clear selection and navigate/view
    setSelectedItems(new Set());

    if (item.isDirectory && onNavigate) {
      onNavigate(item.key);
    } else if (!item.isDirectory) {
      onView(item.key);
    }
  };

  const handleSort = (field: SortField) => {
    const nextDirection: SortDirection =
      activeSortField === field ? (activeSortDirection === "asc" ? "desc" : "asc") : "asc";
    if (serverSort) {
      // Drive the server query; FileList won't re-sort locally.
      pagination?.onSortChange?.(field, nextDirection);
    } else {
      setSortField(field);
      setSortDirection(nextDirection);
    }
  };

  const handleSelectAll = () => {
    // When pagination is enabled, select all on current page only
    const itemsToSelect = pagination?.enabled ? paginatedDisplayItems : sortedItems;
    if (selectedItems.size === itemsToSelect.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(itemsToSelect.map((i) => i.key)));
    }
  };

  const handleSelectItem = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedItems.size > 0) {
      onBulkDelete(Array.from(selectedItems));
      setSelectedItems(new Set());
    }
  };

  const handleBulkDownload = () => {
    if (onBulkDownload && selectedItems.size > 0) {
      const filesToDownload: string[] = [];

      Array.from(selectedItems).forEach((key) => {
        const item = displayedItems.find((i) => i.key === key);

        if (item && item.isDirectory) {
          const folderPrefix = key.endsWith("/") ? key : key + "/";
          files.forEach((file) => {
            if (file.key.startsWith(folderPrefix) && !file.key.endsWith("/")) {
              filesToDownload.push(file.key);
            }
          });
        } else if (item && !item.isDirectory) {
          filesToDownload.push(key);
        }
      });

      if (filesToDownload.length > 0) {
        onBulkDownload(filesToDownload);
      }
      setSelectedItems(new Set());
    }
  };

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, item: DisplayItem) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, item });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Check if we're in a filtered state with no results
  const isFiltered = !!(searchQuery || fileFilter !== "all");
  const hasNoFilteredResults = sortedItems.length === 0 && isFiltered && displayedItems.length > 0;

  // True empty state - no files at all in current folder
  const isTrulyEmpty = displayedItems.length === 0 && !isLoading;

  // Show full empty state only when folder is truly empty (no files at all)
  if (isTrulyEmpty) {
    const isViewFiltered = viewFilter !== "all";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          {onNavigate && viewFilter === "all" && (
            <FileListBreadcrumbs
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          )}
        </div>

        <EmptyState
          isFiltered={isViewFiltered}
          filterMessage={
            viewFilter === "starred"
              ? "No starred files yet"
              : viewFilter === "recent"
              ? "No recently viewed files"
              : "No files in this folder"
          }
          inSubfolder={currentPath !== ""}
          onUploadFiles={onUploadFiles}
          onUploadFolder={onUploadFolder}
          onCreateFolder={onCreateFolder}
          disabled={uploading || connected === false}
          mode={mode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <FileListToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        fileFilter={fileFilter}
        onFilterChange={setFileFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedCount={selectedItems.size}
        onBulkDownload={onBulkDownload ? handleBulkDownload : undefined}
        onBulkDelete={onBulkDelete ? handleBulkDelete : undefined}
        onRefresh={onRefresh || (() => {})}
        isRefreshing={isLoading}
        onUploadFiles={viewFilter === "all" ? onUploadFiles : undefined}
        onUploadFolder={viewFilter === "all" ? onUploadFolder : undefined}
        onCreateFolder={viewFilter === "all" ? onCreateFolder : undefined}
        uploadDisabled={uploading || connected === false}
      />

      {/* Breadcrumbs — only in folder-browse view; flat views have no folder context. */}
      {onNavigate && viewFilter === "all" && (
        <FileListBreadcrumbs
          currentPath={currentPath}
          onNavigate={onNavigate}
        />
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading files...</p>
          </div>
        </div>
      )}

      {/* No results from filter - show inline message */}
      {!isLoading && hasNoFilteredResults && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-muted-foreground text-center">
            No files match your {searchQuery ? "search" : "filter"}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try a different {searchQuery ? "search term" : "filter"} or select &ldquo;All&rdquo;
          </p>
        </div>
      )}

      {/* File views */}
      {!isLoading && !hasNoFilteredResults && (
        viewMode === "list" ? (
          <FileListTable
            items={paginatedDisplayItems}
            selectedItems={selectedItems}
            deletingItems={deletingItems}
            starredItems={starredItems}
            filePreviews={filePreviews}
            sortField={activeSortField}
            sortDirection={activeSortDirection}
            onSort={handleSort}
            onSelectAll={handleSelectAll}
            onSelectItem={handleSelectItem}
            onItemClick={handleItemClick}
            onContextMenu={handleContextMenu}
            onShare={onShare}
            onDownload={onDownload}
            onDelete={onDelete}
            onStar={mode === "cloud" ? handleStar : undefined}
          />
        ) : (
          <FileListGrid
            items={paginatedDisplayItems}
            selectedItems={selectedItems}
            deletingItems={deletingItems}
            starredItems={starredItems}
            filePreviews={filePreviews}
            viewMode={viewMode}
            onSelectItem={handleSelectItem}
            onItemClick={handleItemClick}
            onContextMenu={handleContextMenu}
            onShare={onShare}
            onDownload={onDownload}
            onStar={mode === "cloud" ? handleStar : undefined}
          />
        )
      )}

      {/* Numbered pagination (cloud uses server-side; dev slices client-side). */}
      {pagination?.enabled && !isLoading && !hasNoFilteredResults && actualTotalItems > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={actualTotalPages}
          pageSize={pagination.pageSize}
          totalItems={actualTotalItems}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          loading={pagination.loading}
          loadingMore={pagination.loadingMore}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          item={{
            ...contextMenu.item,
            isStarred: starredItems.has(contextMenu.item.key),
          }}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onView={!contextMenu.item.isDirectory ? onView : undefined}
          onDownload={onDownload}
          onShare={
            onShare ? onShare : undefined
          }
          onNavigate={contextMenu.item.isDirectory ? onNavigate : undefined}
          onDelete={onDelete}
          onStar={!contextMenu.item.isDirectory && mode === "cloud" ? handleStar : undefined}
        />
      )}
    </div>
  );
}
