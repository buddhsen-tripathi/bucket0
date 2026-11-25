
import { useState, useTransition, useEffect } from 'react';
import Link from "@/web/compat/link";
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from "@clerk/react-router";
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";
import { JsonLd } from "@/components/JsonLd";
import { constructMetadata } from "@/lib/shared/seo";

function PricingPageContent() {
    const [isAnnual, setIsAnnual] = useState(true);
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [isPending, startTransition] = useTransition();
    const { isSignedIn, isLoaded } = useAuth();
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
                    alert(`Checkout failed: ${data.error || 'Unknown error'}`);
                }
            } catch (err) {
                console.error('Fetch error:', err);
                alert(`Network error: ${err}`);
            }
        });
    };

    // Plan tier order for upgrade/downgrade comparison
    const PLAN_TIERS: Record<string, number> = {
        free: 0,
        starter: 1,
        pro: 2,
        scale: 3,
    };

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
                "Everything in Free"
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
                "Everything in Starter"
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
                "Everything in Pro"
            ],
        },
    ];

    const faqs = [
        {
            q: "Do I pay for teams or the S3 API separately?",
            a: "No. S3 API, external buckets, and AgentBucket are included with plan-specific limits. Teams start on Starter; members share the owner's storage quota instead of being billed per seat."
        },
        {
            q: "What is AgentBucket+?",
            a: "AgentBucket is storage built for AI agents: they save, list, read, and delete files through a simple API or one-click MCP connector. On paid plans it becomes AgentBucket+, where files are automatically indexed so agents recall them by meaning across sessions, not just by filename."
        },
        {
            q: "What happens when I hit my storage limit?",
            a: "You won't be able to upload new files until you free up space or upgrade your plan. Your existing files remain safe and accessible."
        },
        {
            q: "Can I connect my own S3-compatible buckets?",
            a: "Yes! All plans support external bucket connections. Free includes 1 connection, Starter includes 10, Pro includes 25, and Scale includes 100."
        },
        {
            q: "What is S3 API access?",
            a: "S3 API lets you access your Bucket0 storage using standard S3-compatible tools like AWS CLI, SDKs, and apps like Cyberduck. Free plan includes 1 bucket and 1 API secret, paid plans get up to 100 buckets and 5 secrets."
        },
        {
            q: "How do teams work?",
            a: "You can create teams and invite members to collaborate on shared files. Team storage comes from the owner's plan quota. There are no per-seat charges. Pro and Scale plans also include team chat."
        },
        {
            q: "Is my data encrypted?",
            a: "Yes. All files stored on Bucket0 are encrypted with AES-256 before being stored. Encryption keys never leave the server."
        },
        {
            q: "Can I switch plans at any time?",
            a: "Yes, you can upgrade or downgrade at any time. When upgrading, you'll be charged the prorated difference. When downgrading, the change takes effect at the end of your billing period."
        },
        {
            q: "What's the difference between annual and monthly billing?",
            a: "Annual billing saves you roughly 20% compared to monthly billing. Both options include the same features."
        },
    ];

    return (
        <main className="min-h-screen bg-background">
            {/* Hero Section */}
            <section className="pt-28 lg:pt-36 pb-16">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-center"
                    >
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 tracking-tight">
                            Pricing
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                            Choose a storage plan. Upload files, use the S3 API, connect external buckets, share links, or let AI agents save files to AgentBucket and recall them by meaning.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Billing Toggle */}
            <section className="pb-12">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex justify-center">
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
                </div>
            </section>

            {/* Pricing Cards */}
            <section className="pb-24">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
                        {plans.map((plan, index) => (
                            <motion.div
                                key={plan.name}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                            >
                                <Card
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
                                                <div className="text-foreground text-2xl font-bold">
                                                    {isAnnual ? plan.yearlyPrice : plan.monthlyPrice}
                                                    {plan.id !== "free" && (
                                                        <span className="text-muted-foreground text-sm font-normal">
                                                            /month
                                                        </span>
                                                    )}
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
                                                    <Check className="size-5 shrink-0 text-primary" />
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
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-24">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="max-w-2xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-12"
                        >
                            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                                Frequently Asked Questions
                            </h2>
                            <p className="text-muted-foreground">
                                Everything you need to know about our pricing
                            </p>
                        </motion.div>

                        <div className="space-y-2">
                            {faqs.map((faq, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                    className="border border-border rounded overflow-hidden"
                                >
                                    <button
                                        onClick={() => setOpenFaq(openFaq === index ? null : index)}
                                        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/50 transition-colors"
                                    >
                                        <span className="font-medium text-foreground pr-4">{faq.q}</span>
                                        <ChevronDown
                                            className={cn(
                                                "w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200",
                                                openFaq === index && "rotate-180"
                                            )}
                                        />
                                    </button>
                                    <AnimatePresence>
                                        {openFaq === index && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <div className="px-5 pb-5 text-muted-foreground text-sm leading-relaxed">
                                                    {faq.a}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Cloud Storage with AgentBucket Pricing",
  description: "Encrypted storage with file uploads, S3 API, AgentBucket for AI agents, external buckets, and teams on paid plans.",
  keywords: [
    "cloud storage pricing",
    "S3 API pricing",
    "S3 compatible storage",
    "affordable cloud storage",
    "encrypted storage plans",
    "team cloud storage",
  ],
}));

const breadcrumbs = [
  { name: "Home", url: "https://bucket0.com" },
  { name: "Pricing", url: "https://bucket0.com/pricing" },
];

export default function PricingRoute() {
  return (
    <>
      <JsonLd type="pricing" />
      <JsonLd type="breadcrumb" breadcrumbs={breadcrumbs} />
      <PricingPageContent />
    </>
  );
}
