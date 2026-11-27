import type { ReactNode } from "react";
import { cn } from "@/lib/shared/utils";
import { eyebrow, sectionTitle } from "./styles";

/** A section's eyebrow and title on the left and, on wide screens, its short lead on the right. */
export function SectionHead({
  id,
  label,
  title,
  children,
  as: Heading = "h2",
}: {
  id: string;
  /** h1 when the section opens its page. */
  as?: "h1" | "h2";
  label: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-16">
      <div>
        <p className={eyebrow}>{label}</p>
        <Heading id={id} className={cn(sectionTitle, "reveal mt-4 max-w-xl text-balance")}>
          {title}
        </Heading>
      </div>
      {children ? (
        <div className="reveal max-w-xl text-[17px] leading-relaxed text-[var(--ink-soft)] lg:pb-1.5 [&_code]:font-mono [&_code]:text-[14px] [&_code]:text-[var(--ink)]">
          {children}
        </div>
      ) : null}
    </div>
  );
}
