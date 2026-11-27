// Homepage sections about AgentBucket: what an agent does with it (save, recall, hand off) and connecting over MCP.
import type { ReactNode } from "react";
import Link from "@/web/compat/link";
import { ArrowRightIcon, CheckTickCircleIcon, CopyIcon, FileIcon, FolderIcon, SearchIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { BrushPanel, type BrushTone } from "@/components/site/BrushPanel";
import { SectionHead } from "@/components/site/SectionHead";
import { container } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/shared/utils";

const kicker = "font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--ink-soft)]";
const fragment =
  "w-full max-w-[350px] rounded-[8px] bg-[var(--paper-card)] p-4 text-[var(--ink)] shadow-[var(--shadow-feature)] ring-1 ring-black/10 dark:ring-white/10";
export const pageLink =
  "group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--ink)] underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]";

const FILES = [
  { name: "call-summary.md", size: "6.2 KB", indexed: true },
  { name: "q3-churn.csv", size: "48 KB", indexed: true },
  { name: "scraper.py", size: "3.1 KB", indexed: true },
  { name: "dashboard.png", size: "210 KB", indexed: false },
];

function SaveFragment() {
  return (
    <div className={fragment}>
      <div className="flex items-baseline justify-between">
        <p className={kicker}>Agent Storage</p>
        <p className="font-mono text-[11px] text-[var(--ink-soft)]">4 files</p>
      </div>
      <ul className="mt-3 divide-y divide-[var(--line)]">
        {FILES.map((f) => (
          <li key={f.name} className="flex items-center gap-2.5 py-2">
            <FileIcon aria-hidden className="size-3.5 shrink-0 text-[var(--ink-soft)]" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{f.name}</span>
            {f.indexed && (
              <span className="rounded-[3px] bg-[var(--violet-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--violet)]">indexed</span>
            )}
            <span className="w-12 text-right font-mono text-[11px] text-[var(--ink-soft)] tabular-nums">{f.size}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecallFragment() {
  return (
    <div className={fragment}>
      <div className="flex items-center gap-2 rounded-[5px] bg-[var(--paper-2)] px-2.5 py-2 text-[12.5px]">
        <SearchIcon aria-hidden className="size-3.5 text-[var(--ink-soft)]" />
        pricing feedback from the Acme call
      </div>
      <ul className="mt-3 space-y-3">
        <li>
          <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <span className="truncate">calls/2026-11-18-acme.md</span>
            <span className="text-[var(--ink-soft)] tabular-nums">0.82</span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--ink-soft)]">
            …they said <mark className="rounded-[2px] bg-[var(--violet-soft)] px-0.5 text-[var(--ink)]">the per-seat price was the blocker</mark> and asked about a yearly plan…
          </p>
        </li>
        <li>
          <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
            <span className="truncate">notes/renewals.md</span>
            <span className="text-[var(--ink-soft)] tabular-nums">0.71</span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--ink-soft)]">…Acme renews in January if annual billing is ready…</p>
        </li>
      </ul>
    </div>
  );
}

function HandOffFragment() {
  return (
    <div className={fragment}>
      <p className={kicker}>Share link</p>
      <div className="mt-3 flex items-center gap-2 rounded-[5px] ring-1 ring-[var(--line)] px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">bucket0.com/s/6f1c2e…</span>
        <CopyIcon aria-hidden className="size-3.5 text-[var(--ink-soft)]" />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--ink-soft)]">
        <CheckTickCircleIcon aria-hidden className="size-3.5 text-[var(--violet)]" />
        Anyone with the link can view and download
      </p>
      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <p className={kicker}>Key destination</p>
        <p className="mt-2 flex items-center gap-2 text-[12.5px]">
          <FolderIcon aria-hidden className="size-3.5 text-[var(--ink-soft)]" />
          My Drive <span className="text-[var(--ink-soft)]">/</span> Reports
        </p>
      </div>
    </div>
  );
}

type Item = { id: string; tone: BrushTone; title: string; body: ReactNode; endpoint: string; fragment: ReactNode };

const ITEMS: Item[] = [
  {
    id: "save",
    tone: "lilac",
    title: "Files that outlive the session",
    body: "Reports, notes, CSVs and code your agent writes are stored as ordinary files. It can list, read and delete them later through the same API.",
    endpoint: "POST /files/upload",
    fragment: <SaveFragment />,
  },
  {
    id: "recall",
    tone: "stone",
    title: "Recall by meaning",
    body: "Text files are split into chunks and indexed as they arrive. Ask in plain words and get back the passage, its file and a score. Included from Starter.",
    endpoint: "POST /memory/search",
    fragment: <RecallFragment />,
  },
  {
    id: "handoff",
    tone: "night",
    title: "Results where people look",
    body: "Turn any file into a share link, or set a key to write straight into a folder of your drive so the work lands next to everything else.",
    endpoint: "POST /files/share",
    fragment: <HandOffFragment />,
  },
];

