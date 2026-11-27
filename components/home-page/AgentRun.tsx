// The homepage hero's demo: one agent task through AgentBucket, played back in real time. The agent's code is on the
// left and each request it makes on the right, with its timing. Requests and responses follow the real API: memory
// search returns { results: [{ key, snippet, score }] }, upload returns { key }, share returns { shareUrl }.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { FileIcon, LinkSlantIcon, RefreshIcon, SearchIcon, UploadUpIcon } from "@/components/icons";
import { cn } from "@/lib/shared/utils";

const ASK = "Pull together last week’s customer calls and send me a link.";
const ANSWER = "Done. The summary is saved as call-summary.md and shared at bucket0.com/s/6f1c2e…";

type Step = {
  kind: "api" | "local";
  start: number;
  ms: number;
  title: string;
  detail: string;
  icon: typeof SearchIcon;
};

/** The run, in milliseconds from its start. */
const STEPS: Step[] = [
  { kind: "api", start: 0, ms: 620, title: "POST /memory/search", detail: "query: “customer call notes” · topK 3", icon: SearchIcon },
  { kind: "local", start: 640, ms: 1040, title: "Agent writes call-summary.md", detail: "from the three snippets", icon: FileIcon },
  { kind: "api", start: 1700, ms: 480, title: "POST /files/upload", detail: "call-summary.md · 6.2 KB · indexed", icon: UploadUpIcon },
  { kind: "api", start: 2200, ms: 160, title: "POST /files/share", detail: "bucket0.com/s/6f1c2e…", icon: LinkSlantIcon },
];
const RUN_MS = 2400;

const HITS = [
  { key: "calls/2026-11-18-acme.md", score: 0.82 },
  { key: "calls/2026-11-19-northwind.md", score: 0.79 },
  { key: "calls/2026-11-20-globex.md", score: 0.74 },
];

type Lang = "python" | "typescript" | "curl";

const FILES: Record<Lang, string> = { python: "notes_agent.py", typescript: "notes-agent.ts", curl: "notes-agent.sh" };

/** One block per step after the setup, so the running step's block can light up. */
const CODE: Record<Lang, string[]> = {
  python: [
    `import requests

B0 = "https://bucket0.com/api/agent-bucket"
auth = {"Authorization": f"Bearer {BUCKET0_KEY}"}`,
    `hits = requests.post(f"{B0}/memory/search", headers=auth,
    json={"query": "customer call notes", "topK": 3}).json()["results"]`,
    `summary = summarise([h["snippet"] for h in hits])`,
    `saved = requests.post(f"{B0}/files/upload", headers=auth,
    files={"file": ("call-summary.md", summary)}).json()`,
    `link = requests.post(f"{B0}/files/share", headers=auth,
    json={"key": saved["key"]}).json()["shareUrl"]`,
    `print(link)`,
  ],
  typescript: [
    `const B0 = "https://bucket0.com/api/agent-bucket";
const auth = { Authorization: \`Bearer \${BUCKET0_KEY}\` };
const post = (path: string, body: BodyInit) =>
  fetch(B0 + path, { method: "POST", headers: auth, body }).then((r) => r.json());`,
    `const { results } = await post("/memory/search",
  JSON.stringify({ query: "customer call notes", topK: 3 }));`,
    `const summary = await summarise(results.map((r) => r.snippet));`,
    `const form = new FormData();
form.append("file", new Blob([summary]), "call-summary.md");
const saved = await post("/files/upload", form);`,
    `const { shareUrl } = await post("/files/share",
  JSON.stringify({ key: saved.key }));`,
    `return shareUrl;`,
  ],
  curl: [
    `B0=https://bucket0.com/api/agent-bucket
AUTH="Authorization: Bearer $BUCKET0_KEY"`,
    `curl -s "$B0/memory/search" -H "$AUTH" \\
  --json '{"query": "customer call notes", "topK": 3}'`,
    `# your agent writes call-summary.md from the hits`,
    `curl -s "$B0/files/upload" -H "$AUTH" -F file=@call-summary.md`,
    `curl -s "$B0/files/share" -H "$AUTH" \\
  --json '{"key": "call-summary.md"}'`,
    `# {"success": true, "shareUrl": "https://bucket0.com/s/6f1c2e…"}`,
  ],
};

