
import { ReactNode } from "react";

interface ConfirmModalProps {
  title: string;
  subtitle?: string;
  message: string;
  icon: ReactNode;
  confirmLabel?: string;
  confirmingLabel?: string;
  isConfirming?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  subtitle,
  message,
  icon,
  confirmLabel = "Delete",
  confirmingLabel = "Deleting...",
  isConfirming = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-sm shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded mb-4">{error}</p>
        )}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-muted/80 rounded-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-4 py-2 text-sm text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-sm transition-colors disabled:opacity-50"
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
