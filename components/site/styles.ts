// Shared class names for the public site: square ink buttons, mono eyebrows, one container width.
const focus = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2";

export const button = {
  solid: `${focus} focus-visible:outline-[var(--ink)] inline-flex items-center justify-center gap-2 rounded-[3px] bg-[var(--ink)] px-4 py-2.5 text-[14px] font-medium text-[var(--paper)] transition-colors hover:bg-[color-mix(in_oklch,var(--ink),var(--paper)_16%)]`,
  outline: `${focus} focus-visible:outline-[var(--ink)] inline-flex items-center justify-center gap-2 rounded-[3px] border border-[var(--ink)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]`,
  /** On dark brush panels. */
  light: `${focus} focus-visible:outline-white inline-flex items-center justify-center gap-2 rounded-[3px] bg-[#f5f4f0] px-4 py-2.5 text-[14px] font-medium text-[#141317] transition-colors hover:bg-white`,
  ghostLight: `${focus} focus-visible:outline-white inline-flex items-center justify-center gap-2 rounded-[3px] border border-white/60 px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white hover:text-[#141317]`,
};

export const container = "mx-auto w-full max-w-[1376px] px-5 md:px-8";
export const eyebrow = "font-mono text-[11px] font-medium tracking-[0.16em] uppercase text-[var(--ink-soft)]";
export const sectionTitle = "display text-[clamp(32px,3.8vw,52px)] leading-[1.04]";
export const textLink =
  "font-medium underline decoration-[var(--line)] decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--ink)]";

export const GITHUB_URL = "https://github.com/buddhsen-tripathi/bucket0";
