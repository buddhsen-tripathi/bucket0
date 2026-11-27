import type { CSSProperties } from "react";
import { SignedIn, SignedOut } from "@/components/clerk-compat";
import { AgentRun } from "@/components/home-page/AgentRun";
import { ClosingCta } from "@/components/home-page/DriveSections";
import { ArrowRightIcon } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { BrushPanel } from "@/components/site/BrushPanel";
import { SectionHead } from "@/components/site/SectionHead";
import { button, container, eyebrow, sectionTitle, textLink } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import {
  AGENTBUCKET_COMPARISON,
  AGENTBUCKET_DESCRIPTION,
  AGENTBUCKET_FAQ,
  AGENTBUCKET_STEPS,
  AGENTBUCKET_TITLE,
} from "@/lib/shared/agentbucket-content";
import { constructMetadata } from "@/lib/shared/seo";
import { cn } from "@/lib/shared/utils";
import Link from "@/web/compat/link";
import { nextMeta } from "@/web/compat/meta";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const MCP_SNIPPET = `{
  "mcpServers": {
    "bucket0": { "url": "https://mcp.bucket0.com/mcp" }
  }
}`;

const REST_SNIPPET = `# save a file
curl -s https://bucket0.com/api/agent-bucket/files/upload \\
  -H "Authorization: Bearer $BUCKET0_KEY" -F file=@notes.md

# find it again next week
curl -s https://bucket0.com/api/agent-bucket/memory/search \\
  -H "Authorization: Bearer $BUCKET0_KEY" \\
  --json '{"query": "what did we decide about pricing?"}'`;

