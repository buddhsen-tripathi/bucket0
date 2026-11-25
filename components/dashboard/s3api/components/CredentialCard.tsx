
import { MdOutlineContentCopy, MdOutlineCheck, MdOutlineDelete } from "react-icons/md";
import type { Credential } from "../types";

interface CredentialCardProps {
  credential: Credential;
  copiedField: string | null;
  isDeleting: boolean;
  onCopy: (text: string, field: string) => void;
  onDelete: () => void;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CredentialCard({
  credential,
  copiedField,
  isDeleting,
  onCopy,
  onDelete,
}: CredentialCardProps) {
  const copyFieldId = `key-${credential.id}`;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-foreground">{credential.name}</span>
            {!credential.isActive && (
              <span className="px-1.5 py-0.5 text-xs bg-destructive/10 text-destructive rounded-sm">
                Inactive
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-sm font-mono">
              {credential.accessKeyId}
            </code>
            <button
              onClick={() => onCopy(credential.accessKeyId, copyFieldId)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copiedField === copyFieldId ? (
                <MdOutlineCheck size={14} className="text-green-500" />
              ) : (
                <MdOutlineContentCopy size={14} />
              )}
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Created {formatDate(credential.createdAt)} · Last used {formatDate(credential.lastUsedAt)}
          </div>
        </div>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <MdOutlineDelete size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
