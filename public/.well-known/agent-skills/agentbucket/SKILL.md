---
name: agentbucket
description: Use Bucket0 AgentBucket to store, retrieve, share, and search files for AI agents via REST (Bearer b0ak_) or remote MCP.
---

# AgentBucket

Bucket0 AgentBucket is encrypted object storage designed for AI agents.

## When to use

- Persist agent outputs, artifacts, transcripts, or datasets
- Download or list previously uploaded agent files
- Create public share/stream links for media
- Semantic memory search over agent files (Pro+)

## Auth

1. Human creates a key at https://bucket0.com/dashboard (AgentBucket tab)
2. Key format: `b0ak_...`
3. Header: `Authorization: Bearer b0ak_...`
4. Full registration guide: https://bucket0.com/auth.md

## REST base URL

`https://bucket0.com/api/agent-bucket`

| Action | Request |
|--------|---------|
| Upload | `POST /files/upload` multipart `file` (+ optional `filename`) |
| List | `GET /files?page=1&pageSize=50` |
| Download | `GET /files/download?key=relative/path` |
| Delete | `DELETE /files?key=relative/path` |
| Folder | `POST /files/folder` JSON `{ "path": "reports/daily" }` |
| Share | `POST /files/share` JSON `{ "key": "..." }` |
| Memory | `POST /memory/search` JSON `{ "query": "...", "topK": 8 }` |

OpenAPI: https://bucket0.com/openapi/agent-bucket.json  
Docs: https://bucket0.com/docs

## MCP

Remote Streamable HTTP: `https://mcp.bucket0.com/mcp`

```bash
claude mcp add --transport http agentbucket https://mcp.bucket0.com/mcp
```

Server card: https://bucket0.com/.well-known/mcp/server-card.json
