
import { X, Crown, Users, Sparkles, ArrowRight } from "lucide-react";
import Link from "@/web/compat/link";

interface TeamUpgradeModalProps {
  onClose: () => void;
  currentPlan: string;
  maxTeams: number;
  currentTeamCount: number;
}

export default function TeamUpgradeModal({
  onClose,
  currentPlan,
  maxTeams,
  currentTeamCount,
}: TeamUpgradeModalProps) {
  const isFreePlan = currentPlan === "free";
  const isPro = currentPlan === "pro";
  const isStarter = currentPlan === "starter";

  // Determine upgrade message based on current plan
  const getUpgradeInfo = () => {
    if (isFreePlan) {
      return {
        title: "Unlock Teams",
        subtitle: "Teams require a paid plan",
        description:
          "Collaborate with your team, share files, and manage permissions together.",
        recommendedPlan: "Starter",
        features: [
          "Create 1 team",
          "Up to 3 team members",
          "150 GB shared storage",
          "30-day activity logs",
        ],
      };
    }

    if (isStarter) {
      return {
        title: "Team Limit Reached",
        subtitle: `You've created ${currentTeamCount} of ${maxTeams} team${maxTeams > 1 ? "s" : ""}`,
        description:
          "Upgrade to Scale for more teams and expanded collaboration features.",
        recommendedPlan: "Scale",
        features: [
          "Create up to 2 teams",
          "Up to 10 team members per team",
          "2 TB shared storage",
          "Team chat feature",
          "180-day activity logs",
        ],
      };
    }

    if (isPro) {
      return {
        title: "Team Limit Reached",
        subtitle: `You've created ${currentTeamCount} of ${maxTeams} team${maxTeams > 1 ? "s" : ""}`,
        description:
          "Upgrade to Scale for more teams and expanded collaboration features.",
        recommendedPlan: "Scale",
        features: [
          "Create up to 2 teams",
          "Up to 10 team members per team",
          "2 TB shared storage",
          "180-day activity logs",
        ],
      };
    }

    // Scale plan - already at max
    return {
      title: "Team Limit Reached",
      subtitle: `You've created ${currentTeamCount} of ${maxTeams} teams`,
      description:
        "You're on our highest tier. Contact us for enterprise options with unlimited teams.",
      recommendedPlan: null,
      features: [],
    };
  };

  const upgradeInfo = getUpgradeInfo();

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2 rounded-lg">
              <Crown className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {upgradeInfo.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {upgradeInfo.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-muted-foreground">{upgradeInfo.description}</p>

          {upgradeInfo.features.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-primary" />
                <span className="font-medium text-foreground">
                  {upgradeInfo.recommendedPlan} plan includes:
                </span>
              </div>
              <ul className="space-y-2">
                {upgradeInfo.features.map((feature, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Users size={14} className="text-primary flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded text-foreground hover:bg-muted transition-colors"
            >
              Maybe Later
            </button>
            {upgradeInfo.recommendedPlan ? (
              <Link
                href="/pricing"
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                View Plans
                <ArrowRight size={16} />
              </Link>
            ) : (
              <a
                href="mailto:support@bucket0.io?subject=Enterprise%20Teams"
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                Contact Us
                <ArrowRight size={16} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
