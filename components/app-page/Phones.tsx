// Android phone mockups for /app, drawn in the site palette: the drive, an upload sheet, and the storage list with a
// team notification. Decorative only; the page copy carries the meaning.
import type { ReactNode } from "react";
import { Bell, Video } from "lucide-react";
import {
  CheckTickCircleIcon,
  CloudIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  PhotoImageIcon,
  SearchIcon,
  Settings01Icon,
  UploadUpIcon,
  UserPlusIcon,
} from "@/components/icons";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/shared/utils";

const TABS = [
  { label: "Files", icon: FolderIcon },
  { label: "Buckets", icon: DatabaseIcon },
  { label: "Teams", icon: UserPlusIcon },
  { label: "Settings", icon: Settings01Icon },
];

/** An Android phone: ink bezel, punch-hole camera, status bar, content and a bottom navigation bar. */
function Phone({ active, className, children }: { active: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn("w-[264px] shrink-0 rounded-[38px] bg-[#141317] p-[7px] shadow-[var(--shadow-code)] ring-1 ring-black/20 dark:ring-white/10", className)}>
      <div className="relative flex h-[540px] flex-col overflow-hidden rounded-[32px] bg-[var(--paper-card)] text-[var(--ink)]">
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] font-medium tabular-nums">
          <span>9:41</span>
          <span aria-hidden className="absolute top-2.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-[#141317]" />
          <span className="flex items-center gap-1">
            <span className="flex items-end gap-[1.5px]">
              {[4, 6, 8, 10].map((h) => (
                <span key={h} className="w-[2px] rounded-full bg-[var(--ink)]/70" style={{ height: h }} />
              ))}
            </span>
            <span className="ml-1 h-[8px] w-4 rounded-[2px] p-[1px] ring-1 ring-[var(--ink)]/50">
              <span className="block h-full w-3/4 rounded-[1px] bg-[var(--ink)]/70" />
            </span>
          </span>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
        <nav className="grid grid-cols-4 border-t border-[var(--line)] bg-[var(--paper)] px-2 pt-2 pb-1.5">
          {TABS.map(({ label, icon: Icon }, i) => (
            <span key={label} className="flex flex-col items-center gap-1">
              <span className={cn("flex h-6 w-12 items-center justify-center rounded-full", i === active && "bg-[var(--violet-soft)]")}>
                <Icon className={cn("size-[15px]", i === active ? "text-[var(--violet)]" : "text-[var(--ink-soft)]")} />
              </span>
              <span className={cn("text-[9.5px]", i === active ? "font-medium" : "text-[var(--ink-soft)]")}>{label}</span>
            </span>
          ))}
        </nav>
        <div className="flex justify-center bg-[var(--paper)] pb-1.5">
          <span className="h-1 w-20 rounded-full bg-[var(--ink)]/25" />
        </div>
      </div>
    </div>
  );
}

const DRIVE = [
  { name: "Reports", meta: "14 items", kind: "folder" },
  { name: "Contracts", meta: "6 items", kind: "folder" },
  { name: "q3-board-deck.pdf", meta: "8.4 MB · Nov 20", kind: "file" },
  { name: "launch-video.mp4", meta: "412 MB · Nov 18", kind: "file" },
  { name: "team-offsite.jpg", meta: "3.2 MB · Nov 9", kind: "image" },
  { name: "brand-kit.zip", meta: "96 MB · Nov 12", kind: "file" },
];

function Row({ icon: Icon, name, meta, tint = false }: { icon: typeof FileIcon; name: string; meta: string; tint?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-[8px]", tint ? "bg-[var(--violet-soft)] text-[var(--violet)]" : "bg-[var(--paper-2)] text-[var(--ink-soft)]")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium">{name}</span>
        <span className="block truncate text-[10px] text-[var(--ink-soft)]">{meta}</span>
      </span>
    </li>
  );
}

