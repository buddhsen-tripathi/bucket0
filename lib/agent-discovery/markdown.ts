/**
 * Markdown representations of public pages for Accept: text/markdown negotiation.
 */

import { SITE_URL, MCP_URL, S3_API_URL, DOCS_URL, AUTH_MD_URL } from "./site";

function estimateTokens(text: string): number {
  // Rough heuristic: ~4 chars per token
  return Math.max(1, Math.ceil(text.length / 4));
}

export function withMarkdownHeaders(body: string): HeadersInit {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    "Vary": "Accept",
    "Cache-Control": "public, max-age=300",
    "x-markdown-tokens": String(estimateTokens(body)),
  };
}

const HOME_MD = `---
title: Bucket0 | Cloud Storage with AgentBucket for AI Agents
description: Encrypted cloud storage with S3-compatible API, AgentBucket for AI agents, external buckets, and teams.
---

# Bucket0

Encrypted cloud storage for developers and AI agents. S3-compatible API, AgentBucket REST + MCP, external bucket management, team workspaces, and free browser-based PDF/image tools.

## For AI agents

- **AgentBucket REST API**: \`${SITE_URL}/api/agent-bucket\` — Bearer keys prefixed \`b0ak_\`
- **Remote MCP**: \`${MCP_URL}\` — Streamable HTTP (Claude Code, Cursor, etc.)
- **Docs**: ${DOCS_URL}
- **Auth for agents**: ${AUTH_MD_URL}
- **llms.txt**: ${SITE_URL}/llms.txt
- **API catalog**: ${SITE_URL}/.well-known/api-catalog
- **OpenAPI (AgentBucket)**: ${SITE_URL}/openapi/agent-bucket.json
- **OpenAPI (S3)**: ${SITE_URL}/openapi/s3-api.json
- **S3 API endpoint**: ${S3_API_URL}

## Product

- Encrypted personal Drive (AES-128-GCM)
- S3-compatible gateway for AWS CLI / SDKs / rclone
- Connect external S3, R2, Spaces, B2, Azure Blob
- Teams with granular permissions (paid plans)
- Free PDF & image tools (client-side only)

## Pricing (summary)

| Plan | Price | Storage |
|------|-------|---------|
| Free | $0 | 5 GB |
| Starter | $5–7/mo | 150 GB |
| Pro | $15–19/mo | 700 GB |
| Scale | $35–45/mo | 2 TB |

See ${SITE_URL}/pricing for details.

## Links

- [Docs](${DOCS_URL})
- [Tools](${SITE_URL}/tools)
- [Pricing](${SITE_URL}/pricing)
- [Contact](${SITE_URL}/contact)
- [Sign in](${SITE_URL}/sign-in)
`;

const DOCS_MD = `---
title: Bucket0 API Docs
description: AgentBucket and S3-compatible API documentation
---

# Bucket0 API Documentation

Human-readable docs: ${DOCS_URL}

## AgentBucket

Base URL: \`${SITE_URL}/api/agent-bucket\`

Auth: \`Authorization: Bearer b0ak_...\`

| Method | Path | Purpose |
|--------|------|---------|
| POST | /files/upload | Upload a file (multipart) |
| GET | /files | List agent files |
| GET | /files/download?key= | Download a file |
| DELETE | /files?key= | Delete a file |
| POST | /files/folder | Create a folder |
| POST | /files/share | Create a public share/stream link |
| POST | /memory/search | Semantic memory search (Pro+) |

OpenAPI: ${SITE_URL}/openapi/agent-bucket.json

Create keys in the dashboard after signing in: ${SITE_URL}/dashboard

## S3-compatible API

Endpoint: \`${S3_API_URL}\`

Auth: AWS Signature Version 4 with access keys from the dashboard.

OpenAPI: ${SITE_URL}/openapi/s3-api.json

## MCP

Remote MCP (Streamable HTTP): \`${MCP_URL}\`

Server card: ${SITE_URL}/.well-known/mcp/server-card.json

## Agent registration

See ${AUTH_MD_URL}
`;

const PRICING_MD = `---
title: Bucket0 Pricing
description: Plans for encrypted cloud storage, S3 API, AgentBucket, and teams
---

# Bucket0 Pricing

Full page: ${SITE_URL}/pricing

| Plan | Monthly | Annual | Storage | Highlights |
|------|---------|--------|---------|------------|
| Free | $0 | — | 5 GB | S3 API (1 bucket), AgentBucket, sharing |
| Starter | $7 | $5/mo | 150 GB | 10 external buckets, 1 team (3 members) |
| Pro | $19 | $15/mo | 700 GB | AgentBucket memory, team chat, 5 members |
| Scale | $45 | $35/mo | 2 TB | 2 teams × 10 members, higher limits |

Sign up: ${SITE_URL}/sign-up
`;

const TOOLS_MD = `---
title: Bucket0 Free Tools
description: Browser-based PDF and image tools — files never leave your device
---

# Free PDF & Image Tools

All tools run entirely in your browser. Files are not uploaded to Bucket0 servers.

Hub: ${SITE_URL}/tools

## PDF tools

- Merge, Split, Extract, Organize, Page Numbers
- Protect, Unlock, Sign, Watermark, Redact
- JPG to PDF

## Image tools

- Resize, Rotate, Crop, Compress, Convert
- Watermark, Filter

Open a tool at \`${SITE_URL}/tools/{slug}\` (e.g. \`/tools/merge\`).
`;

/** Paths that support markdown negotiation (exact match). */
export const MARKDOWN_PAGES: Record<string, string> = {
  "/": HOME_MD,
  "/docs": DOCS_MD,
  "/pricing": PRICING_MD,
  "/tools": TOOLS_MD,
};

export function prefersMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  const parts = acceptHeader.split(",").map((p) => p.trim());
  for (const part of parts) {
    const [media, ...params] = part.split(";").map((s) => s.trim());
    if (media.toLowerCase() !== "text/markdown") continue;
    const qParam = params.find((p) => p.startsWith("q="));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    if (!Number.isNaN(q) && q <= 0) continue;
    return true;
  }
  return false;
}
