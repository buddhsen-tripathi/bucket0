
import Link from "@/web/compat/link";
import { motion } from "framer-motion";
import type { Tool } from "./tool-config";

interface ToolCardProps {
  tool: Tool;
  index: number;
}

export default function ToolCard({ tool, index }: ToolCardProps) {
  const Icon = tool.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link href={`/tools/${tool.slug}`}>
        <div className="group relative h-full bg-card border border-border rounded p-6 hover:border-primary/30 transition-colors duration-300 overflow-hidden">
          {/* Gradient overlay on hover — matches bento cards */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative">
            <div
              className={`w-10 h-10 rounded-xl ${tool.iconBgClass} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300`}
            >
              <Icon className={`w-5 h-5 ${tool.colorClass}`} />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{tool.name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tool.description}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
