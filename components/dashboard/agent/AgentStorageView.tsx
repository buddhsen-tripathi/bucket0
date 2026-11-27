
import { useState, useEffect, useCallback } from "react";
import {
  MdOutlineSmartToy,
  MdOutlineKey,
  MdOutlineAdd,
  MdOutlineDelete,
  MdContentCopy,
  MdOutlineVisibility,
  MdOutlineVisibilityOff,
  MdOutlineRefresh,
  MdOutlineCheck,
  MdOutlineDownload,
  MdAutoAwesome,
} from "react-icons/md";
import Link from "@/web/compat/link";
import { getPlanLimits } from "@/lib/payments/plans";
import AgentFilesBrowser, { invalidateAgentFilesCache } from "./AgentFilesBrowser";

const agentApiGuide = `# Bucket0 AgentBucket — Integration Guide for AI Agents

## What this is

Bucket0 AgentBucket is a **persistent file storage tool** for AI agents (Claude, GPT, Gemini, OpenClaw, etc.). Use it when you need to save files for the user that should outlive the current conversation or session.

You interact with it via a simple HTTP API using a Bearer token. The user creates the API key once in their Bucket0 dashboard and gives it to you.

## When to use AgentBucket

Use it whenever you produce a file the user might want to keep, share, or reference later:

- **Generated documents**: PDFs, reports, summaries, transcripts
- **Scraped or fetched data**: JSON, CSV, HTML, datasets
- **Code or scripts**: Python, JS, SQL, Bash you wrote for the user
- **Logs and outputs**: pipeline runs, analysis results, debug traces
- **Media you generated**: charts, images, audio, video
- **Drafts**: emails, blog posts, meeting notes, documentation

Don't use it for:
- Temporary files needed only within the current task (use your own scratch space)
- Secrets, credentials, or PII you weren't asked to store
- Files larger than the user's plan limit (check the error response)

## How it works

1. **User creates a key** in the Bucket0 dashboard → AgentBucket tab → "New Key". The key looks like \`b0ak_...\` and is shown only once.
2. **User configures the destination** for that key (per-key setting):
   - **AgentBucket** (default): Files go to a review tab where the user can move them to their main drive later. Use this when the user hasn't explicitly approved you to write to their drive.
   - **My Drive**: Files go directly into the user's drive, optionally into a folder the user specifies. Use this for trusted agents the user has set up for direct writes.
3. **User gives you the key**. You use it as a Bearer token in the \`Authorization\` header.
4. **You upload files** with paths and filenames you choose. The user reviews them in the dashboard.

You don't choose the destination at upload time — the user controls that via the key's settings.

## Authentication

Every request needs:

\`\`\`
Authorization: Bearer <YOUR_KEY>
\`\`\`

Where \`<YOUR_KEY>\` is the value the user gave you (it starts with \`b0ak_\`).

Base URL: \`https://bucket0.com/api/agent-bucket\`

Keys can be deactivated or revoked by the user at any time. If you get a 401, the key is invalid, expired, or revoked — stop using it and ask the user for a new one.

## Operations

### Upload a file

\`POST /api/agent-bucket/files/upload\`

Multipart form upload. Use slashes in \`filename\` to put files in folders — folders are auto-created.

\`\`\`bash
curl -X POST https://bucket0.com/api/agent-bucket/files/upload \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -F "file=@<LOCAL_PATH>" \\
  -F "filename=<FOLDER>/<FILENAME>.<EXT>"
\`\`\`

**Response:**
\`\`\`json
{
  "success": true,
  "key": "<FOLDER>/<FILENAME>.<EXT>",
  "fileName": "<FILENAME>.<EXT>",
  "size": <BYTES>,
  "destination": "agent"
}
\`\`\`

The \`destination\` field tells you where the file actually landed (\`agent\` or \`drive\`) so you can mention it to the user.

### Create an empty folder

\`POST /api/agent-bucket/files/folder\`

Optional — only needed if you want to create a folder before any files exist in it. Uploading to a nested path auto-creates folders.

\`\`\`bash
curl -X POST https://bucket0.com/api/agent-bucket/files/folder \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"path": "<FOLDER>/<SUBFOLDER>"}'
\`\`\`

### List files

\`GET /api/agent-bucket/files\`

Returns files you've uploaded (only AgentBucket files — moved files don't appear).

\`\`\`bash
curl "https://bucket0.com/api/agent-bucket/files?page=1&pageSize=100" \\
  -H "Authorization: Bearer <YOUR_KEY>"
\`\`\`

**Response shape:**
\`\`\`json
{
  "files": [
    {
      "key": "<FOLDER>/<FILENAME>.<EXT>",
      "fileName": "<FILENAME>.<EXT>",
      "size": <BYTES>,
      "mimeType": "<MIME_TYPE>",
      "createdAt": "<ISO_TIMESTAMP>"
    }
  ],
  "pagination": { "total": <N>, "page": 1, "pageSize": 100, "hasMore": false }
}
\`\`\`

### Download a file

\`GET /api/agent-bucket/files/download?key=<KEY>\`

Returns the raw file bytes. Use this to read back something you uploaded earlier.

\`\`\`bash
curl "https://bucket0.com/api/agent-bucket/files/download?key=<KEY>" \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -o <LOCAL_PATH>
\`\`\`

### Delete a file

\`DELETE /api/agent-bucket/files?key=<KEY>\`

Use sparingly — prefer letting the user clean up. Only delete files you uploaded if the user explicitly asks, or if you uploaded it by mistake.

\`\`\`bash
curl -X DELETE "https://bucket0.com/api/agent-bucket/files?key=<KEY>" \\
  -H "Authorization: Bearer <YOUR_KEY>"
\`\`\`

## Semantic memory (AgentBucket+)

The text files you upload (\`.md\`, \`.txt\`, \`.json\`, \`.csv\`, code, etc.) are **automatically indexed** so you can later recall them by meaning, not just by path. It is on by default; you do not manage it.

**Skip indexing a specific file** (e.g. scratch/throwaway output) by adding \`index=false\` to the upload:

\`\`\`bash
curl -X POST https://bucket0.com/api/agent-bucket/files/upload \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -F "file=@<LOCAL_PATH>" \\
  -F "filename=<FILENAME>.<EXT>" \\
  -F "index=false"
\`\`\`

**Search your memory:**

\`POST /api/agent-bucket/memory/search\`

\`\`\`bash
curl -X POST https://bucket0.com/api/agent-bucket/memory/search \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "<NATURAL_LANGUAGE_QUERY>", "topK": 5}'
\`\`\`

**Response:**
\`\`\`json
{
  "results": [
    { "fileName": "<FILENAME>", "key": "<KEY>", "chunkIndex": 0, "snippet": "<MATCHING_TEXT>", "score": 0.74 }
  ]
}
\`\`\`

Higher \`score\` = closer match. Deleting a file removes it from memory automatically.

## Filename and path rules

- Use forward slashes for paths: \`<folder>/<subfolder>/<filename>.<ext>\`
- Allowed chars: letters, digits, \`.\`, \`_\`, \`-\`, \`/\`
- Spaces and special chars are replaced with \`_\`
- No leading slash
- No \`..\` (path traversal is blocked)
- Always include the correct file extension matching the file's actual content type

**Naming guidance:**
- Use clear, descriptive names — the user will see these
- Group related files in folders by topic, project, or session
- Include dates when relevant for time-series data
- Use lowercase with hyphens for readability

## Error handling

| Status | What it means | What to do |
|---|---|---|
| 200 | Success | Continue |
| 400 | Bad request (missing field, invalid path) | Fix the request payload |
| 401 | Invalid/expired/revoked key | Stop. Ask the user for a new key |
| 402 | Plan limit hit (file size, total storage, file count) | Tell the user; don't retry |
| 404 | File not found | The file may have been moved or deleted |
| 429 | Rate limit (600 uploads/min) | Back off, retry after a minute |
| 500 | Server error | Retry once; if it persists, tell the user |

## Best practices for agents

1. **Tell the user the path before uploading** so they know where to find it
2. **Confirm after upload** with the actual key returned in the response
3. **Don't spam uploads** — batch related work into one file when possible
4. **Re-use folders** for related sessions instead of creating new top-level folders each time
5. **Don't delete the user's files** unless explicitly asked
6. **Respect the destination setting** — if the key is configured for AgentBucket, the user wants to review before files hit their drive
7. **Read the response \`destination\` field** to know where the file actually landed and tell the user accordingly
8. **Use the correct file extension** matching the file's content type — never invent extensions or omit them

## Plan limits

| Plan | Max API keys | Max storage | Max file size |
|---|---|---|---|
| Free | 1 | 5 GB | 1 GB |
| Starter | 3 | 150 GB | 5 GB |
| Pro | 5 | 700 GB | 15 GB |
| Scale | 5 | 2 TB | 15 GB |

If an upload returns 402, the user has hit a limit. Tell them which one (the error message specifies) and don't retry until they upgrade or free space.

## Quick example: full workflow

\`\`\`bash
# 1. (Optional) Create a folder for this session's work
curl -X POST https://bucket0.com/api/agent-bucket/files/folder \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"path": "<FOLDER>"}'

# 2. Upload each generated file
curl -X POST https://bucket0.com/api/agent-bucket/files/upload \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -F "file=@<LOCAL_PATH>" \\
  -F "filename=<FOLDER>/<FILENAME>.<EXT>"

# 3. Read the response — confirm the returned "key" and "destination"
#    Then tell the user where the files were saved.
\`\`\`
`;

