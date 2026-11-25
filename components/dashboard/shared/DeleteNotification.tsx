
import React, { useEffect, useRef } from "react";
import { MdClose, MdUndo, MdOutlineDelete } from "react-icons/md";

export interface DeleteItem {
  key: string;
  name: string;
}

interface DeleteNotificationProps {
  items: DeleteItem[];
  onUndo: () => void;
  onComplete: () => void;
}

export default function DeleteNotification({ items, onUndo, onComplete }: DeleteNotificationProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = React.useState(3);

  useEffect(() => {
    // Reset countdown when items change
    setCountdown(3);

    if (items.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-complete after 3 seconds (matches toast duration)
    timerRef.current = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      clearInterval(countdownInterval);
    };
  }, [items, onComplete]);

  if (items.length === 0) return null;

  const handleUndo = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onUndo();
  };

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:bottom-6 md:right-6 md:w-96 bg-card border border-border rounded-sm shadow-2xl z-50 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <MdOutlineDelete size={18} className="text-destructive" />
          <span className="font-medium text-sm text-foreground">
            {items.length === 1
              ? "Deleting 1 item"
              : `Deleting ${items.length} items`}
          </span>
          {countdown > 0 && (
            <span className="text-xs text-muted-foreground">
              ({countdown}s)
            </span>
          )}
        </div>
        <button
          onClick={handleUndo}
          className="p-1.5 hover:bg-muted rounded-sm transition-colors"
          title="Close"
        >
          <MdClose size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex-1 min-w-0 text-sm text-muted-foreground">
          {items.length === 1 ? (
            <span className="truncate block">{items[0].name}</span>
          ) : items.length <= 3 ? (
            <span className="truncate block">{items.map(i => i.name).join(", ")}</span>
          ) : (
            <span>{items.slice(0, 2).map(i => i.name).join(", ")} and {items.length - 2} more...</span>
          )}
        </div>

        {/* Undo button */}
        <button
          onClick={handleUndo}
          className="flex-shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-sm transition-colors border border-primary/20"
        >
          <MdUndo size={14} />
          Undo
        </button>
      </div>
    </div>
  );
}
