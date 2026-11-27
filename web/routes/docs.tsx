import { useState } from "react";
import { DocsLayout, type NavGroup } from "@/components/docs/DocsLayout";
import { CodeBlock, CodeGroup } from "@/components/docs/CodeBlock";
import { Bullets, Callout, Code, Definitions, DocSection, Endpoints, H3, H4, P, Steps } from "@/components/docs/parts";
import { LockCloseIcon } from "@/components/icons";
import { GITHUB_URL, textLink } from "@/components/site/styles";
import { nextMeta } from "@/web/compat/meta";
import { constructMetadata } from "@/lib/shared/seo";

const SDK_LANGUAGES = ["JavaScript", "Python", "Go", "Rust"] as const;
type SDKLanguage = (typeof SDK_LANGUAGES)[number];

const codeSnippets: Record<string, Record<SDKLanguage, string>> = {
  agentUpload: {
    JavaScript: `const apiKey = 'b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const formData = new FormData();
formData.append('file', fileBuffer);
formData.append('filename', 'research/results.json');

const response = await fetch('https://bucket0.com/api/agent-bucket/files/upload', {
  method: 'POST',
  headers: { 'Authorization': \`Bearer \${apiKey}\` },
  body: formData,
});

const data = await response.json();
// { success: true, key: "research/results.json", fileName: "results.json", size: 2048, destination: "agent" }`,
    Python: `import requests

api_key = "b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

response = requests.post(
    'https://bucket0.com/api/agent-bucket/files/upload',
    files={'file': open('results.json', 'rb')},
    data={'filename': 'research/results.json'},
    headers={'Authorization': f'Bearer {api_key}'}
)

data = response.json()
# { "success": true, "key": "research/results.json", "fileName": "results.json", "size": 2048, "destination": "agent" }`,
    Go: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "mime/multipart"
    "net/http"
)

func agentUpload(apiKey string, fileData []byte, filename string) error {
    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)
    part, _ := writer.CreateFormFile("file", filename)
    part.Write(fileData)
    writer.WriteField("filename", filename)
    writer.Close()

    req, _ := http.NewRequest("POST",
        "https://bucket0.com/api/agent-bucket/files/upload", body)
    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))
    req.Header.Set("Content-Type", writer.FormDataContentType())

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    fmt.Printf("Uploaded: %s (%v bytes)\\n", result["key"], result["size"])
    return nil
}`,
    Rust: `use reqwest::Client;

async fn agent_upload(api_key: &str, file_data: Vec<u8>, filename: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let client = Client::new();
    let form = reqwest::multipart::Form::new()
        .part("file", reqwest::multipart::Part::bytes(file_data)
            .file_name(filename.to_string()))
        .text("filename", filename.to_string());

    let response = client
        .post("https://bucket0.com/api/agent-bucket/files/upload")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await?;

    let result = response.json::<serde_json::Value>().await?;
    Ok(result)
}`,
  },
  agentList: {
    JavaScript: `const apiKey = 'b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const response = await fetch('https://bucket0.com/api/agent-bucket/files?page=1&pageSize=50', {
  headers: { 'Authorization': \`Bearer \${apiKey}\` },
});

const { files, pagination } = await response.json();
// pagination: { total: 25, page: 1, pageSize: 50, hasMore: false }
files.forEach(file => {
  console.log(\`\${file.fileName} - \${file.size} bytes (via \${file.uploadedVia})\`);
});`,
    Python: `import requests

api_key = "b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

response = requests.get(
    'https://bucket0.com/api/agent-bucket/files',
    params={'page': 1, 'pageSize': 50},
    headers={'Authorization': f'Bearer {api_key}'}
)

data = response.json()
for file in data['files']:
    print(f"{file['fileName']} - {file['size']} bytes")
print(f"Total: {data['pagination']['total']}")`,
    Go: `package main

import (
    "encoding/json"
    "fmt"
    "net/http"
)

func listAgentFiles(apiKey string) error {
    req, _ := http.NewRequest("GET",
        "https://bucket0.com/api/agent-bucket/files?page=1&pageSize=50", nil)
    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    fmt.Printf("Total files: %v\\n", result["pagination"].(map[string]interface{})["total"])
    return nil
}`,
    Rust: `use reqwest::Client;

async fn list_agent_files(api_key: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client
        .get("https://bucket0.com/api/agent-bucket/files")
        .query(&[("page", "1"), ("pageSize", "50")])
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await?;

    let result = response.json::<serde_json::Value>().await?;
    Ok(result)
}`,
  },
  agentDownload: {
    JavaScript: `const apiKey = 'b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const key = 'research/results.json';

const response = await fetch(
  \`https://bucket0.com/api/agent-bucket/files/download?key=\${encodeURIComponent(key)}\`,
  { headers: { 'Authorization': \`Bearer \${apiKey}\` } }
);

// Response is binary with headers:
// Content-Type, Content-Disposition, Content-Length
const blob = await response.blob();`,
    Python: `import requests

api_key = "b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
key = "research/results.json"

response = requests.get(
    'https://bucket0.com/api/agent-bucket/files/download',
    params={'key': key},
    headers={'Authorization': f'Bearer {api_key}'}
)

with open('results.json', 'wb') as f:
    f.write(response.content)`,
    Go: `package main

import (
    "fmt"
    "io"
    "net/http"
    "net/url"
)

func downloadAgentFile(apiKey, key string) ([]byte, error) {
    encodedKey := url.QueryEscape(key)
    req, _ := http.NewRequest("GET",
        fmt.Sprintf("https://bucket0.com/api/agent-bucket/files/download?key=%s", encodedKey), nil)
    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    return io.ReadAll(resp.Body)
}`,
    Rust: `use reqwest::Client;

async fn download_agent_file(api_key: &str, key: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client
        .get("https://bucket0.com/api/agent-bucket/files/download")
        .query(&[("key", key)])
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await?;

    let bytes = response.bytes().await?;
    Ok(bytes.to_vec())
}`,
  },
  agentMemorySearch: {
    JavaScript: `const apiKey = 'b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const response = await fetch('https://bucket0.com/api/agent-bucket/memory/search', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${apiKey}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: 'pricing feedback from the Acme call', topK: 5 }),
});

const { results } = await response.json();
// [{ fileName: "acme.md", key: "calls/acme.md", chunkIndex: 2, snippet: "...", score: 0.82 }]`,
    Python: `import requests

api_key = "b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

response = requests.post(
    'https://bucket0.com/api/agent-bucket/memory/search',
    json={'query': 'pricing feedback from the Acme call', 'topK': 5},
    headers={'Authorization': f'Bearer {api_key}'}
)

for r in response.json()['results']:
    print(f"{r['key']} ({r['score']:.2f}): {r['snippet']}")`,
    Go: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

func searchMemory(apiKey, query string) error {
    payload, _ := json.Marshal(map[string]interface{}{"query": query, "topK": 5})
    req, _ := http.NewRequest("POST",
        "https://bucket0.com/api/agent-bucket/memory/search", bytes.NewReader(payload))
    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    fmt.Printf("Results: %v\\n", result["results"])
    return nil
}`,
    Rust: `use reqwest::Client;
use serde_json::json;

async fn search_memory(api_key: &str, query: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client
        .post("https://bucket0.com/api/agent-bucket/memory/search")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({ "query": query, "topK": 5 }))
        .send()
        .await?;

    let result = response.json::<serde_json::Value>().await?;
    Ok(result)
}`,
  },
  agentShare: {
    JavaScript: `const apiKey = 'b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const response = await fetch('https://bucket0.com/api/agent-bucket/files/share', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${apiKey}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ key: 'videos/demo.mp4', allowDownload: false }),
});

