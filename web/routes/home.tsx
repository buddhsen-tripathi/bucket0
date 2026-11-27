import HeroSection from "@/components/home-page/HeroSection";
import { AgentFeatures, McpSection } from "@/components/home-page/AgentSections";
import { ClosingCta, DriveSection, OpenSourceSection, ToolsSection } from "@/components/home-page/DriveSections";
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
      <AgentFeatures />
      <McpSection />
      <DriveSection />
      <ToolsSection />
      <OpenSourceSection />
      <Pricing />
      <FAQ />
      <ClosingCta />
    </main>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Bucket0 | A file system for AI agents, and an encrypted drive for you",
  description:
    "AgentBucket gives AI agents files they can find again by meaning. Connect over MCP or the REST API, with an encrypted drive and S3 API included. Start free with 5 GB.",
}));
