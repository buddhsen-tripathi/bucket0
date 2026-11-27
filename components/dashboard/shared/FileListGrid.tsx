
import React from "react";
import Image from "@/web/compat/image";
import {
  MdOutlineCheck,
  MdOutlineSync,
  MdOutlineShare,
  MdOutlineFileDownload,
  MdStar,
  MdStarOutline,
} from "react-icons/md";
import { DisplayItem } from "./FileContextMenu";
import { formatFileSize, getFileIcon } from "@/lib/shared/file-utils";

type ViewMode = "grid" | "compact";

interface FileListGridProps {
  items: DisplayItem[];
  selectedItems: Set<string>;
  deletingItems: Set<string>;
  starredItems: Set<string>;
  filePreviews: Record<string, string>;
  viewMode: ViewMode;
  onSelectItem: (key: string) => void;
  onItemClick: (item: DisplayItem, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, item: DisplayItem) => void;
  onShare?: (key: string) => void;
  onDownload: (key: string) => void;
  onStar?: (key: string, starred: boolean) => void;
}

function getDocumentType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  const docTypes: Record<string, string> = {
    pdf: "PDF",
    doc: "DOC",
    docx: "DOCX",
    ppt: "PPT",
    pptx: "PPTX",
    xls: "XLS",
    xlsx: "XLSX",
  };
  return docTypes[ext] || null;
}

export default function FileListGrid({
  items,
  selectedItems,
  deletingItems,
  starredItems,
  filePreviews,
  viewMode,
  onSelectItem,
  onItemClick,
  onContextMenu,
  onShare,
  onDownload,
  onStar,
}: FileListGridProps) {
  if (viewMode === "compact") {
    return (
      <div className="divide-y divide-border">
        {items.map((item) => {
          const isSelected = selectedItems.has(item.key);
          const isDeleting = deletingItems.has(item.key);
          const isStarred = starredItems.has(item.key);

          return (
            <div
              key={item.key}
              onClick={(e) => !isDeleting && onItemClick(item, e)}
              onContextMenu={(e) => !isDeleting && onContextMenu(e, item)}
              className={`flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer group ${
                isDeleting
                  ? "opacity-50 pointer-events-none"
                  : isSelected
                  ? "bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.key);
                }}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "border-border opacity-0 group-hover:opacity-100"
                }`}
              >
                {isSelected && (
                  <MdOutlineCheck size={12} className="text-primary-foreground" />
                )}
              </button>

              {getFileIcon(item.name, item.isDirectory, 16)}

              <span
                className="text-sm text-foreground font-medium truncate flex-1"
                title={item.name}
              >
                {item.name}
              </span>

              <span className="text-xs text-muted-foreground hidden sm:block">
                {formatFileSize(item.size)}
              </span>

              {!isDeleting && (
                <div className="flex items-center gap-0.5">
                  {!item.isDirectory && onStar && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStar(item.key, !isStarred);
                      }}
                      className={`rounded transition-colors ${
                        isStarred
                          ? "text-warning hover:text-warning"
                          : "text-muted-foreground/40 hover:text-warning"
                      }`}
                      title={isStarred ? "Remove from starred" : "Add to starred"}
                    >
                      {isStarred ? <MdStar size={16} /> : <MdStarOutline size={16} />}
                    </button>
                  )}
                  {onShare && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShare(item.key);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                      title="Share"
                    >
                      <MdOutlineShare size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(item.key);
                    }}
                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                    title="Download"
                  >
                    <MdOutlineFileDownload size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Grid view
  return (
    <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
      {items.map((item) => {
        const isSelected = selectedItems.has(item.key);
        const isDeleting = deletingItems.has(item.key);
        const isStarred = starredItems.has(item.key);
        const docType = getDocumentType(item.name);
        const ext = item.name.split(".").pop()?.toLowerCase();
        const isVideo = ext && ["mp4", "webm", "mov"].includes(ext);

        return (
          <div
            key={item.key}
            onClick={(e) => !isDeleting && onItemClick(item, e)}
            onContextMenu={(e) => !isDeleting && onContextMenu(e, item)}
            className={`relative group p-2 rounded-sm border transition-all cursor-pointer ${
              isDeleting
                ? "opacity-50 pointer-events-none border-border"
                : isSelected
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-muted-foreground hover:bg-muted/30"
            }`}
          >
            {/* Deleting overlay */}
            {isDeleting && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-sm z-20">
                <div className="flex flex-col items-center gap-1">
                  <MdOutlineSync
                    size={20}
                    className="animate-spin text-muted-foreground"
                  />
                  <span className="text-xs text-muted-foreground">
                    Deleting...
                  </span>
                </div>
              </div>
            )}

            {/* Selection checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(item.key);
              }}
              className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center transition-all z-10 ${
                isSelected
                  ? "bg-primary border-primary"
                  : "border-border bg-background opacity-0 group-hover:opacity-100"
              }`}
            >
              {isSelected && (
                <MdOutlineCheck size={12} className="text-primary-foreground" />
              )}
            </button>

            {/* Star button */}
            {!item.isDirectory && onStar && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(item.key, !isStarred);
                }}
                className={`absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center transition-all z-10 ${
                  isStarred
                    ? "text-warning"
                    : "text-muted-foreground/40 hover:text-warning opacity-0 group-hover:opacity-100"
                }`}
                title={isStarred ? "Remove from starred" : "Add to starred"}
              >
                {isStarred ? <MdStar size={16} /> : <MdStarOutline size={16} />}
              </button>
            )}

            {/* Preview/Icon */}
            <div className="aspect-square rounded-sm bg-muted/50 flex items-center justify-center mb-2 overflow-hidden relative">
              {filePreviews[item.key] ? (
                /* Thumbnail preview (images, videos, PDFs) */
                <Image
                  src={filePreviews[item.key]}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : docType ? (
                /* Document type badge (fallback when no thumbnail) */
                <div className="flex flex-col items-center justify-center">
                  {getFileIcon(item.name, item.isDirectory, 32)}
                  <span className="mt-1 text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {docType}
                  </span>
                </div>
              ) : isVideo ? (
                /* Video icon with play indicator (fallback when no thumbnail) */
                <div className="relative flex items-center justify-center">
                  {getFileIcon(
                    item.name,
                    item.isDirectory,
                    item.isDirectory ? 40 : 32
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-black/50 rounded-sm flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-1" />
                    </div>
                  </div>
                </div>
              ) : (
                getFileIcon(
                  item.name,
                  item.isDirectory,
                  item.isDirectory ? 40 : 32
                )
              )}
            </div>

            {/* Name */}
            <p
              className="text-sm font-medium text-foreground truncate text-center"
              title={item.name}
            >
              {item.name}
            </p>
            <p className="text-xs text-muted-foreground text-center">
              {item.isDirectory ? "Folder" : formatFileSize(item.size)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
