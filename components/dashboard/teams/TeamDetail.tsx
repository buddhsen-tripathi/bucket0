
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Users,
  Settings,
  UserPlus,
  Activity,
  MessageSquare,
  Crown,
  HardDrive,
  FileText,
  Loader2,
  Trash2,
  Shield,
  Pencil,
  Check,
  X,
  Upload,
  Download,
  Share2,
  UserCog,
  ArrowRightLeft,
  FolderOpen,
  Lock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { formatBytes } from "@/lib/payments/plans";
import { useToast } from "@/components/ui/toast";
import MembersList from "./MembersList";
import InviteMemberModal from "./InviteMemberModal";
import TeamActivity from "./TeamActivity";
import TeamChat from "./TeamChat";
import TeamFiles from "./TeamFiles";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface Team {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  storageUsage: number;
  fileCount: number;
  memberCount: number;
  createdAt: string;
  role: "owner" | "member";
  isOwner: boolean;
}

interface TeamPermissions {
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  canShare: boolean;
  canManageMembers: boolean;
  canViewActivity: boolean;
  canChat: boolean;
  canManageBilling: boolean;
  canDeleteTeam: boolean;
  isOwner: boolean;
}

interface TeamQuota {
  storageLimit: number;
  storageUsed: number;
  teamStorageUsed: number;
  availableStorage: number;
  maxFileSizeBytes: number;
  maxMembers: number;
  ownerPlan: string;
}

interface TeamFeatures {
  activityLogsEnabled: boolean;
  chatEnabled: boolean;
  shareLinksEnabled: boolean;
}

interface TeamDetailProps {
  team: Team;
  onBack: () => void;
  onTeamUpdated: (team: Team) => void;
  onTeamDeleted: () => void;
}

type TabType = "members" | "files" | "activity" | "chat" | "settings";

interface TeamMember {
  userId: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
    imageUrl?: string;
  };
  role: string;
  isOwner: boolean;
}

