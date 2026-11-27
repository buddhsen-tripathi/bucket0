import { Fragment, useState } from "react";
import { CopyCopiedIcon, CopyIcon } from "@/components/icons";
import { cn } from "@/lib/shared/utils";

const KEYWORDS = new Set([
  "const", "let", "var", "await", "async", "function", "return", "import", "from", "export", "new", "if", "else", "for",
  "in", "of", "def", "class", "use", "fn", "mut", "pub", "struct", "package", "func", "defer", "nil", "true", "false",
  "None", "True", "False", "with", "as", "while", "type", "impl",
]);

// Comments only start a line or follow whitespace, so URLs like s3://bucket stay code.
const TOKEN =
  /((?:^|(?<=\s))(?:#|\/\/)[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|[A-Za-z_]\w*)/gm;

/** Strings and numbers in violet, keywords and comments stepped back; everything else stays ink. */
export function Highlighted({ code }: { code: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const [text] = match;
    const at = match.index ?? 0;
    if (at > last) parts.push(code.slice(last, at));
    const className =
      text.startsWith("#") || text.startsWith("//")
        ? "text-[var(--ink-soft)] italic"
        : /^["'`]/.test(text) || /^\d/.test(text)
          ? "text-[var(--violet)]"
          : KEYWORDS.has(text)
            ? "text-[var(--ink-soft)]"
            : undefined;
    parts.push(className ? <span key={at} className={className}>{text}</span> : <Fragment key={at}>{text}</Fragment>);
    last = at + text.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <>{parts}</>;
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy code"}
      className={cn(
        "grid size-7 place-items-center rounded-[5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]",
        className,
      )}
    >
      {copied ? <CopyCopiedIcon aria-hidden className="size-4" /> : <CopyIcon aria-hidden className="size-4" />}
    </button>
  );
}

const pre = "overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-[var(--ink)] [scrollbar-width:thin]";

/** A light code block with a copy button; an optional title sits in a header strip. */
export function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="group relative my-5 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper-card)]">
      {title ? (
        <div className="flex items-center justify-between border-b border-[var(--line)] py-1 pr-1.5 pl-4">
          <span className="font-mono text-[12px] text-[var(--ink-soft)]">{title}</span>
          <CopyButton text={code} />
        </div>
      ) : (
        <CopyButton text={code} className="absolute top-2 right-2 bg-[var(--paper-card)]" />
      )}
      <pre className={cn(pre, !title && "pr-12")}>
        <code>
          <Highlighted code={code} />
        </code>
      </pre>
    </div>
  );
}

/** Tabs over one code sample per language. The selected tab is shared by every group on the page. */
export function CodeGroup<T extends string>({
  tabs,
  active,
  onChange,
  codes,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
  codes: Record<T, string>;
}) {
  return (
    <div className="my-5 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pr-1.5 pl-2">
        <div role="tablist" className="-mb-px flex overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === active}
              onClick={() => onChange(tab)}
              className={cn(
                "border-b px-2.5 py-2.5 text-[12.5px] whitespace-nowrap transition-colors outline-none focus-visible:text-[var(--ink)]",
                tab === active
                  ? "border-[var(--ink)] font-medium text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <CopyButton text={codes[active]} />
      </div>
      <pre className={pre}>
        <code>
          <Highlighted code={codes[active]} />
        </code>
      </pre>
    </div>
  );
}