export function AgentFeatures() {
  const { resolvedTheme } = useTheme();
  return (
    <section id="features" aria-labelledby="features-heading" className={cn(container, "scroll-mt-20 pt-16 md:pt-24")}>
      <SectionHead id="features-heading" label="AgentBucket" title="Work that survives the session">
        <p>
          Every new session starts with an empty context. Anything your agent put in AgentBucket is still there, and the
          text inside it can be searched by what it means.
        </p>
        <Link href="/agentbucket" className={cn(pageLink, "mt-5")}>
          How AgentBucket works
          <ArrowRightIcon aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </SectionHead>

      <ul className="mt-12 grid gap-5 md:mt-16 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-col">
            <BrushPanel
              id={`agent-${item.id}`}
              tone={resolvedTheme === "dark" && item.tone !== "night" ? "night" : item.tone}
              className="reveal rounded-[12px] p-5 sm:p-7"
            >
              <div aria-hidden inert className="flex h-[236px] items-center justify-center">
                {item.fragment}
              </div>
            </BrushPanel>
            <div className="flex flex-1 flex-col px-1 pt-6">
              <h3 className="display text-[26px] leading-tight tracking-[-0.03em]">{item.title}</h3>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--ink-soft)]">{item.body}</p>
              <div className="mt-auto flex items-center justify-between gap-4 pt-5">
                <code className="truncate font-mono text-[12px] text-[var(--ink-soft)]">{item.endpoint}</code>
                <Link href="/docs#agent-bucket" className={cn(pageLink, "shrink-0")}>
                  API reference
                  <ArrowRightIcon aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A desktop window frame for product mockups. */
export function Window({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[10px] bg-[var(--paper-card)] text-[var(--ink)] shadow-[var(--shadow-code)] ring-1 ring-black/10 dark:ring-white/10", className)}>
      <div className="relative flex h-9 items-center border-b border-[var(--line)] px-3">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--line)]" />
          <span className="size-2.5 rounded-full bg-[var(--line)]" />
          <span className="size-2.5 rounded-full bg-[var(--line)]" />
        </span>
        <span className="absolute inset-x-0 text-center text-[12px] text-[var(--ink-soft)]">{title}</span>
      </div>
      {children}
    </div>
  );
}

const field = "mt-1.5 rounded-[5px] px-3 py-2 text-[13px] ring-1 ring-[var(--line)]";

function ConnectorDialog() {
  return (
    <Window title="Settings · Connectors" className="w-full max-w-[440px]">
      <div className="p-5">
        <p className="text-[15px] font-medium">Add custom connector</p>
        <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">Connect a remote MCP server.</p>
        <label className="mt-5 block text-[12px] text-[var(--ink-soft)]">
          Name
          <div className={field + " text-[var(--ink)]"}>Bucket0</div>
        </label>
        <label className="mt-3 block text-[12px] text-[var(--ink-soft)]">
          Remote MCP server URL
          <div className={field + " font-mono text-[12.5px] text-[var(--ink)]"}>https://mcp.bucket0.com/mcp</div>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <span className="rounded-[4px] px-3 py-1.5 text-[12.5px] ring-1 ring-[var(--line)]">Cancel</span>
          <span className="rounded-[4px] bg-[var(--ink)] px-3 py-1.5 text-[12.5px] text-[var(--paper)]">Add</span>
        </div>
      </div>
    </Window>
  );
}

function ChatWindow() {
  return (
    <Window title="New chat" className="w-full max-w-[460px]">
      <div className="space-y-4 p-5 text-[13px]">
        <p className="ml-auto max-w-[85%] rounded-[10px] bg-[var(--paper-2)] px-3.5 py-2.5">
          Save these meeting notes to Bucket0 as acme-call.md
        </p>
        <div className="flex items-center gap-2.5 rounded-[6px] px-3 py-2 ring-1 ring-[var(--line)]">
          <Logo size={16} />
          <span className="text-[12.5px]">Used Bucket0</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--ink-soft)]">
            <CheckTickCircleIcon aria-hidden className="size-3.5 text-[var(--violet)]" />
            acme-call.md · 4.1 KB
          </span>
        </div>
        <p className="leading-relaxed">
          Saved. It&apos;s in your Agent Storage, and I can search it the next time you ask about Acme.
        </p>
        <div className="rounded-[8px] px-3.5 py-3 text-[var(--ink-soft)] ring-1 ring-[var(--line)]">Reply…</div>
      </div>
    </Window>
  );
}

export function McpSection() {
  const { resolvedTheme } = useTheme();
  return (
    <section aria-labelledby="mcp-heading" className={cn(container, "pt-24 md:pt-32")}>
      <SectionHead id="mcp-heading" label="MCP" title="Connect the agent you already use">
        <p>
          Add <code>https://mcp.bucket0.com/mcp</code> as a custom connector in Claude, ChatGPT or Cursor and sign in
          with your Bucket0 account. There&apos;s no key to copy. Writing your own agent? Create a key in the dashboard
          and call the REST API.
        </p>
      </SectionHead>
      <BrushPanel
        id="mcp"
        tone={resolvedTheme === "dark" ? "night" : "stone"}
        className="reveal mt-12 rounded-[14px] md:mt-16 max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden"
      >
        <div aria-hidden inert className="grid items-center gap-6 md:grid-cols-2 md:p-10 lg:gap-10 lg:p-16">
          <div className="flex justify-center md:justify-end">
            <ConnectorDialog />
          </div>
          <div className="flex justify-center md:justify-start">
            <ChatWindow />
          </div>
        </div>
      </BrushPanel>
    </section>
  );
}