const mcpUrl = `https://mcp.bucket0.com/mcp`;

const claudeCodeRemoteCmd = `claude mcp add --transport http agentbucket https://mcp.bucket0.com/mcp`;

const claudeCodeCmd = `claude mcp add agentbucket -e BUCKET0_API_KEY=<YOUR_KEY> -- npx -y agentbucket`;

const mcpJsonConfig = `{
  "mcpServers": {
    "agentbucket": {
      "command": "npx",
      "args": ["-y", "agentbucket"],
      "env": { "BUCKET0_API_KEY": "<YOUR_KEY>" }
    }
  }
}`;

function Snippet({
  label,
  code,
  field,
  copiedField,
  onCopy,
}: {
  label: string;
  code: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground mb-1.5">{label}</p>
      <div className="relative">
        <pre className="text-xs font-mono text-muted-foreground bg-background border border-border rounded p-3 pr-10 overflow-x-auto whitespace-pre-wrap break-all">
          {code}
        </pre>
        <button
          onClick={() => onCopy(code, field)}
          className="absolute top-2 right-2 p-1.5 hover:bg-muted rounded transition-colors"
          title="Copy"
        >
          {copiedField === field ? (
            <MdOutlineCheck size={14} className="text-success" />
          ) : (
            <MdContentCopy size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

interface AgentKey {
  id: string;
  keyPrefix: string;
  name: string;
  destination: string;
  destinationFolder: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function AgentStorageView() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesRefreshTrigger, setFilesRefreshTrigger] = useState(0);

  // Create key state
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Settings state
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Whether the user's plan includes semantic memory (Pro/Scale)
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [connectTab, setConnectTab] = useState<"web" | "code" | "local">("web");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/user/plan");
        if (res.ok) {
          const data = await res.json();
          setMemoryEnabled(getPlanLimits(data.plan || "free").memoryEnabled);
        }
      } catch {
        // Non-fatal: memory toggle stays gated
      }
    })();
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/agent-bucket/keys");
      if (!res.ok) throw new Error("Failed to fetch keys");
      const data = await res.json();
      setKeys(data.keys);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch("/api/agent-bucket/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create key");
      }
      const data = await res.json();
      setNewApiKey(data.key.apiKey);
      setShowNewKey(true);
      setNewKeyName("");
      setShowCreateKey(false);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setDeletingId(keyId);
    try {
      const res = await fetch(`/api/agent-bucket/keys?id=${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete key");
      setConfirmDeleteId(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateDestination = async (keyId: string, destination: string, destinationFolder: string | null) => {
    setUpdatingId(keyId);
    try {
      const res = await fetch("/api/agent-bucket/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: keyId, destination, destinationFolder }),
      });
      if (!res.ok) throw new Error("Failed to update key");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update key");
    } finally {
      setUpdatingId(null);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            AgentBucket
            {memoryEnabled && (
              <span className="font-bold text-primary">
                +
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {memoryEnabled
              ? "Storage with semantic memory for AI agents. Save files, recall them by meaning, and move them to your drive."
              : "Storage for AI agents. Save files and move them to your drive."}
          </p>
        </div>
        <button
          onClick={() => {
            fetchKeys();
            invalidateAgentFilesCache();
            setFilesRefreshTrigger((t) => t + 1);
          }}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
          title="Refresh"
        >
          <MdOutlineRefresh size={20} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 px-4 py-2.5 bg-destructive/10 text-destructive rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 underline text-xs hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* New API Key Created Banner */}
      {newApiKey && (
        <div className="mb-3 bg-primary/10 border border-primary/20 rounded p-4">
          <div className="flex items-center gap-2 mb-2">
            <MdOutlineKey className="text-primary" />
            <span className="font-medium text-sm">API Key Created</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Copy this key now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background border rounded px-3 py-2 text-xs font-mono break-all">
              {showNewKey ? newApiKey : "\u2022".repeat(40)}
            </code>
            <button
              onClick={() => setShowNewKey(!showNewKey)}
              className="p-2 hover:bg-muted rounded"
              title={showNewKey ? "Hide" : "Show"}
            >
              {showNewKey ? <MdOutlineVisibilityOff size={16} /> : <MdOutlineVisibility size={16} />}
            </button>
            <button
              onClick={() => copyToClipboard(newApiKey, "apiKey")}
              className="p-2 hover:bg-muted rounded"
              title="Copy"
            >
              {copiedField === "apiKey" ? (
                <MdOutlineCheck size={16} className="text-success" />
              ) : (
                <MdContentCopy size={16} />
              )}
            </button>
          </div>
          <button
            onClick={() => { setNewApiKey(null); setShowNewKey(false); }}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
          >
            I&apos;ve saved the key
          </button>
        </div>
      )}

      {/* API Keys */}
      <div className="bg-card border border-border/50 rounded mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border/50">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MdOutlineKey size={16} className="text-primary" />
            API Keys
            <span className="text-xs text-muted-foreground font-normal">({keys.length})</span>
          </h2>
          <button
            onClick={() => setShowCreateKey(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <MdOutlineAdd size={14} />
            New Key
          </button>
        </div>

        {/* Create Key Inline Form */}
        {showCreateKey && (
          <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g., my-coding-agent)"
                className="flex-1 px-3 py-1.5 bg-background border rounded text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                autoFocus
              />
              <button
                onClick={handleCreateKey}
                disabled={creatingKey || !newKeyName.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50"
              >
                {creatingKey ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => { setShowCreateKey(false); setNewKeyName(""); }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Key List */}
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading keys...</div>
        ) : keys.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MdOutlineKey className="mx-auto text-muted-foreground mb-2" size={28} />
            <p className="text-sm text-muted-foreground">No API keys yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a key to let AI agents upload files</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {keys.map((key) => (
              <div key={key.id} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground">{key.name}</span>
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-sm font-mono">
                        {key.keyPrefix}...
                      </code>
                      {!key.isActive && (
                        <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-sm">Inactive</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      <div className="flex items-center gap-2">
                        <span>Uploads to</span>
                        <div className="flex items-center gap-0.5 bg-muted rounded p-0.5">
                          <button
                            onClick={() => handleUpdateDestination(key.id, "agent", null)}
                            disabled={updatingId === key.id}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                              key.destination === "agent"
                                ? "bg-background shadow-sm font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            AgentBucket
                          </button>
                          <button
                            onClick={() => handleUpdateDestination(key.id, "drive", key.destinationFolder)}
                            disabled={updatingId === key.id}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                              key.destination === "drive"
                                ? "bg-background shadow-sm font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            My Drive
                          </button>
                        </div>
                        {key.destination === "drive" && (
                          <>
                            <span>/</span>
                            <input
                              type="text"
                              defaultValue={key.destinationFolder || ""}
                              onBlur={(e) => {
                                if (e.target.value !== (key.destinationFolder || "")) {
                                  handleUpdateDestination(key.id, "drive", e.target.value || null);
                                }
                              }}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                              placeholder="root"
                              className="px-1.5 py-0.5 bg-background border rounded text-xs w-28"
                            />
                          </>
                        )}
                      </div>
                      {memoryEnabled ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary"
                          title="AgentBucket+: text files are indexed for semantic recall. Agents skip a file with index=false."
                        >
                          <MdAutoAwesome size={13} />
                          <span className="font-medium">Memory on</span>
                        </span>
                      ) : (
                        <Link
                          href="/pricing"
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-2.5 py-1 transition-colors hover:from-primary/25 hover:to-primary/10"
                          title="AgentBucket+ memory: agents recall saved files by meaning. Included on all paid plans."
                        >
                          <MdAutoAwesome size={13} className="text-primary" />
                          <span className="font-medium text-foreground">Memory</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                            Upgrade
                          </span>
                        </Link>
                      )}
                      <span>
                        {key.lastUsedAt
                          ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => confirmDeleteId === key.id ? handleDeleteKey(key.id) : setConfirmDeleteId(key.id)}
                    disabled={deletingId === key.id}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title={confirmDeleteId === key.id ? "Click again to confirm" : "Delete key"}
                  >
                    {deletingId === key.id ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <MdOutlineDelete size={18} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* API Guide — collapsible inside keys section */}
        <details className="border-t border-border/50 group/guide">
          <summary className="px-4 py-3 text-xs text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
            <svg className="w-3 h-3 transition-transform group-open/guide:rotate-90 shrink-0" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4.5 2L9 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <MdOutlineSmartToy size={14} />
            API Guide — curl, Python, JavaScript examples
          </summary>
          <div className="px-4 py-3 border-t border-border/50 bg-muted/10">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <button
                onClick={() => {
                  const blob = new Blob([agentApiGuide], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "bucket0-agentbucket-api-guide.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors"
              >
                <MdOutlineDownload size={14} />
                Download
              </button>
              <button
                onClick={() => copyToClipboard(agentApiGuide, "agentGuide")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors"
              >
                {copiedField === "agentGuide" ? (
                  <><MdOutlineCheck size={14} className="text-success" /> Copied</>
                ) : (
                  <><MdContentCopy size={14} /> Copy</>
                )}
              </button>
            </div>
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">{agentApiGuide}</pre>
          </div>
        </details>
      </div>

      {/* Connect an AI assistant */}
      <div className="bg-card border border-border/50 rounded mb-4 overflow-hidden">
        <div className="px-4 py-3 bg-muted/40 border-b border-border/50">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MdAutoAwesome size={16} className="text-primary" />
            Connect an AI assistant
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Plug AgentBucket into your agent as MCP tools — save, search memory, read, list, delete. One-click for Claude.ai and ChatGPT, or use a key for local clients.
          </p>
        </div>
        <div className="p-4">
          <div className="inline-flex rounded-lg bg-muted/50 p-0.5 mb-4">
            {([
              { id: "web", label: "Claude.ai / ChatGPT" },
              { id: "code", label: "Claude Code" },
              { id: "local", label: "Cursor / Desktop" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setConnectTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  connectTab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {connectTab === "web" && (
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
                <MdAutoAwesome size={11} /> One-click · no key
              </span>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
                <li>In Claude.ai or ChatGPT, open <span className="text-foreground">Settings → Connectors → Add custom connector</span>.</li>
                <li>Name it <span className="text-foreground">AgentBucket</span> and paste the URL below — leave the OAuth fields blank.</li>
                <li>Click <span className="text-foreground">Connect</span>, sign in to Bucket0, then <span className="text-foreground">Authorize</span>.</li>
              </ol>
              <Snippet label="Server URL" code={mcpUrl} field="mcpurl" copiedField={copiedField} onCopy={copyToClipboard} />
            </div>
          )}

          {connectTab === "code" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Run this in your terminal — Claude Code opens your browser to authorize. No key to paste.
              </p>
              <Snippet label="Claude Code · OAuth" code={claudeCodeRemoteCmd} field="ccremote" copiedField={copiedField} onCopy={copyToClipboard} />
              <p className="text-[11px] text-muted-foreground">Prefer a key? Run it locally over npx instead:</p>
              <Snippet label="Claude Code · npx + key" code={claudeCodeCmd} field="cc" copiedField={copiedField} onCopy={copyToClipboard} />
            </div>
          )}

          {connectTab === "local" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Add to your <code className="font-mono">mcp.json</code>. Create a key above and replace <code className="font-mono">&lt;YOUR_KEY&gt;</code>.
              </p>
              <Snippet label="Claude Desktop / Cursor (mcp.json)" code={mcpJsonConfig} field="mcpjson" copiedField={copiedField} onCopy={copyToClipboard} />
            </div>
          )}
        </div>
      </div>

      {/* Agent Files */}
      <AgentFilesBrowser refreshTrigger={filesRefreshTrigger} />
    </div>
  );
}
