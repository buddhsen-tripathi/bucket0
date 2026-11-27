
import { useState, useEffect, useRef, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import Link from "@/web/compat/link";
import { useAuth } from "@clerk/react-router";

import { CheckTickCircleIcon } from "@/components/icons";
import { SectionHead } from "@/components/site/SectionHead";
import { button, container } from "@/components/site/styles";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/shared/utils";

// Animated price component with roll effect
function AnimatedPrice({ price, suffix }: { price: string; suffix?: string }) {
  const [displayPrice, setDisplayPrice] = useState(price);
  const prevPrice = useRef(price);

  useEffect(() => {
    if (prevPrice.current !== price) {
      const timer = setTimeout(() => {
        setDisplayPrice(price);
      }, 150);
      prevPrice.current = price;
      return () => clearTimeout(timer);
    }
  }, [price]);

  return (
    <span className="inline-flex items-baseline">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={price}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
            duration: 0.3
          }}
          className="inline-block"
        >
          {displayPrice}
        </motion.span>
      </AnimatePresence>
      {suffix && (
        <span className="ml-1 font-sans text-[14px] font-normal tracking-normal text-[var(--ink-soft)]">
          {suffix}
        </span>
      )}
    </span>
  );
}

const plans = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: "$0",
    yearlyPrice: "$0",
    description: "5 GB encrypted storage to get started",
    features: [
      "5 GB encrypted storage",
      "File uploads",
      "1 external bucket connection",
      "S3 API access (1 bucket)",
      "AgentBucket for AI agents",
      "File sharing links",
      "Encrypted by default",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: "$7",
    yearlyPrice: "$5",
    description: "150 GB with teams and higher limits",
    features: [
      "150 GB encrypted storage",
      "10 external bucket connections",
      "S3 API access (10 buckets)",
      "AgentBucket+ semantic memory",
      "1 team, 3 members, no seat fees",
      "Activity logs (30-day retention)",
      "Everything in Free",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: "$19",
    yearlyPrice: "$15",
    description: "700 GB for power users and teams",
    highlighted: true,
    features: [
      "700 GB encrypted storage",
      "25 external bucket connections",
      "S3 API access (50 buckets)",
      "AgentBucket+ semantic memory",
      "1 team, 5 members, no seat fees",
      "Team chat",
      "Activity logs (90-day retention)",
      "Priority support",
      "Everything in Starter",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    monthlyPrice: "$45",
    yearlyPrice: "$35",
    description: "2 TB for heavy storage needs",
    features: [
      "2 TB encrypted storage",
      "100 external bucket connections",
      "S3 API access (100 buckets)",
      "AgentBucket+ semantic memory",
      "2 teams, 10 members each, no seat fees",
      "Team chat",
      "Activity logs (180-day retention)",
      "Priority support",
      "Everything in Pro",
    ],
  },
];

// Plan tier order for upgrade/downgrade comparison
const PLAN_TIERS: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  scale: 3,
};

