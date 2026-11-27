import { JsonLd } from "@/components/JsonLd";
import { Pricing } from "@/components/home-page/Pricing";
import { container, eyebrow, sectionTitle } from "@/components/site/styles";
import { constructMetadata } from "@/lib/shared/seo";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";

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

function PricingPageContent() {
    return (
        <main>
            <Pricing asPage className="pt-14 md:pt-24" />
            <section aria-labelledby="pricing-faq-heading" className={cn(container, "grid gap-10 pt-24 md:pt-32 lg:grid-cols-[5fr_7fr] lg:gap-20")}>
                <div>
                    <p className={eyebrow}>Questions</p>
                    <h2 id="pricing-faq-heading" className={cn(sectionTitle, "mt-4")}>
                        About plans and billing
                    </h2>
                </div>
                <div className="border-t border-[var(--line)]">
                    {faqs.map((faq) => (
                        <details key={faq.q} className="group border-b border-[var(--line)]">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16.5px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink)] [&::-webkit-details-marker]:hidden">
                                {faq.q}
                                <span aria-hidden className="relative size-3.5 shrink-0">
                                    <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
                                    <span className="absolute inset-y-0 left-1/2 w-px bg-current transition-transform group-open:rotate-90" />
                                </span>
                            </summary>
                            <p className="max-w-2xl pr-8 pb-5 text-[15px] leading-relaxed text-[var(--ink-soft)]">{faq.a}</p>
                        </details>
                    ))}
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
