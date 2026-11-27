
import { useCallback, useRef, useState } from "react";
import { FileIcon, MultipleCrossCancelIcon, UploadUpIcon } from "@/components/icons";
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
  const browse = () => inputRef.current?.click();

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={label || "Choose files"}
        onClick={browse}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            browse();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "relative cursor-pointer rounded-[10px] border border-dashed outline-none transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]",
          "flex flex-col items-center justify-center gap-4 px-6 py-12 sm:py-14",
          isDragging
            ? "border-[var(--violet)] bg-[var(--violet-soft)]"
            : "border-[color-mix(in_oklch,var(--ink)_24%,transparent)] bg-[var(--paper)] hover:border-[color-mix(in_oklch,var(--ink)_45%,transparent)]",
          hasFiles && "items-stretch gap-3 p-3 sm:p-3"
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
            <span
              className={cn(
                "grid size-11 place-items-center rounded-[8px] border bg-[var(--paper-card)] transition-colors",
                isDragging ? "border-[var(--violet)] text-[var(--violet)]" : "border-[var(--line)] text-[var(--ink)]"
              )}
            >
              <UploadUpIcon aria-hidden className="size-5" />
            </span>
            <div className="text-center">
              <p className="text-[15px] font-medium text-[var(--ink)]">
                {isDragging ? "Drop to add" : label || "Drop your PDF here or click to browse"}
              </p>
              <p className="mt-1 font-mono text-[12px] text-[var(--ink-soft)]">
                {sublabel || `${accept} up to ${maxSizeMb}MB`}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-[3px] bg-[var(--ink)] px-3.5 py-2 text-[13px] font-medium text-[var(--paper)]">
              {multiple ? "Choose files" : "Choose a file"}
            </span>
          </>
        )}

        {hasFiles && (
          <div className="w-full space-y-1.5">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 rounded-[6px] border border-[var(--line)] bg-[var(--paper-card)] px-3.5 py-2.5"
              >
                <FileIcon aria-hidden className="size-4 shrink-0 text-[var(--ink-soft)]" />
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink)]">
                  {file.name}
                </p>
                <p className="shrink-0 font-mono text-[11.5px] tabular-nums text-[var(--ink-soft)]">
                  {formatFileSize(file.size)}
                </p>
                {onRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    aria-label={`Remove ${file.name}`}
                    className="-mr-1 grid size-7 shrink-0 place-items-center rounded-[3px] text-[var(--ink-soft)] transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <MultipleCrossCancelIcon aria-hidden className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {limitMessage && (
              <p className="pt-1 text-center text-xs text-warning dark:text-warning">
                {limitMessage}
              </p>
            )}
            <p className="pt-1.5 pb-0.5 text-center text-[12px] text-[var(--ink-soft)]">
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
