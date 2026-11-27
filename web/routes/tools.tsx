
import type { CSSProperties } from "react";
import { PlusIcon } from "lucide-react";
import Link from "@/web/compat/link";
import { ArrowRightIcon } from "@/components/icons";
import { ALL_TOOLS, type ToolCategory } from "@/components/pdf-tools/tool-config";
import ToolCard from "@/components/pdf-tools/ToolCard";
import { LocalRunPanel } from "@/components/tools/LocalRunPanel";
import { BrushPanel } from "@/components/site/BrushPanel";
import { button, container, eyebrow, sectionTitle } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const FAQ_ITEMS = [
  {
    q: "Are my files really private?",
    a: "Yes. Every tool runs in your browser. Your files are read and written in the tab's memory and are never uploaded to our servers or anyone else's. OCR downloads its language data the first time you use it; your document stays on your device.",
  },
  {
    q: "Is there a file size limit?",
    a: "Each file can be up to 100 MB. Since processing happens in your browser, speed depends on your device. Most PDFs finish in a few seconds.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. The tools are free and need no sign-up. Create a free Bucket0 account if you want to keep the results in encrypted storage, share them by link or work on them with a team.",
  },
  {
    q: "What is Bucket0?",
    a: "Bucket0 is encrypted cloud storage with AgentBucket, a file API your AI agents can save to and search. These tools are a free utility alongside it.",
  },
  {
    q: "Can I use these tools on my phone?",
    a: "Yes. Every tool works on phones and tablets, and the drop zones open your file picker when you tap them.",
  },
];

const GROUPS: { id: ToolCategory; kind: string; title: string; lead: string }[] = [
  { id: "organize", kind: "PDF", title: "Organize", lead: "Combine files, split them apart and put pages in order." },
  { id: "edit", kind: "PDF", title: "Edit", lead: "Sign, annotate, number, stamp and flatten pages." },
  { id: "convert", kind: "PDF", title: "Convert", lead: "Turn images into a PDF and scans into searchable text." },
  { id: "security", kind: "PDF", title: "Secure", lead: "Add or remove a password, or black out what others shouldn't see." },
  { id: "image", kind: "Image", title: "Images", lead: "Convert, resize, crop, compress and clean up photos and graphics." },
];

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export default function ToolsPage() {
  const { resolvedTheme } = useTheme();
  const pdfCount = ALL_TOOLS.filter((t) => t.type !== "image").length;
  const imageCount = ALL_TOOLS.length - pdfCount;

  return (
    <main className="min-h-screen">
      <section className={cn(container, "pt-14 pb-20 md:pt-24 md:pb-24")}>
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:gap-16">
          <div>
            <p className={cn(eyebrow, "rise")}>Free tools</p>
            <h1 className="display rise mt-5 text-balance text-[clamp(44px,5.4vw,80px)] leading-[0.97]" style={delay(60)}>
              PDF and image tools that never upload your files
            </h1>
          </div>
          <div className="rise flex flex-col justify-end lg:pb-2" style={delay(300)}>
            <p className="max-w-[540px] text-[19px] leading-[1.45] text-[var(--ink)]/85 md:text-[20px]">
              Merge, sign, redact or OCR a PDF. Resize, crop or compress an image. Everything runs in your browser, and
              you don&apos;t need an account.
            </p>
            <p className="mt-6 font-mono text-[12px] text-[var(--ink-soft)]">
              {pdfCount} PDF tools · {imageCount} image tools · 0 uploads
            </p>
          </div>
        </div>
        <div className="rise mt-14 md:mt-20" style={delay(420)}>
          <BrushPanel
            id="tools-hero"
            tone={resolvedTheme === "dark" ? "night" : "stone"}
            className="rounded-[14px] max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden md:p-5 lg:px-24 lg:py-12"
          >
            <LocalRunPanel />
          </BrushPanel>
        </div>
      </section>

      <section aria-labelledby="all-tools" className={cn(container, "pb-20 md:pb-28")}>
        <h2 id="all-tools" className={sectionTitle}>
          All tools
        </h2>
        <div className="mt-10 md:mt-14">
          {GROUPS.map((group) => {
            const tools = ALL_TOOLS.filter((t) => t.category === group.id);
            return (
              <div
                key={group.id}
                className="grid gap-6 border-t border-[var(--line)] py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:gap-12"
              >
                <div>
                  <p className={eyebrow}>
                    {group.kind} · {tools.length} tools
                  </p>
                  <h3 className="display mt-3 text-[28px] leading-tight">{group.title}</h3>
                  <p className="mt-2 max-w-xs text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{group.lead}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {tools.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="tools-faq" className={cn(container, "grid gap-10 pb-20 md:pb-28 lg:grid-cols-[5fr_7fr] lg:gap-20")}>
        <div>
          <p className={eyebrow}>Questions</p>
          <h2 id="tools-faq" className={cn(sectionTitle, "mt-4")}>
            Common questions
          </h2>
        </div>
        <div className="border-t border-[var(--line)]">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group border-b border-[var(--line)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-[2px] py-5 text-[16px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)] [&::-webkit-details-marker]:hidden">
                <h3>{item.q}</h3>
                <PlusIcon aria-hidden strokeWidth={1.6} className="size-4 shrink-0 transition-transform group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="max-w-2xl pr-8 pb-6 text-[15px] leading-relaxed text-[var(--ink-soft)]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={cn(container, "pb-24")}>
        <div className="flex flex-col items-start justify-between gap-6 rounded-[12px] border border-[var(--line)] bg-[var(--paper-card)] p-6 md:flex-row md:items-center md:p-8">
          <div>
            <h2 className="display text-[26px] leading-tight">Keep what you make</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[var(--ink-soft)]">
              Store the results in Bucket0&apos;s encrypted drive and share them by link. 5 GB free.
            </p>
          </div>
          <Link href="/sign-up" className={cn(button.solid, "shrink-0")}>
            Create a free account <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
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
