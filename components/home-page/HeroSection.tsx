import type { CSSProperties } from "react";
import { SignedIn, SignedOut } from "@/components/clerk-compat";
import Link from "@/web/compat/link";
import { ArrowRightIcon } from "@/components/icons";
import { BrushPanel } from "@/components/site/BrushPanel";
import { button, container, eyebrow } from "@/components/site/styles";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/shared/utils";
import { AgentRun } from "./AgentRun";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export default function HeroSection() {
  const { resolvedTheme } = useTheme();
  return (
    <section className={cn(container, "pt-14 pb-20 md:pt-24 md:pb-24")}>
      <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:gap-16">
        <div>
          <p className={cn(eyebrow, "rise")}>AgentBucket</p>
          <h1 className="display rise mt-5 text-balance text-[clamp(46px,5.8vw,88px)] leading-[0.96]" style={delay(60)}>
            A file system for AI agents
          </h1>
        </div>
        <div className="rise flex flex-col justify-end lg:pb-2" style={delay(300)}>
          <p className="max-w-[560px] text-[19px] leading-[1.45] text-[var(--ink)]/85 md:text-[21px]">
            Your agent saves what it makes and finds it again by meaning in the next session. Connect Claude, ChatGPT
            or Cursor in one click, or call the API from your own code.
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
            <Link href="/docs#agent-bucket" className={button.outline}>
              Read the API docs
            </Link>
          </div>
        </div>
      </div>
      <div className="rise mt-14 md:mt-20" style={delay(420)}>
        {/* Phones get the demo on the page background: the brush frame only suits wide screens. */}
        <BrushPanel
          id="hero"
          tone={resolvedTheme === "dark" ? "night" : "lilac"}
          className="rounded-[14px] max-md:!bg-transparent max-md:after:!hidden max-md:[&>svg]:hidden md:p-5 lg:p-10"
        >
          <AgentRun />
        </BrushPanel>
      </div>
    </section>
  );
}
