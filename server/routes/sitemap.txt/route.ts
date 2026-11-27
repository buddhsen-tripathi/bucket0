import { ALL_TOOLS } from "@/components/pdf-tools/tool-config";


/**
 * Text sitemap for crawlers that probe /sitemap.txt (we also serve /sitemap.xml).
 * Plain URL list, one per line — common alternate to XML sitemaps.
 */
export async function GET() {
  const baseUrl = "https://bucket0.com";

  const urls = [
    baseUrl,
    `${baseUrl}/agentbucket`,
    `${baseUrl}/pricing`,
    `${baseUrl}/tools`,
    `${baseUrl}/docs`,
    `${baseUrl}/app`,
    `${baseUrl}/changelog`,
    `${baseUrl}/contact`,
    `${baseUrl}/privacy`,
    `${baseUrl}/terms`,
    `${baseUrl}/auth.md`,
    `${baseUrl}/llms.txt`,
    ...ALL_TOOLS.map((tool) => `${baseUrl}/tools/${tool.slug}`),
  ];

  const body = `${urls.join("\n")}\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
