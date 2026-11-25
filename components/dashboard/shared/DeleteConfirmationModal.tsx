import { X, Trash2, Loader2, AlertTriangle } from "lucide-react";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  itemName: string;
  isDeleting: boolean;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  isDeleting,
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  const isFolder = itemName.endsWith("/");
  const displayName = isFolder ? itemName.slice(0, -1) : itemName;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-sm shadow-2xl max-w-md w-full overflow-hidden border border-destructive/20">
        {/* Destructive header */}
        <div className="bg-destructive/10 p-6 border-b border-destructive/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-sm bg-destructive/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="text-destructive" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground">
                Delete {isFolder ? "folder" : "file"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                This action cannot be undone
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className="text-muted-foreground">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground break-all">&quot;{displayName}&quot;</span>
            {isFolder && " and all its contents"}?
          </p>

          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-foreground hover:bg-muted rounded-sm transition-colors border border-border"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="px-6 py-2 bg-destructive text-destructive-foreground rounded-sm hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