const COMMENT: Record<Lang, string> = {
  python: "# or connect https://mcp.bucket0.com/mcp, no key to paste",
  typescript: "// or connect https://mcp.bucket0.com/mcp, no key to paste",
  curl: "# or connect https://mcp.bucket0.com/mcp, no key to paste",
};

const KEYWORDS = /^(import|from|def|return|const|await|new|for|in|curl)$/;
const TOKEN = /(#[^\n]*|\/\/[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w]*)/g;

/** Strings and numbers in violet, keywords and comments stepped back; everything else stays ink. */
function Highlighted({ code, lang }: { code: string; lang: Lang }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const [text] = match;
    const at = match.index ?? 0;
    if (at > last) parts.push(code.slice(last, at));
    const isComment = text.startsWith("#") || (lang !== "curl" && text.startsWith("//"));
    const className = isComment
      ? "text-[var(--ink-soft)] italic"
      : /^["'`]/.test(text) || /^\d/.test(text)
        ? "text-[var(--violet)]"
        : KEYWORDS.test(text)
          ? "text-[var(--ink-soft)]"
          : undefined;
    parts.push(className ? <span key={at} className={className}>{text}</span> : <Fragment key={at}>{text}</Fragment>);
    last = at + text.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <code className="block whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.7] max-sm:text-[11px]">{parts}</code>;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Plays the run once when it scrolls into view, and again on Replay or when the language changes. */
function usePlayback() {
  const [t, setT] = useState(0);
  const root = useRef<HTMLElement>(null);
  const frame = useRef(0);

  const play = useCallback(() => {
    cancelAnimationFrame(frame.current);
    if (reducedMotion()) {
      setT(RUN_MS);
      return;
    }
    const began = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - began, RUN_MS);
      setT(elapsed);
      if (elapsed < RUN_MS) frame.current = requestAnimationFrame(tick);
    };
    setT(0);
    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          play();
          seen.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [play]);

  return { t, play, root };
}

export function AgentRun() {
  const [lang, setLang] = useState<Lang>("python");
  const { t, play, root } = usePlayback();

  const done = t >= RUN_MS;
  const started = (s: Step) => t >= s.start;
  const finished = (s: Step) => t >= s.start + s.ms;
  const current = STEPS.reduce((at, s, i) => (started(s) ? i : at), -1);
  const blocks = CODE[lang];

  const pick = (next: Lang) => {
    setLang(next);
    play();
  };

  return (
    <section
      ref={root}
      aria-label="Example: an agent saves and shares a file with AgentBucket"
      className="overflow-hidden rounded-[10px] bg-[var(--paper-card)] text-[var(--ink)] shadow-[var(--shadow-code)]"
    >
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Logo size={18} />
          <span className="font-mono text-[13px]">{FILES[lang]}</span>
        </div>
        <div role="radiogroup" aria-label="Language" className="order-last flex basis-full gap-1 md:order-none md:basis-auto md:flex-1">
          {(["python", "typescript", "curl"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === lang}
              onClick={() => pick(l)}
              className={cn(
                "rounded-full px-3 py-1 text-[12.5px] ring-1 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ink)]",
                l === lang ? "bg-[var(--ink)] text-[var(--paper)] ring-[var(--ink)]" : "text-[var(--ink-soft)] ring-[var(--line)] hover:text-[var(--ink)]",
              )}
            >
              {l === "python" ? "Python" : l === "typescript" ? "TypeScript" : "curl"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={play}
          className="ml-auto flex items-center gap-1.5 rounded-[3px] px-1.5 py-1 text-[12.5px] text-[var(--ink-soft)] outline-none hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
        >
          <RefreshIcon aria-hidden className="size-3.5" />
          Replay
        </button>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,10fr)_minmax(0,11fr)]">
        {/* The agent's code: the block for the running step is lit, the rest step back. */}
        <div aria-hidden className="min-w-0 space-y-1 px-2 py-4 sm:px-3 lg:py-5">
          <p className="px-3 pb-2 font-mono text-[11.5px] text-[var(--ink-soft)]">{COMMENT[lang]}</p>
          {blocks.map((code, i) => {
            const lit = i === 0 ? current < 0 : i === blocks.length - 1 ? done : current === i - 1 && !done;
            return (
              <div
                key={`${lang}-${i}`}
                className={cn(
                  "rounded-[6px] border-l-2 px-3 py-1.5 transition-[opacity,background-color,border-color] duration-300",
                  lit ? "border-[var(--violet)] bg-[var(--paper-2)] opacity-100" : "border-transparent opacity-45",
                )}
              >
                <Highlighted code={code} lang={lang} />
              </div>
            );
          })}
        </div>

        {/* The run as AgentBucket sees it. Every row is laid out from the start, so nothing shifts as they appear. */}
        <div className="flex min-w-0 flex-col bg-[var(--night)] text-[var(--night-ink)]">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
            <p className="font-mono text-[11px] tracking-[0.14em] text-white/50 uppercase">Run</p>
            <p className="flex items-center gap-2 font-mono text-[12px] tabular-nums text-white/70">
              <span className={cn("size-1.5 rounded-full", done ? "bg-white/50" : "animate-pulse bg-[oklch(0.76_0.1_300)]")} />
              {done ? "Done" : "Running"} · {secs(t)}
            </p>
          </div>

          <div className="px-5 pt-4">
            <p className="font-mono text-[11px] tracking-[0.14em] text-white/45 uppercase">You</p>
            <p className="mt-1 text-[14px] text-white/90">{ASK}</p>
          </div>

          <ol className="mt-4 flex-1 space-y-1 px-3">
            {STEPS.map((s, i) => {
              const ran = Math.min(Math.max(t - s.start, 0), s.ms);
              const Icon = s.icon;
              return (
                <li
                  key={s.title}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 rounded-[6px] px-2 py-2.5 transition-[opacity,transform] duration-300",
                    started(s) ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                    current === i && !done && "bg-white/[0.06]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-[5px] border border-white/15">
                      <Icon aria-hidden className="size-3.5 text-white/80" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("truncate text-[12.5px]", s.kind === "api" ? "font-mono text-white" : "text-white/70")}>{s.title}</p>
                      <p className="truncate text-[11.5px] text-white/50">{s.detail}</p>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[12px] tabular-nums">
                    <p className="text-white/80">{secs(ran)}</p>
                    <p className={cn("transition-opacity", s.kind === "api" && finished(s) ? "text-white/50 opacity-100" : "opacity-0")}>200</p>
                  </div>
                  <div className="relative col-span-2 mt-2 h-1 rounded-full bg-white/[0.08]">
                    <span
                      className={cn("absolute inset-y-0 rounded-full", s.kind === "api" ? "bg-[oklch(0.76_0.1_300)]" : "bg-white/35")}
                      style={{ left: `${(s.start / RUN_MS) * 100}%`, width: `${(ran / RUN_MS) * 100}%` }}
                    />
                  </div>
                  {i === 0 && (
                    <ul className={cn("col-span-2 mt-2.5 space-y-1 transition-opacity duration-300", finished(s) ? "opacity-100" : "opacity-0")}>
                      {HITS.map((h) => (
                        <li key={h.key} className="grid grid-cols-[minmax(0,1fr)_64px_36px] items-center gap-3 font-mono text-[11.5px] text-white/60">
                          <span className="truncate">{h.key}</span>
                          <span className="h-[3px] rounded-full bg-white/[0.08]">
                            <span className="block h-full rounded-full bg-white/40" style={{ width: `${h.score * 100}%` }} />
                          </span>
                          <span className="text-right tabular-nums">{h.score.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>

          <div className={cn("mx-5 mt-3 rounded-[6px] bg-white/[0.08] px-3 py-2.5 transition-opacity duration-500", done ? "opacity-100" : "opacity-0")}>
            <p className="font-mono text-[11px] tracking-[0.14em] text-white/45 uppercase">Agent</p>
            <p className="mt-1 text-[14px] text-white/90">{ANSWER}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/10 px-5 py-3.5 font-mono text-[12px] tabular-nums">
            <span className="text-white/55">3 API calls · 1 key</span>
            <span className="text-white">6.2 KB · {secs(t)}</span>
          </div>
        </div>
      </div>
      <p className="sr-only" role="status">
        {done ? "Run finished: one memory search, one upload and one share link in 2.4 seconds." : ""}
      </p>
    </section>
  );
}
