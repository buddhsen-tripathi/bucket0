
import { useState, useMemo } from "react";
import {
  X,
  Loader2,
  UserPlus,
  Mail,
  Check,
  Upload,
  Download,
  Trash2,
  Share2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface PendingInvitation {
  id: string;
  email: string;
  resendCount: number;
  maxResendCount: number;
  canResend: boolean;
  expiresAt: string;
}

interface InviteResult {
  email: string;
  success: boolean;
  error?: string;
  isPending?: boolean;
  pendingInvitation?: PendingInvitation;
}

interface InviteMemberModalProps {
  teamId: string;
  onClose: () => void;
  onInvited: () => void;
}

interface PermissionCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function PermissionCard({
  icon,
  label,
  description,
  checked,
  onChange,
}: PermissionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-start gap-3 p-3 rounded-sm border transition-all text-left ${
        checked
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-muted-foreground/30"
      }`}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
          checked
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-medium text-sm ${
              checked ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
              checked
                ? "border-primary bg-primary"
                : "border-muted-foreground/40"
            }`}
          >
            {checked && <Check size={10} className="text-primary-foreground" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

export default function InviteMemberModal({
  teamId,
  onClose,
  onInvited,
}: InviteMemberModalProps) {
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);

  // Permission settings
  const [canUpload, setCanUpload] = useState(true);
  const [canDownload, setCanDownload] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [canShare, setCanShare] = useState(true);

  // Parse and validate emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const parsedEmails = useMemo(() => {
    if (!emailInput.trim()) return { valid: [], invalid: [] };

    const emails = emailInput
      .split(/[,\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const unique = [...new Set(emails)];
    const valid: string[] = [];
    const invalid: string[] = [];

    unique.forEach((email) => {
      if (emailRegex.test(email)) {
        valid.push(email);
      } else {
        invalid.push(email);
      }
    });

    return { valid, invalid };
  }, [emailInput]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedEmails.valid.length === 0) {
      setError("Please enter at least one valid email address");
      return;
    }

    if (parsedEmails.invalid.length > 0) {
      setError(`Invalid email${parsedEmails.invalid.length > 1 ? 's' : ''}: ${parsedEmails.invalid.join(", ")}`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const results: InviteResult[] = [];

      // Send invitations sequentially to avoid rate limiting issues
      for (const email of parsedEmails.valid) {
        try {
          const response = await fetch(`/api/teams/${teamId}/invitations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              canUpload,
              canDownload,
              canDelete,
              canShare,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            if (response.status === 409 && data.pendingInvitation) {
              results.push({
                email,
                success: false,
                isPending: true,
                pendingInvitation: data.pendingInvitation,
                error: "Already pending",
              });
            } else {
              results.push({
                email,
                success: false,
                error: data.error || "Failed to send",
              });
            }
          } else {
            results.push({ email, success: true });
          }
        } catch {
          results.push({ email, success: false, error: "Network error" });
        }
      }

      setInviteResults(results);

      // If any succeeded, notify parent
      if (results.some((r) => r.success)) {
        onInvited();
      }
    } catch (err) {
      console.error("Error sending invitations:", err);
      setError(err instanceof Error ? err.message : "Failed to send invitations");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (invitation: PendingInvitation) => {
    try {
      setResending(true);
      setError(null);

      const response = await fetch(
        `/api/teams/${teamId}/invitations/${invitation.id}/resend`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend invitation");
      }

      // Update the result in inviteResults
      if (inviteResults) {
        setInviteResults(
          inviteResults.map((r) =>
            r.email === invitation.email
              ? {
                  ...r,
                  pendingInvitation: {
                    ...invitation,
                    resendCount: data.resendCount,
                    canResend: data.remainingResends > 0,
                  },
                }
              : r
          )
        );
      }

      onInvited();
    } catch (err) {
      console.error("Error resending invitation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to resend invitation"
      );
    } finally {
      setResending(false);
    }
  };

  const successCount = inviteResults?.filter((r) => r.success).length || 0;
  const pendingCount = inviteResults?.filter((r) => r.isPending).length || 0;
  const failedCount = inviteResults?.filter((r) => !r.success && !r.isPending).length || 0;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-sm shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Invite Members
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {inviteResults ? (
            <div className="p-4 space-y-4">
              {/* Success state - all invitations sent */}
              {successCount > 0 && failedCount === 0 && pendingCount === 0 && (
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {successCount === 1 ? "Invitation Sent!" : "All Invitations Sent!"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {successCount === 1
                      ? "Your invitation has been sent successfully."
                      : `${successCount} invitations have been sent successfully.`}
                  </p>
                </div>
              )}

              {/* Mixed results summary */}
              {(pendingCount > 0 || failedCount > 0) && (
                <div className="flex items-center justify-center gap-4 p-3 bg-muted/50 rounded-lg">
                  {successCount > 0 && (
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle size={16} />
                      <span className="text-sm font-medium">{successCount} sent</span>
                    </div>
                  )}
                  {pendingCount > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertCircle size={16} />
                      <span className="text-sm font-medium">{pendingCount} pending</span>
                    </div>
                  )}
                  {failedCount > 0 && (
                    <div className="flex items-center gap-1.5 text-destructive">
                      <XCircle size={16} />
                      <span className="text-sm font-medium">{failedCount} failed</span>
                    </div>
                  )}
                </div>
              )}

              {/* Results list - show emails for success state */}
              <div className="space-y-2">
                {inviteResults.map((result) => (
                  <div
                    key={result.email}
                    className={`p-3 rounded-lg border ${
                      result.success
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : result.isPending
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-destructive/5 border-destructive/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {result.success ? (
                          <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                        ) : result.isPending ? (
                          <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                        ) : (
                          <XCircle size={16} className="text-destructive flex-shrink-0" />
                        )}
                        <span className="text-sm text-foreground truncate">
                          {result.email}
                        </span>
                      </div>
                      {result.isPending && result.pendingInvitation?.canResend && (
                        <button
                          onClick={() => handleResend(result.pendingInvitation!)}
                          disabled={resending}
                          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {resending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                          Resend
                        </button>
                      )}
                    </div>
                    {result.error && !result.isPending && (
                      <p className="text-xs text-destructive mt-1 ml-6">
                        {result.error}
                      </p>
                    )}
                    {result.isPending && (
                      <div className="mt-1 ml-6 space-y-0.5">
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Already has a pending invitation
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Check spam folder if not received
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setInviteResults(null);
                    setEmailInput("");
                  }}
                  className="flex-1 px-4 py-2.5 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                >
                  Invite More
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Email Addresses
                </label>
                <div className="relative flex items-center">
                  <Mail
                    size={16}
                    className="absolute left-3 text-muted-foreground pointer-events-none"
                  />
                  <input
                    id="email"
                    type="text"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="email@example.com, another@example.com"
                    className="w-full h-11 pl-10 pr-3 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    autoFocus
                  />
                </div>

                {/* Email preview */}
                {(parsedEmails.valid.length > 0 || parsedEmails.invalid.length > 0) && (
                  <div className="mt-2 space-y-2">
                    {parsedEmails.valid.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {parsedEmails.valid.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs rounded-full"
                          >
                            <Check size={10} />
                            {email}
                          </span>
                        ))}
                      </div>
                    )}
                    {parsedEmails.invalid.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {parsedEmails.invalid.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-destructive/10 text-destructive text-xs rounded-full"
                          >
                            <X size={10} />
                            {email}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Permissions {parsedEmails.valid.length > 1 && <span className="text-muted-foreground font-normal">(applies to all)</span>}
                </label>
                <div className="space-y-2">
                  <PermissionCard
                    icon={<Upload size={16} />}
                    label="Upload Files"
                    description="Can upload new files to the team"
                    checked={canUpload}
                    onChange={setCanUpload}
                  />
                  <PermissionCard
                    icon={<Download size={16} />}
                    label="Download Files"
                    description="Can download files from the team"
                    checked={canDownload}
                    onChange={setCanDownload}
                  />
                  <PermissionCard
                    icon={<Trash2 size={16} />}
                    label="Delete Files"
                    description="Can delete files they uploaded"
                    checked={canDelete}
                    onChange={setCanDelete}
                  />
                  <PermissionCard
                    icon={<Share2 size={16} />}
                    label="Share Files"
                    description="Can create share links for files"
                    checked={canShare}
                    onChange={setCanShare}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-border rounded text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || parsedEmails.valid.length === 0}
                  className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending...
                    </>
                  ) : parsedEmails.valid.length > 1 ? (
                    `Send ${parsedEmails.valid.length} Invitations`
                  ) : (
                    "Send Invitation"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
