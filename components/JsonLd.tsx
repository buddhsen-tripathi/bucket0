import { getOrganizationSchema, getSoftwareApplicationSchema, getFAQSchema, getPricingSchema, getBreadcrumbSchema } from "@/lib/shared/seo";

type JsonLdProps = {
  type: "organization" | "software" | "faq" | "pricing" | "breadcrumb";
  faqs?: { question: string; answer: string }[];
  breadcrumbs?: { name: string; url: string }[];
};

export function JsonLd({ type, faqs, breadcrumbs }: JsonLdProps) {
  let schema;

  switch (type) {
    case "organization":
      schema = getOrganizationSchema();
      break;
    case "software":
      schema = getSoftwareApplicationSchema();
      break;
    case "faq":
      if (!faqs) return null;
      schema = getFAQSchema(faqs);
      break;
    case "pricing":
      schema = getPricingSchema();
      break;
    case "breadcrumb":
      if (!breadcrumbs) return null;
      schema = getBreadcrumbSchema(breadcrumbs);
      break;
    default:
      return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
