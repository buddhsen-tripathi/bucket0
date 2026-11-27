// Homepage sections after AgentBucket: the drive, the free tools, the open-source repository and the closing call to action.
import Link from "@/web/compat/link";
import { SignedIn, SignedOut } from "@/components/clerk-compat";
import {
  ArrowRightIcon,
  CloudIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  GithubIcon,
  LockCloseIcon,
  PhotoImageIcon,
  ServerIcon,
  UploadUpIcon,
  UserPlusIcon,
} from "@/components/icons";
import { Logo } from "@/components/Logo";
import { IMAGE_TOOLS, PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { BrushPanel } from "@/components/site/BrushPanel";
import { GithubStars } from "@/components/site/GithubStars";
import { SectionHead } from "@/components/site/SectionHead";
import { button, container, GITHUB_URL } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/shared/utils";
import { pageLink, Window } from "./AgentSections";

const SIDEBAR = [
  { label: "My Drive", icon: FolderIcon, active: true },
  { label: "Agent Storage", icon: FileIcon },
  { label: "Shared", icon: UserPlusIcon },
];
const BUCKETS = ["aws-prod-assets", "r2-media", "b2-backups"];
const ROWS = [
  { name: "Reports", kind: "folder", size: "—", date: "Today" },
  { name: "Contracts", kind: "folder", size: "—", date: "Nov 21" },
  { name: "q3-board-deck.pdf", kind: "file", size: "8.4 MB", date: "Nov 20" },
  { name: "launch-video.mp4", kind: "file", size: "412 MB", date: "Nov 18" },
  { name: "brand-kit.zip", kind: "file", size: "96 MB", date: "Nov 12" },
  { name: "team-offsite.jpg", kind: "image", size: "3.2 MB", date: "Nov 09" },
];

function DriveWindow() {
  return (
    <Window title="Bucket0" className="w-full">
      <div className="grid min-h-[380px] grid-cols-[190px_minmax(0,1fr)] max-sm:grid-cols-1">
        <aside className="border-r border-[var(--line)] bg-[var(--paper)] p-3 text-[12.5px] max-sm:hidden">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Logo size={16} />
            <span className="font-medium">Bucket0</span>
          </div>
          <ul className="mt-3 space-y-0.5">
            {SIDEBAR.map(({ label, icon: Icon, active }) => (
              <li key={label} className={cn("flex items-center gap-2 rounded-[5px] px-2 py-1.5", active ? "bg-[var(--paper-2)]" : "text-[var(--ink-soft)]")}>
                <Icon aria-hidden className="size-3.5" />
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-5 px-2 font-mono text-[10px] tracking-[0.12em] text-[var(--ink-soft)] uppercase">Buckets</p>
          <ul className="mt-1.5 space-y-0.5 text-[var(--ink-soft)]">
            {BUCKETS.map((b) => (
              <li key={b} className="flex items-center gap-2 rounded-[5px] px-2 py-1.5 font-mono text-[11.5px]">
                <DatabaseIcon aria-hidden className="size-3.5" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6 px-2">
            <div className="h-1 rounded-full bg-[var(--line)]">
              <div className="h-full w-[38%] rounded-full bg-[var(--violet)]" />
            </div>
            <p className="mt-1.5 font-mono text-[10.5px] text-[var(--ink-soft)]">57 GB of 150 GB</p>
          </div>
        </aside>
        <div className="min-w-0 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px]">
              <span className="text-[var(--ink-soft)]">My Drive /</span> Company
            </p>
            <span className="flex items-center gap-1.5 rounded-[4px] bg-[var(--ink)] px-2.5 py-1.5 text-[12px] text-[var(--paper)]">
              <UploadUpIcon aria-hidden className="size-3.5" />
              Upload
            </span>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_72px_64px] gap-3 border-b border-[var(--line)] pb-2 font-mono text-[10.5px] tracking-[0.1em] text-[var(--ink-soft)] uppercase">
            <span>Name</span>
            <span className="text-right">Size</span>
            <span className="text-right">Modified</span>
          </div>
          <ul>
            {ROWS.map((r) => {
              const Icon = r.kind === "folder" ? FolderIcon : r.kind === "image" ? PhotoImageIcon : FileIcon;
              return (
                <li key={r.name} className="grid grid-cols-[minmax(0,1fr)_72px_64px] items-center gap-3 border-b border-[var(--line)] py-2.5 text-[12.5px] last:border-b-0">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon aria-hidden className={cn("size-4 shrink-0", r.kind === "folder" ? "text-[var(--violet)]" : "text-[var(--ink-soft)]")} />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="text-right font-mono text-[11.5px] text-[var(--ink-soft)] tabular-nums">{r.size}</span>
                  <span className="text-right text-[11.5px] text-[var(--ink-soft)]">{r.date}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Window>
  );
}

function Terminal() {
  return (
    <div className="overflow-hidden rounded-[10px] bg-[var(--night)] font-mono text-[12px] leading-[1.7] text-[var(--night-ink)] shadow-[var(--shadow-code)] ring-1 ring-white/10">
      <div className="flex h-8 items-center gap-1.5 border-b border-white/10 px-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <div className="p-4">
        <p>
          <span className="text-white/45">$</span> aws s3 ls s3://company/ \
        </p>
        <p className="pl-4">--endpoint-url https://s3.bucket0.com</p>
        <pre className="mt-2 font-mono text-[12px] leading-[1.7] whitespace-pre text-white/55">
          {`                           PRE Contracts/
                           PRE Reports/
2026-11-20 14:02:11    8808038 q3-board-deck.pdf
2026-11-12 09:15:40  100663296 brand-kit.zip`}
        </pre>
      </div>
    </div>
  );
}

const DRIVE_POINTS = [
  { icon: LockCloseIcon, title: "Encrypted drive", body: "Files are encrypted at rest. Start with 5 GB free and add space when you need it." },
  { icon: ServerIcon, title: "S3-compatible API", body: "Point the AWS CLI, SDKs, Cyberduck or WinSCP at s3.bucket0.com." },
  { icon: CloudIcon, title: "Buckets you already have", body: "Browse AWS S3, Cloudflare R2, Backblaze, DigitalOcean, Azure and MinIO from one dashboard." },
  { icon: UserPlusIcon, title: "Teams", body: "Shared files, roles and activity logs from Starter, without per-seat fees." },
];

export function DriveSection() {
  const { resolvedTheme } = useTheme();
  return (
    <section aria-labelledby="drive-heading" className={cn(container, "pt-24 md:pt-32")}>
      <SectionHead id="drive-heading" label="Drive" title="Pay for storage. Use it however you like.">
        <p>
          The same account is an encrypted drive for your own files. Upload in the browser, use any S3 tool, connect the
          buckets you already pay for and share folders with your team.
        </p>
      </SectionHead>
      <BrushPanel
        id="drive"
        tone={resolvedTheme === "dark" ? "night" : "lilac"}
        className="reveal mt-12 rounded-[14px] md:mt-16 max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden"
      >
        <div aria-hidden inert className="relative md:px-10 md:pt-10 md:pb-24 lg:px-20 lg:pt-16 lg:pb-28">
          <DriveWindow />
          <div className="absolute right-6 -bottom-2 hidden w-[460px] md:block lg:right-12 lg:bottom-0">
            <Terminal />
          </div>
        </div>
      </BrushPanel>
      <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
        {DRIVE_POINTS.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Icon aria-hidden className="size-5 text-[var(--violet)]" />
            <h3 className="mt-4 text-[16px] font-medium">{title}</h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--ink-soft)]">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ToolsSection() {
  const groups = [
    { label: "PDF", tools: PDF_TOOLS },
    { label: "Image", tools: IMAGE_TOOLS },
  ];
  return (
    <section aria-labelledby="tools-heading" className={cn(container, "pt-24 md:pt-32")}>
      <SectionHead id="tools-heading" label="Free tools" title="PDF and image tools that run in your browser">
        <p>
          Merge, sign, redact, compress and convert without uploading anything. Files stay on your device, and you
          don&apos;t need an account.{" "}
          <Link href="/tools" className={pageLink}>
            All {PDF_TOOLS.length + IMAGE_TOOLS.length} tools
          </Link>
        </p>
      </SectionHead>
      <div className="reveal mt-12 grid gap-px overflow-hidden rounded-[12px] bg-[var(--line)] ring-1 ring-[var(--line)] md:mt-16 lg:grid-cols-[160px_minmax(0,1fr)]">
        {groups.map((g) => (
          <div key={g.label} className="contents">
            <p className="bg-[var(--paper)] px-5 pt-5 font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase lg:py-5">{g.label}</p>
            <ul className="flex flex-wrap gap-2 bg-[var(--paper)] p-5">
              {g.tools.map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/tools/${t.slug}`}
                    className="inline-flex rounded-[4px] bg-[var(--paper-card)] px-3 py-1.5 text-[13.5px] ring-1 ring-[var(--line)] transition-colors hover:ring-[var(--ink)]"
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const TREE = [
  { name: "server/", note: "Hono API and the S3 gateway" },
  { name: "lib/", note: "encryption, quotas, sharing, memory" },
  { name: "web/", note: "React Router pages" },
  { name: "media/", note: "thumbnail service" },
  { name: "wrangler.jsonc", note: "Cloudflare Workers config" },
];

export function OpenSourceSection() {
  return (
    <section aria-labelledby="oss-heading" className={cn(container, "pt-24 md:pt-32")}>
      <div className="grid items-center gap-10 border-y border-[var(--line)] py-14 lg:grid-cols-2 lg:gap-16 md:py-20">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-[var(--ink-soft)] uppercase">Open source</p>
          <h2 id="oss-heading" className="display mt-4 max-w-xl text-[clamp(32px,3.8vw,52px)] leading-[1.04]">
            Read the code that holds your files
          </h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[var(--ink-soft)]">
            Bucket0 is open source under AGPL-3.0. Check how encryption, quotas and sharing work, or run your own copy on
            Cloudflare.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={button.solid}>
              <GithubIcon aria-hidden className="size-4" /> View on GitHub
            </a>
            <GithubStars className="ring-1 ring-[var(--line)] py-2.5" />
          </div>
        </div>
        <div aria-hidden className="overflow-hidden rounded-[10px] bg-[var(--paper-card)] ring-1 ring-[var(--line)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <span className="flex items-center gap-2 font-mono text-[12.5px]">
              <GithubIcon className="size-4" /> buddhsen-tripathi/bucket0
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-soft)] max-sm:hidden">AGPL-3.0 · TypeScript</span>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {TREE.map((f) => (
              <li key={f.name} className="grid grid-cols-[124px_minmax(0,1fr)] gap-4 px-4 py-2.5 text-[12.5px] sm:grid-cols-[150px_minmax(0,1fr)]">
                <span className="flex items-center gap-2 font-mono">
                  {f.name.endsWith("/") ? (
                    <FolderIcon className="size-3.5 text-[var(--violet)]" />
                  ) : (
                    <FileIcon className="size-3.5 text-[var(--ink-soft)]" />
                  )}
                  {f.name}
                </span>
                <span className="truncate text-[var(--ink-soft)]">{f.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className={cn(container, "pt-24 pb-8 md:pt-32")}>
      <BrushPanel id="closing" tone="night" className="reveal rounded-[14px] text-white">
        <div className="flex min-h-[320px] flex-col items-start justify-end gap-8 p-8 md:p-14 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="display max-w-3xl text-balance text-[clamp(34px,4.6vw,60px)] leading-[1.02]">Give your agent somewhere to keep its work</h2>
          <div className="flex shrink-0 flex-wrap gap-3">
            <SignedOut>
              <Link href="/sign-up" className={button.light}>
                Create a free bucket <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard" className={button.light}>
                Go to dashboard <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            </SignedIn>
            <Link href="/docs#agent-bucket" className={button.ghostLight}>
              Read the API docs
            </Link>
          </div>
        </div>
      </BrushPanel>
    </section>
  );
}