const { shareUrl, streamUrl } = await response.json();
// shareUrl: "https://bucket0.com/s/<linkId>"
// streamUrl: "https://bucket0.com/api/cloud/share/stream?id=<linkId>"`,
    Python: `import requests

api_key = "b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

response = requests.post(
    'https://bucket0.com/api/agent-bucket/files/share',
    json={'key': 'videos/demo.mp4', 'allowDownload': False},
    headers={'Authorization': f'Bearer {api_key}'}
)

data = response.json()
print(data['shareUrl'], data['streamUrl'])`,
    Go: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

func shareAgentFile(apiKey, key string) error {
    payload, _ := json.Marshal(map[string]interface{}{"key": key, "allowDownload": false})
    req, _ := http.NewRequest("POST",
        "https://bucket0.com/api/agent-bucket/files/share", bytes.NewReader(payload))
    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    fmt.Printf("Share: %s\\nStream: %s\\n", result["shareUrl"], result["streamUrl"])
    return nil
}`,
    Rust: `use reqwest::Client;
use serde_json::json;

async fn share_agent_file(api_key: &str, key: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client
        .post("https://bucket0.com/api/agent-bucket/files/share")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({ "key": key, "allowDownload": false }))
        .send()
        .await?;

    let result = response.json::<serde_json::Value>().await?;
    Ok(result)
}`,
  },
  s3ListBuckets: {
    JavaScript: `import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: 'https://s3.bucket0.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'YOUR_ACCESS_KEY_ID',
    secretAccessKey: 'YOUR_SECRET_ACCESS_KEY',
  },
});

const { Buckets } = await client.send(new ListBucketsCommand({}));
Buckets?.forEach(b => console.log(b.Name, b.CreationDate));`,
    Python: `import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://s3.bucket0.com',
    aws_access_key_id='YOUR_ACCESS_KEY_ID',
    aws_secret_access_key='YOUR_SECRET_ACCESS_KEY',
    region_name='auto'
)

response = s3.list_buckets()
for bucket in response['Buckets']:
    print(f"{bucket['Name']} - {bucket['CreationDate']}")`,
    Go: `package main

import (
    "context"
    "fmt"

    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/credentials"
    "github.com/aws/aws-sdk-go-v2/service/s3"
)

func listBuckets() error {
    client := s3.New(s3.Options{
        BaseEndpoint: aws.String("https://s3.bucket0.com"),
        Region:       "auto",
        Credentials:  credentials.NewStaticCredentialsProvider("KEY_ID", "SECRET", ""),
    })

    result, err := client.ListBuckets(context.Background(), &s3.ListBucketsInput{})
    if err != nil {
        return err
    }
    for _, b := range result.Buckets {
        fmt.Printf("%s - %s\\n", *b.Name, b.CreationDate)
    }
    return nil
}`,
    Rust: `use aws_sdk_s3::{Client, Config};
use aws_sdk_s3::config::{Credentials, Region};

async fn list_buckets() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::builder()
        .endpoint_url("https://s3.bucket0.com")
        .region(Region::new("auto"))
        .credentials_provider(Credentials::new("KEY_ID", "SECRET", None, None, "static"))
        .build();

    let client = Client::from_conf(config);
    for bucket in client.list_buckets().send().await?.buckets() {
        println!("{:?} - {:?}", bucket.name(), bucket.creation_date());
    }
    Ok(())
}`,
  },
  s3Upload: {
    JavaScript: `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: 'https://s3.bucket0.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'YOUR_ACCESS_KEY_ID',
    secretAccessKey: 'YOUR_SECRET_ACCESS_KEY',
  },
});

