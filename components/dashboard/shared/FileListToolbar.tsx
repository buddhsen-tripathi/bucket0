
import React from "react";
import { Search, RefreshCw, Download, Trash2 } from "lucide-react";
import { MdViewList, MdViewModule } from "react-icons/md";
import NewButton from "./NewButton";

type ViewMode = "list" | "grid" | "compact";
type FileFilter = "all" | "images" | "videos" | "documents" | "audio" | "other";

interface FileListToolbarProps {
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // Filters
  fileFilter: FileFilter;
  onFilterChange: (filter: FileFilter) => void;

  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;

  // Bulk actions
  selectedCount: number;
  onBulkDownload?: () => void;
  onBulkDelete?: () => void;

  // Refresh
  onRefresh: () => void;
  isRefreshing?: boolean;

  // Upload
  onUploadFiles?: () => void;
  onUploadFolder?: () => void;
  onCreateFolder?: () => void;
  uploadDisabled?: boolean;
}

export default function FileListToolbar({
  searchQuery,
  onSearchChange,
  fileFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  selectedCount,
  onBulkDownload,
  onBulkDelete,
  onRefresh,
  isRefreshing = false,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  uploadDisabled = false,
}: FileListToolbarProps) {
  const fileTypeFilters: { value: FileFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "images", label: "Images" },
    { value: "videos", label: "Videos" },
    { value: "documents", label: "Documents" },
    { value: "audio", label: "Audio" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-3">
      {/* Search Bar + Upload */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-muted/30 border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
        {onUploadFiles && onUploadFolder && onCreateFolder && (
          <NewButton
            onUploadFiles={onUploadFiles}
            onUploadFolder={onUploadFolder}
            onCreateFolder={onCreateFolder}
            disabled={uploadDisabled}
          />
        )}
      </div>

      {/* File Type Filters, Refresh, View Mode */}
      <div className="flex items-center justify-between gap-4">
        <div className="hidden md:flex gap-1.5 flex-wrap">
          {fileTypeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors border ${
                fileFilter === filter.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border-border"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center md:ml-auto">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors disabled:opacity-50"
            title="Refresh files"
          >
            <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
          </button>

          <div className="flex gap-0.5">
            <button
              onClick={() => onViewModeChange("list")}
              className={`p-2 rounded-sm transition-colors ${
                viewMode === "list"
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="List view"
            >
              <MdViewList size={18} />
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`p-2 rounded-sm transition-colors ${
                viewMode === "grid"
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Grid view"
            >
              <MdViewModule size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar (only shown when items are selected) */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between px-3 md:px-4 py-1.5 md:py-2 bg-primary/10 border border-primary/20 rounded-sm">
          <span className="text-xs md:text-sm font-medium text-foreground">
            {selectedCount} selected
          </span>
          <div className="flex gap-1">
            {onBulkDownload && (
              <button
                onClick={onBulkDownload}
                className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-medium text-foreground bg-muted hover:bg-muted/70 rounded-sm transition-colors border border-border"
              >
                <Download size={14} className="md:w-4 md:h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            {onBulkDelete && (
              <button
                onClick={onBulkDelete}
                className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-medium text-foreground bg-muted hover:bg-muted/70 rounded-sm transition-colors border border-border"
              >
                <Trash2 size={14} className="md:w-4 md:h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
