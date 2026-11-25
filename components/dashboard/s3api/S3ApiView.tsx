
import { useState } from "react";
import {
  MdOutlineKey,
  MdOutlineStorage,
  MdOutlineAdd,
  MdOutlineRefresh,
  MdOutlineUpgrade,
  MdOutlineApi,
  MdOutlineDelete,
  MdOutlineContentCopy,
  MdOutlineCheck,
  MdOutlineSmartToy,
  MdOutlineDownload,
} from "react-icons/md";
import { useS3ApiData } from "./useS3ApiData";
import {
  EndpointInfo,
  CredentialCard,
  BucketCard,
  NewCredentialModal,
  CreateKeyModal,
  CreateBucketModal,
  CredentialsModal,
  ConfirmModal,
  BucketFileBrowser,
} from "./components";
import type { Bucket, NewCredential } from "./types";

const s3AgentGuide = `# Bucket0 S3 API — Integration Guide for AI Agents

## What this is

Bucket0's **S3-compatible API** lets AI agents (Claude, GPT, Gemini, OpenClaw, etc.) read and write files using standard AWS SDKs. It speaks the S3 protocol so any S3 client works — boto3, AWS CLI, AWS SDK for JavaScript, rclone, cyberduck, etc.

The user creates an access key in the Bucket0 dashboard and gives you the credentials. You authenticate with AWS Signature v4 (handled automatically by any S3 SDK).

## How it works

1. **User creates a key** in the dashboard → S3 API tab → "Create Key". An Access Key ID and Secret Access Key are generated. The secret is shown only once.
2. **User gives you the credentials** along with a bucket name (or you can list/create buckets via the API).
3. **You use any S3 SDK** with the Bucket0 endpoint and the user's credentials.
4. **Files are stored** in the specified bucket and counted against the user's plan storage.

## Endpoint

\`\`\`
https://s3.bucket0.com
\`\`\`

| Setting | Value |
|---|---|
| Endpoint URL | \`https://s3.bucket0.com\` |
| Region | \`auto\` |
| Force path style | \`true\` (recommended) |
| Authentication | AWS Signature v4 |

## Operations

### AWS CLI

\`\`\`bash
# One-time: configure a profile
aws configure --profile bucket0
# Access Key ID: <ACCESS_KEY_ID>
# Secret Access Key: <SECRET_ACCESS_KEY>
# Region: auto
# Output format: json

# Upload a file
aws s3 cp <LOCAL_PATH> s3://<BUCKET>/<KEY> \\
  --endpoint-url https://s3.bucket0.com --profile bucket0

# List bucket contents
aws s3 ls s3://<BUCKET>/ \\
  --endpoint-url https://s3.bucket0.com --profile bucket0

# Download a file
aws s3 cp s3://<BUCKET>/<KEY> <LOCAL_PATH> \\
  --endpoint-url https://s3.bucket0.com --profile bucket0

# Delete a file
aws s3 rm s3://<BUCKET>/<KEY> \\
  --endpoint-url https://s3.bucket0.com --profile bucket0
\`\`\`

### Python (boto3)

\`\`\`python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.bucket0.com",
    aws_access_key_id="<ACCESS_KEY_ID>",
    aws_secret_access_key="<SECRET_ACCESS_KEY>",
    region_name="auto",
)

# Upload
s3.upload_file("<LOCAL_PATH>", "<BUCKET>", "<KEY>")

# Download
s3.download_file("<BUCKET>", "<KEY>", "<LOCAL_PATH>")

# List
response = s3.list_objects_v2(Bucket="<BUCKET>")
for obj in response.get("Contents", []):
    print(obj["Key"], obj["Size"])

# Delete
s3.delete_object(Bucket="<BUCKET>", Key="<KEY>")
\`\`\`

### JavaScript / TypeScript (AWS SDK v3)

\`\`\`typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

const s3 = new S3Client({
  region: "auto",
  endpoint: "https://s3.bucket0.com",
  credentials: {
    accessKeyId: "<ACCESS_KEY_ID>",
    secretAccessKey: "<SECRET_ACCESS_KEY>",
  },
  forcePathStyle: true,
});

// Upload
await s3.send(new PutObjectCommand({
  Bucket: "<BUCKET>",
  Key: "<KEY>",
  Body: readFileSync("<LOCAL_PATH>"),
}));

// List
const list = await s3.send(new ListObjectsV2Command({ Bucket: "<BUCKET>" }));
for (const obj of list.Contents ?? []) {
  console.log(obj.Key, obj.Size);
}

// Delete
await s3.send(new DeleteObjectCommand({ Bucket: "<BUCKET>", Key: "<KEY>" }));
\`\`\`

## Key naming rules

- Use forward slashes for "folder" paths: \`<folder>/<subfolder>/<filename>.<ext>\`
- Always include the correct file extension matching the content type
- Avoid special characters; stick to letters, digits, \`.\`, \`_\`, \`-\`, \`/\`
- Keys are case-sensitive
- Maximum key length: 1024 bytes

## Buckets

- The user creates buckets via the dashboard (or you can create them via \`PutBucket\` if your key has permission)
- Bucket names are globally unique per user
- Use bucket names as logical project/topic separators (e.g., one bucket per project)

## Error handling

Standard S3 error codes apply. Common ones to handle:

| HTTP | S3 Error | What to do |
|---|---|---|
| 200 | — | Success |
| 400 | \`InvalidRequest\`, \`MalformedXML\` | Fix the request |
| 401 | \`InvalidAccessKeyId\` | Stop. Ask user for new credentials |
| 403 | \`SignatureDoesNotMatch\`, \`AccessDenied\` | Wrong secret or no permission |
| 404 | \`NoSuchBucket\`, \`NoSuchKey\` | Resource doesn't exist |
| 409 | \`BucketAlreadyExists\` | Use a different bucket name |
| 413 | \`EntityTooLarge\` | File exceeds plan's per-file limit |
| 429 | \`SlowDown\` | Back off and retry |
| 500 | \`InternalError\` | Retry with backoff |
| 507 | \`InsufficientStorage\` | User hit plan storage limit |

Most S3 SDKs handle retries and backoff automatically.

## Best practices for agents

1. **Tell the user the bucket and key** before uploading
2. **Confirm after upload** with the actual key you used
3. **Use multipart upload for large files** (most SDKs do this automatically for files > 5MB)
4. **Don't delete the user's files** unless explicitly asked
5. **Use consistent key prefixes** within a session: \`<topic>/<date>/<filename>\`
6. **Use the correct file extension** matching the content type — never invent extensions
7. **Handle 401/403 gracefully** — stop immediately and ask the user for new credentials
8. **Respect storage limits** — if you get a 507, tell the user; don't retry

## Plan limits

| Plan | Max access keys | Max buckets | Max storage | Max file size |
|---|---|---|---|---|
| Free | 1 | 1 | 5 GB | 1 GB |
| Starter | 5 | 10 | 150 GB | 5 GB |
| Pro | 5 | 50 | 700 GB | 15 GB |
| Scale | 5 | 100 | 2 TB | 15 GB |

## Compatible tools

Anything that speaks S3 will work:
- AWS CLI, AWS SDKs (Python, JS, Go, Java, .NET, Ruby, PHP)
- rclone, s3cmd, mc (MinIO client)
- Cyberduck, Transmit, S3 Browser
- Any S3-compatible library
`;

