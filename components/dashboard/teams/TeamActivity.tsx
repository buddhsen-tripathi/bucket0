
import { useState, useEffect, useCallback } from "react";
import {
  FileUp,
  FileDown,
  Trash2,
  Share2,
  UserPlus,
  UserMinus,
  Settings,
  Shield,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface ActivityUser {
  name: string;
  email: string;
  imageUrl: string | null;
}

interface ActivityLog {
  id: string;
  teamId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: ActivityUser;
}

interface TeamActivityProps {
  teamId: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  "file.upload": <FileUp size={14} />,
  "file.download": <FileDown size={14} />,
  "file.delete": <Trash2 size={14} />,
  "file.share": <Share2 size={14} />,
  "member.join": <UserPlus size={14} />,
  "member.leave": <UserMinus size={14} />,
  "member.invite": <UserPlus size={14} />,
  "member.remove": <UserMinus size={14} />,
  "role.create": <Shield size={14} />,
  "role.update": <Shield size={14} />,
  "role.delete": <Shield size={14} />,
  "team.create": <Settings size={14} />,
  "team.update": <Settings size={14} />,
};

const ACTION_COLORS: Record<string, string> = {
  "file.upload": "text-emerald-500 bg-emerald-500/10",
  "file.download": "text-blue-500 bg-blue-500/10",
  "file.delete": "text-red-500 bg-red-500/10",
  "file.share": "text-purple-500 bg-purple-500/10",
  "member.join": "text-emerald-500 bg-emerald-500/10",
  "member.leave": "text-amber-500 bg-amber-500/10",
  "member.invite": "text-blue-500 bg-blue-500/10",
  "member.remove": "text-red-500 bg-red-500/10",
  default: "text-muted-foreground bg-muted",
};

export default function TeamActivity({ teamId }: TeamActivityProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchActivity = useCallback(
    async (reset = false) => {
      try {
        setLoading(true);
        setError(null);
        const currentOffset = reset ? 0 : offset;
        const response = await fetch(
          `/api/teams/${teamId}/activity?limit=20&offset=${currentOffset}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch activity");
        }

        const data = await response.json();

        if (reset) {
          setActivities(data.activities || []);
          setOffset(data.activities?.length || 0);
        } else {
          setActivities((prev) => [...prev, ...(data.activities || [])]);
          setOffset((prev) => prev + (data.activities?.length || 0));
        }
        setHasMore(data.hasMore || false);
      } catch (err) {
        console.error("Error fetching activity:", err);
        setError(err instanceof Error ? err.message : "Failed to load activity");
      } finally {
        setLoading(false);
      }
    },
    [teamId, offset]
  );

  useEffect(() => {
    fetchActivity(true);
  }, [teamId]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (loading && activities.length === 0) {
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
          onClick={() => fetchActivity(true)}
          className="mt-4 text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground">Recent Activity</h3>
        <button
          onClick={() => fetchActivity(true)}
          disabled={loading}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="bg-card border border-border rounded-sm divide-y divide-border">
        {activities.map((activity) => (
          <div key={activity.id} className="p-4 flex items-start gap-3">
            <div
              className={`p-2 rounded-lg ${
                ACTION_COLORS[activity.action] || ACTION_COLORS.default
              }`}
            >
              {ACTION_ICONS[activity.action] || <Settings size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-medium">{activity.user?.name || "Someone"}</span>
                {" "}
                {activity.description.toLowerCase()}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTime(activity.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => fetchActivity(false)}
          disabled={loading}
          className="w-full py-2 text-sm text-primary hover:underline disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
