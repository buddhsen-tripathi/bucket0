
import {
  Users,
  Shield,
  Activity,
  MessageSquare,
  HardDrive,
  ArrowRight,
  Check,
} from "lucide-react";

interface TeamsLandingProps {
  onGetStarted: () => void;
}

export default function TeamsLanding({ onGetStarted }: TeamsLandingProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center bg-primary/10 p-4 rounded-full mb-6">
          <Users className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">
          Collaborate with Teams
        </h1>
        <p className="text-muted-foreground">
          Share files, manage permissions, and work together seamlessly.
        </p>
      </div>

      {/* Features List */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          What you get with Teams
        </h2>
        <ul className="space-y-4">
          <FeatureItem
            icon={<Shield className="w-5 h-5" />}
            title="Flexible Permissions"
            description="Assign upload, download, delete, and share permissions individually or via custom roles"
          />
          <FeatureItem
            icon={<HardDrive className="w-5 h-5" />}
            title="Shared Storage"
            description="Team storage is shared from your plan — no extra cost for members"
          />
          <FeatureItem
            icon={<Activity className="w-5 h-5" />}
            title="Activity Logs"
            description="Track who uploaded, deleted, or shared files with real-time audit logs"
          />
          <FeatureItem
            icon={<MessageSquare className="w-5 h-5" />}
            title="Team Chat"
            description="Communicate with your team directly within Bucket0 (Pro & Scale)"
          />
        </ul>
      </div>

      {/* Plans with Teams */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Teams by Plan
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Starter</span>
            <span className="font-medium text-foreground">1 team, 3 members</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Pro</span>
            <span className="font-medium text-foreground">1 team, 5 members</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Scale</span>
            <span className="font-medium text-foreground">2 teams, 10 members each</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground font-semibold mt-4">
          Team members share storage from the owner&apos;s plan at no additional cost.
        </p>
      </div>

      {/* Limits */}
      <div className="flex flex-wrap gap-4 justify-center text-sm text-muted-foreground mb-6">
        <span className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-success" />
          End-to-end encryption
        </span>
        <span className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-success" />
          No extra cost for members
        </span>
      </div>

      {/* CTA */}
      <div className="text-center">
        <button
          onClick={onGetStarted}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded font-medium hover:bg-primary/90 transition-colors"
        >
          Create Your Team
          <ArrowRight size={18} />
        </button>
        <p className="text-sm text-muted-foreground mt-3">
          You&apos;ll be the team owner with full control
        </p>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}
