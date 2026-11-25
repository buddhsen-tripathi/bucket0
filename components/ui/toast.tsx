
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";

type ToastVariant = "error" | "success" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_DURATION = 4000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), TOAST_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss]);

  const icon =
    toast.variant === "error" ? <AlertCircle size={18} className="text-destructive flex-shrink-0" /> :
    toast.variant === "success" ? <CheckCircle size={18} className="text-green-500 flex-shrink-0" /> :
    <Info size={18} className="text-blue-500 flex-shrink-0" />;

  const borderColor =
    toast.variant === "error" ? "border-l-destructive" :
    toast.variant === "success" ? "border-l-green-500" :
    "border-l-blue-500";

  return (
    <div
      className={`bg-card border border-border ${borderColor} border-l-4 rounded-sm shadow-lg flex items-start gap-3 p-4 min-w-[300px] max-w-[420px] animate-in slide-in-from-bottom-2 fade-in duration-200`}
    >
      {icon}
      <p className="text-sm text-foreground flex-1 break-words">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 hover:bg-muted rounded transition-colors flex-shrink-0"
      >
        <X size={14} className="text-muted-foreground" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, variant: ToastVariant = "error") => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
