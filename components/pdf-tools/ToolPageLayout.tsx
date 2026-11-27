import type { CSSProperties, ReactNode } from "react";
import Link from "@/web/compat/link";
import { ArrowRightIcon, ChevronRightIcon, LockCloseIcon } from "@/components/icons";
import { BrushPanel } from "@/components/site/BrushPanel";
import { SectionHead } from "@/components/site/SectionHead";
import { container, eyebrow } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/shared/utils";
import ToolCard from "./ToolCard";
import { ALL_TOOLS, type Tool } from "./tool-config";

interface ToolPageLayoutProps {
  tool: Tool;
  children: ReactNode;
}

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

/**
 * The tool's controls sit in a framed workspace. Inside it, the shared Button's filled variant turns ink (violet stays
 * for selection rings and focus), outline buttons get an ink border, and nested cards sit on paper.
 */
const workspace = cn(
  "p-4 sm:p-6 md:p-8 [--card:var(--paper)]",
  "[&_button]:rounded-[3px] [&_.rounded-xl]:rounded-[10px] [&_.rounded-lg]:rounded-[6px]",
  "[&_button.bg-primary]:bg-[var(--ink)] [&_button.bg-primary:hover]:bg-[color-mix(in_oklch,var(--ink),var(--paper)_16%)]",
  "[&_button.border-input]:border-[var(--ink)] [&_button.border-input]:bg-transparent [&_button.border-input:hover]:bg-[var(--ink)] [&_button.border-input:hover]:text-[var(--paper)]"
);

/** What people usually do with the result of each tool, in order. Crosses between PDF and image where that fits. */
const NEXT_STEPS: Record<string, string[]> = {
  merge: ["organize", "page-numbers", "protect", "sign"],
  split: ["extract", "organize", "merge", "page-numbers"],
  extract: ["merge", "organize", "split", "redact"],
  organize: ["merge", "page-numbers", "extract", "split"],
  "jpg-to-pdf": ["merge", "ocr", "compress-image", "organize"],
  "page-numbers": ["watermark", "sign", "protect", "merge"],
  watermark: ["protect", "flatten", "page-numbers", "watermark-image"],
  protect: ["unlock", "redact", "watermark", "flatten"],
  unlock: ["organize", "extract", "sign", "protect"],
  redact: ["flatten", "protect", "sign", "ocr"],
  flatten: ["protect", "sign", "redact", "merge"],
  annotate: ["flatten", "sign", "redact", "page-numbers"],
  ocr: ["redact", "extract", "merge", "jpg-to-pdf"],
  sign: ["flatten", "protect", "merge", "annotate"],
  "convert-image": ["compress-image", "resize-image", "jpg-to-pdf", "crop-image"],
  "resize-image": ["compress-image", "crop-image", "convert-image", "watermark-image"],
  "crop-image": ["resize-image", "rotate-image", "compress-image", "filter-image"],
  "rotate-image": ["crop-image", "resize-image", "jpg-to-pdf", "filter-image"],
  "compress-image": ["resize-image", "convert-image", "jpg-to-pdf", "crop-image"],
  "filter-image": ["reduce-image-noise", "crop-image", "watermark-image", "compress-image"],
  "reduce-image-noise": ["filter-image", "compress-image", "resize-image", "crop-image"],
  "watermark-image": ["compress-image", "resize-image", "convert-image", "watermark"],
};

/** Four tools to suggest: the curated next steps, filled from the same category and kind if any are missing. */
function nextTools(tool: Tool) {
  const kind = (t: Tool) => t.type ?? "pdf";
  const picked = (NEXT_STEPS[tool.slug] ?? []).flatMap((slug) => ALL_TOOLS.filter((t) => t.slug === slug));
  const others = ALL_TOOLS.filter((t) => t.slug !== tool.slug && kind(t) === kind(tool) && !picked.includes(t));
  return [...picked, ...others.filter((t) => t.category === tool.category), ...others].slice(0, 4);
}

export default function ToolPageLayout({ tool, children }: ToolPageLayoutProps) {
  const { resolvedTheme } = useTheme();
  const Icon = tool.icon;
  const isImage = tool.type === "image";

  return (
    <main className="min-h-screen">
      <section className={cn(container, "pt-14 pb-20 md:pt-24 md:pb-24")}>
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:gap-16">
          <div>
            <nav aria-label="Breadcrumb" className={cn(eyebrow, "rise flex items-center gap-1.5")}>
              <Link href="/tools" className="transition-colors hover:text-[var(--ink)]">
                Tools
              </Link>
              <ChevronRightIcon aria-hidden className="size-3" />
              <span>{isImage ? "Image" : "PDF"}</span>
            </nav>
            <h1 className="display rise mt-5 text-balance text-[clamp(44px,5.6vw,84px)] leading-[0.98]" style={delay(60)}>
              {tool.name}
            </h1>
          </div>
          <div className="rise flex flex-col justify-end lg:pb-2" style={delay(200)}>
            <p className="max-w-[520px] text-[19px] leading-[1.45] text-[var(--ink)]/85 md:text-[20px]">{tool.description}</p>
            <p className="mt-4 flex items-center gap-1.5 font-mono text-[12px] text-[var(--ink-soft)]">
              <LockCloseIcon aria-hidden className="size-3.5" />
              Runs in this tab · 0 uploads · no account
            </p>
          </div>
        </div>

        {/* Phones get the tool on the page background: the brush frame only suits wide screens. */}
        <div className="rise mt-10 md:mt-16" style={delay(300)}>
          <BrushPanel
            id={`tool-${tool.slug}`}
            tone={resolvedTheme === "dark" ? "night" : "stone"}
            className="rounded-[14px] max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden md:p-5 lg:px-24 lg:py-12"
          >
            <div className="relative z-10 overflow-hidden rounded-[10px] bg-[var(--paper-card)] text-[var(--ink)] shadow-[var(--shadow-code)] ring-1 ring-black/10 dark:ring-white/10">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
                <span className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-[var(--ink-soft)]">
                  <Icon aria-hidden strokeWidth={1.6} className="size-3.5 shrink-0 text-[var(--ink)]" />
                  <span className="truncate">bucket0.com/tools/{tool.slug}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--ink-soft)]">
                  <LockCloseIcon aria-hidden className="size-3.5" />
                  <span className="hidden sm:inline">Runs on this device</span>
                </span>
              </div>
              <div className={workspace}>{children}</div>
            </div>
          </BrushPanel>
        </div>
      </section>

      <section aria-labelledby="next-tools" className={cn(container, "pb-24 md:pb-32")}>
        <SectionHead id="next-tools" label="Next" title={`Often used after ${tool.name}`}>
          <p>
            Download the result and drop it into the next one. It stays on your device the whole way.{" "}
            <Link
              href="/tools"
              className="group inline-flex items-center gap-1.5 font-medium text-[var(--ink)] underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]"
            >
              All {ALL_TOOLS.length} tools
              <ArrowRightIcon aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </p>
        </SectionHead>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 md:mt-14 lg:grid-cols-4">
          {nextTools(tool).map((t) => (
            <ToolCard key={t.slug} tool={t} />
          ))}
        </div>
      </section>
    </main>
  );
}
