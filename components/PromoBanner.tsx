
import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { motion } from "framer-motion";

const PROMO_CODE = "15OFF";

export default function PromoBanner({ onDismiss }: { onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; ignore
    }
  };

  return (
    <motion.div
      key="promo-banner"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 36, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="relative z-[60] h-9 overflow-hidden bg-[var(--ink)] text-[var(--paper)]"
      role="banner"
    >
      <div className="relative mx-auto flex h-full max-w-6xl items-center justify-center gap-2 px-10 text-center text-[13px] sm:px-12">
        <p className="flex items-center gap-1.5 truncate">
          <span>
            Get <span className="font-medium">15% off</span> any plan with code
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1 rounded-[3px] bg-[var(--paper)]/15 px-1.5 py-0.5 font-mono text-[12px] tracking-wide transition-colors hover:bg-[var(--paper)]/25"
            aria-label={copied ? "Code copied" : "Copy promo code"}
            title={copied ? "Copied!" : "Copy code"}
          >
            {PROMO_CODE}
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss promo banner"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--paper)]/70 transition-colors hover:bg-[var(--paper)]/15 hover:text-[var(--paper)] sm:right-3"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
