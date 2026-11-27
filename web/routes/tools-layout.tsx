import { Outlet } from "react-router";
import { RefreshIcon } from "@/components/icons";
import Link from "@/web/compat/link";
import { button, container, eyebrow } from "@/components/site/styles";
import { cn } from "@/lib/shared/utils";

export default function ToolsLayout() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return (
    <main className={cn(container, "flex min-h-[70vh] flex-col justify-center py-20")}>
      <p className={eyebrow}>Tools</p>
      <h1 className="display mt-4 text-[clamp(36px,4.4vw,56px)] leading-[1]">This tool didn&apos;t load</h1>
      <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-[var(--ink-soft)]">
        Something went wrong while loading it. Reload the page to try again; your files were never uploaded, so nothing
        is lost on our side.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => window.location.reload()} className={button.solid}>
          <RefreshIcon aria-hidden className="size-4" />
          Reload
        </button>
        <Link href="/tools" className={button.outline}>
          All tools
        </Link>
      </div>
    </main>
  );
}
