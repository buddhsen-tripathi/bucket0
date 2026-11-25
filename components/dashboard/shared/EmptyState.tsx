
import React from "react";
import {
  Upload,
  FolderPlus,
  FileText,
  Command,
  ArrowUpFromLine,
} from "lucide-react";
import NewButton from "./NewButton";

interface EmptyStateProps {
  isFiltered?: boolean;
  filterMessage?: string;
  /** True when viewing an empty sub-folder (vs. a brand-new, empty drive at root). */
  inSubfolder?: boolean;
  onUploadFiles?: () => void;
  onUploadFolder?: () => void;
  onCreateFolder?: () => void;
  disabled?: boolean;
  mode?: "cloud" | "dev" | "teams";
}

export default function EmptyState({
  isFiltered = false,
  filterMessage = "No files found",
  inSubfolder = false,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  disabled = false,
  mode,
}: EmptyStateProps) {
  // Filtered empty state (e.g., starred/recent view with no items)
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="relative mb-6">
          <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center border border-border">
            <FileText className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-card rounded-full border border-border flex items-center justify-center">
            <span className="text-xs text-muted-foreground">0</span>
          </div>
        </div>
        <p className="text-muted-foreground text-center">{filterMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Main illustration area */}
      <div className="relative mb-10">
        {/* File type icons floating around */}
        <div className="relative w-48 h-48">
          {/* Center upload zone */}
          <div className="absolute inset-8 bg-card rounded-2xl border-2 border-dashed border-primary/30 flex items-center justify-center">
            <ArrowUpFromLine className="w-10 h-10 text-primary/60" />
          </div>
        </div>
      </div>

      {/* Text content */}
      <h3 className="text-xl font-semibold text-foreground mb-2 text-center">
        {inSubfolder ? "This folder is empty" : "Your storage is empty"}
      </h3>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        {inSubfolder
          ? "Drag and drop files here, or use the button below to upload to this folder."
          : "Upload files to get started. Drag and drop anywhere, or use the button below."}
      </p>

      {/* Upload button */}
      {onUploadFiles && onUploadFolder && onCreateFolder && mode !== "dev" && (
        <div className="mb-10">
          <NewButton
            onUploadFiles={onUploadFiles}
            onUploadFolder={onUploadFolder}
            onCreateFolder={onCreateFolder}
            disabled={disabled}
          />
        </div>
      )}

      {/* Quick tips — first-run onboarding; only at the empty drive root, not sub-folders. */}
      {!inSubfolder && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg w-full">
          <QuickTip
            icon={<Upload className="w-4 h-4" />}
            title="Drag & Drop"
            description="Drop files anywhere"
          />
          <QuickTip
            icon={<FolderPlus className="w-4 h-4" />}
            title="Folders"
            description="Upload entire folders"
          />
          <QuickTip
            icon={
              <div className="flex items-center gap-0.5">
                <Command className="w-3 h-3" />
                <span className="text-[10px] font-medium">U</span>
              </div>
            }
            title="Shortcut"
            description="Quick upload"
          />
        </div>
      )}
    </div>
  );
}

function QuickTip({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded bg-card/50 border border-border/50 hover:border-border hover:bg-card transition-colors">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
