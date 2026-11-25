
const AI_ALLOW = [
  "/",
  "/pricing",
  "/contact",
  "/privacy",
  "/terms",
  "/changelog",
  "/tools",
  "/tools/*",
  "/docs",
  "/auth.md",
  "/llms.txt",
  "/sitemap.txt",
  "/sitemap.xml",
  "/openapi/",
  "/openapi/*",
  "/.well-known/",
  "/.well-known/*",
];

const AI_DISALLOW = ["/api/", "/dashboard/", "/s/", "/sign-in", "/sign-up"];

interface RobotsRule { userAgent: string; allow: string | string[]; disallow: string | string[] }
interface Robots { rules: RobotsRule[]; sitemap: string; host: string }

function robots(): Robots {
  const baseUrl = "https://bucket0.com";

  return {
    rules: [
      // Standard search engine crawlers
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/s/"], // Block share links (user content)
      },
      // AI/LLM crawlers - allow product pages + agent discovery surfaces
      {
        userAgent: "GPTBot",
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
      {
        userAgent: "Google-Extended",
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
      {
        userAgent: "ChatGPT-User",
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
      {
        userAgent: "anthropic-ai",
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
      {
        userAgent: "Claude-Web",
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
      {
        userAgent: "CCBot", // Common Crawl
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
      {
        userAgent: "PerplexityBot",
        allow: AI_ALLOW,
        disallow: AI_DISALLOW,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

function lines(label: string, value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value]).map((v) => `${label}: ${v}`);
}

export async function GET() {
  const r = robots();
  const body = r.rules
    .map((rule) => [`User-agent: ${rule.userAgent}`, ...lines("Allow", rule.allow), ...lines("Disallow", rule.disallow)].join("\n"))
    .concat([`Sitemap: ${r.sitemap}`, `Host: ${r.host}`])
    .join("\n\n");
  return new Response(body + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
