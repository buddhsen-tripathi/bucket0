
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  MoreVertical,
  UserMinus,
  Loader2,
  User,
  Mail,
  Clock,
  X,
  Shield,
  Upload,
  Download,
  Trash2,
  Share2,
  Activity,
  Check,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

interface Member {
  userId: string;
  role: string;
  roleName: string;
  roleId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    imageUrl?: string;
  };
  permissions: {
    canUpload: boolean;
    canDownload: boolean;
    canDelete: boolean;
    canShare: boolean;
    canManageMembers: boolean;
    canViewActivity: boolean;
    canChat: boolean;
  };
  joinedAt: string;
  isOwner: boolean;
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface MembersListProps {
  teamId: string;
  isOwner: boolean;
  canManageMembers: boolean;
  onMemberCountChange: (count: number) => void;
}

interface ConfirmAction {
  type: "cancel-invite" | "remove-member";
  id: string;
  label: string;
}

export default function MembersList({
  teamId,
  isOwner,
  canManageMembers,
  onMemberCountChange,
}: MembersListProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [cancellingInvite, setCancellingInvite] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Permissions editing
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editPerms, setEditPerms] = useState({
    canUpload: false,
    canDownload: false,
    canDelete: false,
    canShare: false,
    canManageMembers: false,
    canViewActivity: false,
    canChat: false,
  });
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/teams/${teamId}/members`);
      if (!response.ok) {
        throw new Error("Failed to fetch members");
      }
      const data = await response.json();
      setMembers(data.members || []);
      return data.total || 0;
    } catch (err) {
      console.error("Error fetching members:", err);
      setError(err instanceof Error ? err.message : "Failed to load members");
      return null;
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const fetchInvitations = useCallback(async () => {
    if (!isOwner && !canManageMembers) return;
    try {
      const response = await fetch(`/api/teams/${teamId}/invitations`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error("Error fetching invitations:", err);
    }
  }, [teamId, isOwner, canManageMembers]);

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      setCancellingInvite(invitationId);
      setIsConfirming(true);
      const response = await fetch(
        `/api/teams/${teamId}/invitations/${invitationId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel invitation");
      }

      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      setConfirmAction(null);
    } catch (err) {
      console.error("Error cancelling invitation:", err);
      toast(err instanceof Error ? err.message : "Failed to cancel invitation");
    } finally {
      setCancellingInvite(null);
      setIsConfirming(false);
    }
  };

  const promptCancelInvitation = (invitationId: string, email: string) => {
    setConfirmAction({
      type: "cancel-invite",
      id: invitationId,
      label: email,
    });
  };

  useEffect(() => {
    fetchMembers().then((total) => {
      if (total !== null) {
        onMemberCountChange(total);
      }
    });
    fetchInvitations();
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveMember = async (userId: string) => {
    try {
      setRemoving(userId);
      setMenuOpen(null);
      setIsConfirming(true);

      const response = await fetch(`/api/teams/${teamId}/members/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove member");
      }

      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      onMemberCountChange(members.length - 1);
      setConfirmAction(null);
    } catch (err) {
      console.error("Error removing member:", err);
      toast(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemoving(null);
      setIsConfirming(false);
    }
  };

  const promptRemoveMember = (userId: string, name: string) => {
    setConfirmAction({
      type: "remove-member",
      id: userId,
      label: name,
    });
  };

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "cancel-invite") {
      handleCancelInvitation(confirmAction.id);
    } else if (confirmAction.type === "remove-member") {
      handleRemoveMember(confirmAction.id);
    }
  };

  const openPermissions = (member: Member) => {
    setEditingMember(member);
    setEditPerms({ ...member.permissions });
    setMenuOpen(null);
  };

  const handleSavePermissions = async () => {
    if (!editingMember) return;
    try {
      setSavingPerms(true);
      const response = await fetch(
        `/api/teams/${teamId}/members/${editingMember.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editPerms),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update permissions");
      }
      // Update local state
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === editingMember.userId
            ? { ...m, permissions: { ...editPerms } }
            : m
        )
      );
      setEditingMember(null);
      toast("Permissions updated", "success");
    } catch (err) {
      console.error("Error updating permissions:", err);
      toast(err instanceof Error ? err.message : "Failed to update permissions");
    } finally {
      setSavingPerms(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
        <button
          onClick={fetchMembers}
          className="mt-4 text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "Expired";
    if (diffDays === 0) return "Expires today";
    if (diffDays === 1) return "Expires tomorrow";
    return `Expires in ${diffDays} days`;
  };

  return (
    <div className="space-y-6">
      {/* Pending Invitations */}
      {(isOwner || canManageMembers) && invitations.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Mail size={18} />
              Pending Invitations
              <span className="text-xs bg-warning/10 text-warning dark:text-warning px-2 py-0.5 rounded-full">
                {invitations.length}
              </span>
            </h3>
          </div>
          <div className="divide-y divide-border">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{invitation.email}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      {formatExpiryDate(invitation.expiresAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => promptCancelInvitation(invitation.id, invitation.email)}
                  disabled={cancellingInvite === invitation.id}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                  title="Cancel invitation"
                >
                  {cancellingInvite === invitation.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <X size={16} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="bg-card border border-border rounded-lg">
        <div className="divide-y divide-border">
          {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              {member.user?.imageUrl ? (
                <img
                  src={member.user.imageUrl}
                  alt={member.user.name || "Member"}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
              )}

              {/* Info */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {member.user?.name || member.user?.email || "Unknown User"}
                  </span>
                  {member.isOwner && (
                    <span className="flex items-center gap-1 text-xs bg-warning/10 text-warning dark:text-warning px-1.5 py-0.5 rounded">
                      <Crown size={10} />
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {member.user?.email}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Permissions badges */}
              <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {member.permissions.canUpload && (
                  <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    Upload
                  </span>
                )}
                {member.permissions.canDownload && (
                  <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    Download
                  </span>
                )}
                {member.permissions.canDelete && (
                  <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    Delete
                  </span>
                )}
                {member.permissions.canShare && (
                  <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    Share
                  </span>
                )}
                {member.permissions.canManageMembers && (
                  <span className="text-[11px] bg-primary/10 px-1.5 py-0.5 rounded text-primary">
                    Admin
                  </span>
                )}
              </div>

              {/* Menu */}
              {!member.isOwner && (isOwner || canManageMembers) && (
                <div className={`transition-opacity ${menuOpen === member.userId ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                  <button
                    ref={(el) => { menuButtonRefs.current[member.userId] = el; }}
                    onClick={() => {
                      if (menuOpen === member.userId) {
                        setMenuOpen(null);
                      } else {
                        const btn = menuButtonRefs.current[member.userId];
                        if (btn) {
                          const rect = btn.getBoundingClientRect();
                          setMenuPos({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                        }
                        setMenuOpen(member.userId);
                      }
                    }}
                    className="p-1.5 hover:bg-muted rounded transition-colors"
                    disabled={removing === member.userId}
                  >
                    {removing === member.userId ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <MoreVertical size={16} />
                    )}
                  </button>

                  {menuOpen === member.userId && createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setMenuOpen(null)}
                      />
                      <div
                        ref={dropdownRef}
                        style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
                        className="z-[9999] bg-card border border-border rounded-sm shadow-xl overflow-hidden min-w-[190px] animate-in fade-in zoom-in-95 duration-100"
                      >
                        <button
                          onClick={() => openPermissions(member)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                        >
                          <Shield size={18} className="text-muted-foreground flex-shrink-0" />
                          <span>Manage permissions</span>
                        </button>
                        <div className="border-t border-border" />
                        <button
                          onClick={() => promptRemoveMember(member.userId, member.user?.name || member.user?.email || "this member")}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors whitespace-nowrap"
                        >
                          <UserMinus size={18} className="flex-shrink-0" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        title={
          confirmAction?.type === "cancel-invite"
            ? "Cancel Invitation"
            : "Remove Member"
        }
        message={
          confirmAction?.type === "cancel-invite"
            ? `Are you sure you want to cancel the invitation for ${confirmAction?.label}?`
            : `Are you sure you want to remove ${confirmAction?.label} from the team?`
        }
        confirmLabel={confirmAction?.type === "cancel-invite" ? "Cancel Invitation" : "Remove"}
        variant={confirmAction?.type === "cancel-invite" ? "warning" : "danger"}
        isLoading={isConfirming}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Permissions Modal */}
      {editingMember && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !savingPerms && setEditingMember(null)}
          />
          <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {editingMember.user?.imageUrl ? (
                    <img
                      src={editingMember.user.imageUrl}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <User size={16} className="text-primary" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {editingMember.user?.name || "Member"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {editingMember.user?.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingMember(null)}
                  disabled={savingPerms}
                  className="p-1.5 hover:bg-muted rounded-sm transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-2">
              {([
                { key: "canUpload" as const, label: "Upload files", icon: Upload },
                { key: "canDownload" as const, label: "Download files", icon: Download },
                { key: "canDelete" as const, label: "Delete files", icon: Trash2 },
                { key: "canShare" as const, label: "Share files", icon: Share2 },
                { key: "canViewActivity" as const, label: "View activity", icon: Activity },
              ]).map((perm) => (
                <button
                  key={perm.key}
                  type="button"
                  onClick={() => setEditPerms((p) => ({ ...p, [perm.key]: !p[perm.key] }))}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <perm.icon size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">{perm.label}</span>
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    editPerms[perm.key]
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/30 bg-background"
                  }`}>
                    {editPerms[perm.key] && <Check size={14} className="text-primary-foreground" />}
                  </div>
                </button>
              ))}
            </div>

            <div className="p-5 border-t border-border flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingMember(null)}
                disabled={savingPerms}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {savingPerms && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
