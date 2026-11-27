
import { useState, useEffect, useCallback } from "react";
import {
  MdOutlineFolder,
  MdOutlineInsertDriveFile,
  MdOutlineDriveFileMove,
  MdOutlineFileDownload,
  MdOutlineDelete,
  MdOutlineRefresh,
  MdOutlineChevronRight,
  MdOutlineCheck,
} from "react-icons/md";
import { formatFileSize, formatDate, getFileIcon } from "@/lib/shared/file-utils";
import { X, Download } from "lucide-react";

interface AgentFileRaw {
  key: string;
  fileName: string;
  size: number;
  mimeType: string | null;
  hasThumbnail: boolean;
  createdAt: string;
}

interface DisplayItem {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
  mimeType: string | null;
}

// Module-level cache
let agentFilesCache: { files: AgentFileRaw[]; timestamp: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

function AgentPreviewContent({ fileKey, fileName }: { fileKey: string; fileName: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const viewUrl = `/api/cloud/view?key=${encodeURIComponent(fileKey)}`;

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext);
  const isVideo = ["mp4", "webm", "mov", "avi"].includes(ext);
  const isAudio = ["mp3", "wav", "flac", "aac", "ogg"].includes(ext);
  const isPdf = ext === "pdf";
  const isText = [
    "txt", "log", "csv", "md", "mdx", "json", "yaml", "yml", "toml", "xml",
    "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h",
    "css", "scss", "html", "sh", "bash", "sql", "ini", "cfg", "conf",
  ].includes(ext);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <p className="text-sm mb-2">Preview not available</p>
        <p className="text-xs">Download the file to view it</p>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex items-center justify-center h-full p-4 bg-muted/30">
        {loading && <div className="absolute animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />}
        <img
          src={viewUrl}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="flex items-center justify-center h-full p-4 bg-black">
        <video src={viewUrl} controls autoPlay muted className="max-w-full max-h-full" onError={() => setError(true)}>
          Your browser does not support video.
        </video>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-lg mb-4">{fileName}</p>
        <audio src={viewUrl} controls className="w-full max-w-md" onError={() => setError(true)} />
      </div>
    );
  }

  if (isPdf || isText) {
    return (
      <iframe
        src={isPdf ? `${viewUrl}#toolbar=0` : viewUrl}
        className="w-full h-full border-0"
        title={fileName}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
      <p className="text-sm mb-2">Preview not available for .{ext} files</p>
      <p className="text-xs">Download the file to view it</p>
    </div>
  );
}

export default function AgentFilesBrowser({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [files, setFiles] = useState<AgentFileRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("");
  const [moveResult, setMoveResult] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ key: string; name: string } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const fetchFiles = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && agentFilesCache && Date.now() - agentFilesCache.timestamp < CACHE_TTL) {
      setFiles(agentFilesCache.files);
      setLoading(false);
      return;
    }

    try {
      if (forceRefresh) setLoading(true);
      const res = await fetch("/api/agent-bucket/files/list?page=1&pageSize=500");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const fetched = data.files || [];
      setFiles(fetched);
      agentFilesCache = { files: fetched, timestamp: Date.now() };
    } catch {
      // empty state shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // External refresh trigger (from parent's refresh button)
  useEffect(() => {
    if (refreshTrigger > 0) {
      agentFilesCache = null;
      fetchFiles(true);
    }
  }, [refreshTrigger, fetchFiles]);

  // Reset selection when path changes
  useEffect(() => { setSelectedKeys(new Set()); }, [currentPath]);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (allKeys: string[]) => {
    setSelectedKeys((prev) => {
      const allSelected = allKeys.every((k) => prev.has(k));
      return allSelected ? new Set() : new Set(allKeys);
    });
  };

  const clearSelection = () => setSelectedKeys(new Set());

  // Build display items for current path (folders + files)
  const displayItems: DisplayItem[] = (() => {
    const prefix = currentPath;
    const folderSet = new Set<string>();
    const items: DisplayItem[] = [];

    for (const f of files) {
      if (!f.key.startsWith(prefix)) continue;
      const rest = f.key.slice(prefix.length);
      const slashIdx = rest.indexOf("/");

      if (slashIdx !== -1) {
        // It's inside a subfolder
        const folderName = rest.slice(0, slashIdx);
        if (!folderSet.has(folderName)) {
          folderSet.add(folderName);
          items.push({
            key: `${prefix}${folderName}/`,
            name: folderName,
            size: 0,
            lastModified: new Date(f.createdAt),
            isDirectory: true,
            mimeType: null,
          });
        }
      } else if (rest && !rest.endsWith("/")) {
        // Direct child file
        items.push({
          key: f.key,
          name: rest,
          size: f.size,
          lastModified: new Date(f.createdAt),
          isDirectory: false,
          mimeType: f.mimeType,
        });
      }
    }

    // Sort: folders first, then files alphabetically
    return items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  })();

  const handleDownload = (key: string) => {
    const fileName = key.split("/").pop() || key;
    const link = document.createElement("a");
    link.href = `/api/cloud/download?key=${encodeURIComponent(key)}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (key: string) => {
    try {
      const res = await fetch("/api/cloud/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error("Failed");
      agentFilesCache = null;
      await fetchFiles(true);
    } catch {
      // silent
    }
  };

  // Expand selected keys: if a key ends with "/", expand to all files inside that folder
  const expandSelectedFileKeys = (): string[] => {
    const result = new Set<string>();
    for (const key of selectedKeys) {
      if (key.endsWith("/")) {
        // It's a folder - find all files inside it
        for (const f of files) {
          if (f.key.startsWith(key)) result.add(f.key);
        }
      } else {
        result.add(key);
      }
    }
    return Array.from(result);
  };

  const handleBulkMove = async () => {
    const fileKeys = expandSelectedFileKeys();
    if (fileKeys.length === 0) return;
    setBulkActionLoading(true);
    try {
      let succeeded = 0;
      for (const key of fileKeys) {
        const res = await fetch("/api/agent-bucket/files/move-to-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey: key, mode: "move" }),
        });
        if (res.ok) succeeded++;
      }
      setMoveResult(`Moved ${succeeded} of ${fileKeys.length} files to your drive`);
      agentFilesCache = null;
      await fetchFiles(true);
      clearSelection();
      setTimeout(() => setMoveResult(null), 3000);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDownload = async () => {
    const fileKeys = expandSelectedFileKeys();
    for (const key of fileKeys) {
      handleDownload(key);
      await new Promise((r) => setTimeout(r, 200));
    }
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const fileKeys = expandSelectedFileKeys();
    if (fileKeys.length === 0) return;
    const folderCount = Array.from(selectedKeys).filter(k => k.endsWith("/")).length;
    const msg = folderCount > 0
      ? `Delete ${fileKeys.length} file${fileKeys.length === 1 ? "" : "s"} from ${selectedKeys.size} item${selectedKeys.size === 1 ? "" : "s"}? This cannot be undone.`
      : `Delete ${fileKeys.length} file${fileKeys.length === 1 ? "" : "s"}? This cannot be undone.`;
    if (!confirm(msg)) return;
    setBulkActionLoading(true);
    try {
      for (const key of fileKeys) {
        await fetch("/api/cloud/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
      }
      agentFilesCache = null;
      await fetchFiles(true);
      clearSelection();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleMoveToDrive = async (key: string) => {
    try {
      const res = await fetch("/api/agent-bucket/files/move-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: key, mode: "move" }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMoveResult(`Moved "${data.fileName}" to your drive`);
      agentFilesCache = null;
      await fetchFiles(true);
      setTimeout(() => setMoveResult(null), 3000);
    } catch {
      // silent
    }
  };


  // Breadcrumb segments
  const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const FileIcon = ({ name }: { name: string }) => {
    return getFileIcon(name, false, 18);
  };

  if (loading) {
    return (
      <div className="border border-border/50 rounded bg-card py-12 text-center text-sm text-muted-foreground">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="border border-border/50 rounded bg-card py-12 text-center">
        <MdOutlineFolder className="mx-auto text-muted-foreground mb-3" size={32} />
        <p className="text-sm text-muted-foreground">No files yet</p>
        <p className="text-xs text-muted-foreground mt-1">Files uploaded by AI or OpenClaw agents will appear here</p>
      </div>
    );
  }

  return (
    <>
      {moveResult && (
        <div className="mb-3 px-4 py-2.5 bg-success/10 text-success dark:text-success rounded text-sm">
          {moveResult}
        </div>
      )}

      <div className="border border-border/50 rounded bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/50">
          {selectedKeys.size > 0 ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{selectedKeys.size} selected</span>
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkMove}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <MdOutlineDriveFileMove size={14} />
                  Move to Drive
                </button>
                <button
                  onClick={handleBulkDownload}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <MdOutlineFileDownload size={14} />
                  Download
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  <MdOutlineDelete size={14} />
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <MdOutlineInsertDriveFile size={16} className="text-primary" />
                <span className="font-medium">Files</span>
                <span className="text-xs text-muted-foreground">({files.length})</span>
              </div>
              <button
                onClick={() => { agentFilesCache = null; fetchFiles(true); }}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
                title="Refresh"
              >
                <MdOutlineRefresh size={16} />
              </button>
            </>
          )}
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-2 border-b border-border/50 flex items-center gap-1 text-sm overflow-x-auto">
          <button
            onClick={() => setCurrentPath("")}
            className={`hover:text-foreground transition-colors ${currentPath === "" ? "text-foreground font-medium" : "text-muted-foreground"}`}
          >
            Home
          </button>
          {breadcrumbs.map((crumb, i) => {
            const path = breadcrumbs.slice(0, i + 1).join("/") + "/";
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={path} className="flex items-center gap-1">
                <MdOutlineChevronRight size={14} className="text-muted-foreground" />
                <button
                  onClick={() => setCurrentPath(path)}
                  className={`hover:text-foreground transition-colors ${isLast ? "text-foreground font-medium" : "text-muted-foreground"}`}
                >
                  {crumb}
                </button>
              </span>
            );
          })}
        </div>

        {/* File table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-xs text-muted-foreground">
              <th className="w-10 px-4 py-2">
                {(() => {
                  const allKeys = displayItems.map(i => i.key);
                  const allSelected = allKeys.length > 0 && allKeys.every(k => selectedKeys.has(k));
                  const someSelected = allKeys.some(k => selectedKeys.has(k));
                  return (
                    <button
                      onClick={() => toggleSelectAll(allKeys)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        allSelected
                          ? "bg-primary border-primary"
                          : someSelected
                          ? "bg-primary/50 border-primary"
                          : "border-border hover:border-primary"
                      }`}
                      title={allSelected ? "Deselect all" : "Select all"}
                    >
                      {(allSelected || someSelected) && <MdOutlineCheck size={12} className="text-primary-foreground" />}
                    </button>
                  );
                })()}
              </th>
              <th className="text-left px-4 py-2 font-medium">NAME</th>
              <th className="text-left px-4 py-2 font-medium w-24">SIZE</th>
              <th className="text-left px-4 py-2 font-medium w-32">MODIFIED</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item) => {
              const isSelected = selectedKeys.has(item.key);
              return (
              <tr
                key={item.key}
                className={`border-b border-border/50 last:border-b-0 transition-colors group ${
                  isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toggleSelect(item.key)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {isSelected && <MdOutlineCheck size={12} className="text-primary-foreground" />}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => {
                      if (item.isDirectory) {
                        setCurrentPath(item.key);
                      } else {
                        setPreviewFile({ key: item.key, name: item.name });
                      }
                    }}
                    className="flex items-center gap-2.5 hover:text-primary transition-colors text-left"
                  >
                    {item.isDirectory ? (
                      <MdOutlineFolder size={18} className="text-muted-foreground shrink-0" />
                    ) : (
                      <FileIcon name={item.name} />
                    )}
                    <span className="truncate">{item.name}</span>
                  </button>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {item.isDirectory ? "-" : formatFileSize(item.size)}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {formatDate(item.lastModified)}
                </td>
                <td className="px-4 py-2.5">
                  {!item.isDirectory && (
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleMoveToDrive(item.key)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                        title="Move to Drive"
                      >
                        <MdOutlineDriveFileMove size={15} />
                      </button>
                      <button
                        onClick={() => handleDownload(item.key)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                        title="Download"
                      >
                        <MdOutlineFileDownload size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.key)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                        title="Delete"
                      >
                        <MdOutlineDelete size={15} />
                      </button>
                    </div>
                  )}
                  {item.isDirectory && (
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDelete(item.key)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                        title="Delete folder"
                      >
                        <MdOutlineDelete size={15} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
            {displayItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  This folder is empty
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      {previewFile && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-card rounded border border-border w-full max-w-5xl h-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{previewFile.name}</span>
                <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded">
                  {previewFile.name.split(".").pop()?.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleMoveToDrive(previewFile.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors"
                >
                  <MdOutlineDriveFileMove size={14} />
                  Move to Drive
                </button>
                <button
                  onClick={() => handleDownload(previewFile.key)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                  title="Download"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <AgentPreviewContent fileKey={previewFile.key} fileName={previewFile.name} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function invalidateAgentFilesCache() {
  agentFilesCache = null;
}
