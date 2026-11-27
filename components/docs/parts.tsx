import type { ReactNode } from "react";
import { cn } from "@/lib/shared/utils";

/** A top-level docs section: its id is the page anchor, and the sidebar and table of contents follow it. */
export function DocSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} data-doc-section className="scroll-mt-32 lg:scroll-mt-24 border-t border-[var(--line)] pt-14 pb-4 first:border-t-0 first:pt-0">
      <h2 data-toc={title} className="display text-[30px] leading-[1.1] md:text-[34px]">
        {title}
      </h2>
      {description ? <p className="mt-2 text-[17px] text-[var(--ink-soft)]">{description}</p> : null}
      <div className="mt-6 text-[15.5px] leading-[1.75] text-[var(--ink)]/90">{children}</div>
    </section>
  );
}

/** A subsection heading, listed in "On this page". */
export function H3({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} data-toc={children} data-toc-sub className="mt-10 mb-3 scroll-mt-32 lg:scroll-mt-24 text-[19px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
      {children}
    </h3>
  );
}

export function H4({ children }: { children: ReactNode }) {
  return <h4 className="mt-7 mb-2 text-[15.5px] font-semibold text-[var(--ink)]">{children}</h4>;
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("my-4", className)}>{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[4px] bg-[var(--paper-2)] px-[5px] py-[1.5px] font-mono text-[0.86em] text-[var(--ink)]">
      {children}
    </code>
  );
}

/** Numbered steps on a vertical rule. */
export function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="my-6">
      {children.map((step, i) => (
        <li key={i} className="relative pb-5 pl-10 last:pb-0">
          {i < children.length - 1 && <span aria-hidden className="absolute top-7 bottom-0 left-[11px] w-px bg-[var(--line)]" />}
          <span className="absolute top-0.5 left-0 grid size-[23px] place-items-center rounded-full border border-[var(--line)] bg-[var(--paper-card)] font-mono text-[11.5px] text-[var(--ink)]">
            {i + 1}
          </span>
          <div>{step}</div>
        </li>
      ))}
    </ol>
  );
}

const METHOD_TONE: Record<string, string> = {
  GET: "text-[var(--ink)] bg-[var(--paper-2)]",
  HEAD: "text-[var(--ink)] bg-[var(--paper-2)]",
  POST: "text-[var(--violet)] bg-[var(--violet-soft)]",
  PUT: "text-[var(--violet)] bg-[var(--violet-soft)]",
  DELETE: "text-[var(--ink-soft)] bg-[var(--paper-2)]",
};

/** Method, path and one line each, as a list with hairlines between rows. */
export function Endpoints({ items }: { items: { method: string; path: string; description: string }[] }) {
  return (
    <ul className="my-5 divide-y divide-[var(--line)] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper-card)]">
      {items.map((item) => (
        <li key={`${item.method} ${item.path}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className={cn("w-[58px] shrink-0 rounded-[4px] py-0.5 text-center font-mono text-[11px] font-medium", METHOD_TONE[item.method])}>
              {item.method}
            </span>
            <code className="truncate font-mono text-[13px] text-[var(--ink)]">{item.path}</code>
          </span>
          <span className="text-[14px] text-[var(--ink-soft)] sm:ml-auto sm:text-right">{item.description}</span>
        </li>
      ))}
    </ul>
  );
}

/** Two columns: a code-like term and what it means. */
export function Definitions({ items }: { items: { term: string; description: ReactNode }[] }) {
  return (
    <dl className="my-5 divide-y divide-[var(--line)] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper-card)]">
      {items.map((item) => (
        <div key={item.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
          <dt className="font-mono text-[13px] text-[var(--ink)]">{item.term}</dt>
          <dd className="text-[14px] text-[var(--ink-soft)]">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="my-4 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="relative pl-5 before:absolute before:top-[0.8em] before:left-1 before:size-[5px] before:rounded-full before:bg-[var(--ink-soft)]/60">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Callout({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="my-6 flex gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--paper-2)] px-4 py-3.5 text-[14.5px] leading-relaxed">
      {icon ? <span className="mt-0.5 shrink-0 text-[var(--ink)]">{icon}</span> : null}
      <div>
        <p className="font-medium text-[var(--ink)]">{title}</p>
        <div className="mt-0.5 text-[var(--ink-soft)]">{children}</div>
      </div>
    </div>
  );
}
