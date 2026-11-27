/**
 * Markdown representations of public pages for Accept: text/markdown negotiation.
 */

import {
  AGENTBUCKET_COMPARISON,
  AGENTBUCKET_DESCRIPTION,
  AGENTBUCKET_FAQ,
  AGENTBUCKET_STEPS,
  AGENTBUCKET_TITLE,
} from "@/lib/shared/agentbucket-content";
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
title: Bucket0 | A file system for AI agents, and an encrypted drive for you
description: AgentBucket gives AI agents files they can find again by meaning. Connect over MCP or the REST API, with an encrypted drive and S3 API included. Start free with 5 GB.
---

# Bucket0

AgentBucket is persistent file storage for AI agents: an agent saves files over MCP or a REST API and finds them again in a later session, by listing them or searching their text by meaning (Starter and up). The same account includes an encrypted drive, an S3-compatible API, external bucket management, team workspaces, and free browser-based PDF/image tools.

## For AI agents

- **AgentBucket overview**: ${SITE_URL}/agentbucket

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

- [AgentBucket](${SITE_URL}/agentbucket)
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
| POST | /memory/search | Semantic memory search (Starter and up) |

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
| Free | $0 | — | 5 GB | AgentBucket (1 agent key), S3 API (1 bucket), sharing |
| Starter | $7 | $5/mo | 150 GB | Memory search (10k chunks), 3 agent keys, 10 external buckets, 1 team (3 members) |
| Pro | $19 | $15/mo | 700 GB | Memory search (50k chunks), 5 agent keys, team chat, 5 members |
| Scale | $45 | $35/mo | 2 TB | Memory search (200k chunks), 2 teams × 10 members, higher limits |

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

const AGENTBUCKET_MD = `---
title: ${AGENTBUCKET_TITLE}
description: ${AGENTBUCKET_DESCRIPTION}
---

# Persistent file storage for AI agents

Agents lose their working files when a session ends. AgentBucket gives Claude, ChatGPT, Cursor and your own agents a place to save files that is still there next time, over MCP or a REST API.

Full page: ${SITE_URL}/agentbucket

## How it works

${AGENTBUCKET_STEPS.map((s, i) => `${i + 1}. **${s.title}**: ${s.body}`).join("\n")}

Connectors and API keys on one account share the same Agent Storage.

## Connect

- **Remote MCP** (Streamable HTTP, OAuth sign-in): \`${MCP_URL}\`
- **REST API**: \`${SITE_URL}/api/agent-bucket\` with \`Authorization: Bearer b0ak_...\`
- **Docs**: ${DOCS_URL}#agent-bucket
- **OpenAPI**: ${SITE_URL}/openapi/agent-bucket.json

## AgentBucket or a general object store?

Amazon S3 and Google Cloud Storage are the right call when you need regions, IAM and petabytes. AgentBucket is for agents that need to keep and find their own files without you building the plumbing.

| You need to | AgentBucket | Amazon S3 / Google Cloud Storage |
|-------------|-------------|----------------------------------|
${AGENTBUCKET_COMPARISON.map((r) => `| ${r.need} | ${r.agentbucket} | ${r.objectStore} |`).join("\n")}

## FAQ

${AGENTBUCKET_FAQ.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")}
`;

/** Paths that support markdown negotiation (exact match). */
export const MARKDOWN_PAGES: Record<string, string> = {
  "/": HOME_MD,
  "/agentbucket": AGENTBUCKET_MD,
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
