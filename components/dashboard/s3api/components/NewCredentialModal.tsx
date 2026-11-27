
import {
  MdOutlineCheck,
  MdOutlineWarning,
  MdOutlineContentCopy,
  MdOutlineVisibility,
  MdOutlineVisibilityOff,
} from "react-icons/md";
import type { NewCredential } from "../types";

interface NewCredentialModalProps {
  credential: NewCredential;
  showSecret: boolean;
  copiedField: string | null;
  onToggleSecret: () => void;
  onCopy: (text: string, field: string) => void;
  onClose: () => void;
}

export function NewCredentialModal({
  credential,
  showSecret,
  copiedField,
  onToggleSecret,
  onCopy,
  onClose,
}: NewCredentialModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded shadow-xl max-w-lg w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
            <MdOutlineCheck className="text-success" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Access Key Created</h3>
            <p className="text-sm text-muted-foreground">{credential.name}</p>
          </div>
        </div>

        <div className="bg-warning/10 border border-warning/20 rounded-sm p-3 mb-4">
          <div className="flex items-start gap-2">
            <MdOutlineWarning className="text-warning mt-0.5" size={18} />
            <p className="text-sm text-warning dark:text-warning">
              Save your secret access key now. You won&apos;t be able to see it again.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Access Key ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-foreground bg-muted px-3 py-2 rounded border border-border font-mono">
                {credential.accessKeyId}
              </code>
              <button
                onClick={() => onCopy(credential.accessKeyId, "newAccessKeyId")}
                className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-sm"
              >
                {copiedField === "newAccessKeyId" ? (
                  <MdOutlineCheck size={16} className="text-success" />
                ) : (
                  <MdOutlineContentCopy size={16} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Secret Access Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-foreground bg-muted px-3 py-2 rounded border border-border font-mono overflow-hidden">
                {showSecret ? credential.secretAccessKey : "•".repeat(40)}
              </code>
              <button
                onClick={onToggleSecret}
                className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-sm"
              >
                {showSecret ? <MdOutlineVisibilityOff size={16} /> : <MdOutlineVisibility size={16} />}
              </button>
              <button
                onClick={() => onCopy(credential.secretAccessKey, "newSecretKey")}
                className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-sm"
              >
                {copiedField === "newSecretKey" ? (
                  <MdOutlineCheck size={16} className="text-success" />
                ) : (
                  <MdOutlineContentCopy size={16} />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-primary-foreground bg-primary hover:bg-primary/90 rounded-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
