
interface CreateKeyModalProps {
  keyName: string;
  isCreating: boolean;
  error: string | null;
  onKeyNameChange: (name: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function CreateKeyModal({
  keyName,
  isCreating,
  error,
  onKeyNameChange,
  onCreate,
  onClose,
}: CreateKeyModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-sm shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Create Access Key</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Key Name</label>
            <input
              type="text"
              value={keyName}
              onChange={(e) => onKeyNameChange(e.target.value)}
              placeholder="e.g., CLI Access"
              className="w-full px-3 py-2 bg-background border border-border rounded-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground bg-muted hover:bg-muted/80 rounded-sm"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={isCreating || !keyName.trim()}
            className="px-4 py-2 text-sm text-primary-foreground bg-primary hover:bg-primary/90 rounded-sm disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