export default function TeamDetail({
  team,
  onBack,
  onTeamUpdated,
  onTeamDeleted,
}: TeamDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>("files");
  const [permissions, setPermissions] = useState<TeamPermissions | null>(null);
  const [quota, setQuota] = useState<TeamQuota | null>(null);
  const [features, setFeatures] = useState<TeamFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Settings state
  const [editingName, setEditingName] = useState(false);
  const [teamName, setTeamName] = useState(team.name);
  const [savingName, setSavingName] = useState(false);

  // Default permissions state
  const [defaultCanUpload, setDefaultCanUpload] = useState(true);
  const [defaultCanDownload, setDefaultCanDownload] = useState(true);
  const [defaultCanDelete, setDefaultCanDelete] = useState(false);
  const [defaultCanShare, setDefaultCanShare] = useState(true);
  const [savingDefaults, setSavingDefaults] = useState(false);

  // Transfer ownership state
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

  // Delete team confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Transfer ownership confirmation state
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  const { toast } = useToast();

  // Ref for dropdown click-outside
  const ownerDropdownRef = useRef<HTMLDivElement>(null);


  const fetchTeamDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/teams/${team.id}`);
      if (response.ok) {
        const data = await response.json();
        setPermissions(data.permissions);
        if (data.quota) {
          setQuota(data.quota);
        }
        if (data.features) {
          setFeatures(data.features);
        }
        if (data.team) {
          setTeamName(data.team.name);
          onTeamUpdated({
            ...team,
            ...data.team,
            role: data.permissions?.isOwner ? "owner" : "member",
            isOwner: data.permissions?.isOwner,
          });
        }
        // Set default permissions from team settings
        if (data.settings) {
          setDefaultCanUpload(data.settings.defaultCanUpload ?? true);
          setDefaultCanDownload(data.settings.defaultCanDownload ?? true);
          setDefaultCanDelete(data.settings.defaultCanDelete ?? false);
          setDefaultCanShare(data.settings.defaultCanShare ?? true);
        }
      }
    } catch (err) {
      console.error("Error fetching team details:", err);
    } finally {
      setLoading(false);
    }
  }, [team.id]);

  // Fetch team members for transfer ownership
  const fetchMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/teams/${team.id}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error("Error fetching members:", err);
    }
  }, [team.id]);

  // Save team name
  const handleSaveName = async () => {
    if (!teamName.trim() || teamName === team.name) {
      setEditingName(false);
      setTeamName(team.name);
      return;
    }

    try {
      setSavingName(true);
      const response = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update team name");
      }

      const data = await response.json();
      onTeamUpdated({ ...team, name: data.team.name });
      setEditingName(false);
      toast("Team name updated", "success");
    } catch (err) {
      console.error("Error updating team name:", err);
      toast(err instanceof Error ? err.message : "Failed to update team name", "error");
      setTeamName(team.name);
    } finally {
      setSavingName(false);
    }
  };

  // Save default permissions
  const handleSaveDefaultPermissions = async () => {
    try {
      setSavingDefaults(true);
      const response = await fetch(`/api/teams/${team.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultCanUpload,
          defaultCanDownload,
          defaultCanDelete,
          defaultCanShare,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update settings");
      }
      toast("Default permissions saved", "success");
    } catch (err) {
      console.error("Error updating settings:", err);
      toast(err instanceof Error ? err.message : "Failed to update settings", "error");
    } finally {
      setSavingDefaults(false);
    }
  };

  // Transfer ownership
  const handleTransferOwnership = async () => {
    if (!selectedNewOwner) return;
    setShowTransferConfirm(true);
  };

  const confirmTransferOwnership = async () => {
    try {
      setTransferring(true);
      setTransferError(null);
      const response = await fetch(`/api/teams/${team.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: selectedNewOwner }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to transfer ownership");
      }

      // Refresh team details
      fetchTeamDetails();
      setSelectedNewOwner("");
      setShowTransferConfirm(false);
      setTransferError(null);
      toast("Ownership transferred successfully", "success");
    } catch (err) {
      console.error("Error transferring ownership:", err);
      setTransferError(err instanceof Error ? err.message : "Failed to transfer ownership");
      setShowTransferConfirm(false);
    } finally {
      setTransferring(false);
    }
  };

  useEffect(() => {
    fetchTeamDetails();
  }, [fetchTeamDetails]);

  // Fetch members when settings tab is active
  useEffect(() => {
    if (activeTab === "settings" && permissions?.isOwner) {
      fetchMembers();
    }
  }, [activeTab, permissions?.isOwner, fetchMembers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setShowOwnerDropdown(false);
      }
    };

    if (showOwnerDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showOwnerDropdown]);

  const handleDeleteTeam = async () => {
    try {
      setDeleting(true);
      const response = await fetch(`/api/teams/${team.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete team");
      }

      setShowDeleteConfirm(false);
      onTeamDeleted();
    } catch (err) {
      console.error("Error deleting team:", err);
      toast(err instanceof Error ? err.message : "Failed to delete team", "error");
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode; show: boolean; locked?: boolean }[] = [
    { id: "members", label: "Members", icon: <Users size={16} />, show: true },
    {
      id: "files",
      label: "Files",
      icon: <FolderOpen size={16} />,
      show: permissions?.canDownload || permissions?.isOwner || false,
    },
    {
      id: "activity",
      label: "Activity",
      icon: <Activity size={16} />,
      show: (features?.activityLogsEnabled !== false) && (permissions?.canViewActivity || permissions?.isOwner || false),
    },
    {
      id: "chat",
      label: "Chat",
      icon: <MessageSquare size={16} />,
      show: features?.chatEnabled
        ? (permissions?.canChat || permissions?.isOwner || false)
        : (permissions?.isOwner || false),
      locked: features?.chatEnabled === false,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings size={16} />,
      show: permissions?.isOwner || false,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <button
            onClick={onBack}
            className="mt-0.5 p-2 hover:bg-muted rounded-sm transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{team.name}</h1>
              {team.isOwner && (
                <span className="flex items-center gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Crown size={12} />
                  Owner
                </span>
              )}
            </div>
            {/* Stats */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users size={14} />
                {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
              </span>
              <span className="flex items-center gap-1.5">
                <FileText size={14} />
                {team.fileCount} {team.fileCount === 1 ? "file" : "files"}
              </span>
              <span className="flex items-center gap-1.5">
                <HardDrive size={14} />
                {quota ? `${formatBytes(quota.availableStorage)} available` : formatBytes(team.storageUsage)}
              </span>
              {quota && (
                <span className="text-muted-foreground">
                  {formatBytes(team.storageUsage)} used by team
                </span>
              )}
            </div>
          </div>
        </div>

        {(permissions?.canManageMembers || permissions?.isOwner) && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto flex-shrink-0"
          >
            <UserPlus size={18} />
            Invite
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border -mx-4 px-4 sm:mx-0 sm:px-0">
        <nav className="flex gap-1 overflow-x-auto pb-px" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {tabs
            .filter((tab) => tab.show)
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.locked && <Lock size={12} className="text-muted-foreground" />}
              </button>
            ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === "members" && (
              <MembersList
                teamId={team.id}
                isOwner={team.isOwner}
                canManageMembers={permissions?.canManageMembers || false}
                onMemberCountChange={(count) => {
                  onTeamUpdated({ ...team, memberCount: count });
                }}
              />
            )}

            {activeTab === "files" && (
              <TeamFiles
                teamId={team.id}
                canUpload={permissions?.canUpload || false}
                canDownload={permissions?.canDownload || false}
                canDelete={permissions?.canDelete || false}
                canShare={permissions?.canShare || false}
                isOwner={permissions?.isOwner || false}
              />
            )}

            {activeTab === "activity" && <TeamActivity teamId={team.id} />}

            {activeTab === "chat" && (
              features?.chatEnabled === false ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <MessageSquare size={28} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Team Chat</h3>
                  <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">
                    Chat with your team members, share updates, and comment on files. Available on Pro and Scale plans.
                  </p>
                  <a
                    href="/pricing"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Sparkles size={16} />
                    View Plans
                  </a>
                </div>
              ) : (
                <TeamChat teamId={team.id} />
              )
            )}

            {activeTab === "settings" && permissions?.isOwner && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* General Settings */}
                  <div className="border border-border rounded-lg h-fit">
                    <div className="p-4 border-b border-border bg-muted/30">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <Settings size={18} />
                        General Settings
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Team Name */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">Team Name</p>
                          <p className="text-sm text-muted-foreground">
                            The display name for your team
                          </p>
                        </div>
                        {editingName ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={teamName}
                              onChange={(e) => setTeamName(e.target.value)}
                              className="px-3 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                              autoFocus
                            />
                            <button
                              onClick={handleSaveName}
                              disabled={savingName}
                              className="p-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                              {savingName ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Check size={16} />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setEditingName(false);
                                setTeamName(team.name);
                              }}
                              disabled={savingName}
                              className="p-1.5 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 disabled:opacity-50"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingName(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted transition-colors"
                          >
                            <Pencil size={14} />
                            {team.name}
                          </button>
                        )}
                      </div>

                      {/* Team Slug (read-only) */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">Team URL</p>
                          <p className="text-sm text-muted-foreground">
                            Unique identifier for your team
                          </p>
                        </div>
                        <span className="px-3 py-1.5 text-sm text-muted-foreground bg-muted rounded-md font-mono truncate max-w-[150px]">
                          {team.slug}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Storage Usage */}
                  <div className="border border-border rounded-lg h-fit">
                    <div className="p-4 border-b border-border bg-muted/30">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <HardDrive size={18} />
                        Storage Usage
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Shared from your {quota?.ownerPlan ? quota.ownerPlan.charAt(0).toUpperCase() + quota.ownerPlan.slice(1) : ""} plan quota
                      </p>
                    </div>
                    <div className="p-4 space-y-4">
                      {quota && quota.storageLimit > 0 && (
                        <div>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="text-muted-foreground">
                              {formatBytes(quota.availableStorage)} available
                            </span>
                            <span className="text-muted-foreground">
                              {formatBytes(team.storageUsage)} used by team
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                quota.storageUsed / quota.storageLimit > 0.9
                                  ? "bg-destructive"
                                  : quota.storageUsed / quota.storageLimit > 0.75
                                  ? "bg-amber-500"
                                  : "bg-primary"
                              }`}
                              style={{ width: `${Math.min(100, (quota.storageUsed / quota.storageLimit) * 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Total plan usage: {formatBytes(quota.storageUsed)} of {formatBytes(quota.storageLimit)} (includes personal files)
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Team Storage</p>
                          <p className="text-2xl font-semibold text-foreground">
                            {formatBytes(team.storageUsage)}
                          </p>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Total Files</p>
                          <p className="text-2xl font-semibold text-foreground">
                            {team.fileCount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Ownership */}
                  <div className="border border-border rounded-lg h-fit">
                    <div className="p-4 border-b border-border bg-muted/30">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <ArrowRightLeft size={18} className="text-amber-500" />
                        Transfer Ownership
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Transfer team ownership to another member
                      </p>
                    </div>
                    <div className="p-4">
                      {members.filter((m) => !m.isOwner).length === 0 ? (
                        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <Users size={20} className="text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">No members available</p>
                            <p className="text-sm text-muted-foreground">
                              Invite members first before transferring ownership
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                              Select new owner
                            </label>
                            <div className="relative" ref={ownerDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setShowOwnerDropdown(!showOwnerDropdown)}
                                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 flex items-center justify-between"
                              >
                                <span className={selectedNewOwner ? "text-foreground" : "text-muted-foreground"}>
                                  {selectedNewOwner
                                    ? members.find(m => m.userId === selectedNewOwner)?.user?.name ||
                                      members.find(m => m.userId === selectedNewOwner)?.user?.email ||
                                      "Selected member"
                                    : "Choose a member..."}
                                </span>
                                <svg
                                  className={`w-4 h-4 text-muted-foreground transition-transform ${showOwnerDropdown ? "rotate-180" : ""}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {showOwnerDropdown && (
                                <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                                  {members
                                    .filter((m) => !m.isOwner)
                                    .map((member) => (
                                      <button
                                        key={member.userId}
                                        type="button"
                                        onClick={() => {
                                          setSelectedNewOwner(member.userId);
                                          setShowOwnerDropdown(false);
                                          setTransferError(null);
                                        }}
                                        className={`w-full px-3 py-2.5 text-left flex items-center gap-3 hover:bg-muted transition-colors ${
                                          selectedNewOwner === member.userId ? "bg-primary/10" : ""
                                        }`}
                                      >
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                                          {member.user?.imageUrl ? (
                                            <img
                                              src={member.user.imageUrl}
                                              alt=""
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <Users size={14} className="text-muted-foreground" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-foreground truncate">
                                            {member.user?.name || "Unknown"}
                                          </p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {member.user?.email || member.userId}
                                          </p>
                                        </div>
                                        {selectedNewOwner === member.userId && (
                                          <Check size={16} className="text-primary flex-shrink-0" />
                                        )}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={handleTransferOwnership}
                            disabled={!selectedNewOwner || transferring}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {transferring ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Transferring...
                              </>
                            ) : (
                              <>
                                <ArrowRightLeft size={16} />
                                Transfer Ownership
                              </>
                            )}
                          </button>

                          {transferError && (
                            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                              <AlertCircle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-destructive">{transferError}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Default Permissions */}
                  <div className="border border-border rounded-lg h-fit">
                    <div className="p-4 border-b border-border bg-muted/30">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <UserCog size={18} />
                        Default Member Permissions
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Permissions applied to new members when they join
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => setDefaultCanUpload(!defaultCanUpload)}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Upload size={18} className="text-muted-foreground" />
                          <div className="text-left">
                            <p className="font-medium text-sm">Upload Files</p>
                            <p className="text-xs text-muted-foreground">Can upload new files</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          defaultCanUpload
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30 bg-background"
                        }`}>
                          {defaultCanUpload && <Check size={14} className="text-primary-foreground" />}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDefaultCanDownload(!defaultCanDownload)}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Download size={18} className="text-muted-foreground" />
                          <div className="text-left">
                            <p className="font-medium text-sm">Download Files</p>
                            <p className="text-xs text-muted-foreground">Can download files</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          defaultCanDownload
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30 bg-background"
                        }`}>
                          {defaultCanDownload && <Check size={14} className="text-primary-foreground" />}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDefaultCanDelete(!defaultCanDelete)}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Trash2 size={18} className="text-muted-foreground" />
                          <div className="text-left">
                            <p className="font-medium text-sm">Delete Files</p>
                            <p className="text-xs text-muted-foreground">Can delete files they uploaded</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          defaultCanDelete
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30 bg-background"
                        }`}>
                          {defaultCanDelete && <Check size={14} className="text-primary-foreground" />}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDefaultCanShare(!defaultCanShare)}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Share2 size={18} className="text-muted-foreground" />
                          <div className="text-left">
                            <p className="font-medium text-sm">Share Files</p>
                            <p className="text-xs text-muted-foreground">Can create share links</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          defaultCanShare
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30 bg-background"
                        }`}>
                          {defaultCanShare && <Check size={14} className="text-primary-foreground" />}
                        </div>
                      </button>

                      <button
                        onClick={handleSaveDefaultPermissions}
                        disabled={savingDefaults}
                        className="w-full mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {savingDefaults ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Default Permissions"
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="border border-border rounded-lg h-fit">
                    <div className="p-4 border-b border-border bg-muted/30">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <Shield size={18} className="text-destructive" />
                        Danger Zone
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Irreversible actions that affect this team
                      </p>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <Trash2 size={20} className="text-destructive" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">Delete Team</p>
                            <p className="text-sm text-muted-foreground">
                              Permanently delete this team and all its data
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          disabled={deleting}
                          className="px-4 py-2 text-destructive border border-border rounded-lg font-medium hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors flex items-center gap-2 disabled:opacity-50 flex-shrink-0"
                        >
                          <Trash2 size={16} />
                          Delete Team
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showInviteModal && (
        <InviteMemberModal
          teamId={team.id}
          onClose={() => setShowInviteModal(false)}
          onInvited={() => {
            setShowInviteModal(false);
            fetchTeamDetails();
          }}
        />
      )}

      {/* Transfer Ownership Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showTransferConfirm}
        title="Transfer Ownership"
        message={`Are you sure you want to transfer ownership to ${members.find((m) => m.userId === selectedNewOwner)?.user?.name || members.find((m) => m.userId === selectedNewOwner)?.user?.email || "this member"}? You will become a regular member.`}
        confirmLabel="Transfer"
        variant="warning"
        isLoading={transferring}
        onConfirm={confirmTransferOwnership}
        onCancel={() => setShowTransferConfirm(false)}
      />

      {/* Delete Team Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Team"
        message={`Are you sure you want to permanently delete "${team.name}"?\n\nThis will delete:\n• All ${team.fileCount} files (${formatBytes(team.storageUsage)})\n• All team messages and chat history\n• All member access and invitations\n• All activity logs\n\nThis action cannot be undone.`}
        confirmLabel="Delete Team"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDeleteTeam}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
