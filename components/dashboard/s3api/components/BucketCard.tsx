
import { MdOutlineStorage, MdOutlineDelete } from "react-icons/md";
import type { Bucket } from "../types";

interface BucketCardProps {
  bucket: Bucket;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function BucketCard({ bucket, isDeleting, onSelect, onDelete }: BucketCardProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <MdOutlineStorage className="text-muted-foreground" size={20} />
        <div>
          <span className="font-mono text-sm text-foreground">{bucket.name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {bucket.objectCount} objects
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{bucket.storageUsedFormatted}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isDeleting}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <MdOutlineDelete size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
