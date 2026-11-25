
import React, { useState, useEffect, useCallback } from "react";
import { X, Link2, Copy, Check, Globe, Lock, Users, Download, FolderPlus } from "lucide-react";

// Access types for sharing:
// - "restricted": Only the owner can access (no sharing)
// - "protected": Only authenticated Bucket0 users can access
// - "anyone": Anyone with the link can access (no auth required)
type AccessType = "restricted" | "protected" | "anyone";

// Toast notification component
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4 ${
      type === "success" ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground"
    }`}>
      {type === "success" ? <Check size={16} /> : <X size={16} />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// Toggle switch component
function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileKey: string;
  targetType?: "file" | "folder";
  onCreateLink: (
    key: string,
    expiresInHours?: number,
    accessType?: string,
    allowDownload?: boolean,
    allowAddToDrive?: boolean,
    targetType?: "file" | "folder"
  ) => Promise<{ url: string }>;
  onRevokeLink?: (linkId: string) => Promise<void>;
  mode?: "cloud" | "teams";
  teamId?: string;
}

export default function ShareModal({
  isOpen,
  onClose,
  fileName,
  fileKey,
  targetType = "file",
  onCreateLink,
  onRevokeLink,
  mode = "cloud",
  teamId,
}: ShareModalProps) {
  const [accessType, setAccessType] = useState<AccessType>("restricted");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [existingAccessType, setExistingAccessType] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Permission states
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowAddToDrive, setAllowAddToDrive] = useState(true);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  };

  // Fetch existing share status when modal opens
  const fetchExistingShare = useCallback(async () => {
    if (!fileKey) return;

    try {
      setInitialLoading(true);

      // Use the correct API based on mode
      const url = mode === "teams" && teamId
        ? `/api/teams/${teamId}/files/share?key=${encodeURIComponent(fileKey)}`
        : `/api/cloud/share?key=${encodeURIComponent(fileKey)}&targetType=${targetType}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.exists) {
        // Map server access type to UI access type
        const serverAccessType = data.accessType || "anyone";
        setAccessType(serverAccessType as AccessType);
        setExistingAccessType(serverAccessType);
        setShareLink(data.shareUrl);
        setLinkId(data.linkId);
        // Load permission flags
        setAllowDownload(data.allowDownload !== false);
        setAllowAddToDrive(data.allowAddToDrive !== false);
      } else {
        setAccessType("restricted");
        setExistingAccessType(null);
        setShareLink(null);
        setLinkId(null);
        setAllowDownload(true);
        setAllowAddToDrive(true);
      }
    } catch {
      // Ignore errors, just start fresh
    } finally {
      setInitialLoading(false);
    }
  }, [fileKey, mode, teamId, targetType]);

  // Fetch existing share when modal opens
  useEffect(() => {
    if (isOpen && fileKey) {
      fetchExistingShare();
    }
  }, [isOpen, fileKey, fetchExistingShare]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShareLink(null);
      setLinkId(null);
      setAccessType("restricted");
      setExistingAccessType(null);
      setCopied(false);
      setError(null);
      setRevoking(false);
      setToast(null);
      setAllowDownload(true);
      setAllowAddToDrive(true);
    }
  }, [isOpen]);

  // Helper to copy link to clipboard
  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      return false;
    }
  };

  const handleGenerateLink = async (type: AccessType, download = allowDownload, addToDrive = allowAddToDrive) => {
    try {
      setLoading(true);
      setError(null);
      const result = await onCreateLink(fileKey, undefined, type, download, addToDrive, targetType);
      setShareLink(result.url);
      setExistingAccessType(type);
      // Extract linkId from URL (handles both /s/ and /ts/ patterns)
      const linkIdMatch = result.url.match(/\/(?:s|ts)\/([^/]+)$/);
      setLinkId(linkIdMatch ? linkIdMatch[1] : null);

      // Auto-copy to clipboard
      const copied = await copyToClipboard(result.url);
      if (copied) {
        showToast("Link copied to clipboard");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unable to create share link. Please try again later.";
      setError(errorMessage);
      showToast("Failed to create share link", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;

    const success = await copyToClipboard(shareLink);
    if (success) {
      showToast("Link copied to clipboard");
    } else {
      setError("Failed to copy to clipboard");
    }
  };

  const handleAccessChange = async (type: AccessType) => {
    // Don't do anything if already on this type
    if (type === accessType) return;

    setAccessType(type);
    setError(null);

    // If switching to restricted and there's an existing link, revoke it silently
    if (type === "restricted" && shareLink && linkId && onRevokeLink) {
      try {
        setRevoking(true);
        await onRevokeLink(linkId);
        setShareLink(null);
        setLinkId(null);
        setExistingAccessType(null);
        showToast("Access restricted - link revoked");
      } catch {
        setError("Failed to revoke link. Please try again.");
        showToast("Failed to revoke link", "error");
        setAccessType(existingAccessType as AccessType || "anyone");
      } finally {
        setRevoking(false);
      }
    } else if (type === "restricted" && !shareLink) {
      // Just switching to restricted without an existing link
      showToast("Access set to restricted");
    } else if (type === "anyone" || type === "protected") {
      // Auto-generate and copy link when selecting sharing options
      await handleGenerateLink(type);
    }
  };

  // Handle permission toggle changes - update the link with new permissions
  const handlePermissionChange = async (permission: "download" | "addToDrive", value: boolean) => {
    if (permission === "download") {
      setAllowDownload(value);
    } else {
      setAllowAddToDrive(value);
    }

    // If there's an active share link, update it with new permissions
    if (shareLink && accessType !== "restricted") {
      const newDownload = permission === "download" ? value : allowDownload;
      const newAddToDrive = permission === "addToDrive" ? value : allowAddToDrive;
      await handleGenerateLink(accessType, newDownload, newAddToDrive);
    }
  };

  if (!isOpen) return null;

  if (initialLoading) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-card rounded-sm shadow-xl border border-border w-full max-w-md p-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-muted-foreground">Loading share settings...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-sm shadow-xl border border-border w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Link2 size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Share</h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/70 rounded-sm transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* File name */}
          <div className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/70 rounded-sm transition-colors border border-border">
            <div className="text-sm text-muted-foreground truncate flex-1">
              Sharing {targetType}: <span className="text-foreground font-medium">{fileName}</span>
            </div>
          </div>

          {/* Access Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">General access</label>

            <button
              onClick={() => handleAccessChange("restricted")}
              disabled={loading || revoking}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all disabled:opacity-50 ${
                accessType === "restricted"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className={`p-2 rounded-full ${accessType === "restricted" ? "bg-primary/10" : "bg-muted"}`}>
                {revoking && accessType === "restricted" ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Lock size={16} className={accessType === "restricted" ? "text-primary" : "text-muted-foreground"} />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-foreground">Restricted</div>
                <div className="text-xs text-muted-foreground">Only you can access</div>
              </div>
              {accessType === "restricted" && !revoking && (
                <Check size={16} className="text-primary" />
              )}
            </button>

            <button
              onClick={() => handleAccessChange("protected")}
              disabled={loading || revoking}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all disabled:opacity-50 ${
                accessType === "protected"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className={`p-2 rounded-full ${accessType === "protected" ? "bg-primary/10" : "bg-muted"}`}>
                {loading && accessType === "protected" ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Users size={16} className={accessType === "protected" ? "text-primary" : "text-muted-foreground"} />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-foreground">Bucket0 users</div>
                <div className="text-xs text-muted-foreground">Only signed-in Bucket0 users can access</div>
              </div>
              {accessType === "protected" && !loading && (
                <Check size={16} className="text-primary" />
              )}
            </button>

            <button
              onClick={() => handleAccessChange("anyone")}
              disabled={loading || revoking}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all disabled:opacity-50 ${
                accessType === "anyone"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className={`p-2 rounded-full ${accessType === "anyone" ? "bg-primary/10" : "bg-muted"}`}>
                {loading && accessType === "anyone" ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Globe size={16} className={accessType === "anyone" ? "text-primary" : "text-muted-foreground"} />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-foreground">Anyone with the link</div>
                <div className="text-xs text-muted-foreground">Anyone on the internet can view</div>
              </div>
              {accessType === "anyone" && !loading && (
                <Check size={16} className="text-primary" />
              )}
            </button>
          </div>

          {/* Permission toggles - only show when sharing is enabled */}
          {accessType !== "restricted" && (
            <div className="space-y-3 pt-2 border-t border-border">
              <label className="text-sm font-medium text-foreground">Viewer permissions</label>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Allow download</span>
                </div>
                <Toggle
                  checked={allowDownload}
                  onChange={(value) => handlePermissionChange("download", value)}
                  disabled={loading}
                />
              </div>

              {targetType === "file" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderPlus size={16} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Allow save to drive</span>
                </div>
                <Toggle
                  checked={allowAddToDrive}
                  onChange={(value) => handlePermissionChange("addToDrive", value)}
                  disabled={loading}
                />
              </div>
              )}

              <p className="text-xs text-muted-foreground">
                {targetType === "folder"
                  ? "Folder links let viewers browse the folder and open individual files."
                  : "Both download and save to drive require viewers to be signed in."}
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-sm">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Generated link */}
          {shareLink && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Share link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-muted/30 border border-border rounded-sm text-sm text-foreground truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className={`p-2 rounded-sm transition-colors ${
                    copied
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted hover:bg-muted/70 text-foreground"
                  }`}
                  title={copied ? "Copied!" : "Copy link"}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
            >
              Done
            </button>
            {shareLink && (
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm transition-colors flex items-center gap-2"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy link"}
              </button>
            )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
