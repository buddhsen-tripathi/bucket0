
import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/shared/utils";

interface FileDropZoneProps {
  accept?: string;
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  onRemove?: (index: number) => void;
  maxSizeMb?: number;
  maxFiles?: number;
  label?: string;
  sublabel?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropZone({
  accept = ".pdf",
  multiple = false,
  files,
  onFiles,
  onRemove,
  maxSizeMb = 100,
  maxFiles,
  label,
  sublabel,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      setLimitMessage(null);
      let arr = Array.from(fileList).filter(
        (f) => f.size <= maxSizeMb * 1024 * 1024
      );
      if (maxFiles && multiple) {
        const remaining = maxFiles - files.length;
        if (remaining <= 0) {
          setLimitMessage(`Maximum ${maxFiles} files allowed.`);
          return;
        }
        if (arr.length > remaining) {
          arr = arr.slice(0, remaining);
          setLimitMessage(
            `Only ${remaining} more file${remaining === 1 ? "" : "s"} added. Maximum is ${maxFiles}.`
          );
        }
      }
      onFiles(arr);
    },
    [onFiles, maxSizeMb, maxFiles, multiple, files.length]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300",
          "flex flex-col items-center justify-center gap-3 p-10",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/30 hover:bg-muted/20",
          hasFiles && "p-6"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        {!hasFiles && (
          <>
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium">
                {label || "Drop your PDF here or click to browse"}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                {sublabel || `${accept} up to ${maxSizeMb}MB`}
              </p>
            </div>
          </>
        )}

        {hasFiles && (
          <div className="w-full space-y-2">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 bg-muted/40 rounded-sm px-4 py-3 hover:bg-muted/60 transition-colors"
              >
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {onRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    className="p-1 hover:bg-destructive/10 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            ))}
            {limitMessage && (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400 pt-1">
                {limitMessage}
              </p>
            )}
            <p className="text-center text-xs text-muted-foreground pt-1">
              {multiple
                ? maxFiles && files.length >= maxFiles
                  ? `Maximum ${maxFiles} files reached`
                  : "Drop more files or click to add"
                : "Click or drop to replace"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
