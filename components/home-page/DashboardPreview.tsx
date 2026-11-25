
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MdFolder,
  MdInsertDriveFile,
  MdSearch,
  MdGridView,
  MdViewList,
  MdDownload,
  MdDelete,
  MdVisibility,
} from "react-icons/md";
import {
  FolderSync,
  Terminal,
  Cloud,
  Users,
  Bot,
  Key,
  Plus,
  Copy,
  Activity,
  MessageSquare,
} from "lucide-react";
import { FaAws } from "react-icons/fa";
import { SiCloudflare } from "react-icons/si";
import { cn } from "@/lib/shared/utils";

type TabId = "drive" | "s3" | "buckets" | "agent" | "teams";

const tabs: { id: TabId; name: string; icon: typeof FolderSync }[] = [
  { id: "drive", name: "My Drive", icon: FolderSync },
  { id: "s3", name: "S3 API", icon: Terminal },
  { id: "buckets", name: "External Buckets", icon: Cloud },
  { id: "agent", name: "AgentBucket", icon: Bot },
  { id: "teams", name: "Teams", icon: Users },
];

const panelMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

function MyDrivePanel() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">My Drive</h3>
          <p className="text-xs text-muted-foreground">Encrypted Cloud Storage</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <MdGridView className="w-4 h-4" />
          </button>
          <button type="button" className="p-2 text-primary">
            <MdViewList className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="flex-1 px-4 py-2 bg-background border border-border rounded flex items-center gap-2">
          <MdSearch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Search files...</span>
        </div>
        <button type="button" className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors">
          Upload
        </button>
      </div>

      <div className="mb-6 p-4 rounded-xs bg-gradient-to-r from-primary/20 to-primary/20 border border-primary/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Storage Used</span>
          <span className="text-sm text-muted-foreground">28 GB / 100 GB</span>
        </div>
        <div className="w-full h-2 bg-background rounded-full overflow-hidden">
          <div className="h-full w-[28%] bg-gradient-to-r from-primary/50 to-primary/50 rounded-full" />
        </div>
      </div>

      <div className="space-y-2">
        {[
          { name: "project-assets/", size: "24 items", icon: MdFolder },
          { name: "presentation.pdf", size: "4.2 MB", icon: MdInsertDriveFile },
          { name: "backup-2024.zip", size: "124 MB", icon: MdInsertDriveFile },
        ].map((file) => {
          const Icon = file.icon;
          return (
            <div
              key={file.name}
              className="flex items-center gap-4 p-3 rounded-lg bg-background/50 hover:bg-background transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/40 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.size}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" className="p-1.5 hover:bg-muted rounded transition-colors">
                  <MdVisibility className="w-4 h-4 text-muted-foreground" />
                </button>
                <button type="button" className="p-1.5 hover:bg-muted rounded transition-colors">
                  <MdDownload className="w-4 h-4 text-muted-foreground" />
                </button>
                <button type="button" className="p-1.5 hover:bg-muted rounded transition-colors">
                  <MdDelete className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function S3ApiPanel() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">S3 API</h3>
          <p className="text-xs text-muted-foreground">Access keys for AWS CLI, SDKs, and S3 tools</p>
        </div>
        <button type="button" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          Create Key
        </button>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-background/50 border border-border">
        <p className="text-xs text-muted-foreground mb-1">Endpoint</p>
        <div className="flex items-center justify-between gap-2">
          <code className="text-sm font-mono text-foreground">https://s3.bucket0.com</code>
          <button type="button" className="p-1.5 hover:bg-muted rounded transition-colors">
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { name: "production-cli", key: "B0AK••••••••4F2A", created: "Mar 12, 2026" },
          { name: "cyberduck-backup", key: "B0AK••••••••9D1C", created: "Feb 4, 2026" },
        ].map((item) => (
          <div key={item.name} className="flex items-center gap-4 p-3 rounded-lg bg-background/50 border border-border/50">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{item.key}</p>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">{item.created}</span>
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-foreground mb-3 mt-3">my-app-bucket</p>
      <div className="space-y-2">
        {["deploy.zip", "config.json"].map((file) => (
          <div key={file} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
            <MdInsertDriveFile className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">{file}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ExternalBucketsPanel() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">External Buckets</h3>
          <p className="text-xs text-muted-foreground">Connect S3-compatible storage from any provider</p>
        </div>
        <button type="button" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          Add Bucket
        </button>
      </div>

      <div className="space-y-2">
        {[
          { name: "company-backups", provider: "AWS S3", region: "us-east-1", icon: FaAws, items: "1,248 objects" },
          { name: "cdn-assets", provider: "Cloudflare R2", region: "auto", icon: SiCloudflare, items: "384 objects" },
          { name: "dev-uploads", provider: "AWS S3", region: "eu-west-1", icon: FaAws, items: "92 objects" },
        ].map((bucket) => {
          const Icon = bucket.icon;
          return (
            <div key={bucket.name} className="flex items-center gap-4 p-3 rounded-lg bg-background/50 border border-border/50 hover:bg-background transition-colors">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{bucket.name}</p>
                <p className="text-xs text-muted-foreground">
                  {bucket.provider} · {bucket.region} · {bucket.items}
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500">Connected</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AgentBucketPanel() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">AgentBucket</h3>
          <p className="text-xs text-muted-foreground">File storage and semantic memory for AI agents</p>
        </div>
        <button type="button" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          New Key
        </button>
      </div>

      <div className="mb-4 p-4 rounded-lg bg-background border border-border font-mono text-xs space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-primary shrink-0">{">"}</span>
          <span className="text-muted-foreground">POST /api/agent-bucket/files/upload</span>
        </div>
        <div className="flex items-start gap-2 pl-4">
          <span className="text-emerald-500 shrink-0">✓</span>
          <span className="text-foreground">llm-benchmarks-2026.json uploaded (24 KB)</span>
        </div>
        <div className="flex items-start gap-2 pl-4">
          <span className="text-emerald-500 shrink-0">✓</span>
          <span className="text-foreground">research-notes.md uploaded (8 KB)</span>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { name: "llm-benchmarks-2026.json", size: "24 KB" },
          { name: "research-notes.md", size: "8 KB" }
        ].map((file) => (
          <div key={file.name} className="flex items-center gap-4 p-3 rounded-lg bg-background/50 border border-border/50">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{file.size}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Semantic memory search */}
      <p className="text-sm font-medium text-foreground mb-2 mt-4">Memory</p>
      <div className="rounded-lg bg-background border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <MdSearch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">what were the Q3 benchmark numbers?</span>
        </div>
        <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">llm-benchmarks-2026.json</p>
            <p className="text-[11px] text-muted-foreground truncate italic">GPQA topped out at 71%, led by…</p>
          </div>
          <span className="text-[11px] font-medium text-primary shrink-0">0.84</span>
        </div>
      </div>
    </>
  );
}

function TeamsPanel() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Engineering</h3>
          <p className="text-xs text-muted-foreground">Shared team workspace · 4 members</p>
        </div>
        <div className="flex -space-x-2">
          {["SC", "MJ", "AK", "You"].map((initial, i) => (
            <div
              key={initial}
              className={cn(
                "w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-semibold text-white",
                i === 3 ? "bg-primary" : i === 0 ? "bg-blue-500" : i === 1 ? "bg-emerald-500" : "bg-violet-500"
              )}
            >
              {initial === "You" ? "Y" : initial[0]}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-3 rounded-lg bg-background/50 border border-border/50">
          <Activity className="w-4 h-4 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Recent activity</p>
          <p className="text-sm font-medium text-foreground">12 actions today</p>
        </div>
        <div className="p-3 rounded-lg bg-background/50 border border-border/50">
          <MessageSquare className="w-4 h-4 text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Team chat</p>
          <p className="text-sm font-medium text-foreground">3 unread messages</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { name: "Q4 Report.pdf", size: "2.4 MB", user: "SC" },
          { name: "Brand Assets/", size: "24 items", user: "MJ" },
          { name: "Product Demo.mp4", size: "148 MB", user: "You" },
        ].map((file) => (
          <div key={file.name} className="flex items-center gap-4 p-3 rounded-lg bg-background/50 border border-border/50">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <MdFolder className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{file.size}</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-primary">
                {file.user === "You" ? "Y" : file.user[0]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const panels: Record<TabId, () => React.ReactNode> = {
  drive: MyDrivePanel,
  s3: S3ApiPanel,
  buckets: ExternalBucketsPanel,
  agent: AgentBucketPanel,
  teams: TeamsPanel,
};

const TAB_CYCLE_MS = 1500;

export default function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<TabId>("drive");
  const [isPaused, setIsPaused] = useState(false);
  const ActivePanel = panels[activeTab];

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setActiveTab((current) => {
        const index = tabs.findIndex((tab) => tab.id === current);
        return tabs[(index + 1) % tabs.length].id;
      });
    }, TAB_CYCLE_MS);

    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="relative w-full max-w-5xl mx-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative bg-card rounded border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center px-4 py-3 bg-muted border-b border-border">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 bg-background rounded-md text-xs text-muted-foreground">
              bucket0.com/dashboard
            </div>
          </div>
          <div className="w-[52px]" />
        </div>

        <div className="p-6 bg-gradient-to-br from-background via-background to-muted/20">
          <div
            className="flex items-center gap-1 mb-6 pb-4 border-b border-border overflow-x-auto flex-nowrap shrink-0"
            role="tablist"
            aria-label="Dashboard preview tabs"
          >
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.name}
                </motion.button>
              );
            })}
          </div>

          <div className="relative h-[500px]" role="tabpanel">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                className="absolute inset-0 overflow-y-auto"
                {...panelMotion}
              >
                <ActivePanel />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 blur-3xl" />
    </motion.div>
  );
}
