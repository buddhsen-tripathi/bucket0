import {
  AUTH_MD_URL,
  CLERK_ISSUER,
  DOCS_URL,
  SITE_URL,
} from "@/lib/agent-discovery/site";


/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) for Bucket0.
 * Human identity is delegated to Clerk; agents register via Auth.md / dashboard API keys.
 */
const metadata = {
  issuer: SITE_URL,
  authorization_endpoint: `${SITE_URL}/sign-in`,
  token_endpoint: `${CLERK_ISSUER}/oauth/token`,
  revocation_endpoint: `${CLERK_ISSUER}/oauth/token/revoke`,
  introspection_endpoint: `${CLERK_ISSUER}/oauth/token_info`,
  userinfo_endpoint: `${CLERK_ISSUER}/oauth/userinfo`,
  jwks_uri: `${CLERK_ISSUER}/.well-known/jwks.json`,
  registration_endpoint: `${SITE_URL}/sign-up`,
  scopes_supported: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "agent-bucket:read",
    "agent-bucket:write",
  ],
  response_types_supported: ["code"],
  response_modes_supported: ["query", "form_post"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_basic",
    "client_secret_post",
    "none",
  ],
  code_challenge_methods_supported: ["S256"],
  service_documentation: DOCS_URL,
  op_policy_uri: `${SITE_URL}/privacy`,
  op_tos_uri: `${SITE_URL}/terms`,
  // Auth.md agent registration discovery
  agent_auth: {
    skill: "https://workos.com/auth.md",
    register_uri: `${SITE_URL}/dashboard`,
    documentation: AUTH_MD_URL,
    identity_types_supported: ["anonymous"],
    anonymous: {
      credential_types_supported: ["api_key"],
      claim_uri: `${SITE_URL}/docs`,
      description:
        "Create a Bucket0 account (Google OAuth or email), open the dashboard AgentBucket tab, and mint a b0ak_ API key. Use Authorization: Bearer b0ak_... on AgentBucket REST endpoints. For MCP clients, connect to https://mcp.bucket0.com/mcp (OAuth consent or paste an API key).",
    },
  },
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
