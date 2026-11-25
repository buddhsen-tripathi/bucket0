
import Link from "@/web/compat/link";
import { ArrowLeft, Shield } from "lucide-react";
import { motion } from "framer-motion";
import type { Tool } from "./tool-config";

interface ToolPageLayoutProps {
  tool: Tool;
  children: React.ReactNode;
}

export default function ToolPageLayout({ tool, children }: ToolPageLayoutProps) {
  const Icon = tool.icon;

  return (
    <main className="min-h-screen bg-background">
      <section className="pt-28 lg:pt-36 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Back link */}
            <Link
              href="/tools"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-300 mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              All Tools
            </Link>

            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
              <div
                className={`w-12 h-12 rounded-xl ${tool.iconBgClass} flex items-center justify-center`}
              >
                <Icon className={`w-6 h-6 ${tool.colorClass}`} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                {tool.name}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg mb-8 sm:ml-16">
              {tool.description}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="[&_button]:rounded"
          >
            {children}
          </motion.div>

          {/* Privacy badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground text-center"
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span>Your files never leave your browser. All processing happens locally.</span>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
