
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import {
  ALL_TOOLS,
  TOOL_CATEGORIES,
  type ToolCategory,
} from "@/components/pdf-tools/tool-config";
import ToolCard from "@/components/pdf-tools/ToolCard";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const FAQ_ITEMS = [
  {
    q: "Are my files really private?",
    a: "Yes. Every tool runs entirely in your browser using JavaScript. Your files are never uploaded to our servers or any third party. We physically cannot see your documents.",
  },
  {
    q: "Is there a file size limit?",
    a: "Each file can be up to 100 MB. Since processing happens in your browser, performance depends on your device. Most PDFs process in seconds.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. All PDF tools are completely free and require no sign-up. If you need cloud storage, file sharing, or team collaboration, you can create a free Bucket0 account.",
  },
  {
    q: "What is Bucket0?",
    a: "Bucket0 is a cloud storage platform that lets you manage S3 buckets from any provider or use our encrypted storage. These PDF tools are a free utility we offer to the community.",
  },
  {
    q: "Can I use these tools on mobile?",
    a: "Yes. All tools are fully responsive and work on phones and tablets. Drop zones support tap-to-browse on mobile devices.",
  },
];

function FaqItem({ item, index }: { item: (typeof FAQ_ITEMS)[0]; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm font-medium text-foreground">{item.q}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200 mt-0.5",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-40 pb-5" : "max-h-0"
        )}
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          {item.a}
        </p>
      </div>
    </motion.div>
  );
}

export default function ToolsPage() {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("all");

  const filteredTools =
    activeCategory === "all"
      ? ALL_TOOLS
      : ALL_TOOLS.filter((t) => t.category === activeCategory);

  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-28 lg:pt-36 pb-8">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
              Every tool you need for PDFs and images
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              100% free, 100% private. Your files never leave your browser.
              All processing happens locally on your device.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Category filter */}
      <section className="pb-8">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap justify-center gap-2"
          >
            {TOOL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-300",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Tools grid */}
      <section className="pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredTools.map((tool, index) => (
              <ToolCard key={tool.slug} tool={tool} index={index} />
            ))}
          </div>

          {filteredTools.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No tools in this category yet.
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-24">
        <div className="max-w-2xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
              Frequently asked questions
            </h2>
          </motion.div>

          <div className="divide-y divide-border">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={item.q} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Free PDF & Image Tools",
  description:
    "Free browser-based PDF and image tools. Merge, split, sign PDFs. Convert, resize, crop, rotate, compress, filter, and watermark images. Your files never leave your browser.",
  keywords: [
    "PDF tools",
    "image tools",
    "merge PDF",
    "split PDF",
    "redact PDF",
    "sign PDF",
    "flatten PDF",
    "annotate PDF",
    "OCR PDF",
    "JPG to PDF",
    "convert image",
    "resize image",
    "crop image",
    "compress image",
    "reduce image noise",
    "rotate image",
    "image filters",
    "watermark image",
    "browser PDF editor",
    "browser image editor",
    "free PDF tools",
    "free image tools",
  ],
}));
