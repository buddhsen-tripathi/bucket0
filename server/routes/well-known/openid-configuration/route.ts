import { CLERK_ISSUER, DOCS_URL, SITE_URL } from "@/lib/agent-discovery/site";


/**
 * OpenID Connect Discovery document.
 * Human authentication is provided by Clerk at clerk.bucket0.com.
 * Agents should prefer Auth.md + AgentBucket API keys (see /auth.md).
 */
const metadata = {
  issuer: CLERK_ISSUER,
  authorization_endpoint: `${CLERK_ISSUER}/oauth/authorize`,
  token_endpoint: `${CLERK_ISSUER}/oauth/token`,
  revocation_endpoint: `${CLERK_ISSUER}/oauth/token/revoke`,
  introspection_endpoint: `${CLERK_ISSUER}/oauth/token_info`,
  userinfo_endpoint: `${CLERK_ISSUER}/oauth/userinfo`,
  jwks_uri: `${CLERK_ISSUER}/.well-known/jwks.json`,
  scopes_supported: [
    "private_metadata",
    "openid",
    "offline_access",
    "email",
    "profile",
    "public_metadata",
  ],
  response_types_supported: ["code"],
  response_modes_supported: ["form_post", "query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: [
    "client_secret_basic",
    "none",
    "client_secret_post",
  ],
  claims_supported: [
    "iss",
    "iat",
    "email",
    "email_verified",
    "given_name",
    "name",
    "preferred_username",
    "picture",
    "sub",
    "aud",
    "exp",
    "family_name",
  ],
  code_challenge_methods_supported: ["S256"],
  service_documentation: DOCS_URL,
  // Point agents at the site-local AS + Auth.md for API access
  bucket0_authorization_server: `${SITE_URL}/.well-known/oauth-authorization-server`,
  bucket0_auth_md: `${SITE_URL}/auth.md`,
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
