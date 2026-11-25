/**
 * Auth.md — agent registration instructions for Bucket0 / AgentBucket.
 * Spec: https://workos.com/auth.md
 */

const AUTH_MD = `# auth.md

> Agent registration and credential instructions for **Bucket0** (https://bucket0.com).

## Audience

AI agents, MCP clients, CLI tools, and automation that need programmatic access to **AgentBucket** storage (upload, download, list, share, memory search) or the **S3-compatible API**.

## Supported methods

| Method | Who | Credential |
|--------|-----|------------|
| Dashboard API key | Human creates key for an agent | \`Authorization: Bearer b0ak_...\` |
| Remote MCP OAuth | MCP clients (Claude Code, Cursor, etc.) | OAuth via \`https://mcp.bucket0.com/mcp\` |
| S3 access keys | SDKs / CLI using SigV4 | AWS access key + secret from dashboard |

Bucket0 does **not** currently support unattended agent-verified (ID-JAG) registration. A human must create the account and mint credentials.

## Register (API key)

1. Open [https://bucket0.com/sign-up](https://bucket0.com/sign-up) (Google OAuth or email).
2. Sign in and go to [https://bucket0.com/dashboard](https://bucket0.com/dashboard).
3. Open the **AgentBucket** tab.
4. Create an API key. The secret is shown **once** and starts with \`b0ak_\`.
5. Store the key securely. Call AgentBucket endpoints with:

\`\`\`http
Authorization: Bearer b0ak_your_key_here
\`\`\`

Base URL: \`https://bucket0.com/api/agent-bucket\`

Human docs: [https://bucket0.com/docs](https://bucket0.com/docs)  
OpenAPI: [https://bucket0.com/openapi/agent-bucket.json](https://bucket0.com/openapi/agent-bucket.json)

## Register (MCP)

1. Add the remote MCP server: \`https://mcp.bucket0.com/mcp\` (Streamable HTTP).
2. Complete the OAuth consent flow when prompted (signs in via Bucket0 / Clerk), **or** paste an existing \`b0ak_\` key if your client supports bearer auth.
3. Server card: [https://bucket0.com/.well-known/mcp/server-card.json](https://bucket0.com/.well-known/mcp/server-card.json)

Example (Claude Code):

\`\`\`bash
claude mcp add --transport http agentbucket https://mcp.bucket0.com/mcp
\`\`\`

## Register (S3 API)

1. In the dashboard, open **S3 API** and create access keys.
2. Configure your S3 client:

- Endpoint: \`https://s3.bucket0.com\`
- Region: \`auto\` (or as shown in the dashboard)
- Auth: AWS Signature Version 4

OpenAPI: [https://bucket0.com/openapi/s3-api.json](https://bucket0.com/openapi/s3-api.json)

## Discovery metadata

- Protected resource: [/.well-known/oauth-protected-resource](https://bucket0.com/.well-known/oauth-protected-resource)
- Authorization server: [/.well-known/oauth-authorization-server](https://bucket0.com/.well-known/oauth-authorization-server)
- OpenID (Clerk): [/.well-known/openid-configuration](https://bucket0.com/.well-known/openid-configuration)
- API catalog: [/.well-known/api-catalog](https://bucket0.com/.well-known/api-catalog)

## Credential use

- Prefer header bearer tokens for AgentBucket REST.
- Never embed API keys in public repos or share links.
- Revoke keys anytime from the dashboard.
- Rate limits and plan quotas apply (see docs).

## Contact

- Docs: https://bucket0.com/docs
- Support: https://bucket0.com/contact
- Email: team@bucket0.com
`;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}


export async function GET() {
  return new Response(AUTH_MD, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "x-markdown-tokens": String(estimateTokens(AUTH_MD)),
    },
  });
}
