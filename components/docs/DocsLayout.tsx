import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDownIcon,
  CopyCopiedIcon,
  CopyIcon,
  ExternalLinkSquareIcon,
  GithubIcon,
  SearchIcon,
  SidebarMenuIcon,
} from "@/components/icons";
import { container, eyebrow, GITHUB_URL } from "@/components/site/styles";
import { cn } from "@/lib/shared/utils";

export interface NavGroup {
  title: string;
  items: { id: string; label: string }[];
}

interface TocEntry {
  id: string;
  label: string;
  sub: boolean;
  /** The section the heading belongs to. */
  section: string;
}

/** Below the sticky 64px header, with some air: a heading counts as current once its top passes this line. */
const ACTIVE_LINE = 120;

/** The last of `ids` whose element has scrolled past the active line. */
function useActiveId(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join(",");
  useEffect(() => {
    const list = key ? key.split(",") : [];
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = list[0] ?? "";
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_LINE) current = id;
      }
      // At the very bottom the last heading may never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = list[list.length - 1] ?? current;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [key]);
  return active;
}

function useCopied() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

/** Finds the first text match in the article, scrolls to it and tints it briefly. */
function findInArticle(article: HTMLElement | null, query: string) {
  const q = query.trim().toLowerCase();
  if (!q || !article) return false;
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.toLowerCase().includes(q) && node.parentElement) {
      const el = node.parentElement;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const before = el.style.backgroundColor;
      el.style.backgroundColor = "var(--violet-soft)";
      setTimeout(() => {
        el.style.backgroundColor = before;
      }, 2000);
      return true;
    }
  }
  return false;
}

function SearchBox({ onSearch }: { onSearch: (query: string) => boolean }) {
  const [query, setQuery] = useState("");
  const [missed, setMissed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setMissed(!onSearch(query));
      }}
      className={cn(
        "flex items-center gap-2 rounded-[6px] border bg-[var(--paper-card)] px-2.5 py-[7px] transition-colors focus-within:border-[var(--ink-soft)]",
        missed ? "border-destructive/50" : "border-[var(--line)]",
      )}
    >
      <SearchIcon aria-hidden className="size-4 shrink-0 text-[var(--ink-soft)]" />
      <input
        ref={input}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setMissed(false);
        }}
        placeholder="Search the docs"
        aria-label="Search the docs"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
      />
      <kbd className="hidden rounded-[4px] border border-[var(--line)] px-1.5 font-mono text-[10.5px] text-[var(--ink-soft)] lg:inline">⌘K</kbd>
    </form>
  );
}