const PROBLEMS = [
  {
    title: "Context ends with the session",
    body: "A conversation keeps what it knows only until it closes. The next session starts empty unless the work was saved somewhere it can reach.",
  },
  {
    title: "Sandboxes are temporary",
    body: "Files an assistant writes in a code sandbox are usually deleted when the sandbox shuts down, along with the CSVs, charts and drafts it produced.",
  },
  {
    title: "Raw buckets need plumbing",
    body: "An object store keeps files, but the agent then needs credentials, an SDK and its own way to find the right file again.",
  },
];

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-[var(--paper-card)] ring-1 ring-[var(--line)]">
      <p className="border-b border-[var(--line)] px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">
        {label}
      </p>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function AgentBucketPage() {
  const { resolvedTheme } = useTheme();
  return (
    <main>
      <JsonLd type="faq" faqs={AGENTBUCKET_FAQ} />
      <JsonLd
        type="breadcrumb"
        breadcrumbs={[
          { name: "Home", url: "https://bucket0.com" },
          { name: "AgentBucket", url: "https://bucket0.com/agentbucket" },
        ]}
      />

      <section className={cn(container, "pt-14 pb-20 md:pt-24 md:pb-24")}>
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:gap-16">
          <div>
            <p className={cn(eyebrow, "rise")}>AgentBucket by Bucket0</p>
            <h1 className="display rise mt-5 text-balance text-[clamp(44px,5.6vw,84px)] leading-[0.98]" style={delay(60)}>
              Persistent file storage for AI agents
            </h1>
          </div>
          <div className="rise flex flex-col justify-end lg:pb-2" style={delay(300)}>
            <p className="max-w-[560px] text-[19px] leading-[1.45] text-[var(--ink)]/85 md:text-[21px]">
              Agents lose their working files when a session ends. AgentBucket gives Claude, ChatGPT, Cursor and your
              own agents a place to save files that is still there next time, over MCP or a REST API.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <SignedOut>
                <Link href="/sign-up" className={button.solid}>
                  Create a free bucket <ArrowRightIcon aria-hidden className="size-4" />
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard" className={button.solid}>
                  Go to dashboard <ArrowRightIcon aria-hidden className="size-4" />
                </Link>
              </SignedIn>
              <Link href="/docs#mcp" className={button.outline}>
                Read the MCP docs
              </Link>
            </div>
          </div>
        </div>
        <div className="rise mt-14 md:mt-20" style={delay(420)}>
          <BrushPanel
            id="agentbucket-hero"
            tone={resolvedTheme === "dark" ? "night" : "lilac"}
            className="rounded-[14px] max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden md:p-5 lg:p-10"
          >
            <AgentRun />
          </BrushPanel>
        </div>
      </section>

      <section aria-labelledby="problem-heading" className={cn(container, "pt-8 md:pt-16")}>
        <SectionHead id="problem-heading" label="The problem" title="Why agents lose their files">
          <p>Long-running work needs somewhere to live between sessions, and none of the defaults are built for it.</p>
        </SectionHead>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-[12px] bg-[var(--line)] ring-1 ring-[var(--line)] md:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <li key={p.title} className="bg-[var(--paper-card)] p-6 md:p-8">
              <p className="font-mono text-[12px] text-[var(--ink-soft)]">0{i + 1}</p>
              <h3 className="mt-6 text-[18px] font-medium">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className={cn(container, "pt-24 md:pt-32")}>
        <SectionHead id="how-heading" label="How it works" title="Save it in one session, find it in the next">
          <p>
            Connectors and API keys on your account share one Agent Storage, so a file saved from ChatGPT is there when
            Cursor asks for it.
          </p>
        </SectionHead>
        <div className="mt-12 grid gap-10 md:mt-16 lg:grid-cols-2 lg:gap-16">
          <ol className="border-t border-[var(--line)]">
            {AGENTBUCKET_STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[48px_minmax(0,1fr)] gap-4 border-b border-[var(--line)] py-6">
                <span className="font-mono text-[13px] text-[var(--violet)]">0{i + 1}</span>
                <div>
                  <h3 className="text-[18px] font-medium">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--ink-soft)]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="space-y-4">
            <Snippet label="Cursor · mcp.json" code={MCP_SNIPPET} />
            <Snippet label="REST API" code={REST_SNIPPET} />
            <p className="text-[14px] text-[var(--ink-soft)]">
              Every endpoint, request and response is in the{" "}
              <Link href="/docs#agent-bucket" className={cn(textLink, "text-[var(--ink)]")}>
                API reference
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="compare-heading" className={cn(container, "pt-24 md:pt-32")}>
        <SectionHead id="compare-heading" label="Compared" title="AgentBucket or a general object store?">
          <p>
            Amazon S3 and Google Cloud Storage are the right call when you need regions, IAM and petabytes. AgentBucket
            is for agents that need to keep and find their own files without you building the plumbing.
          </p>
        </SectionHead>
        <dl className="mt-12 divide-y divide-[var(--line)] rounded-[12px] bg-[var(--paper-card)] ring-1 ring-[var(--line)] md:hidden">
          {AGENTBUCKET_COMPARISON.map((row) => (
            <div key={row.need} className="p-5">
              <dt className="font-medium">{row.need}</dt>
              <dd className="mt-3 text-[14.5px]">
                <span className="block font-mono text-[10.5px] tracking-[0.14em] text-[var(--violet)] uppercase">AgentBucket</span>
                {row.agentbucket}
              </dd>
              <dd className="mt-3 text-[14.5px] text-[var(--ink-soft)]">
                <span className="block font-mono text-[10.5px] tracking-[0.14em] uppercase">S3 / Cloud Storage</span>
                {row.objectStore}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-16 hidden overflow-hidden rounded-[12px] ring-1 ring-[var(--line)] md:block">
          <table className="w-full border-collapse bg-[var(--paper-card)] text-left text-[14.5px]">
            <thead>
              <tr className="border-b border-[var(--line)] font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">
                <th className="w-[22%] px-5 py-4 font-medium">You need to</th>
                <th className="px-5 py-4 font-medium text-[var(--violet)]">AgentBucket</th>
                <th className="px-5 py-4 font-medium">Amazon S3 / Google Cloud Storage</th>
              </tr>
            </thead>
            <tbody>
              {AGENTBUCKET_COMPARISON.map((row) => (
                <tr key={row.need} className="border-b border-[var(--line)] last:border-b-0">
                  <th scope="row" className="px-5 py-4 font-medium">
                    {row.need}
                  </th>
                  <td className="px-5 py-4">{row.agentbucket}</td>
                  <td className="px-5 py-4 text-[var(--ink-soft)]">{row.objectStore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="agentbucket-faq-heading"
        className={cn(container, "grid gap-10 pt-24 md:pt-32 lg:grid-cols-[5fr_7fr] lg:gap-20")}
      >
        <div>
          <p className={eyebrow}>Questions</p>
          <h2 id="agentbucket-faq-heading" className={cn(sectionTitle, "mt-4")}>
            Agent storage, answered
          </h2>
        </div>
        <div className="border-t border-[var(--line)]">
          {AGENTBUCKET_FAQ.map((item) => (
            <details key={item.question} className="group border-b border-[var(--line)]" open={item === AGENTBUCKET_FAQ[0]}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16.5px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)] [&::-webkit-details-marker]:hidden">
                <h3>{item.question}</h3>
                <span aria-hidden className="relative size-3.5 shrink-0">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-current transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <p className="max-w-2xl pr-8 pb-5 text-[15px] leading-relaxed text-[var(--ink-soft)]">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <ClosingCta />
    </main>
  );
}

export const meta = () =>
  nextMeta(
    constructMetadata({
      title: AGENTBUCKET_TITLE,
      description: AGENTBUCKET_DESCRIPTION,
      keywords: [
        "persistent file storage for AI agents",
        "AI agent file storage",
        "MCP file storage",
        "agent memory",
        "Claude persistent files",
        "ChatGPT file storage",
      ],
    })
  );