export const Pricing = ({ className, asPage = false }: { className?: string; asPage?: boolean }) => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { isSignedIn, isLoaded } = useAuth();
  const { toast } = useToast();
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  useEffect(() => {
    const fetchUserPlan = async () => {
      if (isSignedIn) {
        try {
          const response = await fetch("/api/user/plan");
          if (response.ok) {
            const data = await response.json();
            setUserPlan(data.plan || "free");
          }
        } catch (error) {
          console.error("Failed to fetch user plan:", error);
        }
      }
      setLoadingPlan(false);
    };

    if (isLoaded) {
      fetchUserPlan();
    }
  }, [isSignedIn, isLoaded]);

  const handleUpgrade = (plan: string) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/polar/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interval: isAnnual ? 'yearly' : 'monthly',
            plan,
          }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error('Checkout failed:', data);
          toast(`Checkout failed: ${data.error || 'Unknown error'}`, "error");
        }
      } catch (err) {
        console.error('Fetch error:', err);
        toast("Network error. Please check your connection and try again.", "error");
      }
    });
  };

  const actionClass = (highlighted?: boolean) => cn(highlighted ? button.solid : button.outline, "mt-auto w-full disabled:opacity-60");

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className={cn(container, "scroll-mt-20 pt-24 md:pt-32", className)}>
      <SectionHead id="pricing-heading" label="Pricing" title="Start with 5 GB free" as={asPage ? "h1" : "h2"}>
        <p>
          Every plan includes the drive, the S3 API, your own buckets and AgentBucket. Paid plans add memory search, teams
          and more room.
        </p>
      </SectionHead>

      <div className="mt-10 flex md:mt-14">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-[4px] bg-[var(--paper-2)] p-1 text-[13px]">
          {[
            { annual: false, label: "Monthly" },
            { annual: true, label: "Annual" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={isAnnual === o.annual}
              onClick={() => setIsAnnual(o.annual)}
              className={cn(
                "rounded-[3px] px-3.5 py-1.5 transition-colors",
                isAnnual === o.annual ? "bg-[var(--paper-card)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              )}
            >
              {o.label}
              {o.annual && <span className="ml-1.5 font-mono text-[11px] text-[var(--violet)]">save ~20%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-[12px] bg-[var(--line)] ring-1 ring-[var(--line)] md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn("relative flex flex-col bg-[var(--paper-card)] p-6 md:p-7", plan.highlighted && "bg-[var(--paper)]")}
          >
            {plan.highlighted && <span className="absolute inset-x-0 top-0 h-[3px] bg-[var(--violet)]" />}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-medium">{plan.name}</h3>
              {plan.highlighted && (
                <span className="font-mono text-[10.5px] tracking-[0.12em] text-[var(--violet)] uppercase">Most popular</span>
              )}
            </div>
            <div className="display mt-6 overflow-hidden text-[44px] leading-none tracking-[-0.04em]">
              <AnimatedPrice
                price={isAnnual ? plan.yearlyPrice : plan.monthlyPrice}
                suffix={plan.id !== "free" ? " / month" : undefined}
              />
            </div>
            <p className="mt-2 h-4 font-mono text-[11px] text-[var(--ink-soft)]">
              {isAnnual && plan.id !== "free" ? "billed annually" : ""}
            </p>
            <p className="mt-4 text-[14px] text-[var(--ink-soft)]">{plan.description}</p>

            <ul className="mt-6 mb-8 flex-1 space-y-2.5 border-t border-[var(--line)] pt-6">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-[13.5px]">
                  <CheckTickCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--violet)]" />
                  {feature}
                </li>
              ))}
            </ul>

            {(() => {
              // Not signed in
              if (!isLoaded || !isSignedIn) {
                return (
                  <Link href={plan.id === "free" ? "/sign-up" : "/sign-in"} className={actionClass(plan.highlighted)}>
                    {plan.id === "free" ? "Create a free bucket" : "Sign in to upgrade"}
                  </Link>
                );
              }

              // Signed in - loading plan
              if (loadingPlan) {
                return (
                  <button className={actionClass()} disabled>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </button>
                );
              }

              const currentTier = PLAN_TIERS[userPlan || "free"] ?? 0;
              const planTier = PLAN_TIERS[plan.id] ?? 0;
              const isCurrentPlan = userPlan === plan.id;
              const isDowngrade = planTier < currentTier;

              // Current plan
              if (isCurrentPlan) {
                return (
                  <button className={actionClass(plan.highlighted)} disabled>
                    Current plan
                  </button>
                );
              }

              // Downgrade (including to Free) - go to billing portal
              if (isDowngrade) {
                return (
                  <button
                    className={actionClass()}
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/polar/portal");
                        if (res.ok) {
                          const { url } = await res.json();
                          window.open(url, "_blank");
                        }
                      } catch (err) {
                        console.error("Portal error:", err);
                      }
                    }}
                  >
                    {plan.id === "free" ? "Go to dashboard" : `Downgrade to ${plan.name}`}
                  </button>
                );
              }

              // Upgrade button
              return (
                <button className={actionClass(plan.highlighted)} onClick={() => handleUpgrade(plan.id)} disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
              );
            })()}
          </div>
        ))}
      </div>
    </section>
  );
};
