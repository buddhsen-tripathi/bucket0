// The tools page hero's picture: Merge PDF at work in a browser window, with the tab's activity beside it. Every step
// reads or writes in the tab's memory, so the upload counter stays at zero.
import { DownloadDownIcon, FileIcon, LockCloseIcon } from "@/components/icons";

const FILES = [
  { name: "q3-report.pdf", pages: 12, size: "1.8 MB" },
  { name: "appendix-a.pdf", pages: 8, size: "940 KB" },
  { name: "cover-letter.pdf", pages: 4, size: "310 KB" },
];

const ACTIVITY = [
  { op: "read", target: "q3-report.pdf", note: "12 pages" },
  { op: "read", target: "appendix-a.pdf", note: "8 pages" },
  { op: "read", target: "cover-letter.pdf", note: "4 pages" },
  { op: "write", target: "merged.pdf", note: "24 pages" },
];

export function LocalRunPanel() {
  return (
    <div className="overflow-hidden rounded-[10px] bg-[var(--paper-card)] text-[var(--ink)] shadow-[var(--shadow-code)]">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-[var(--line)] px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--line)]" />
          <span className="size-2.5 rounded-full bg-[var(--line)]" />
          <span className="size-2.5 rounded-full bg-[var(--line)]" />
        </span>
        <span className="mx-auto flex items-center gap-1.5 rounded-[5px] bg-[var(--paper-2)] px-3 py-1 font-mono text-[11.5px] text-[var(--ink-soft)]">
          <LockCloseIcon aria-hidden className="size-3" />
          bucket0.com/tools/merge
        </span>
        <span className="w-[42px]" />
      </div>

      <div className="grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 p-5 sm:p-6">
          <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--ink-soft)] uppercase">Merge PDF · file order</p>
          <ol className="mt-4 space-y-1.5">
            {FILES.map((f, i) => (
              <li key={f.name} className="flex items-center gap-3 rounded-[6px] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5">
                <span className="w-4 font-mono text-[11.5px] text-[var(--ink-soft)]">{i + 1}</span>
                <FileIcon aria-hidden className="size-4 shrink-0 text-[var(--ink-soft)]" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{f.name}</span>
                <span className="hidden font-mono text-[11.5px] text-[var(--ink-soft)] sm:inline">{f.pages} pp</span>
                <span className="font-mono text-[11.5px] tabular-nums text-[var(--ink-soft)]">{f.size}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center rounded-[3px] bg-[var(--ink)] px-3.5 py-2 text-[13px] font-medium text-[var(--paper)]">
              Merge 3 PDFs
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--ink)] px-3.5 py-2 text-[13px] font-medium">
              <DownloadDownIcon aria-hidden className="size-3.5" />
              merged.pdf
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col bg-[var(--night)] text-[var(--night-ink)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <p className="font-mono text-[11px] tracking-[0.14em] text-white/50 uppercase">This tab</p>
            <p className="font-mono text-[11.5px] text-white/60">pdf-lib</p>
          </div>
          <ul className="flex-1 space-y-2.5 px-5 py-4">
            {ACTIVITY.map((a) => (
              <li key={a.target} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 font-mono text-[12px]">
                <span className={a.op === "write" ? "text-[oklch(0.76_0.1_300)]" : "text-white/45"}>{a.op}</span>
                <span className="truncate text-white/85">{a.target}</span>
                <span className="text-white/45">{a.note}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-4 border-t border-white/10 px-5 py-3.5 font-mono text-[12px]">
            <span className="text-white/55">Uploaded</span>
            <span className="text-white">0 bytes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