await client.send(new PutObjectCommand({
  Bucket: 'my-bucket',
  Key: 'documents/report.pdf',
  Body: fileBuffer,
  ContentType: 'application/pdf',
}));
// Returns ETag header on success`,
    Python: `import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://s3.bucket0.com',
    aws_access_key_id='YOUR_ACCESS_KEY_ID',
    aws_secret_access_key='YOUR_SECRET_ACCESS_KEY',
    region_name='auto'
)

# Bucket auto-creates on first upload
s3.upload_fileobj(
    open('report.pdf', 'rb'),
    'my-bucket',
    'documents/report.pdf',
    ExtraArgs={'ContentType': 'application/pdf'}
)`,
    Go: `package main

import (
    "bytes"
    "context"

    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/service/s3"
)

func uploadToS3(client *s3.Client, bucket, key string, data []byte) error {
    // Bucket auto-creates on first upload
    _, err := client.PutObject(context.Background(), &s3.PutObjectInput{
        Bucket:      &bucket,
        Key:         &key,
        Body:        bytes.NewReader(data),
        ContentType: aws.String("application/pdf"),
    })
    return err
}`,
    Rust: `use aws_sdk_s3::{Client, primitives::ByteStream};

async fn upload_to_s3(client: &Client, bucket: &str, key: &str, data: Vec<u8>) -> Result<(), Box<dyn std::error::Error>> {
    // Bucket auto-creates on first upload
    client.put_object()
        .bucket(bucket)
        .key(key)
        .body(ByteStream::from(data))
        .content_type("application/pdf")
        .send()
        .await?;
    Ok(())
}`,
  },
  s3Download: {
    JavaScript: `import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: 'https://s3.bucket0.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'YOUR_ACCESS_KEY_ID',
    secretAccessKey: 'YOUR_SECRET_ACCESS_KEY',
  },
});

const response = await client.send(new GetObjectCommand({
  Bucket: 'my-bucket',
  Key: 'documents/report.pdf',
}));

// response includes: ContentType, ContentLength, ETag, LastModified
const chunks = [];
for await (const chunk of response.Body) {
  chunks.push(chunk);
}
const buffer = Buffer.concat(chunks);`,
    Python: `import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://s3.bucket0.com',
    aws_access_key_id='YOUR_ACCESS_KEY_ID',
    aws_secret_access_key='YOUR_SECRET_ACCESS_KEY',
    region_name='auto'
)

response = s3.get_object(Bucket='my-bucket', Key='documents/report.pdf')
# response includes: ContentType, ContentLength, ETag, LastModified

with open('report.pdf', 'wb') as f:
    f.write(response['Body'].read())`,
    Go: `package main

import (
    "context"
    "io"
    "os"

    "github.com/aws/aws-sdk-go-v2/service/s3"
)

func downloadFromS3(client *s3.Client, bucket, key, filename string) error {
    result, err := client.GetObject(context.Background(), &s3.GetObjectInput{
        Bucket: &bucket,
        Key:    &key,
    })
    if err != nil {
        return err
    }
    defer result.Body.Close()

    file, _ := os.Create(filename)
    defer file.Close()
    _, err = io.Copy(file, result.Body)
    return err
}`,
    Rust: `use aws_sdk_s3::Client;

async fn download_from_s3(client: &Client, bucket: &str, key: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let result = client.get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await?;

    // result includes: content_type, content_length, e_tag, last_modified
    let bytes = result.body.collect().await?.to_vec();
    Ok(bytes)
}`,
  },
};

// --- Section markdown for copy-as-MD ---

