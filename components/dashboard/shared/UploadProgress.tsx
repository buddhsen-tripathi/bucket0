
import React, { useEffect, useRef } from "react";
import { MdClose, MdOutlineCheckCircle, MdOutlineError, MdOutlineUploadFile, MdRefresh, MdOutlineCancel } from "react-icons/md";

export interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  file?: File;
}

interface UploadProgressProps {
  uploads: UploadItem[];
  onClose: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onCancelAll?: () => void;
}

export default function UploadProgress({ uploads, onClose, onCancel, onRetry, onCancelAll }: UploadProgressProps) {
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const completedCount = uploads.filter(u => u.status === "success").length;
  const totalCount = uploads.length;
  const hasErrors = uploads.some(u => u.status === "error");
  const hasUploading = uploads.some(u => u.status === "uploading");
  const allComplete = uploads.every(u => u.status === "success" || u.status === "error");

  // Auto-close after 4 seconds when all uploads are complete (no errors)
  useEffect(() => {
    // Clear any existing timer
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    // Only auto-close if all uploads are complete and there are no errors
    if (allComplete && !hasErrors && uploads.length > 0) {
      autoCloseTimerRef.current = setTimeout(() => {
        onClose();
      }, 4000); // 4 seconds delay
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [allComplete, hasErrors, uploads.length, onClose]);

  if (uploads.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:bottom-6 md:right-6 md:w-96 bg-card border border-border rounded-sm shadow-2xl z-50 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <MdOutlineUploadFile size={18} className="text-muted-foreground" />
          <span className="font-medium text-sm text-foreground">
            {hasErrors
              ? `Completed with errors (${completedCount}/${totalCount})`
              : completedCount === totalCount
                ? `Upload complete (${totalCount})`
                : `Uploading ${completedCount}/${totalCount} files`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasUploading && onCancelAll && (
            <button
              onClick={onCancelAll}
              className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
              title="Cancel all uploads"
            >
              Cancel All
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-sm transition-colors"
            title="Close"
          >
            <MdClose size={18} />
          </button>
        </div>
      </div>

      {/* Upload List */}
      <div className="max-h-80 overflow-y-auto">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className="p-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {upload.status === "uploading" && (
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
                {upload.status === "success" && (
                  <MdOutlineCheckCircle size={20} className="text-emerald-500" />
                )}
                {upload.status === "error" && (
                  <MdOutlineError size={20} className="text-destructive" />
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate" title={upload.name}>
                  {upload.name}
                </p>
                
                {upload.status === "uploading" && (
                  <>
                    <div className="mt-2 mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{upload.progress.toFixed(2)}%</span>
                      <span>{upload.progress === 100 ? "Processing..." : "Uploading..."}</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  </>
                )}
                
                {upload.status === "success" && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    Upload complete
                  </p>
                )}
                
                {upload.status === "error" && (
                  <p className="text-xs text-destructive mt-1">
                    {upload.error || "Upload failed"}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {/* Retry Button (only for failed uploads with file reference) */}
                {upload.status === "error" && onRetry && upload.file && (
                  <button
                    onClick={() => onRetry(upload.id)}
                    className="p-1 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-sm transition-colors"
                    title="Retry upload"
                  >
                    <MdRefresh size={16} />
                  </button>
                )}

                {/* Cancel Button (only for uploading) */}
                {upload.status === "uploading" && onCancel && (
                  <button
                    onClick={() => onCancel(upload.id)}
                    className="p-1 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
                    title="Cancel upload"
                  >
                    <MdOutlineCancel size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
