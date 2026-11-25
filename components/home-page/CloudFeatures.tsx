
import { motion } from "framer-motion";
import { DashedLine } from "@/components/ui/dashed-line";
import {
  Cloud,
  Upload,
  FolderSync,
  Shield,
  Zap,
  Terminal
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { SiCloudflare, SiMinio, SiBackblaze, SiGooglecloud } from "react-icons/si";
import { FaDigitalOcean, FaAws } from "react-icons/fa";
import { VscAzure } from "react-icons/vsc";

const topItems = [
  {
    title: "Use Bucket0 encrypted storage",
    description: "Start with 5 GB free, then scale encrypted storage as you grow",
    icon: FolderSync,
    highlight: true,
  },
  {
    title: "Access via S3 API",
    description: "Use AWS CLI, SDKs, WinSCP, Cyberduck, and any S3-compatible tool",
    icon: Terminal,
  },
  {
    title: "Connect your own buckets",
    description: "Manage AWS S3, R2, Azure, DigitalOcean, MinIO, and Backblaze from one dashboard",
    icon: Cloud,
  },
];

const bottomItems = [
  {
    title: "Upload without limits",
    description: "Large files, folder drops, real-time progress, and chunked transfers",
    icon: Upload,
  },
  {
    title: "Choose cloud or local",
    description: "Sync encrypted bucket credentials across devices or keep them only in your browser",
    icon: Shield,
  },
  {
    title: "Built for speed",
    description: "Parallel transfers and smart chunking keep uploads moving",
    icon: Zap,
  },
];

const providers = [
  { name: "AWS S3", icon: FaAws },
  { name: "Cloudflare R2", icon: SiCloudflare },
  { name: "Azure Blob", icon: VscAzure },
  { name: "Google Cloud", icon: SiGooglecloud },
  { name: "DigitalOcean", icon: FaDigitalOcean },
  { name: "MinIO", icon: SiMinio },
  { name: "Backblaze B2", icon: SiBackblaze },
];

export default function CloudFeatures() {
  return (
    <section id="features" className="overflow-hidden py-24 bg-background">
      <div className="max-w-6xl mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4"
        >
          Cloud storage, your way
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-center text-lg text-muted-foreground max-w-2xl mx-auto mb-12"
        >
          Store files with Bucket0, use the S3 API, or bring buckets you already own.
        </motion.p>

        <div className="mt-8 md:mt-12">
          <DashedLine orientation="horizontal" />

          {/* Top Features Grid - 3 items */}
          <div className="relative grid max-md:grid-cols-1 md:grid-cols-3">
            {topItems.map((item, i) => (
              <FeatureItem 
                key={item.title} 
                item={item} 
                index={i}
                isLast={i === topItems.length - 1} 
              />
            ))}
          </div>
          
          <DashedLine orientation="horizontal" />

          {/* Provider logos */}
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="py-8 md:py-12"
          >
            <p className="text-center text-sm text-muted-foreground mb-6">
              Works with all major cloud providers
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {providers.map((provider, i) => {
                const Icon = provider.icon;
                return (
                  <motion.div
                    key={provider.name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border hover:border-foreground/20 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{provider.name}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <DashedLine orientation="horizontal" />

          {/* Bottom Features Grid - 3 items */}
          <div className="relative grid max-md:grid-cols-1 md:grid-cols-3 pb-2 md:pb-4">
            {bottomItems.map((item, i) => (
              <FeatureItem 
                key={item.title} 
                item={item}
                index={i}
                isLast={i === bottomItems.length - 1}
              />
            ))}
          </div>
          
          <DashedLine orientation="horizontal" />
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          {[
            { value: "99.9%", label: "Uptime SLA" },
            { value: "50ms", label: "Avg response" },
            { value: "100", label: "Buckets supported" },
            { value: "0", label: "Data we can see" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-bold text-foreground">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
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
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center",
        item.highlight ? "bg-primary/10" : "bg-muted"
      )}>
        <Icon className={cn(
          "w-6 h-6",
          item.highlight ? "text-primary" : "text-foreground"
        )} />
      </div>
      
      <div>
        <h3 className="font-semibold text-foreground">{item.title}</h3>
        <p className="text-muted-foreground mt-1">{item.description}</p>
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
