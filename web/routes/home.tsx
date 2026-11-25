import HeroSection from "@/components/home-page/HeroSection";
import CloudFeatures from "@/components/home-page/CloudFeatures";
import AgentBucketShowcase from "@/components/home-page/AgentBucketShowcase";
import TeamsShowcase from "@/components/home-page/TeamsShowcase";
import { Pricing } from "@/components/home-page/Pricing";
import FAQ from "@/components/home-page/FAQ";
import WebMcpProvider from "@/components/home-page/WebMcpProvider";
import { JsonLd } from "@/components/JsonLd";
import { constructMetadata } from "@/lib/shared/seo";
import { faqCategories } from "@/lib/shared/faq-data";
import { nextMeta } from "@/web/compat/meta";

// Flatten FAQ categories for schema markup
const allFaqs = faqCategories.flatMap((category) => category.questions);

export default function Home() {
  return (
    <main>
      <WebMcpProvider />
      <JsonLd type="faq" faqs={allFaqs} />
      <HeroSection />
      <AgentBucketShowcase />
      <CloudFeatures />
      <TeamsShowcase />
      <Pricing />
      <FAQ />
    </main>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Bucket0 | Cloud Storage with AgentBucket for AI Agents",
  description:
    "Encrypted cloud storage with file uploads, S3-compatible API, AgentBucket for AI agents, external buckets, and teams on paid plans. Start free with 5 GB.",
}));
