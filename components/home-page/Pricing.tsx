
import { useState, useEffect, useRef, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MdCheck } from "react-icons/md";
import { Loader2 } from "lucide-react";
import Link from "@/web/compat/link";
import { useAuth } from "@clerk/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
        <span className="text-muted-foreground text-sm font-normal">
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

export const Pricing = ({ className }: { className?: string }) => {
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

  return (
    <section id="pricing" className={cn("py-24 bg-background", className)}>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose a storage plan. Upload files, use the S3 API, connect external buckets, share links, or let AI agents save files to AgentBucket and recall them by meaning.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-medium", !isAnnual && "text-foreground", isAnnual && "text-muted-foreground")}>
              Monthly
            </span>
            <Switch
              checked={isAnnual}
              onCheckedChange={setIsAnnual}
              aria-label="Toggle annual billing"
            />
            <span className={cn("text-sm font-medium", isAnnual && "text-foreground", !isAnnual && "text-muted-foreground")}>
              Annual <span className="text-green-500 text-xs">Save ~20%</span>
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 items-stretch">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                "flex flex-col h-full",
                plan.highlighted && "outline-primary origin-top outline-4"
              )}
            >
              <CardContent className="flex flex-col gap-7 px-6 py-5 flex-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground font-semibold">{plan.name}</h3>
                    {plan.highlighted && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-foreground text-2xl font-bold overflow-hidden">
                      <AnimatedPrice
                        price={isAnnual ? plan.yearlyPrice : plan.monthlyPrice}
                        suffix={plan.id !== "free" ? "/month" : undefined}
                      />
                    </div>
                    {isAnnual && plan.id !== "free" && (
                      <div className="text-xs text-muted-foreground">
                        billed annually
                      </div>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {plan.description}
                  </p>
                </div>

                <div className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <div
                      key={feature}
                      className="text-muted-foreground flex items-center gap-1.5"
                    >
                      <MdCheck className="size-5 shrink-0 text-primary" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {(() => {
                  // Not signed in
                  if (!isLoaded || !isSignedIn) {
                    return (
                      <Button
                        asChild
                        className="w-full mt-auto rounded"
                        variant={plan.highlighted ? "default" : "outline"}
                      >
                        <Link href={plan.id === "free" ? "/sign-up" : "/sign-in"}>
                          {plan.id === "free" ? "Get started" : "Sign in to upgrade"}
                        </Link>
                      </Button>
                    );
                  }

                  // Signed in - loading plan
                  if (loadingPlan) {
                    return (
                      <Button className="w-full mt-auto rounded" disabled variant="outline">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </Button>
                    );
                  }

                  const currentTier = PLAN_TIERS[userPlan || "free"] ?? 0;
                  const planTier = PLAN_TIERS[plan.id] ?? 0;
                  const isCurrentPlan = userPlan === plan.id;
                  const isDowngrade = planTier < currentTier;

                  // Current plan
                  if (isCurrentPlan) {
                    return (
                      <Button
                        className="w-full mt-auto rounded"
                        variant={plan.highlighted ? "default" : "outline"}
                        disabled
                      >
                        Current plan
                      </Button>
                    );
                  }

                  // Downgrade (including to Free) - go to billing portal
                  if (isDowngrade) {
                    return (
                      <Button
                        className="w-full mt-auto rounded"
                        variant="outline"
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
                      </Button>
                    );
                  }

                  // Upgrade button
                  return (
                    <Button
                      className="w-full mt-auto rounded"
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isPending}
                      variant={plan.highlighted ? "default" : "outline"}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Redirecting...
                        </>
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
