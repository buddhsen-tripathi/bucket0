/** Shared constants for AI agent discovery endpoints (RFC 8288 / 9727 / 9728). */

export const SITE_URL = "https://bucket0.com";
export const MCP_URL = "https://mcp.bucket0.com/mcp";
export const MCP_ORIGIN = "https://mcp.bucket0.com";
export const S3_API_URL = "https://s3.bucket0.com";
export const CLERK_ISSUER = "https://clerk.bucket0.com";

export const AGENT_BUCKET_API = `${SITE_URL}/api/agent-bucket`;
export const S3_API_ANCHOR = S3_API_URL;
export const HEALTH_URL = `${SITE_URL}/api/health`;
export const DOCS_URL = `${SITE_URL}/docs`;
export const AUTH_MD_URL = `${SITE_URL}/auth.md`;
export const LLMS_TXT_URL = `${SITE_URL}/llms.txt`;

export const OPENAPI_AGENT_BUCKET = `${SITE_URL}/openapi/agent-bucket.json`;
export const OPENAPI_S3 = `${SITE_URL}/openapi/s3-api.json`;

export const API_CATALOG_URL = `${SITE_URL}/.well-known/api-catalog`;
export const MCP_SERVER_CARD_URL = `${SITE_URL}/.well-known/mcp/server-card.json`;
export const AGENT_SKILLS_INDEX_URL = `${SITE_URL}/.well-known/agent-skills/index.json`;
export const OAUTH_PRM_URL = `${SITE_URL}/.well-known/oauth-protected-resource`;
export const OAUTH_AS_URL = `${SITE_URL}/.well-known/oauth-authorization-server`;
export const OIDC_CONFIG_URL = `${SITE_URL}/.well-known/openid-configuration`;

/** RFC 8288 Link header values advertised on the homepage. */
export const HOMEPAGE_LINK_HEADERS = [
  `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  `</openapi/agent-bucket.json>; rel="service-desc"; type="application/json"`,
  `</docs>; rel="service-doc"; type="text/html"`,
  `</llms.txt>; rel="describedby"; type="text/plain"`,
  `</auth.md>; rel="describedby"; type="text/markdown"`,
  `</.well-known/mcp/server-card.json>; rel="alternate"; type="application/json"; title="MCP Server Card"`,
  `</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"`,
  `</.well-known/agent-skills/index.json>; rel="alternate"; type="application/json"; title="Agent Skills"`,
  `</api/health>; rel="status"; type="application/json"`,
] as const;