const sectionMarkdown: Record<string, string> = {
  introduction: `## Introduction

Bucket0 exposes two developer APIs:

- **AgentBucket API**: Bearer token auth (\`b0ak_\` prefix). Upload, download, list, delete files, create folders, create share links, and search file contents by meaning. Designed for AI agents.
- **MCP server**: \`https://mcp.bucket0.com/mcp\`. Connect Claude, ChatGPT, Cursor or another MCP client and sign in with your Bucket0 account. No key to paste.
- **S3-Compatible API**: AWS Signature V4 auth. Works with AWS CLI, boto3, aws-sdk, Cyberduck, rclone, etc.

`,

  authentication: `## Authentication

### AgentBucket — Bearer Token

1. Go to **Dashboard > AgentBucket > API Keys > New Key**
2. Name your key and choose destination: **AgentBucket** (review files first) or **My Drive** (direct access)
3. Copy the key — it's shown only once
4. Copy the **API Guide** from the same tab and give it to your agent as a reference file for instant setup

\`\`\`
Authorization: Bearer b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

### S3 API — AWS Signature V4

1. Go to **Dashboard > S3 API > Access Keys > Create Key**
2. Copy the Access Key ID and Secret Access Key — shown only once
3. Copy the **S3 API Integration Guide** from the same tab and give it to your agent

\`\`\`bash
aws configure --profile bucket0
AWS Access Key ID: <YOUR_ACCESS_KEY>       # format: B0IAXXXXXXXXXXXXXXXX
AWS Secret Access Key: <YOUR_SECRET_KEY>
Default region name: auto
\`\`\`

Endpoint: \`https://s3.bucket0.com\``,

  "agent-bucket": `## AgentBucket API

Base: \`https://bucket0.com/api/agent-bucket\`
Auth: \`Authorization: Bearer b0ak_...\`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /files/upload | Upload file (multipart/form-data) |
| GET | /files?page=1&pageSize=50 | List files (paginated, max 100) |
| GET | /files/download?key=path | Download file |
| DELETE | /files?key=path | Delete file |
| POST | /files/folder | Create folder |
| POST | /files/share | Create a share link for an Agent Storage file |
| POST | /memory/search | Search indexed file contents by meaning (Starter and up) |

### Upload Response
\`\`\`json
{ "success": true, "key": "research/results.json", "fileName": "results.json", "size": 2048, "destination": "agent" }
\`\`\`

Optional form field \`index\`: send \`false\` to skip memory indexing for this file.

### List Response
\`\`\`json
{
  "files": [{ "key": "research/results.json", "fileName": "results.json", "size": 2048, "mimeType": "application/json", "isStarred": false, "uploadedVia": "key_id", "createdAt": "...", "updatedAt": "..." }],
  "pagination": { "total": 25, "page": 1, "pageSize": 50, "hasMore": false }
}
\`\`\`

### Create Folder
\`\`\`json
POST /files/folder { "path": "reports/daily" }
→ { "success": true, "path": "reports/daily/" }
\`\`\`

### Memory Search
Available on Starter, Pro and Scale. Text files up to 1 MB are indexed after upload (text/*, JSON, XML, YAML, CSV, JavaScript, TypeScript, and common code and config extensions). PDFs and other binary files are not indexed. Content is split into 1,000-character chunks with 100 characters of overlap and stored encrypted. Uploading to the same key replaces its chunks.

| Plan | Indexed chunks |
|------|----------------|
| Free | Not included |
| Starter | 10,000 |
| Pro | 50,000 |
| Scale | 200,000 |

When the chunk limit is reached, further text is not indexed.

\`\`\`json
POST /memory/search { "query": "pricing feedback from the Acme call", "topK": 5 }
→ { "results": [{ "fileName": "acme.md", "key": "calls/acme.md", "chunkIndex": 2, "snippet": "...", "score": 0.82 }] }
\`\`\`

\`topK\` defaults to 8 and is clamped to 1-50. \`score\` is cosine similarity; higher is closer.

### Share Links
\`\`\`json
POST /files/share { "key": "videos/demo.mp4", "allowDownload": false }
→ { "success": true, "linkId": "...", "shareUrl": "https://bucket0.com/s/<linkId>", "streamUrl": "https://bucket0.com/api/cloud/share/stream?id=<linkId>" }
\`\`\`

- Works only for files in Agent Storage. Files written by a key with the My Drive destination return 404.
- Anyone with the link can open it. \`allowDownload\` defaults to true.
- Calling again for the same key returns the existing active link.
- \`streamUrl\` supports Range requests, so audio and video can seek.
- Limit: 100 share links per hour.

### Move to Drive (dashboard only)
Moving or copying an Agent Storage file into My Drive is done from the dashboard (Agent Storage > Move to Drive). The endpoint behind it, \`POST /files/move-to-drive\`, uses your signed-in session and does not accept \`b0ak_\` keys. Moving a file removes it from memory search.

### Error Codes
| Code | Meaning |
|------|---------|
| 400 | Missing file, filename, key or query, or invalid path |
| 401 | Missing/invalid/expired API key |
| 402 | Plan limit, storage quota, or file size exceeded; memory search not included in plan |
| 404 | File or user not found |
| 409 | A file already exists at this path |
| 429 | Rate limit (100 uploads/min, 100 share links/hour). Check X-RateLimit-* headers |
| 503 | Memory search is not available |`,

  mcp: `## MCP server

URL: \`https://mcp.bucket0.com/mcp\` (Streamable HTTP)
Auth: OAuth. Sign in with your Bucket0 account; there is no key to paste.

### Connect
1. In your MCP client, add a remote (custom) MCP server or connector with the URL above.
2. When the client opens the Bucket0 sign-in page, sign in and approve access.
3. Approving creates an AgentBucket API key for that client. It appears in **Dashboard > AgentBucket > API Keys**; delete it to disconnect the client.

Claude Code:
\`\`\`bash
claude mcp add --transport http agentbucket https://mcp.bucket0.com/mcp
\`\`\`
Then run \`/mcp\` in Claude Code and choose the server to sign in.

Claude, ChatGPT and Cursor: add the URL as a custom connector or remote MCP server in the client's settings.

### Tools
| Tool | What it does |
|------|--------------|
| save_file | Save text content to a path. \`index\` (default true) controls memory indexing |
| search_memory | Search saved files by meaning. \`limit\` up to 50, default 8. Starter and up |
| read_file | Read a saved text file |
| list_files | List files, optionally under a folder, with paging |
| delete_file | Delete a file |
| create_folder | Create an empty folder |
| create_streaming_link | Create a share link and a direct stream URL for an Agent Storage file. \`allowDownload\` default true |

### Local server with an API key
The \`agentbucket\` npm package runs the same tools locally over stdio, except \`create_streaming_link\`. It authenticates with an API key from the dashboard.

\`\`\`bash
claude mcp add agentbucket -e BUCKET0_API_KEY=b0ak_your_key -- npx -y agentbucket
\`\`\`

\`\`\`json
{ "mcpServers": { "agentbucket": { "command": "npx", "args": ["-y", "agentbucket"], "env": { "BUCKET0_API_KEY": "b0ak_your_key" } } } }
\`\`\`

### Agent skill
An AgentBucket skill that describes when and how to use these tools is published at https://bucket0.com/.well-known/agent-skills/agentbucket/SKILL.md (index: https://bucket0.com/.well-known/agent-skills/index.json).`,

  "s3-api": `## S3-Compatible API

Endpoint: \`https://s3.bucket0.com\`
Auth: AWS Signature V4

### Operations

| Operation | Method | Notes |
|-----------|--------|-------|
| ListBuckets | GET / | |
| ListObjectsV2 | GET /{bucket}?list-type=2 | prefix, delimiter, max-keys, continuation-token |
| HeadBucket | HEAD /{bucket} | |
| CreateBucket | PUT /{bucket} | |
| DeleteBucket | DELETE /{bucket} | Must be empty |
| GetObject | GET /{bucket}/{key} | Range header supported |
| HeadObject | HEAD /{bucket}/{key} | |
| PutObject | PUT /{bucket}/{key} | Auto-creates bucket |
| DeleteObject | DELETE /{bucket}/{key} | Idempotent (204 even if missing) |

### Behavior
- Buckets auto-create on first PutObject
- DeleteObject returns 204 even if object doesn't exist
- GetObject supports Range requests (returns 206)
- PutObject enforces plan storage and file size limits
- Quota reserved atomically before upload, rolled back on failure

### S3 Error Codes
AccessDenied, NoSuchBucket, NoSuchKey, BucketAlreadyExists, BucketNotEmpty, InvalidBucketName, QuotaExceeded, EntityTooLarge`,

  "rate-limits": `## Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| File Upload | 100 | per minute |
| General API | 200 | per minute |
| Share Links | 100 | per hour |
| S3 Connection Test | 15 | per minute |

On 429, check response headers:
- \`X-RateLimit-Limit\`: max allowed
- \`X-RateLimit-Remaining\`: remaining
- \`X-RateLimit-Reset\`: Unix timestamp of reset`,
};

