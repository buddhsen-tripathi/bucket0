import type { PointerEvent } from "react";
import Link from "@/web/compat/link";
import { ArrowRightIcon } from "@/components/icons";
import type { Tool } from "./tool-config";

/** Records the pointer position on the card so its spotlight and lit edge follow the cursor. */
function track(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
}

const glow = "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100";

/** One tool in a directory grid: icon, name, one line on what it does, and its path. */
export default function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;

  return (
    <Link
      href={`/tools/${tool.slug}`}
      onPointerMove={track}
      className="group relative isolate flex h-full rounded-[10px] bg-[var(--line)] p-px outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      {/* The edge: a violet light under the 1px border that follows the pointer. */}
      <span
        aria-hidden
        className={glow}
        style={{ background: "radial-gradient(300px circle at var(--x, 50%) var(--y, 50%), var(--violet), transparent 65%)" }}
      />
      <div className="relative flex w-full flex-col overflow-hidden rounded-[9px] bg-[var(--paper-card)] p-5">
        <span
          aria-hidden
          className={glow}
          style={{ background: "radial-gradient(320px circle at var(--x, 50%) var(--y, 50%), var(--violet-soft), transparent 70%)" }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <span className="grid size-9 place-items-center rounded-[7px] border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] transition-colors duration-300 group-hover:border-[var(--ink)] group-hover:bg-[var(--ink)] group-hover:text-[var(--paper)]">
            <Icon aria-hidden strokeWidth={1.6} className="size-[18px]" />
          </span>
          <ArrowRightIcon
            aria-hidden
            className="size-4 -translate-x-1 text-[var(--ink)] opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100"
          />
        </div>
        <h3 className="relative mt-5 text-[15px] font-medium tracking-[-0.01em] text-[var(--ink)]">{tool.name}</h3>
        <p className="relative mt-1.5 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">{tool.description}</p>
        <p className="relative mt-auto pt-4 font-mono text-[11.5px] text-[var(--ink-soft)] transition-colors group-hover:text-[var(--violet)]">
          /tools/{tool.slug}
        </p>
      </div>
    </Link>
  );
}
