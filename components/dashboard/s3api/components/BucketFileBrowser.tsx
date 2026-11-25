
import { useState, useEffect, useRef } from "react";
import {
  MdOutlineFolder,
  MdOutlineInsertDriveFile,
  MdOutlineArrowBack,
  MdOutlineRefresh,
  MdOutlineFileUpload,
  MdOutlineDownload,
  MdOutlineDelete,
} from "react-icons/md";
import { ConfirmModal } from "./ConfirmModal";

interface FileItem {
  key: string;
  name: string;
  size: number;
  sizeFormatted: string;
  lastModified: string;
  isFolder: boolean;
}

interface BucketFileBrowserProps {
  bucketName: string;
  onBack: () => void;
  onStorageChange?: () => void;
}

export function BucketFileBrowser({ bucketName, onBack, onStorageChange }: BucketFileBrowserProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<FileItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ bucket: bucketName });
      if (prefix) params.set("prefix", prefix);

      const res = await fetch(`/api/s3-api/files?${params}`);
      const data = await res.json();

      if (res.ok) {
        setFiles(data.files || []);
      } else {
        setError(data.error || "Failed to load files");
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
      setError("Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [bucketName, prefix]);

  const handleFolderClick = (folderKey: string) => {
    setPrefix(folderKey);
  };

  const handleBack = () => {
    if (prefix) {
      // Go up one level
      const parts = prefix.split("/").filter(Boolean);
      parts.pop();
      setPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
    } else {
      onBack();
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = e.target.files;
    if (!uploadFiles || uploadFiles.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(uploadFiles)) {
        const key = prefix + file.name;
        const params = new URLSearchParams({ bucket: bucketName, key });

        await fetch(`/api/s3-api/files/upload?${params}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
      }

      // Refresh file list and notify storage change
      await fetchFiles();
      onStorageChange?.();
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Failed to upload file(s)");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = async (file: FileItem) => {
    const params = new URLSearchParams({ bucket: bucketName, key: file.key });
    window.open(`/api/s3-api/files/download?${params}`, "_blank");
  };

  const handleDelete = async (file: FileItem) => {
    setDeletingKey(file.key);
    setConfirmDeleteFile(null);

    try {
      const params = new URLSearchParams({ bucket: bucketName, key: file.key });
      const res = await fetch(`/api/s3-api/files?${params}`, { method: "DELETE" });

      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.key !== file.key));
        onStorageChange?.();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete file");
      }
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Failed to delete file");
    } finally {
      setDeletingKey(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Breadcrumb parts
  const breadcrumbs = ["", ...prefix.split("/").filter(Boolean)];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
          >
            <MdOutlineArrowBack size={20} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono">{bucketName}</h2>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((part, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="mx-1">/</span>}
                  <button
                    onClick={() => {
                      const newPrefix = breadcrumbs.slice(1, i + 1).join("/");
                      setPrefix(newPrefix ? newPrefix + "/" : "");
                    }}
                    className="hover:text-foreground transition-colors"
                  >
                    {i === 0 ? "root" : part}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors disabled:opacity-50"
          >
            <MdOutlineRefresh size={20} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <MdOutlineFileUpload size={16} />
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-sm mb-4">
          {error}
        </div>
      )}

      {/* File List */}
      <div className="border border-border rounded-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_160px_80px] gap-4 px-4 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground font-medium">
          <div>Name</div>
          <div className="text-right">Size</div>
          <div>Modified</div>
          <div></div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {/* Empty */}
        {!loading && files.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <MdOutlineFolder size={40} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No files yet</p>
            <p className="text-xs mt-1">Upload files to get started</p>
          </div>
        )}

        {/* Files */}
        {!loading &&
          files.map((file) => (
            <div
              key={file.key}
              className="grid grid-cols-[1fr_100px_160px_80px] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {file.isFolder ? (
                  <button
                    onClick={() => handleFolderClick(file.key)}
                    className="flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
                  >
                    <MdOutlineFolder size={18} className="text-primary shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <MdOutlineInsertDriveFile size={18} className="text-muted-foreground shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                )}
              </div>
              <div className="text-sm text-muted-foreground text-right">
                {file.sizeFormatted}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDate(file.lastModified)}
              </div>
              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!file.isFolder && (
                  <>
                    <button
                      onClick={() => handleDownload(file)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Download"
                    >
                      <MdOutlineDownload size={16} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteFile(file)}
                      disabled={deletingKey === file.key}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingKey === file.key ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <MdOutlineDelete size={16} />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteFile && (
        <ConfirmModal
          title="Delete File"
          subtitle={confirmDeleteFile.name}
          message="This action cannot be undone. The file will be permanently deleted."
          icon={<MdOutlineDelete className="text-destructive" size={20} />}
          isConfirming={deletingKey === confirmDeleteFile.key}
          onConfirm={() => handleDelete(confirmDeleteFile)}
          onCancel={() => setConfirmDeleteFile(null)}
        />
      )}
    </div>
  );
}