export function DrivePhone({ className }: { className?: string }) {
  return (
    <Phone active={0} className={className}>
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-[17px] font-medium tracking-[-0.02em]">My Drive</span>
        <span className="grid size-7 place-items-center rounded-full bg-[var(--paper-2)]">
          <Logo size={14} />
        </span>
      </div>
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-full bg-[var(--paper-2)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">
        <SearchIcon className="size-3.5" />
        Search your files
      </div>
      <div className="mx-4 mt-3 rounded-[10px] px-3 py-2.5 ring-1 ring-[var(--line)]">
        <div className="flex items-baseline justify-between text-[10.5px]">
          <span className="text-[var(--ink-soft)]">Storage</span>
          <span className="font-mono tabular-nums">57.2 / 150 GB</span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-[var(--paper-2)]">
          <div className="h-full w-[38%] rounded-full bg-[var(--violet)]" />
        </div>
      </div>
      <ul className="mt-2">
        {DRIVE.map((f) => (
          <Row key={f.name} icon={f.kind === "folder" ? FolderIcon : f.kind === "image" ? PhotoImageIcon : FileIcon} name={f.name} meta={f.meta} tint={f.kind === "folder"} />
        ))}
      </ul>
      <span className="absolute right-4 bottom-3 grid size-11 place-items-center rounded-[14px] bg-[var(--ink)] text-[var(--paper)] shadow-lg">
        <UploadUpIcon className="size-[18px]" />
      </span>
    </Phone>
  );
}

export function UploadPhone({ className }: { className?: string }) {
  return (
    <Phone active={0} className={className}>
      <div className="px-4 pt-2 text-[17px] font-medium tracking-[-0.02em] opacity-40">Reports</div>
      <ul className="mt-2 opacity-40">
        <Row icon={FileIcon} name="q3-board-deck.pdf" meta="8.4 MB" />
        <Row icon={FileIcon} name="pipeline-review.xlsx" meta="212 KB" />
      </ul>
      <div className="absolute inset-0 bg-[#141317]/35" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-[var(--paper-card)] px-4 pt-2 pb-4 shadow-[0_-12px_30px_-12px_rgb(0_0_0/0.35)]">
        <span className="mx-auto block h-1 w-9 rounded-full bg-[var(--ink)]/20" />
        <p className="mt-3 text-[13px] font-medium">Upload to Reports</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
          {[
            { label: "Take photo", icon: PhotoImageIcon },
            { label: "Record video", icon: Video },
            { label: "Choose files", icon: FileIcon },
          ].map(({ label, icon: Icon }) => (
            <span key={label} className="flex flex-col items-center gap-1.5 rounded-[10px] py-2.5 ring-1 ring-[var(--line)] [&_svg]:stroke-[2]">
              <Icon className="size-4 text-[var(--violet)]" />
              {label}
            </span>
          ))}
        </div>
        <p className="mt-4 font-mono text-[9.5px] tracking-[0.12em] text-[var(--ink-soft)] uppercase">Uploading 2 files</p>
        <ul className="mt-2 space-y-2.5">
          <li>
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate">IMG_2041.jpg</span>
              <CheckTickCircleIcon className="size-3.5 text-[var(--violet)]" />
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-[var(--violet)]" />
          </li>
          <li>
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate">receipt-scan.pdf</span>
              <span className="font-mono text-[10px] text-[var(--ink-soft)] tabular-nums">62%</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-[var(--paper-2)]">
              <div className="h-full w-[62%] rounded-full bg-[var(--violet)]" />
            </div>
          </li>
        </ul>
      </div>
    </Phone>
  );
}

const SOURCES = [
  { name: "Bucket0", meta: "Encrypted storage · 57.2 GB", tint: true, icon: CloudIcon },
  { name: "aws-prod-assets", meta: "AWS S3 · us-east-1", icon: DatabaseIcon },
  { name: "r2-media", meta: "Cloudflare R2", icon: DatabaseIcon },
  { name: "b2-backups", meta: "Backblaze B2", icon: DatabaseIcon },
  { name: "do-spaces-static", meta: "DigitalOcean Spaces", icon: DatabaseIcon },
];

export function BucketsPhone({ className }: { className?: string }) {
  return (
    <Phone active={1} className={className}>
      <div className="mx-3 mt-1 rounded-[14px] bg-[var(--paper)] px-3 py-2.5 shadow-[0_10px_24px_-12px_rgb(0_0_0/0.45)] ring-1 ring-[var(--line)]">
        <div className="flex items-center gap-1.5 text-[9.5px] text-[var(--ink-soft)]">
          <Bell className="size-3" strokeWidth={1.8} />
          Bucket0 · now
        </div>
        <p className="mt-1 text-[11.5px] font-medium">Design team</p>
        <p className="text-[11px] text-[var(--ink-soft)]">Priya added 3 files to Contracts</p>
      </div>
      <div className="px-4 pt-3 text-[17px] font-medium tracking-[-0.02em]">Buckets</div>
      <ul className="mt-2">
        {SOURCES.map((s) => (
          <Row key={s.name} icon={s.icon} name={s.name} meta={s.meta} tint={s.tint} />
        ))}
      </ul>
      <div className="mx-4 mt-2 rounded-[10px] border border-dashed border-[var(--line)] py-2.5 text-center text-[11px] text-[var(--ink-soft)]">
        Connect a bucket
      </div>
    </Phone>
  );
}