interface S3ApiViewProps {
  initialBucketId?: string | null;
  onBucketsLoaded?: (buckets: Bucket[]) => void;
  onBucketSelect?: (bucketId: string) => void;
  showCreateBucketModal?: boolean;
  onCloseCreateBucketModal?: () => void;
  showCredentialsModal?: boolean;
  onCloseCredentialsModal?: () => void;
}

export default function S3ApiView({
  onBucketsLoaded,
  onBucketSelect,
  showCreateBucketModal = false,
  onCloseCreateBucketModal,
  showCredentialsModal = false,
  onCloseCredentialsModal,
}: S3ApiViewProps) {
  // Data hook
  const {
    credentials,
    buckets,
    loading,
    error,
    setError,
    isS3ApiEnabled,
    maxKeys,
    maxBuckets,
    fetchData,
    createCredential,
    deleteCredential,
    createBucket,
    deleteBucket,
  } = useS3ApiData({ onBucketsLoaded });

  // UI state
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newCredential, setNewCredential] = useState<NewCredential | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const [newBucketName, setNewBucketName] = useState("");
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [showLocalCreateBucket, setShowLocalCreateBucket] = useState(false);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingBucketId, setDeletingBucketId] = useState<string | null>(null);
  const [confirmDeleteBucketId, setConfirmDeleteBucketId] = useState<string | null>(null);
  const [forceDeleteBucketId, setForceDeleteBucketId] = useState<string | null>(null);
  const [selectedBucketName, setSelectedBucketName] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCreateCredential = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);

    const result = await createCredential(newKeyName.trim());
    if (result) {
      setNewCredential(result);
      setNewKeyName("");
      setShowCreateKey(false);
    }

    setCreatingKey(false);
  };

  const handleDeleteCredential = async (id: string) => {
    setDeletingId(id);
    await deleteCredential(id);
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  const handleRequestDelete = (id: string) => {
    if (credentials.length <= 1 && buckets.length > 0) {
      setError("Cannot delete the last API key while buckets exist. Delete your buckets first, or create another key.");
      return;
    }
    setConfirmDeleteId(id);
  };

  const handleCreateBucket = async () => {
    if (!newBucketName.trim()) return;
    setCreatingBucket(true);
    setBucketError(null);

    try {
      await createBucket(newBucketName.trim());
      setNewBucketName("");
      setShowLocalCreateBucket(false);
      onCloseCreateBucketModal?.();
    } catch (err) {
      setBucketError(err instanceof Error ? err.message : "Failed to create bucket");
    } finally {
      setCreatingBucket(false);
    }
  };

  const handleDeleteBucket = async (bucketId: string, force: boolean = false) => {
    setDeletingBucketId(bucketId);
    setConfirmDeleteBucketId(null);
    setForceDeleteBucketId(null);

    const result = await deleteBucket(bucketId, force);

    if (!result.success && result.notEmpty) {
      // Bucket is not empty, show force delete dialog
      setDeletingBucketId(null);
      setForceDeleteBucketId(bucketId);
      return;
    }

    setDeletingBucketId(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Upgrade prompt for free users
  if (!isS3ApiEnabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="max-w-md w-full text-center px-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <MdOutlineApi className="text-primary" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">S3 API Access</h2>
          <p className="text-muted-foreground mb-6">
            Access your Bucket0 storage via AWS CLI, SDKs, and S3-compatible tools.
            This feature is available on paid plans.
          </p>
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors font-medium"
          >
            <MdOutlineUpgrade size={20} />
            View Plans
          </a>
        </div>
      </div>
    );
  }

  // Welcome screen when no credentials
  if (credentials.length === 0) {
    return (
      <div className="max-w-2xl mx-auto pt-8 px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <MdOutlineKey className="text-primary" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Get Started with S3 API</h2>
          <p className="text-muted-foreground">
            Create access keys to use your Bucket0 storage with AWS CLI, SDKs and S3-compatible tools.
          </p>
        </div>

        <EndpointInfo copiedField={copiedField} onCopy={copyToClipboard} />

        <div className="bg-card border border-border rounded p-6 mt-6">
          <h3 className="font-medium text-foreground mb-4">Create Your First Access Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., CLI Access, Backup Script"
                className="w-full px-3 py-2 bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              onClick={handleCreateCredential}
              disabled={creatingKey || !newKeyName.trim()}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
            >
              {creatingKey ? "Creating..." : "Create Access Key"}
            </button>
          </div>
        </div>

        {newCredential && (
          <NewCredentialModal
            credential={newCredential}
            showSecret={showSecret}
            copiedField={copiedField}
            onToggleSecret={() => setShowSecret(!showSecret)}
            onCopy={copyToClipboard}
            onClose={() => {
              setNewCredential(null);
              setShowSecret(false);
            }}
          />
        )}
      </div>
    );
  }

  // File browser view when a bucket is selected
  if (selectedBucketName) {
    return (
      <div className="px-4">
        <BucketFileBrowser
          bucketName={selectedBucketName}
          onBack={() => setSelectedBucketName(null)}
          onStorageChange={() => fetchData(true)}
        />
      </div>
    );
  }

  // Main view
  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">S3 API Access</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your access keys and buckets for S3-compatible access
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
          title="Refresh"
        >
          <MdOutlineRefresh size={20} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 px-4 py-2.5 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 underline text-xs hover:no-underline">Dismiss</button>
        </div>
      )}

      {/* Endpoint */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border border-border/50 rounded mb-3">
        <span className="text-xs text-muted-foreground">S3 Endpoint</span>
        <button
          onClick={() => copyToClipboard("https://s3.bucket0.com", "endpoint")}
          className="flex items-center gap-2 text-sm font-mono text-foreground hover:text-primary transition-colors"
          title="Copy endpoint"
        >
          https://s3.bucket0.com
          {copiedField === "endpoint" ? (
            <MdOutlineCheck size={14} className="text-green-500" />
          ) : (
            <MdOutlineContentCopy size={14} className="text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Access Keys */}
      <div className="bg-card border border-border/50 rounded mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border/50">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MdOutlineKey size={16} className="text-primary" />
            Access Keys
            <span className="text-xs text-muted-foreground font-normal">
              ({credentials.length}/{maxKeys})
            </span>
          </h2>
          <div className="flex items-center gap-3">
            {credentials.length < maxKeys && (
              <button
                onClick={() => setShowCreateKey(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <MdOutlineAdd size={14} />
                Create Key
              </button>
            )}
          </div>
        </div>

        {credentials.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MdOutlineKey className="mx-auto text-muted-foreground mb-2" size={28} />
            <p className="text-sm text-muted-foreground">No access keys yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a key to access your buckets via S3-compatible tools</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {credentials.map((cred) => (
              <CredentialCard
                key={cred.id}
                credential={cred}
                copiedField={copiedField}
                isDeleting={deletingId === cred.id}
                onCopy={copyToClipboard}
                onDelete={() => handleRequestDelete(cred.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Buckets Section */}
      <div className="bg-card border border-border/50 rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border/50">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MdOutlineStorage size={16} className="text-primary" />
            Buckets
            <span className="text-xs text-muted-foreground font-normal">
              ({buckets.length}/{maxBuckets})
            </span>
          </h2>
          {buckets.length < maxBuckets && (
            <button
              onClick={() => setShowLocalCreateBucket(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs hover:bg-muted transition-colors"
            >
              <MdOutlineAdd size={14} />
              Create Bucket
            </button>
          )}
        </div>

        {buckets.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MdOutlineStorage className="mx-auto text-muted-foreground mb-2" size={28} />
            <p className="text-sm text-muted-foreground">No buckets yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Buckets are created automatically on first upload
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {buckets.map((bucket) => (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                isDeleting={deletingBucketId === bucket.id}
                onSelect={() => {
                  setSelectedBucketName(bucket.name);
                  onBucketSelect?.(bucket.id);
                }}
                onDelete={() => setConfirmDeleteBucketId(bucket.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Agent S3 Access Guide */}
      <div className="bg-card border border-border/50 rounded mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border/50">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <MdOutlineSmartToy size={16} className="text-primary" />
            S3 API Integration Guide
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const content = s3AgentGuide;
                const blob = new Blob([content], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "bucket0-s3-api-integration-guide.md";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors"
            >
              <MdOutlineDownload size={14} />
              Download
            </button>
            <button
              onClick={() => copyToClipboard(s3AgentGuide, "agentGuide")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded hover:bg-muted transition-colors"
            >
              {copiedField === "agentGuide" ? (
                <><MdOutlineCheck size={14} className="text-green-500" /> Copied</>
              ) : (
                <><MdOutlineContentCopy size={14} /> Copy</>
              )}
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">{s3AgentGuide}</pre>
        </div>
      </div>

      {/* Modals */}
      {showCreateKey && (
        <CreateKeyModal
          keyName={newKeyName}
          isCreating={creatingKey}
          error={error}
          onKeyNameChange={setNewKeyName}
          onCreate={handleCreateCredential}
          onClose={() => {
            setShowCreateKey(false);
            setNewKeyName("");
            setError(null);
          }}
        />
      )}

      {newCredential && (
        <NewCredentialModal
          credential={newCredential}
          showSecret={showSecret}
          copiedField={copiedField}
          onToggleSecret={() => setShowSecret(!showSecret)}
          onCopy={copyToClipboard}
          onClose={() => {
            setNewCredential(null);
            setShowSecret(false);
          }}
        />
      )}

      {(showCreateBucketModal || showLocalCreateBucket) && (
        <CreateBucketModal
          bucketName={newBucketName}
          isCreating={creatingBucket}
          error={bucketError}
          onBucketNameChange={setNewBucketName}
          onCreate={handleCreateBucket}
          onClose={() => {
            setShowLocalCreateBucket(false);
            onCloseCreateBucketModal?.();
            setNewBucketName("");
            setBucketError(null);
          }}
        />
      )}

      {showCredentialsModal && !newCredential && (
        <CredentialsModal
          credentials={credentials}
          maxKeys={maxKeys}
          copiedField={copiedField}
          deletingId={deletingId}
          onCopy={copyToClipboard}
          onDelete={handleRequestDelete}
          onCreateNew={() => {
            onCloseCredentialsModal?.();
            setShowCreateKey(true);
          }}
          onClose={() => onCloseCredentialsModal?.()}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Delete Access Key"
          subtitle={credentials.find((c) => c.id === confirmDeleteId)?.name}
          message="This action cannot be undone. Any applications using this key will lose access."
          icon={<MdOutlineDelete className="text-destructive" size={20} />}
          isConfirming={deletingId === confirmDeleteId}
          onConfirm={() => handleDeleteCredential(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {confirmDeleteBucketId && (
        <ConfirmModal
          title="Delete Bucket"
          subtitle={buckets.find((b) => b.id === confirmDeleteBucketId)?.name}
          message="This will permanently delete the bucket. If the bucket contains files, you'll be prompted to confirm deletion of all files."
          icon={<MdOutlineStorage className="text-destructive" size={20} />}
          isConfirming={deletingBucketId === confirmDeleteBucketId}
          onConfirm={() => handleDeleteBucket(confirmDeleteBucketId)}
          onCancel={() => setConfirmDeleteBucketId(null)}
        />
      )}

      {forceDeleteBucketId && (
        <ConfirmModal
          title="Bucket Not Empty"
          subtitle={buckets.find((b) => b.id === forceDeleteBucketId)?.name}
          message={`This bucket contains ${buckets.find((b) => b.id === forceDeleteBucketId)?.objectCount || 0} file(s). Do you want to delete all files and the bucket? This action cannot be undone.`}
          icon={<MdOutlineDelete className="text-destructive" size={20} />}
          isConfirming={deletingBucketId === forceDeleteBucketId}
          confirmLabel="Delete All"
          confirmingLabel="Deleting all..."
          onConfirm={() => handleDeleteBucket(forceDeleteBucketId, true)}
          onCancel={() => setForceDeleteBucketId(null)}
        />
      )}
    </div>
  );
}
