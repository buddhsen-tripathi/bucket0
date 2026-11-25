
import { MdOutlineContentCopy, MdOutlineCheck } from "react-icons/md";

const S3_ENDPOINT = "https://s3.bucket0.com";

interface EndpointInfoProps {
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  variant?: "card" | "inline";
}

export function EndpointInfo({ copiedField, onCopy, variant = "card" }: EndpointInfoProps) {
  if (variant === "inline") {
    return (
      <div className="bg-card border border-border rounded p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">S3 Endpoint</p>
            <code className="text-sm text-foreground font-mono">{S3_ENDPOINT}</code>
          </div>
          <button
            onClick={() => onCopy(S3_ENDPOINT, "endpoint")}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {copiedField === "endpoint" ? (
              <MdOutlineCheck size={16} className="text-green-500" />
            ) : (
              <MdOutlineContentCopy size={16} />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded p-4">
      <p className="text-xs text-muted-foreground mb-2">S3 Endpoint</p>
      <div className="flex items-center gap-2">
        <code className="text-sm text-foreground bg-muted px-3 py-2 rounded border border-border flex-1 font-mono">
          {S3_ENDPOINT}
        </code>
        <button
          onClick={() => onCopy(S3_ENDPOINT, "endpoint")}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors border border-border rounded-sm"
        >
          {copiedField === "endpoint" ? (
            <MdOutlineCheck size={16} className="text-green-500" />
          ) : (
            <MdOutlineContentCopy size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
