import {
  AGENT_BUCKET_API,
  AUTH_MD_URL,
  CLERK_ISSUER,
  DOCS_URL,
  SITE_URL,
} from "@/lib/agent-discovery/site";


/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for AgentBucket.
 * Human dashboard sessions use Clerk; agents use Bearer API keys (b0ak_).
 */
const metadata = {
  resource: AGENT_BUCKET_API,
  authorization_servers: [CLERK_ISSUER, SITE_URL],
  scopes_supported: [
    "agent-bucket:read",
    "agent-bucket:write",
    "openid",
    "profile",
    "email",
  ],
  bearer_methods_supported: ["header"],
  resource_documentation: DOCS_URL,
  resource_signing_alg_values_supported: ["RS256"],
  // Extra discovery hints for agents (non-standard but useful)
  agent_api_key_prefix: "b0ak_",
  agent_registration: AUTH_MD_URL,
};

export async function GET() {
  return Response.json(metadata, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
