import {
  AGENT_BUCKET_API,
  DOCS_URL,
  HEALTH_URL,
  MCP_SERVER_CARD_URL,
  MCP_URL,
  OPENAPI_AGENT_BUCKET,
  OPENAPI_S3,
  S3_API_ANCHOR,
} from "@/lib/agent-discovery/site";


const catalog = {
  linkset: [
    {
      anchor: AGENT_BUCKET_API,
      "service-desc": [
        {
          href: OPENAPI_AGENT_BUCKET,
          type: "application/json",
        },
      ],
      "service-doc": [
        {
          href: DOCS_URL,
          type: "text/html",
        },
      ],
      status: [
        {
          href: HEALTH_URL,
          type: "application/json",
        },
      ],
    },
    {
      anchor: S3_API_ANCHOR,
      "service-desc": [
        {
          href: OPENAPI_S3,
          type: "application/json",
        },
      ],
      "service-doc": [
        {
          href: DOCS_URL,
          type: "text/html",
        },
      ],
      status: [
        {
          href: HEALTH_URL,
          type: "application/json",
        },
      ],
    },
    {
      anchor: MCP_URL,
      "service-desc": [
        {
          href: MCP_SERVER_CARD_URL,
          type: "application/json",
        },
      ],
      "service-doc": [
        {
          href: DOCS_URL,
          type: "text/html",
        },
      ],
    },
  ],
};

export async function GET() {
  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type":
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
