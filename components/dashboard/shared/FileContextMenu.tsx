
import React, { useEffect, useRef } from "react";
import {
  MdOutlineVisibility,
  MdOutlineFileDownload,
  MdOutlineShare,
  MdOutlineOpenInNew,
  MdOutlineDelete,
  MdStar,
  MdStarOutline,
} from "react-icons/md";

export interface DisplayItem {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
  isStarred?: boolean;
  hasThumbnail?: boolean;
  mimeType?: string | null;
}

interface FileContextMenuProps {
  item: DisplayItem;
  position: { x: number; y: number };
  onClose: () => void;
  onView?: (key: string) => void;
  onDownload?: (key: string) => void;
  onShare?: (key: string) => void;
  onNavigate?: (path: string) => void;
  onDelete: (key: string) => void;
  onStar?: (key: string, starred: boolean) => void;
}

export default function FileContextMenu({
  item,
  position,
  onClose,
  onView,
  onDownload,
  onShare,
  onNavigate,
  onDelete,
  onStar,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed bg-card border border-border rounded-sm shadow-xl overflow-hidden z-50 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: Math.min(position.x, window.innerWidth - 200),
        top: Math.min(position.y, window.innerHeight - 250),
      }}
    >
      {/* File actions */}
      {!item.isDirectory && (
        <>
          {onView && (
            <button
              onClick={() => handleAction(() => onView(item.key))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <MdOutlineVisibility
                size={18}
                className="text-muted-foreground flex-shrink-0"
              />
              <span>Preview</span>
            </button>
          )}
          {onDownload && (
            <button
              onClick={() => handleAction(() => onDownload(item.key))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <MdOutlineFileDownload
                size={18}
                className="text-muted-foreground flex-shrink-0"
              />
              <span>Download</span>
            </button>
          )}
          {onShare && (
            <button
              onClick={() => handleAction(() => onShare(item.key))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <MdOutlineShare
                size={18}
                className="text-muted-foreground flex-shrink-0"
              />
              <span>Share link</span>
            </button>
          )}
          {onStar && (
            <button
              onClick={() => handleAction(() => onStar(item.key, !item.isStarred))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              {item.isStarred ? (
                <MdStar size={18} className="flex-shrink-0 text-warning" />
              ) : (
                <MdStarOutline size={18} className="flex-shrink-0 text-muted-foreground" />
              )}
              <span>{item.isStarred ? "Remove from starred" : "Add to starred"}</span>
            </button>
          )}
          <div className="border-t border-border" />
        </>
      )}

      {/* Folder actions */}
      {item.isDirectory && onNavigate && (
        <>
          <button
            onClick={() => handleAction(() => onNavigate(item.key))}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
          >
            <MdOutlineOpenInNew
              size={18}
              className="text-muted-foreground flex-shrink-0"
            />
            <span>Open folder</span>
          </button>
          {onShare && (
            <button
              onClick={() => handleAction(() => onShare(item.key))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <MdOutlineShare
                size={18}
                className="text-muted-foreground flex-shrink-0"
              />
              <span>Share link</span>
            </button>
          )}
          {onDownload && (
            <button
              onClick={() => handleAction(() => onDownload(item.key))}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <MdOutlineFileDownload
                size={18}
                className="text-muted-foreground flex-shrink-0"
              />
              <span>Download</span>
            </button>
          )}
          <div className="border-t border-border" />
        </>
      )}

      {/* Delete action (always available) */}
      <button
        onClick={() => handleAction(() => onDelete(item.key))}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors whitespace-nowrap"
      >
        <MdOutlineDelete size={18} className="flex-shrink-0" />
        <span>Delete</span>
      </button>
    </div>
  );
}