// --- Page ---

const NAV: NavGroup[] = [
  {
    title: "Get started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "authentication", label: "Authentication" },
    ],
  },
  {
    title: "APIs",
    items: [
      { id: "agent-bucket", label: "AgentBucket API" },
      { id: "mcp", label: "MCP server" },
      { id: "s3-api", label: "S3-compatible API" },
    ],
  },
  {
    title: "Reference",
    items: [
      { id: "sdks", label: "SDK examples" },
      { id: "rate-limits", label: "Rate limits" },
    ],
  },
];

const LEAD = "Three ways to integrate: the AgentBucket API and MCP server for AI agents, and an S3-compatible API for standard tooling.";

function sdkMarkdown(lang: SDKLanguage) {
  const block = (title: string, code: string) => `### ${title}\n\n\`\`\`\n${code}\n\`\`\``;
  return [
    `## SDK Examples (${lang})`,
    block("AgentBucket: upload file", codeSnippets.agentUpload[lang]),
    block("AgentBucket: list files", codeSnippets.agentList[lang]),
    block("AgentBucket: download file", codeSnippets.agentDownload[lang]),
    block("AgentBucket: search memory", codeSnippets.agentMemorySearch[lang]),
    block("AgentBucket: create share link", codeSnippets.agentShare[lang]),
    block("S3: list buckets", codeSnippets.s3ListBuckets[lang]),
    block("S3: upload", codeSnippets.s3Upload[lang]),
    block("S3: download", codeSnippets.s3Download[lang]),
  ].join("\n\n");
}

