
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  UserPlus,
  Loader2,
  ChevronRight,
  Crown,
  HardDrive,
  FileText,
} from "lucide-react";
import { formatBytes, getMaxTeams, canCreateTeam } from "@/lib/payments/plans";
import { ToastProvider } from "@/components/ui/toast";
import TeamDetail from "./TeamDetail";
import CreateTeamModal from "./CreateTeamModal";
import TeamsLanding from "./TeamsLanding";
import TeamUpgradeModal from "./TeamUpgradeModal";

// Module-level cache for fast tab switching
interface TeamsCache {
  teams: Team[];
  timestamp: number;
}
let teamsCache: TeamsCache | null = null;
const TEAMS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

interface UserPlanInfo {
  plan: string;
  storageUsage: number;
  fileCount: number;
}

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

interface TeamsViewProps {
  initialTeamId?: string | null;
  onTeamsLoaded?: (teams: Team[]) => void;
  onTeamSelect?: (teamId: string | null) => void;
  onTeamDeleted?: (teamId: string) => void;
  onCreateTeam?: () => void;
  showCreateModal?: boolean;
  onCloseCreateModal?: () => void;
}

export default function TeamsView({
  initialTeamId,
  onTeamsLoaded,
  onTeamSelect,
  onTeamDeleted,
  onCreateTeam,
  showCreateModal: externalShowCreateModal,
  onCloseCreateModal,
}: TeamsViewProps = {}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [internalShowCreateModal, setInternalShowCreateModal] = useState(false);
  const [hasCheckedTeams, setHasCheckedTeams] = useState(false);
  const [userPlan, setUserPlan] = useState<UserPlanInfo | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Use refs to avoid infinite loops from callback dependencies
  const onTeamsLoadedRef = useRef(onTeamsLoaded);
  const onTeamSelectRef = useRef(onTeamSelect);

  // Update refs when callbacks change
  useEffect(() => {
    onTeamsLoadedRef.current = onTeamsLoaded;
  }, [onTeamsLoaded]);

  useEffect(() => {
    onTeamSelectRef.current = onTeamSelect;
  }, [onTeamSelect]);

  // Use external or internal create modal state
  const showCreateModal = externalShowCreateModal ?? internalShowCreateModal;
  const setShowCreateModal = onCloseCreateModal
    ? (show: boolean) => { if (!show) onCloseCreateModal(); else setInternalShowCreateModal(true); }
    : setInternalShowCreateModal;

  const fetchUserPlan = useCallback(async () => {
    try {
      const response = await fetch("/api/user/plan");
      if (response.ok) {
        const data = await response.json();
        setUserPlan(data);
      }
    } catch (err) {
      console.error("Error fetching user plan:", err);
    }
  }, []);

  const fetchTeams = useCallback(async (forceRefresh = false) => {
    // Use cache if fresh and not forcing refresh
    if (!forceRefresh && teamsCache && Date.now() - teamsCache.timestamp < TEAMS_CACHE_TTL) {
      setTeams(teamsCache.teams);
      setHasCheckedTeams(true);
      setLoading(false);
      onTeamsLoadedRef.current?.(teamsCache.teams);
      return;
    }

    try {
      // Only show loading if no cached data
      if (!teamsCache) {
        setLoading(true);
      }
      setError(null);
      const response = await fetch("/api/teams");
      if (!response.ok) {
        throw new Error("Failed to fetch teams");
      }
      const data = await response.json();
      const fetchedTeams = data.teams || [];

      // Update cache
      teamsCache = {
        teams: fetchedTeams,
        timestamp: Date.now(),
      };

      setTeams(fetchedTeams);
      setHasCheckedTeams(true);
      onTeamsLoadedRef.current?.(fetchedTeams);
    } catch (err) {
      console.error("Error fetching teams:", err);
      setError(err instanceof Error ? err.message : "Failed to load teams");
      setHasCheckedTeams(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch user plan info
    fetchUserPlan();

    // Load from cache immediately if available, then refresh in background
    if (teamsCache && Date.now() - teamsCache.timestamp < TEAMS_CACHE_TTL) {
      setTeams(teamsCache.teams);
      setHasCheckedTeams(true);
      setLoading(false);
      onTeamsLoadedRef.current?.(teamsCache.teams);
      // Background refresh if cache is older than 30 seconds
      if (Date.now() - teamsCache.timestamp > 30 * 1000) {
        fetchTeams(true);
      }
    } else {
      fetchTeams();
    }
  }, [fetchTeams, fetchUserPlan]);

  // Handle external team selection
  useEffect(() => {
    if (initialTeamId && teams.length > 0) {
      const team = teams.find((t) => t.id === initialTeamId);
      if (team && selectedTeam?.id !== team.id) {
        setSelectedTeam(team);
      }
    } else if (initialTeamId === null && selectedTeam !== null) {
      setSelectedTeam(null);
    }
  }, [initialTeamId, teams]);

  const handleTeamCreated = (team: Team) => {
    const newTeams = [team, ...teams];
    setTeams(newTeams);
    setShowCreateModal(false);
    setSelectedTeam(team);
    // Update cache with new team
    teamsCache = {
      teams: newTeams,
      timestamp: Date.now(),
    };
    onTeamsLoadedRef.current?.(newTeams);
    onTeamSelectRef.current?.(team.id);
  };

  const handleBackToList = () => {
    setSelectedTeam(null);
    onTeamSelectRef.current?.(null);
    fetchTeams(true); // Force refresh in case data changed
  };

  // Count teams owned by the user
  const ownedTeamsCount = teams.filter((t) => t.isOwner).length;
  const maxTeams = userPlan ? getMaxTeams(userPlan.plan) : 0;
  const canCreate = userPlan ? canCreateTeam(userPlan.plan) && ownedTeamsCount < maxTeams : false;

  const handleNewTeamClick = () => {
    if (!userPlan) {
      // Plan not loaded yet, try to show create modal anyway (API will validate)
      setShowCreateModal(true);
      return;
    }

    if (!canCreate) {
      // Show upgrade modal
      setShowUpgradeModal(true);
      return;
    }

    setShowCreateModal(true);
  };

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    onTeamSelectRef.current?.(team.id);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading teams...</p>
      </div>
    );
  }

  // Show team detail view
  if (selectedTeam) {
    return (
      <ToastProvider>
      <TeamDetail
        team={selectedTeam}
        onBack={handleBackToList}
        onTeamUpdated={(updated) => {
          setSelectedTeam(updated);
          setTeams((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t))
          );
        }}
        onTeamDeleted={() => {
          const deletedTeamId = selectedTeam.id;
          const newTeams = teams.filter((t) => t.id !== deletedTeamId);
          setTeams(newTeams);
          setSelectedTeam(null);
          // Update cache
          teamsCache = { teams: newTeams, timestamp: Date.now() };
          // Notify parent components
          onTeamsLoadedRef.current?.(newTeams);
          onTeamSelectRef.current?.(null);
          onTeamDeleted?.(deletedTeamId);
        }}
      />
      </ToastProvider>
    );
  }

  // Show landing page if user has no teams (first time)
  if (hasCheckedTeams && teams.length === 0 && !error) {
    return (
      <>
        <TeamsLanding onGetStarted={() => {
          if (onCreateTeam) {
            onCreateTeam();
          } else {
            handleNewTeamClick();
          }
        }} />
        {showCreateModal && (
          <CreateTeamModal
            onClose={() => setShowCreateModal(false)}
            onCreated={handleTeamCreated}
          />
        )}
        {showUpgradeModal && userPlan && (
          <TeamUpgradeModal
            onClose={() => setShowUpgradeModal(false)}
            currentPlan={userPlan.plan}
            maxTeams={maxTeams}
            currentTeamCount={ownedTeamsCount}
          />
        )}
      </>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg max-w-md text-center">
          <p className="font-medium">Error loading teams</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => fetchTeams(true)}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show teams list
  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Teams</h1>
            <p className="text-muted-foreground mt-1">
              Manage your teams and collaborations
            </p>
          </div>
          <button
            onClick={handleNewTeamClick}
            className="bg-primary text-primary-foreground px-4 py-2 rounded font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <UserPlus size={18} />
            New Team
          </button>
        </div>

        {/* Teams Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => handleSelectTeam(team)}
              className="bg-card border border-border rounded-sm p-5 text-left hover:border-primary/50 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {team.name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      {team.isOwner && (
                        <>
                          <Crown size={12} className="text-amber-500" />
                          <span>Owner</span>
                        </>
                      )}
                      {!team.isOwner && <span>Member</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={20}
                  className="text-muted-foreground group-hover:text-primary transition-colors"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users size={14} />
                  <span>{team.memberCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText size={14} />
                  <span>{team.fileCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <HardDrive size={14} />
                  <span>{formatBytes(team.storageUsage)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <CreateTeamModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTeamCreated}
        />
      )}

      {showUpgradeModal && userPlan && (
        <TeamUpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={userPlan.plan}
          maxTeams={maxTeams}
          currentTeamCount={ownedTeamsCount}
        />
      )}
    </>
  );
}
