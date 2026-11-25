
import { motion } from "framer-motion";
import {
  Cloud,
  Upload,
  Bell,
  Bot,
  HardDrive,
  Search,
  Home,
  Users,
  Plus,
  Settings,
  ArrowRight,
  Folder,
  Image,
  FileText,
  Film,
} from "lucide-react";
import { AiFillApple } from "react-icons/ai";
import { DashedLine } from "@/components/ui/dashed-line";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.bucket0";

const appFeatures = [
  {
    title: "Unified storage.",
    description:
      "Manage all your cloud buckets from one app. AWS S3, Cloudflare R2, and more.",
    icon: Cloud,
    highlight: true,
  },
  {
    title: "Upload from device.",
    description:
      "Capture and upload photos, videos, and documents directly from your phone.",
    icon: Upload,
  },
];

const moreFeatures = [
  {
    title: "Push notifications.",
    description:
      "Team activity, shared files, and storage alerts. Always in the loop.",
    icon: Bell,
  },
  {
    title: "AgentBucket.",
    description:
      "Persistent file storage for AI agents. Manage files programmatically with simple API access.",
    icon: Bot,
  },
  {
    title: "External buckets.",
    description:
      "Connect your own S3-compatible storage. AWS, DigitalOcean, Backblaze, and more.",
    icon: HardDrive,
  },
];

const mockFiles = [
  { name: "Documents", icon: Folder, meta: "12 items", color: "text-primary", bg: "bg-primary/10" },
  { name: "vacation-photos", icon: Image, meta: "48 items", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { name: "Q4-report.pdf", icon: FileText, meta: "2.4 MB", color: "text-red-500", bg: "bg-red-500/10" },
  { name: "product-demo.mp4", icon: Film, meta: "128 MB", color: "text-violet-500", bg: "bg-violet-500/10" },
  { name: "design-assets", icon: Folder, meta: "24 items", color: "text-primary", bg: "bg-primary/10" },
];

export default function DownloadAppPage() {
  return (
    <main className="pt-28 lg:pt-36 min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6">
        {/* Hero - Side by side on desktop */}
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 mb-20 lg:mb-28">
          {/* Text content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">
                Now on Google Play
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
              Your cloud storage,
              <br className="hidden sm:block" /> always with you
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10">
              Access your files, manage buckets, and collaborate with your
              team. All from your phone. Available now on Android.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 lg:flex-nowrap">
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 min-w-[160px]"
              >
                Get it on Google Play
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </a>

              <div className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border text-foreground font-medium rounded min-w-[160px]">
                <AiFillApple className="w-4 h-4" />
                iOS coming soon
              </div>
            </div>
          </motion.div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex-shrink-0"
          >
            <div className="w-[260px] sm:w-[280px] rounded-[2.5rem] border-[6px] border-foreground/15 bg-card shadow-2xl overflow-hidden">
              {/* Status bar */}
              <div className="flex items-center justify-between px-5 pt-3 pb-1">
                <span className="text-[9px] font-semibold text-foreground/70">
                  9:41
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-end gap-[1.5px]">
                    {[4, 6, 8, 10].map((h, i) => (
                      <div
                        key={i}
                        className="w-[2px] rounded-full bg-foreground/60"
                        style={{ height: h }}
                      />
                    ))}
                  </div>
                  <div className="w-4 h-[7px] rounded-sm border border-foreground/40 p-[1px]">
                    <div className="h-full w-3/4 bg-foreground/60 rounded-[1px]" />
                  </div>
                </div>
              </div>

              <div className="px-4 pb-2">
                {/* Nav bar */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-foreground tracking-tight">
                    My Files
                  </span>
                  <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-primary">
                      B
                    </span>
                  </div>
                </div>

                {/* Search */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 mb-3"
                >
                  <Search className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    Search files...
                  </span>
                </motion.div>

                {/* Storage bar */}
                <div className="mb-3 p-2.5 rounded-xl bg-muted/60">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-muted-foreground">Storage</span>
                    <span className="text-foreground font-medium">
                      4.2 / 10 GB
                    </span>
                  </div>
                  <div className="h-1 bg-background rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "42%" }}
                      transition={{
                        duration: 1,
                        delay: 0.8,
                        ease: "easeOut",
                      }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                </div>

                {/* File list */}
                <div className="space-y-0.5">
                  {mockFiles.map((file, i) => {
                    const Icon = file.icon;
                    return (
                      <motion.div
                        key={file.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + i * 0.08 }}
                        className="flex items-center gap-2.5 p-2 rounded-lg"
                      >
                        <div
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                            file.bg
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", file.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-foreground truncate">
                            {file.name}
                          </div>
                          <div className="text-[9px] text-muted-foreground">
                            {file.meta}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom tab bar */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="flex items-center justify-around px-4 py-2 border-t border-border/30"
              >
                <div className="flex flex-col items-center gap-1">
                  <Home className="w-4 h-4 text-primary" />
                  <div className="w-1 h-1 rounded-full bg-primary" />
                </div>
                <Cloud className="w-4 h-4 text-muted-foreground" />
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center -mt-2 shadow-md shadow-primary/30">
                  <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div className="relative">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div className="absolute -top-1.5 -right-2 w-3 h-3 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-[6px] text-white font-bold">3</span>
                  </div>
                </div>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </motion.div>

              {/* Home indicator */}
              <div className="flex justify-center pb-2.5 pt-1">
                <div className="w-24 h-1 bg-foreground/20 rounded-full" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <section className="py-8">
          <DashedLine orientation="horizontal" />

          <div className="relative flex max-md:flex-col">
            {appFeatures.map((item, i) => (
              <FeatureItem
                key={item.title}
                item={item}
                index={i}
                isLast={i === appFeatures.length - 1}
              />
            ))}
          </div>

          <DashedLine orientation="horizontal" />

          <div className="relative grid max-md:grid-cols-1 md:grid-cols-3 pb-2 md:pb-4">
            {moreFeatures.map((item, i) => (
              <FeatureItem
                key={item.title}
                item={item}
                index={i}
                isLast={i === moreFeatures.length - 1}
              />
            ))}
          </div>

          <DashedLine orientation="horizontal" />
        </section>

        {/* Bottom CTA */}
        <section className="py-16 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 tracking-tight">
              Ready to go mobile?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Download Bucket0 on Android and take your files everywhere.
            </p>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 min-w-[160px]"
            >
              Get it on Google Play
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

interface FeatureItemProps {
  item: {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    highlight?: boolean;
  };
  index: number;
  isLast?: boolean;
  className?: string;
}

function FeatureItem({ item, index, isLast, className }: FeatureItemProps) {
  const Icon = item.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "relative flex-1 flex flex-col gap-4 px-0 py-6 md:px-6 md:py-8",
        className
      )}
    >
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          item.highlight ? "bg-primary/10" : "bg-muted"
        )}
      >
        <Icon
          className={cn(
            "w-6 h-6",
            item.highlight ? "text-primary" : "text-foreground"
          )}
        />
      </div>

      <div>
        <h3 className="inline font-semibold text-foreground">{item.title} </h3>
        <span className="text-muted-foreground">{item.description}</span>
      </div>

      {!isLast && (
        <>
          <DashedLine
            orientation="vertical"
            className="absolute top-0 right-0 max-md:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute inset-x-0 bottom-0 md:hidden"
          />
        </>
      )}
    </motion.div>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Mobile App with AgentBucket",
  description:
    "Download the Bucket0 Android app for cloud storage, AgentBucket, external buckets, uploads from your device, and team activity.",
}));