export default function DocsPage() {
  const [lang, setLang] = useState<SDKLanguage>("JavaScript");
  const snippet = (name: keyof typeof codeSnippets) => (
    <CodeGroup tabs={SDK_LANGUAGES} active={lang} onChange={setLang} codes={codeSnippets[name]} />
  );

  const markdownFor = (id: string) => (id === "sdks" ? sdkMarkdown(lang) : sectionMarkdown[id]);
  const pageMarkdown = () =>
    [`# Bucket0 developer docs`, LEAD, ...NAV.flatMap((g) => g.items.map((i) => markdownFor(i.id)))].filter(Boolean).join("\n\n");

  return (
    <DocsLayout
      groups={NAV}
      label="Developer docs"
      title="Build on Bucket0"
      lead={LEAD}
      pageMarkdown={pageMarkdown}
      sectionMarkdown={markdownFor}
    >
      <DocSection id="introduction" title="Introduction" description="What you can build with Bucket0">
        <P>Bucket0 gives you three ways to reach your storage from code or from an AI agent.</P>
        <Definitions
          items={[
            {
              term: "AgentBucket API",
              description: (
                <>
                  Designed for AI agents. Create API keys from your dashboard, then use Bearer token auth to upload, download,
                  list, delete and share files, create folders and search file contents by meaning. Keys start with{" "}
                  <Code>b0ak_</Code>.
                </>
              ),
            },
            {
              term: "MCP server",
              description: (
                <>
                  Add <Code>https://mcp.bucket0.com/mcp</Code> to Claude, ChatGPT, Cursor or another MCP client and sign in with
                  your Bucket0 account. Your agent gets the same file and memory tools without a key to paste. See{" "}
                  <a href="#mcp" className={textLink}>
                    MCP server
                  </a>
                  .
                </>
              ),
            },
            {
              term: "S3-compatible API",
              description: (
                <>
                  A standard S3 endpoint with AWS Signature V4 authentication. Create access keys from your dashboard, then use
                  any S3 client: AWS CLI, boto3, aws-sdk, Cyberduck, rclone. Access keys look like{" "}
                  <Code>B0IAXXXXXXXXXXXXXXXX</Code>.
                </>
              ),
            },
          ]}
        />
        <P>
          Bucket0 is open source under AGPL-3.0. The code behind every endpoint on this page is{" "}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={textLink}>
            on GitHub
          </a>
          .
        </P>
      </DocSection>

      <DocSection id="authentication" title="Authentication" description="How to get credentials from the dashboard">
        <H3 id="authentication-bearer">AgentBucket: Bearer token</H3>
        <Steps>
          {[
            <>Go to <strong>Dashboard &gt; AgentBucket &gt; API Keys &gt; New Key</strong>.</>,
            <>Name your key, for example <Code>my-coding-agent</Code>.</>,
            <>
              Choose a destination: <strong>AgentBucket</strong> (files go to the review tab) or <strong>My Drive</strong> (files go
              straight to your drive, optionally into a folder).
            </>,
            <>Copy the key. It is shown only once.</>,
            <>
              Copy the <strong>API Guide</strong> from the same tab and give it to your agent as a reference file. It covers
              endpoints, examples, error handling and best practices.
            </>,
          ]}
        </Steps>
        <CodeBlock code="Authorization: Bearer b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />

        <H3 id="authentication-s3">S3 API: AWS Signature V4</H3>
        <Steps>
          {[
            <>Go to <strong>Dashboard &gt; S3 API &gt; Access Keys &gt; Create Key</strong>.</>,
            <>Name your key, for example <Code>CLI Access</Code>.</>,
            <>
              Copy both the Access Key ID (<Code>B0IAXXXXXXXXXXXXXXXX</Code>) and the Secret Access Key. They are shown only once.
            </>,
            <>
              Copy the <strong>S3 API Integration Guide</strong> from the same tab and give it to your agent. It covers every S3
              operation, error handling and best practices.
            </>,
          ]}
        </Steps>
        <CodeBlock
          title="Terminal"
          code={`aws configure --profile bucket0
AWS Access Key ID: B0IAXXXXXXXXXXXXXXXX
AWS Secret Access Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Default region name: auto`}
        />
        <P>
          Endpoint: <Code>https://s3.bucket0.com</Code>
        </P>
        <Callout title="Keys are shown once" icon={<LockCloseIcon aria-hidden className="size-4" />}>
          API keys and S3 credentials are shown only at creation, so store them somewhere safe. You can deactivate or delete keys
          from the dashboard at any time.
        </Callout>
      </DocSection>

      <DocSection id="agent-bucket" title="AgentBucket API" description="File storage for AI agents">
        <P>
          AgentBucket lets AI agents save files to your storage with an API key. Files land in your Agent Storage tab by default,
          so you can review them before moving them to your drive, or straight in your Drive if the key uses the “My Drive”
          destination.
        </P>
        <P>
          Base URL: <Code>https://bucket0.com/api/agent-bucket</Code>
        </P>

        <H3 id="agent-bucket-endpoints">Endpoints</H3>
        <Endpoints
          items={[
            { method: "POST", path: "/api/agent-bucket/files/upload", description: "Upload a file (multipart/form-data)" },
            { method: "GET", path: "/api/agent-bucket/files", description: "List files (paginated)" },
            { method: "GET", path: "/api/agent-bucket/files/download", description: "Download a file by key" },
            { method: "DELETE", path: "/api/agent-bucket/files", description: "Delete a file by key" },
            { method: "POST", path: "/api/agent-bucket/files/folder", description: "Create a folder" },
            { method: "POST", path: "/api/agent-bucket/files/share", description: "Create a share link for an Agent Storage file" },
            { method: "POST", path: "/api/agent-bucket/memory/search", description: "Search indexed file contents by meaning" },
          ]}
        />

        <H3 id="agent-bucket-upload">Upload a file</H3>
        <P>
          Send <Code>multipart/form-data</Code> with a <Code>file</Code> field and an optional <Code>filename</Code> (defaults to
          the file&apos;s name). Files are encrypted with AES-128-GCM automatically.
        </P>
        {snippet("agentUpload")}
        <P>
          The response includes <Code>success</Code>, <Code>key</Code>, <Code>fileName</Code>, <Code>size</Code> and{" "}
          <Code>destination</Code> (<Code>agent</Code> or <Code>drive</Code>).
        </P>
        <P>
          On plans with memory search, text files are indexed after the upload finishes. Add an <Code>index</Code> field set to{" "}
          <Code>false</Code> to skip indexing for a file, for example scratch output you won&apos;t need to search.
        </P>

        <H3 id="agent-bucket-list">List files</H3>
        {snippet("agentList")}
        <P>
          Parameters: <Code>page</Code> (default 1) and <Code>pageSize</Code> (default 50, max 100). Each file includes key,
          fileName, size, mimeType, isStarred, uploadedVia, createdAt and updatedAt.
        </P>

        <H3 id="agent-bucket-download">Download a file</H3>
        <P>
          Returns the file as a binary stream, decrypted. Response headers include Content-Type, Content-Disposition and
          Content-Length.
        </P>
        {snippet("agentDownload")}

        <H3 id="agent-bucket-delete">Delete a file</H3>
        <P>Deletes the file and releases its storage quota.</P>
        <CodeBlock
          code={`DELETE /api/agent-bucket/files?key=research/results.json
Authorization: Bearer b0ak_xxx...

→ { "success": true }`}
        />

        <H3 id="agent-bucket-folder">Create a folder</H3>
        <P>
          Creates a folder marker. The path cannot contain <Code>..</Code> or <Code>//</Code>.
        </P>
        <CodeBlock
          code={`POST /api/agent-bucket/files/folder
Authorization: Bearer b0ak_xxx...
Content-Type: application/json

{ "path": "reports/daily" }

→ { "success": true, "path": "reports/daily/" }`}
        />

        <H3 id="agent-bucket-memory">Search memory</H3>
        <P>
          Memory search finds passages in your agent&apos;s files by meaning rather than exact words. It is included on Starter,
          Pro and Scale. Files uploaded through the API are indexed automatically after the upload finishes.
        </P>
        {snippet("agentMemorySearch")}
        <P>
          Send <Code>query</Code> and an optional <Code>topK</Code> (default 8, clamped to 1-50). Each result has{" "}
          <Code>fileName</Code>, <Code>key</Code>, <Code>chunkIndex</Code>, <Code>snippet</Code> and <Code>score</Code>.
          The score is cosine similarity: higher means closer.
        </P>
        <H4>What gets indexed</H4>
        <Bullets
          items={[
            "Text files up to 1 MB: text/*, JSON, XML, YAML, CSV, JavaScript and TypeScript, plus common code and config extensions such as .md, .py, .go, .rs, .sql, .toml and .log",
            "PDFs, images and other binary files are not indexed",
            "Content is split into 1,000-character chunks with 100 characters of overlap, and chunk text is stored encrypted",
            "Uploading to the same key replaces that file's chunks; moving a file to My Drive removes them",
          ]}
        />
        <H4>Chunk limits</H4>
        <div className="my-5 overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--paper-card)]">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-[12px] tracking-[0.08em] text-[var(--ink-soft)] uppercase">
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 font-medium">Indexed chunks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {[
                ["Free", "Not included"],
                ["Starter", "10,000"],
                ["Pro", "50,000"],
                ["Scale", "200,000"],
              ].map(([plan, chunks]) => (
                <tr key={plan}>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{plan}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] tabular-nums">{chunks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>When you reach the limit, files still upload, but text beyond the limit is not indexed.</P>

        <H3 id="agent-bucket-share">Create a share link</H3>
        <P>
          Creates a public link for a file in Agent Storage, so a person can open what your agent made. Anyone with the link can
          view it without signing in.
        </P>
        {snippet("agentShare")}
        <Bullets
          items={[
            <>
              <Code>shareUrl</Code> opens a viewer page. <Code>streamUrl</Code> serves the file directly and supports Range
              requests, so you can embed audio or video and seek.
            </>,
            <>
              <Code>allowDownload</Code> defaults to <Code>true</Code>. Set it to <Code>false</Code> for view-only.
            </>,
            "Calling it again for the same key returns the existing active link",
            "Only files in Agent Storage can be shared this way. Files written by a key with the My Drive destination return 404; share those from your drive",
            "Limit: 100 share links per hour",
          ]}
        />

        <H3 id="agent-bucket-move-to-drive">Move files to your drive</H3>
        <P>
          Moving files from Agent Storage into My Drive is a dashboard action: open <strong>Agent Storage</strong> and choose{" "}
          <strong>Move to Drive</strong>. The endpoint behind it, <Code>POST /api/agent-bucket/files/move-to-drive</Code>, uses
          your signed-in session and does not accept <Code>b0ak_</Code> keys. If you want an agent&apos;s files to land in your
          drive directly, give its key the My Drive destination.
        </P>
        <Bullets
          items={[
            "A moved file leaves Agent Storage and is no longer returned by memory search",
            "If a file with the same name exists in the target folder, the moved file gets a timestamp suffix",
          ]}
        />

        <H3 id="agent-bucket-errors">Error codes</H3>
        <Definitions
          items={[
            { term: "400", description: "Missing file, filename, key or query, or invalid path" },
            { term: "401", description: "Missing, invalid, or expired API key" },
            { term: "402", description: "Plan limit, storage quota, or file size exceeded, or memory search is not included in your plan" },
            { term: "404", description: "File not found, or not in Agent Storage (share links)" },
            { term: "409", description: "A file already exists at this path" },
            { term: "429", description: "Rate limit exceeded (100 uploads per minute, 100 share links per hour)" },
            { term: "503", description: "Memory search is not available" },
          ]}
        />
      </DocSection>

      <DocSection id="mcp" title="MCP server" description="Connect Claude, ChatGPT, Cursor and other MCP clients">
        <P>
          The Bucket0 MCP server gives an AI client the AgentBucket file and memory tools. You sign in with your Bucket0 account,
          so there is no API key to copy.
        </P>
        <P>
          Server URL: <Code>https://mcp.bucket0.com/mcp</Code> (Streamable HTTP, OAuth)
        </P>

        <H3 id="mcp-connect">Connect a client</H3>
        <Steps>
          {[
            <>In your MCP client, add a remote (custom) MCP server or connector and enter the server URL.</>,
            <>When the client opens the Bucket0 sign-in page, sign in and approve access.</>,
            <>
              Approving creates an AgentBucket API key for that client. It appears in{" "}
              <strong>Dashboard &gt; AgentBucket &gt; API Keys</strong>. Delete the key to revoke the client&apos;s access.
            </>,
          ]}
        </Steps>
        <H4>Claude Code</H4>
        <CodeBlock title="Terminal" code="claude mcp add --transport http agentbucket https://mcp.bucket0.com/mcp" />
        <P>
          Then run <Code>/mcp</Code> in Claude Code and choose <Code>agentbucket</Code> to sign in.
        </P>
        <H4>Claude, ChatGPT and Cursor</H4>
        <P>
          Add the server URL as a custom connector or remote MCP server in the app&apos;s settings, then complete the sign-in when
          prompted. Where this setting lives depends on the app.
        </P>
        <P>
          Files saved through MCP land in Agent Storage, the same place as files uploaded with an API key.
        </P>

        <H3 id="mcp-tools">Tools</H3>
        <Definitions
          items={[
            { term: "save_file", description: <>Save text content to a path. <Code>index</Code> (default true) controls memory indexing.</> },
            { term: "search_memory", description: <>Search saved files by meaning. <Code>limit</Code> up to 50, default 8. Starter and up.</> },
            { term: "read_file", description: "Read back a saved text file" },
            { term: "list_files", description: <>List files, optionally under a <Code>folder</Code>, with <Code>page</Code> for paging.</> },
            { term: "delete_file", description: "Delete a file" },
            { term: "create_folder", description: "Create an empty folder. Saving to a nested path creates folders anyway" },
            {
              term: "create_streaming_link",
              description: (
                <>
                  Create a share link and a direct stream URL for a file in Agent Storage. <Code>allowDownload</Code> defaults to
                  true.
                </>
              ),
            },
          ]}
        />

        <H3 id="mcp-local">Local server with an API key</H3>
        <P>
          If your client only runs local servers, or you prefer a key, the <Code>agentbucket</Code> npm package runs the same
          tools over stdio, except <Code>create_streaming_link</Code>. Create a key in the dashboard and pass it as{" "}
          <Code>BUCKET0_API_KEY</Code>.
        </P>
        <CodeBlock title="Claude Code" code="claude mcp add agentbucket -e BUCKET0_API_KEY=b0ak_your_key -- npx -y agentbucket" />
        <CodeBlock
          title="mcp.json"
          code={`{
  "mcpServers": {
    "agentbucket": {
      "command": "npx",
      "args": ["-y", "agentbucket"],
      "env": { "BUCKET0_API_KEY": "b0ak_your_key" }
    }
  }
}`}
        />

        <H3 id="mcp-skill">Agent skill</H3>
        <P>
          An AgentBucket skill describes when an agent should save, search and share files. Point your agent at{" "}
          <a href="/.well-known/agent-skills/agentbucket/SKILL.md" className={textLink}>
            SKILL.md
          </a>{" "}
          or the{" "}
          <a href="/.well-known/agent-skills/index.json" className={textLink}>
            skills index
          </a>
          .
        </P>
      </DocSection>

      <DocSection id="s3-api" title="S3-compatible API" description="Use AWS SDKs, CLI, and S3 tools">
        <P>
          An S3-compatible API with AWS Signature V4. Use the AWS CLI, SDKs, Cyberduck, WinSCP, rclone or any other S3 client.
        </P>

        <H3 id="s3-api-endpoint">Endpoint</H3>
        <CodeBlock code="https://s3.bucket0.com" />

        <H3 id="s3-api-operations">Supported operations</H3>
        <Endpoints
          items={[
            { method: "GET", path: "/", description: "ListBuckets" },
            { method: "GET", path: "/{bucket}", description: "ListObjectsV2" },
            { method: "HEAD", path: "/{bucket}", description: "HeadBucket" },
            { method: "PUT", path: "/{bucket}", description: "CreateBucket" },
            { method: "DELETE", path: "/{bucket}", description: "DeleteBucket (must be empty)" },
            { method: "GET", path: "/{bucket}/{key}", description: "GetObject (Range supported)" },
            { method: "HEAD", path: "/{bucket}/{key}", description: "HeadObject" },
            { method: "PUT", path: "/{bucket}/{key}", description: "PutObject (auto-creates bucket)" },
            { method: "DELETE", path: "/{bucket}/{key}", description: "DeleteObject (idempotent)" },
          ]}
        />

        <H3 id="s3-api-behavior">Behavior</H3>
        <Bullets
          items={[
            "Buckets are created on the first PutObject, so you don’t need to call CreateBucket first",
            "DeleteObject returns 204 even if the object doesn’t exist (idempotent)",
            "GetObject supports Range requests (returns 206 Partial Content)",
            "PutObject enforces plan storage and file size limits with atomic quota reservation",
            "DeleteBucket requires the bucket to be empty first",
            "ListObjectsV2 supports prefix, delimiter, max-keys, and continuation-token",
          ]}
        />

        <H3 id="s3-api-list-buckets">List buckets</H3>
        <CodeBlock title="JavaScript" code={codeSnippets.s3ListBuckets.JavaScript} />

        <H3 id="s3-api-upload">Upload a file</H3>
        <CodeBlock title="JavaScript" code={codeSnippets.s3Upload.JavaScript} />

        <H3 id="s3-api-download">Download a file</H3>
        <P>The response includes the standard S3 headers: Content-Type, Content-Length, ETag, Last-Modified and Accept-Ranges.</P>
        <CodeBlock title="JavaScript" code={codeSnippets.s3Download.JavaScript} />

        <H3 id="s3-api-cli">AWS CLI</H3>
        <CodeBlock
          title="Terminal"
          code={`# Configure
aws configure --profile bucket0
AWS Access Key ID: B0IAXXXXXXXXXXXXXXXX
AWS Secret Access Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Default region name: auto
Default output format: json

# List buckets
aws s3 ls --endpoint-url https://s3.bucket0.com --profile bucket0

# Upload file
aws s3 cp report.pdf s3://my-bucket/documents/report.pdf \\
  --endpoint-url https://s3.bucket0.com --profile bucket0

# Download file
aws s3 cp s3://my-bucket/documents/report.pdf ./report.pdf \\
  --endpoint-url https://s3.bucket0.com --profile bucket0`}
        />

        <H3 id="s3-api-errors">S3 error codes</H3>
        <Definitions
          items={[
            { term: "AccessDenied", description: "Invalid signature or expired credentials" },
            { term: "NoSuchBucket", description: "Bucket does not exist" },
            { term: "NoSuchKey", description: "Object does not exist" },
            { term: "BucketNotEmpty", description: "Cannot delete non-empty bucket" },
            { term: "QuotaExceeded", description: "Storage limit reached" },
            { term: "EntityTooLarge", description: "File exceeds plan size limit" },
          ]}
        />
      </DocSection>

      <DocSection id="sdks" title="SDK examples" description="Code examples in JavaScript, Python, Go, and Rust">
        <P>Pick a language once; every example on this page follows it.</P>
        <H3 id="sdks-agent-bucket">AgentBucket</H3>
        <H4>Upload file</H4>
        {snippet("agentUpload")}
        <H4>List files</H4>
        {snippet("agentList")}
        <H4>Download file</H4>
        {snippet("agentDownload")}
        <H4>Search memory</H4>
        {snippet("agentMemorySearch")}
        <H4>Create share link</H4>
        {snippet("agentShare")}

        <H3 id="sdks-s3">S3-compatible API</H3>
        <H4>List buckets</H4>
        {snippet("s3ListBuckets")}
        <H4>Upload</H4>
        {snippet("s3Upload")}
        <H4>Download</H4>
        {snippet("s3Download")}
      </DocSection>

      <DocSection id="rate-limits" title="Rate limits" description="API request limits per user">
        <H3 id="rate-limits-requests">Request limits</H3>
        <div className="my-5 overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--paper-card)]">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-[12px] tracking-[0.08em] text-[var(--ink-soft)] uppercase">
                <th className="px-4 py-2.5 font-medium">Operation</th>
                <th className="px-4 py-2.5 font-medium">Limit</th>
                <th className="px-4 py-2.5 font-medium">Window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {[
                ["File upload", "100", "per minute"],
                ["General API", "200", "per minute"],
                ["Share links", "100", "per hour"],
                ["S3 connection test", "15", "per minute"],
              ].map(([op, limit, window]) => (
                <tr key={op}>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{op}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] tabular-nums">{limit}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-soft)]">{window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3 id="rate-limits-429">Handling 429 responses</H3>
        <P>When a request is rate limited, the response carries headers that tell you when to retry:</P>
        <CodeBlock
          code={`X-RateLimit-Limit: 100        # max requests allowed
X-RateLimit-Remaining: 0      # requests remaining
X-RateLimit-Reset: 1713024060 # Unix timestamp when limit resets`}
        />
        <Bullets
          items={[
            "Back off exponentially, and wait for the reset timestamp before retrying",
            "Cache file listings to reduce API calls",
            "Keep API keys on the server, never in client code",
          ]}
        />
      </DocSection>
    </DocsLayout>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Storage & AgentBucket API Docs",
  description: "Bucket0 API documentation for cloud storage, AgentBucket for AI agents, external buckets, teams, and S3-compatible access.",
}));
