
import React from "react";
import { AlertTriangle, X, Copy, Replace } from "lucide-react";

interface DuplicateFile {
  originalName: string;
  suggestedName: string;
  file: File;
}

interface DuplicateFileModalProps {
  isOpen: boolean;
  duplicates: DuplicateFile[];
  onRenameAll: () => void;
  onReplaceAll: () => void;
  onCancel: () => void;
}

export default function DuplicateFileModal({
  isOpen,
  duplicates,
  onRenameAll,
  onReplaceAll,
  onCancel,
}: DuplicateFileModalProps) {
  if (!isOpen || duplicates.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-sm shadow-xl max-w-md w-full border border-border">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 bg-warning/10 rounded-sm">
            <AlertTriangle className="text-warning" size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">
              {duplicates.length === 1 ? "File Already Exists" : `${duplicates.length} Files Already Exist`}
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose how to handle duplicate files
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* File list */}
        <div className="p-4 max-h-60 overflow-y-auto">
          <div className="space-y-2">
            {duplicates.slice(0, 5).map((dup, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground truncate flex-1" title={dup.originalName}>
                  {dup.originalName}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium truncate flex-1" title={dup.suggestedName}>
                  {dup.suggestedName}
                </span>
              </div>
            ))}
            {duplicates.length > 5 && (
              <p className="text-sm text-muted-foreground">
                ...and {duplicates.length - 5} more files
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border flex flex-col sm:flex-row gap-2">
          <button
            onClick={onRenameAll}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm font-medium transition-colors"
          >
            <Copy size={16} />
            Keep Both (Rename)
          </button>
          <button
            onClick={onReplaceAll}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-muted text-foreground hover:bg-muted/70 rounded-sm font-medium transition-colors"
          >
            <Replace size={16} />
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function to generate a unique filename
export function generateUniqueName(originalName: string, existingNames: Set<string>): string {
  if (!existingNames.has(originalName)) {
    return originalName;
  }

  const lastDotIndex = originalName.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0;
  const baseName = hasExtension ? originalName.slice(0, lastDotIndex) : originalName;
  const extension = hasExtension ? originalName.slice(lastDotIndex) : "";

  let counter = 1;
  let newName = `${baseName} (${counter})${extension}`;
  
  while (existingNames.has(newName)) {
    counter++;
    newName = `${baseName} (${counter})${extension}`;
  }

  return newName;
}
