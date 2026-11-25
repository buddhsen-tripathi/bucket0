
import { MdOutlineContentCopy, MdOutlineCheck, MdOutlineDelete, MdOutlineAdd } from "react-icons/md";
import type { Credential } from "../types";

const S3_ENDPOINT = "https://s3.bucket0.com";

interface CredentialsModalProps {
  credentials: Credential[];
  maxKeys: number;
  copiedField: string | null;
  deletingId: string | null;
  onCopy: (text: string, field: string) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export function CredentialsModal({
  credentials,
  maxKeys,
  copiedField,
  deletingId,
  onCopy,
  onDelete,
  onCreateNew,
  onClose,
}: CredentialsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">Manage Access Keys</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Endpoint */}
        <div className="bg-muted/30 border border-border rounded p-4 mb-6">
          <p className="text-xs text-muted-foreground mb-2">S3 Endpoint</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm text-foreground font-mono">{S3_ENDPOINT}</code>
            <button
              onClick={() => onCopy(S3_ENDPOINT, "modal-endpoint")}
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              {copiedField === "modal-endpoint" ? (
                <MdOutlineCheck size={16} className="text-green-500" />
              ) : (
                <MdOutlineContentCopy size={16} />
              )}
            </button>
          </div>
        </div>

        {/* Keys */}
        <div className="space-y-3 mb-6">
          {credentials.map((cred) => (
            <div key={cred.id} className="bg-background border border-border rounded p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium text-foreground">{cred.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-muted-foreground font-mono">{cred.accessKeyId}</code>
                    <button
                      onClick={() => onCopy(cred.accessKeyId, `modal-key-${cred.id}`)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      {copiedField === `modal-key-${cred.id}` ? (
                        <MdOutlineCheck size={12} className="text-green-500" />
                      ) : (
                        <MdOutlineContentCopy size={12} />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => onDelete(cred.id)}
                  disabled={deletingId === cred.id}
                  className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <MdOutlineDelete size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {credentials.length < maxKeys && (
          <button
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-border hover:border-primary/50 rounded text-muted-foreground hover:text-primary transition-colors"
          >
            <MdOutlineAdd size={18} />
            Create New Access Key
          </button>
        )}
      </div>
    </div>
  );
}
