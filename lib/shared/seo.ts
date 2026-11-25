/** Subset of the Next.js Metadata shape that constructMetadata() produces. */
export interface Metadata {
  title?: string | { default: string; template?: string };
  description?: string;
  keywords?: string[];
  authors?: { name: string; url?: string }[];
  creator?: string;
  metadataBase?: URL;
  openGraph?: {
    type?: string;
    locale?: string;
    url?: string;
    title?: string;
    description?: string;
    siteName?: string;
    images?: { url: string; width?: number; height?: number; alt?: string }[];
  };
  twitter?: { card?: string; title?: string; description?: string; images?: string[]; creator?: string };
  robots?: {
    index?: boolean;
    follow?: boolean;
    googleBot?: {
      index?: boolean;
      follow?: boolean;
      "max-video-preview"?: number;
      "max-image-preview"?: string;
      "max-snippet"?: number;
    };
  };
  icons?: { icon?: string; shortcut?: string; apple?: string };
  manifest?: string;
  alternates?: { canonical?: string };
}

const siteConfig = {
  name: "Bucket0",
  url: "https://bucket0.com",
  ogImage: "https://bucket0.com/og-image.png",
  description: "Encrypted cloud storage with file uploads, S3-compatible API, AgentBucket for AI agents, external buckets, and teams on paid plans. Start free with 5 GB.",
  keywords: [
    "cloud storage",
    "S3 API",
    "S3 compatible API",
    "S3 storage",
    "S3 management",
    "private cloud",
    "secure storage",
    "data privacy",
    "AWS S3",
    "AWS CLI",
    "Cloudflare R2",
    "encrypted cloud storage",
    "file management",
    "bucket management",
    "team collaboration",
    "file sharing",
    "AgentBucket",
    "AI agent storage",
    "AI file storage",
    "PDF tools",
    "merge PDF",
    "split PDF",
    "free PDF editor",
  ],
  authors: [{ name: "Bucket0", url: "https://bucket0.com" }],
  creator: "Bucket0",
};

export function constructMetadata({
  title = siteConfig.name,
  description = siteConfig.description,
  image = siteConfig.ogImage,
  noIndex = false,
  keywords = siteConfig.keywords,
  canonicalUrl,
}: {
  title?: string;
  description?: string;
  image?: string;
  noIndex?: boolean;
  keywords?: string[];
  canonicalUrl?: string;
} = {}): Metadata {
  return {
    title: {
      default: title,
      template: `%s | ${siteConfig.name}`,
    },
    description,
    keywords,
    authors: siteConfig.authors,
    creator: siteConfig.creator,
    metadataBase: new URL(siteConfig.url),
    openGraph: {
      type: "website",
      locale: "en_US",
      url: canonicalUrl || siteConfig.url,
      title,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@bucket0",
    },
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    icons: {
      icon: "/icon.svg",
      shortcut: "/icon.svg",
      apple: "/b0-logo.png",
    },
    manifest: "/site.webmanifest",
    alternates: {
      canonical: canonicalUrl || siteConfig.url,
    },
  };
}

// JSON-LD structured data for organization
export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/b0-logo.png`,
    sameAs: [
      "https://x.com/bucket0dotcom",
      "https://github.com/bucket0-com",
      "https://www.linkedin.com/company/bucket0",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${siteConfig.url}/contact`,
    },
  };
}

// JSON-LD structured data for software application
export function getSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: siteConfig.description,
    url: siteConfig.url,
  };
}

// JSON-LD structured data for FAQ page
export function getFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// JSON-LD structured data for breadcrumbs
export function getBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// JSON-LD structured data for pricing/product
export function getPricingSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Bucket0 Cloud Storage",
    description: "Cloud storage with S3-compatible API, external bucket management, and team collaboration. AES-256 encrypted. Start free with 5 GB.",
    brand: {
      "@type": "Brand",
      name: "Bucket0",
    },
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        description: "5 GB encrypted storage, 1 external bucket, S3 API (1 bucket), file sharing",
        url: `${siteConfig.url}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Starter",
        price: "5",
        priceCurrency: "USD",
        priceValidUntil: new Date(new Date().getFullYear() + 1, 11, 31).toISOString().split("T")[0],
        description: "150 GB storage, 10 external buckets, S3 API (10 buckets), 1 team with 3 members",
        url: `${siteConfig.url}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "15",
        priceCurrency: "USD",
        priceValidUntil: new Date(new Date().getFullYear() + 1, 11, 31).toISOString().split("T")[0],
        description: "700 GB storage, 25 external buckets, S3 API (50 buckets), 1 team with 5 members, team chat",
        url: `${siteConfig.url}/pricing`,
      },
      {
        "@type": "Offer",
        name: "Scale",
        price: "35",
        priceCurrency: "USD",
        priceValidUntil: new Date(new Date().getFullYear() + 1, 11, 31).toISOString().split("T")[0],
        description: "2 TB storage, 100 external buckets, S3 API (100 buckets), 2 teams with 10 members each, team chat",
        url: `${siteConfig.url}/pricing`,
      },
    ],
  };
}

export { siteConfig };
