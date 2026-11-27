
import { useState } from "react";
import Link from "@/web/compat/link";
import Image from "@/web/compat/image";
import { Logo } from "@/components/Logo";
import { Download, CloudUpload, Check, Loader2, Users } from "lucide-react";

interface ShareToolbarProps {
  fileName: string;
  streamUrl: string;
  shareLinkId: string;
  shareType: "personal" | "team";
  teamName?: string;
  allowDownload: boolean;
  allowAddToDrive: boolean;
  isAuthenticated: boolean;
  alreadySavedAs: string | null; // Filename if already saved, null otherwise
}

export default function ShareToolbar({
  fileName,
  streamUrl,
  shareLinkId,
  shareType,
  teamName,
  allowDownload,
  allowAddToDrive,
  isAuthenticated,
  alreadySavedAs,
}: ShareToolbarProps) {
  const [addingToDrive, setAddingToDrive] = useState(false);
  const [addedToDrive, setAddedToDrive] = useState(!!alreadySavedAs);
  const [error, setError] = useState<string | null>(null);

  // Build redirect URL for sign-in
  const currentPath = shareType === "team" ? `/ts/${shareLinkId}` : `/s/${shareLinkId}`;
  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;

  const handleAddToDrive = async () => {
    if (!isAuthenticated) {
      window.location.href = signInUrl;
      return;
    }

    try {
      setAddingToDrive(true);
      setError(null);

      const response = await fetch("/api/cloud/share/add-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareLinkId,
          shareType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Handle "already saved" as success (409 conflict)
        if (response.status === 409) {
          setAddedToDrive(true);
          return;
        }
        throw new Error(data.error || "Failed to add file to your drive");
      }

      setAddedToDrive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add file");
    } finally {
      setAddingToDrive(false);
    }
  };

  const handleDownload = () => {
    if (!isAuthenticated) {
      window.location.href = signInUrl;
      return;
    }

    const downloadUrl = `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}download=true`;
    window.location.href = downloadUrl;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: Logo and file info */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex-shrink-0"
          >
            <Logo size={32} />
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            {teamName && (
              <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex-shrink-0">
                <Users className="w-3 h-3" />
                <span className="hidden sm:inline">{teamName}</span>
              </span>
            )}
            <h1 className="text-sm font-medium text-foreground truncate">
              {fileName}
            </h1>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {error && (
            <span className="text-xs text-destructive max-w-[150px] truncate hidden sm:block">
              {error}
            </span>
          )}

          {allowAddToDrive && (
            <button
              onClick={handleAddToDrive}
              disabled={addingToDrive || addedToDrive}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                addedToDrive
                  ? "bg-success/10 text-success cursor-default"
                  : "bg-muted hover:bg-muted/70 text-foreground"
              } disabled:opacity-50`}
              title={
                !isAuthenticated
                  ? "Sign in to save to your drive"
                  : addedToDrive
                    ? "Saved to your drive"
                    : "Save a copy to your Bucket0 storage"
              }
            >
              {addingToDrive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : addedToDrive ? (
                <Check className="w-4 h-4" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {addedToDrive ? "Saved" : "Save to Drive"}
              </span>
            </button>
          )}

          {allowDownload && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
              title={!isAuthenticated ? "Sign in to download" : "Download file"}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
