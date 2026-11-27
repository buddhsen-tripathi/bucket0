import { cn } from "@/lib/shared/utils";

// Tone colours are the --brush-<tone>-* variables under .site in web/app.css.
export type BrushTone = "lilac" | "night" | "stone";

const toneVar = (tone: BrushTone, part: "base" | "stroke" | "wash") => `var(--brush-${tone}-${part})`;

/** A panel painted with dry brush strokes: an SVG turbulence filter over three wide strokes and a soft wash. */
export function BrushPanel({
  id,
  tone = "lilac",
  className,
  children,
}: {
  /** Unique per page: the SVG filter ids. */
  id: string;
  tone?: BrushTone;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("grain relative isolate overflow-hidden", className)} style={{ backgroundColor: toneVar(tone, "base") }}>
      <svg aria-hidden className="absolute inset-0 -z-10 size-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id={`${id}-dry`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="4" seed="7" result="streaks" />
            <feDisplacementMap in="SourceGraphic" in2="streaks" scale="70" xChannelSelector="R" yChannelSelector="G" result="warped" />
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="speckle" />
            <feColorMatrix in="speckle" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.55" result="mask" />
            <feComposite in="warped" in2="mask" operator="in" />
          </filter>
          <filter id={`${id}-soft`}>
            <feGaussianBlur stdDeviation="60" />
          </filter>
        </defs>
        <ellipse cx="900" cy="140" rx="420" ry="220" filter={`url(#${id}-soft)`} opacity="0.9" style={{ fill: toneVar(tone, "wash") }} />
        <g filter={`url(#${id}-dry)`} fill="none" strokeLinecap="round" style={{ stroke: toneVar(tone, "stroke") }}>
          <path d="M-80 520 C 180 380, 380 640, 640 470 S 1060 300, 1300 420" strokeWidth="190" opacity="0.78" />
          <path d="M-60 120 C 160 60, 260 260, 520 170" strokeWidth="120" opacity="0.55" />
          <path d="M860 720 C 960 600, 1120 640, 1280 560" strokeWidth="140" opacity="0.6" />
        </g>
      </svg>
      {children}
    </div>
  );
}