function NavList({ groups, active, onNavigate }: { groups: NavGroup[]; active: string; onNavigate?: () => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <nav aria-label="Docs" className="space-y-5">
      {groups.map((group) => {
        const open = !closed[group.title];
        return (
          <div key={group.title}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setClosed((c) => ({ ...c, [group.title]: open }))}
              className="flex w-full items-center justify-between py-1 text-[14px] font-medium text-[var(--ink)]"
            >
              {group.title}
              <ChevronDownIcon aria-hidden className={cn("size-4 text-[var(--ink-soft)] transition-transform", !open && "-rotate-90")} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="mt-1.5 ml-1 space-y-0.5 overflow-hidden border-l border-[var(--line)] pl-2"
                >
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        onClick={onNavigate}
                        aria-current={active === item.id ? "location" : undefined}
                        className={cn(
                          "block rounded-[6px] px-2.5 py-1.5 text-[14px] transition-colors",
                          active === item.id
                            ? "bg-[var(--paper-2)] font-medium text-[var(--ink)]"
                            : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
                        )}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}

function GithubNote() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2.5 rounded-[8px] border border-[var(--line)] px-3 py-2.5 text-[13px] leading-snug transition-colors hover:border-[var(--ink-soft)]"
    >
      <GithubIcon aria-hidden className="mt-px size-4 shrink-0" />
      <span>
        <span className="block font-medium text-[var(--ink)]">Bucket0 is open source</span>
        <span className="text-[var(--ink-soft)]">Read the code on GitHub</span>
      </span>
    </a>
  );
}

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]";

/** "Copy page" with a menu for the current section and the machine-readable files that exist in public/. */
function CopyPage({ page, section }: { page: () => string; section: { label: string; markdown: string } | null }) {
  const { copied, copy } = useCopied();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => copy(page())}
        className="flex items-center gap-1.5 rounded-l-[6px] border border-[var(--line)] bg-[var(--paper-card)] px-2.5 py-1.5 text-[13px] text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
      >
        {copied ? <CopyCopiedIcon aria-hidden className="size-3.5" /> : <CopyIcon aria-hidden className="size-3.5" />}
        {copied ? "Copied" : "Copy page"}
      </button>
      <button
        type="button"
        aria-label="More copy options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid place-items-center rounded-r-[6px] border border-l-0 border-[var(--line)] bg-[var(--paper-card)] px-1.5 text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
      >
        <ChevronDownIcon aria-hidden className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 z-30 mt-1.5 w-64 rounded-[8px] border border-[var(--line)] bg-[var(--paper-card)] p-1 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.35)]"
          >
            <button type="button" className={MENU_ITEM} onClick={() => { copy(page()); setOpen(false); }}>
              <CopyIcon aria-hidden className="size-4 text-[var(--ink-soft)]" />
              <span>
                Copy page as Markdown
                <span className="block text-[12px] text-[var(--ink-soft)]">For an LLM or your notes</span>
              </span>
            </button>
            {section && (
              <button type="button" className={MENU_ITEM} onClick={() => { copy(section.markdown); setOpen(false); }}>
                <CopyIcon aria-hidden className="size-4 text-[var(--ink-soft)]" />
                <span>
                  Copy this section
                  <span className="block text-[12px] text-[var(--ink-soft)]">{section.label}</span>
                </span>
              </button>
            )}
            <div className="my-1 border-t border-[var(--line)]" />
            {[
              { href: "/llms.txt", label: "llms.txt", note: "Site overview for AI agents" },
              { href: "/openapi/agent-bucket.json", label: "AgentBucket OpenAPI", note: "agent-bucket.json" },
              { href: "/openapi/s3-api.json", label: "S3 API OpenAPI", note: "s3-api.json" },
            ].map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener" className={MENU_ITEM} onClick={() => setOpen(false)}>
                <ExternalLinkSquareIcon aria-hidden className="size-4 text-[var(--ink-soft)]" />
                <span>
                  {link.label}
                  <span className="block text-[12px] text-[var(--ink-soft)]">{link.note}</span>
                </span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Every section, with the subsections of the one you're reading opened under it. */
function Toc({ entries, active, section }: { entries: TocEntry[]; active: string; section: string }) {
  if (entries.length === 0) return null;
  return (
    <nav aria-label="On this page">
      <p className={eyebrow}>On this page</p>
      <ul className="mt-4 border-l border-[var(--line)]">
        {entries.filter((entry) => !entry.sub || entry.section === section).map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={cn(
                "-ml-px block border-l py-1.5 text-[13px] leading-snug transition-colors",
                entry.sub ? "pl-6" : "pl-3.5",
                active === entry.id
                  ? "border-[var(--ink)] text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]",
              )}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DocsLayout({
  groups,
  label,
  title,
  lead,
  pageMarkdown,
  sectionMarkdown,
  children,
}: {
  groups: NavGroup[];
  label: string;
  title: string;
  lead: ReactNode;
  pageMarkdown: () => string;
  sectionMarkdown: (id: string) => string | undefined;
  children: ReactNode;
}) {
  const article = useRef<HTMLElement>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  // The table of contents is read from the rendered headings, so it can't drift from the page.
  useEffect(() => {
    const els = article.current?.querySelectorAll<HTMLElement>("[data-toc]") ?? [];
    setToc(
      Array.from(els).map((el) => ({
        id: el.id || el.closest("section")?.id || "",
        label: el.dataset.toc ?? "",
        sub: el.hasAttribute("data-toc-sub"),
        section: el.closest("section")?.id ?? "",
      })),
    );
  }, []);

  const sectionIds = groups.flatMap((g) => g.items.map((i) => i.id));
  const activeSection = useActiveId(sectionIds);
  const activeToc = useActiveId(toc.map((t) => t.id));
  const activeItem = groups.flatMap((g) => g.items).find((i) => i.id === activeSection);
  const activeMarkdown = sectionMarkdown(activeSection);
  const search = (q: string) => findInArticle(article.current, q);

  return (
    <div className="min-h-screen">
      {/* Phones and tablets: the sidebar folds into a bar under the header. */}
      <div className="sticky top-16 z-30 border-b border-[var(--line)] bg-[var(--paper)]/90 backdrop-blur-md lg:hidden">
        <div className={container}>
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 py-3 text-[14px]"
          >
            <SidebarMenuIcon aria-hidden className="size-4 text-[var(--ink-soft)]" />
            <span className="text-[var(--ink-soft)]">Docs</span>
            <span className="text-[var(--ink-soft)]">/</span>
            <span className="truncate font-medium text-[var(--ink)]">{activeItem?.label}</span>
            <ChevronDownIcon aria-hidden className={cn("ml-auto size-4 text-[var(--ink-soft)] transition-transform", menuOpen && "rotate-180")} />
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-[var(--line)]"
            >
              <div className={cn(container, "max-h-[70vh] space-y-5 overflow-y-auto py-5")}>
                <SearchBox onSearch={(q) => { setMenuOpen(false); return search(q); }} />
                <NavList groups={groups} active={activeSection} onNavigate={() => setMenuOpen(false)} />
                <GithubNote />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={cn(container, "grid gap-12 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_200px] xl:gap-14")}>
        <aside className="hidden lg:block">
          <div className="sticky top-16 flex h-[calc(100vh-4rem)] flex-col gap-6 overflow-y-auto pt-10 pb-8 [scrollbar-width:thin]">
            <SearchBox onSearch={search} />
            <NavList groups={groups} active={activeSection} />
            <div className="mt-auto">
              <GithubNote />
            </div>
          </div>
        </aside>

        <main ref={article} className="min-w-0 max-w-[760px] pt-10 pb-24 md:pt-12">
          <div className="flex items-center justify-between gap-4">
            <p className={eyebrow}>{label}</p>
            <CopyPage
              page={pageMarkdown}
              section={activeMarkdown && activeItem ? { label: activeItem.label, markdown: activeMarkdown } : null}
            />
          </div>
          <h1 className="display mt-4 text-[clamp(38px,4.6vw,56px)] leading-[1.02]">{title}</h1>
          <div className="mt-4 max-w-[640px] text-[18px] leading-relaxed text-[var(--ink-soft)]">{lead}</div>
          <div className="mt-12">{children}</div>
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto pt-12 pb-8 [scrollbar-width:thin]">
            <Toc entries={toc} active={activeToc} section={activeSection} />
          </div>
        </aside>
      </div>
    </div>
  );
}
