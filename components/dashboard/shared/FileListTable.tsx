
import React from "react";
import Image from "@/web/compat/image";
import {
  MdOutlineCheck,
  MdOutlineSync,
  MdOutlineShare,
  MdOutlineFileDownload,
  MdOutlineDelete,
  MdStar,
  MdStarOutline,
} from "react-icons/md";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DisplayItem } from "./FileContextMenu";
import { formatFileSize, formatDate, getFileIcon } from "@/lib/shared/file-utils";
import type { SortField, SortDirection } from "./Pagination";

interface FileListTableProps {
  items: DisplayItem[];
  selectedItems: Set<string>;
  deletingItems: Set<string>;
  starredItems: Set<string>;
  filePreviews: Record<string, string>;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onSelectAll: () => void;
  onSelectItem: (key: string) => void;
  onItemClick: (item: DisplayItem, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, item: DisplayItem) => void;
  onShare?: (key: string) => void;
  onDownload: (key: string) => void;
  onDelete: (key: string) => void;
  onStar?: (key: string, starred: boolean) => void;
}

export default function FileListTable({
  items,
  selectedItems,
  deletingItems,
  starredItems,
  filePreviews,
  sortField,
  sortDirection,
  onSort,
  onSelectAll,
  onSelectItem,
  onItemClick,
  onContextMenu,
  onShare,
  onDownload,
  onDelete,
  onStar,
}: FileListTableProps) {
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp size={14} />
    ) : (
      <ChevronDown size={14} />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/30 border-b border-border">
          <tr>
            {/* Select all checkbox */}
            <th className="w-14 py-2 px-3">
              <button
                onClick={onSelectAll}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selectedItems.size === items.length && items.length > 0
                    ? "bg-primary border-primary"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                {selectedItems.size === items.length && items.length > 0 && (
                  <MdOutlineCheck size={12} className="text-primary-foreground" />
                )}
              </button>
            </th>

            {/* Name column */}
            <th className="text-left py-2 px-3">
              <button
                onClick={() => onSort("name")}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide"
              >
                Name <SortIcon field="name" />
              </button>
            </th>

            {/* Size column */}
            <th className="text-left py-2 px-3 hidden md:table-cell">
              <button
                onClick={() => onSort("size")}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide"
              >
                Size <SortIcon field="size" />
              </button>
            </th>

            {/* Modified column */}
            <th className="text-left py-2 px-3 hidden md:table-cell">
              <button
                onClick={() => onSort("lastModified")}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide"
              >
                Modified <SortIcon field="lastModified" />
              </button>
            </th>

            {/* Actions column */}
            <th className="w-32 py-2 px-3"></th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const isSelected = selectedItems.has(item.key);
            const isDeleting = deletingItems.has(item.key);
            const isStarred = starredItems.has(item.key);

            return (
              <tr
                key={item.key}
                onClick={(e) => !isDeleting && onItemClick(item, e)}
                onContextMenu={(e) => !isDeleting && onContextMenu(e, item)}
                className={`border-b border-border transition-colors cursor-pointer group ${
                  isDeleting
                    ? "opacity-50 pointer-events-none"
                    : isSelected
                    ? "bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                {/* Checkbox and Star */}
                <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectItem(item.key)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-border group-hover:border-muted-foreground"
                      }`}
                    >
                      {isSelected && (
                        <MdOutlineCheck size={12} className="text-primary-foreground" />
                      )}
                    </button>
                    {!item.isDirectory && onStar && (
                      <button
                        onClick={() => onStar(item.key, !isStarred)}
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
                  </div>
                </td>

                {/* Name */}
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    {filePreviews[item.key] ? (
                      <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0 relative">
                        <Image
                          src={filePreviews[item.key]}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      getFileIcon(item.name, item.isDirectory, 20)
                    )}
                    <span
                      className="text-foreground font-medium truncate"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                  </div>
                </td>

                {/* Size */}
                <td className="py-2 px-3 text-muted-foreground text-sm hidden md:table-cell">
                  {formatFileSize(item.size)}
                </td>

                {/* Modified */}
                <td className="py-2 px-3 text-muted-foreground text-sm hidden md:table-cell">
                  {formatDate(item.lastModified)}
                </td>

                {/* Actions */}
                <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                  {isDeleting ? (
                    <div className="flex items-center justify-end gap-2">
                      <MdOutlineSync
                        size={14}
                        className="animate-spin text-muted-foreground"
                      />
                      <span className="text-xs text-muted-foreground">
                        Deleting...
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      {onShare && (
                        <button
                          onClick={() => onShare(item.key)}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                          title="Share link"
                        >
                          <MdOutlineShare size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => onDownload(item.key)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                        title="Download"
                      >
                        <MdOutlineFileDownload size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(item.key)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="Delete"
                      >
                        <MdOutlineDelete size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
