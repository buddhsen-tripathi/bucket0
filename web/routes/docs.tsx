
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Zap,
  ChevronRight,
  Copy,
  Check,
  Shield,
  Code,
  Search,
  X,
} from "lucide-react";
import { MdOutlineApi, MdOutlineSmartToy } from "react-icons/md";
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

- **AgentBucket API** — Bearer token auth (\`b0ak_\` prefix). Upload, download, list, delete files, and create folders. Designed for AI agents.
- **S3-Compatible API** — AWS Signature V4 auth. Works with AWS CLI, boto3, aws-sdk, Cyberduck, rclone, etc.

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

### Upload Response
\`\`\`json
{ "success": true, "key": "research/results.json", "fileName": "results.json", "size": 2048, "destination": "agent" }
\`\`\`

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

### Error Codes
| Code | Meaning |
|------|---------|
| 400 | Missing file, filename, or invalid folder path |
| 401 | Missing/invalid/expired API key |
| 402 | Plan limit, storage quota, or file size exceeded |
| 404 | File or user not found |
| 429 | Rate limit (100 uploads/min). Check X-RateLimit-* headers |`,

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

// --- Components ---

interface CodeBlockProps {
  code: string;
}

function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto text-sm">
        <code className="text-foreground/80 font-mono">{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <Check className="w-4 h-4 text-primary" />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "text-primary border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

interface SectionProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  markdown?: string;
  children: React.ReactNode;
}

function Section({ id, icon, title, description, markdown, children }: SectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id={id} className="scroll-mt-20 mb-16">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
        </div>
        {markdown && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs flex-shrink-0"
            title="Copy section as Markdown"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        )}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  const [activeLanguage, setActiveLanguage] = useState<SDKLanguage>("JavaScript");
  const [activeSection, setActiveSection] = useState("introduction");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim() || !mainRef.current) return;
    const walker = document.createTreeWalker(
      mainRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent?.toLowerCase().includes(searchQuery.toLowerCase())) {
        const el = node.parentElement;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const orig = el.style.backgroundColor;
          el.style.backgroundColor = "hsl(var(--primary) / 0.2)";
          setTimeout(() => { el.style.backgroundColor = orig; }, 2000);
          return;
        }
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const navItems = [
    { id: "introduction", label: "Introduction" },
    { id: "authentication", label: "Authentication" },
    { id: "agent-bucket", label: "AgentBucket API" },
    { id: "s3-api", label: "S3-Compatible API" },
    { id: "sdks", label: "SDK Examples" },
    { id: "rate-limits", label: "Rate Limits" },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-20% 0% -60% 0%",
        threshold: 0,
      }
    );

    navItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 pt-28 lg:pt-36 pb-12 flex gap-12">
        {/* Sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <nav className="sticky top-24 space-y-1">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`block px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeSection === item.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main ref={mainRef} className="flex-1 min-w-0 max-w-4xl pt-8">
          {/* Hero */}
          <div className="mb-12">
            <div className="flex items-start justify-between gap-4">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold text-foreground mb-4"
              >
                Bucket0 Developer Docs
              </motion.h1>
              <div className="flex items-center gap-2 flex-shrink-0 pt-2">
                {searchOpen ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                    className="flex items-center gap-1 bg-muted/50 border border-border rounded-lg px-2 py-1 animate-in fade-in slide-in-from-right-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search docs..."
                      className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-40"
                    />
                    <button
                      type="button"
                      onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                      className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="p-2 rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Search docs"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-muted-foreground"
            >
              Two ways to integrate: AgentBucket API for AI agents, and an S3-compatible API for standard tooling.
            </motion.p>
          </div>

          {/* Feature Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16"
          >
            <div className="flex gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <MdOutlineSmartToy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">AgentBucket API</h3>
                <p className="text-sm text-muted-foreground">
                  Bearer token auth for AI agents to upload, download, list, delete files, and create folders
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <MdOutlineApi className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">S3-Compatible API</h3>
                <p className="text-sm text-muted-foreground">
                  AWS Signature V4 auth — works with AWS CLI, SDKs, Cyberduck, rclone, and more
                </p>
              </div>
            </div>
          </motion.div>

          {/* Introduction */}
          <Section
            id="introduction"
            icon={<BookOpen className="w-5 h-5 text-primary" />}
            title="Introduction"
            description="What you can build with Bucket0"
            markdown={sectionMarkdown.introduction}
          >
            <div className="prose prose-invert max-w-none space-y-4">
              <p className="text-muted-foreground">
                Bucket0 exposes two developer APIs for programmatic access to your storage:
              </p>

              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-border">
                  <h4 className="font-semibold text-foreground mb-1">AgentBucket API</h4>
                  <p className="text-sm text-muted-foreground">
                    Designed for AI agents. Create API keys from your dashboard, then use Bearer token
                    auth to upload, download, list, delete files, and create folders. Keys are prefixed with{" "}
                    <code className="px-2 py-1 bg-muted rounded text-sm">b0ak_</code>.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <h4 className="font-semibold text-foreground mb-1">S3-Compatible API</h4>
                  <p className="text-sm text-muted-foreground">
                    A standard S3 endpoint with AWS Signature V4 authentication. Create access keys from
                    your dashboard, then use any S3 client — AWS CLI, boto3, aws-sdk, Cyberduck, rclone, etc.
                    Access key format: <code className="px-2 py-1 bg-muted rounded text-sm">B0IAXXXXXXXXXXXXXXXX</code>.
                  </p>
                </div>
              </div>


            </div>
          </Section>

          {/* Authentication */}
          <Section
            id="authentication"
            icon={<Shield className="w-5 h-5 text-primary" />}
            title="Authentication"
            description="How to get credentials from the dashboard"
            markdown={sectionMarkdown.authentication}
          >
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">AgentBucket — Bearer Token</h3>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground"><strong>1.</strong> Go to <strong>Dashboard &gt; AgentBucket &gt; API Keys &gt; New Key</strong></p>
                  <p className="text-sm text-muted-foreground"><strong>2.</strong> Name your key (e.g., &quot;my-coding-agent&quot;)</p>
                  <p className="text-sm text-muted-foreground"><strong>3.</strong> Choose destination: <strong>AgentBucket</strong> (files go to review tab) or <strong>My Drive</strong> (files go directly to your drive, optionally into a folder)</p>
                  <p className="text-sm text-muted-foreground"><strong>4.</strong> Copy the key — it&apos;s shown only once</p>
                  <p className="text-sm text-muted-foreground"><strong>5.</strong> Copy the <strong>API Guide</strong> (available in the same tab) and give it to your agent as a reference file — it includes endpoints, examples, error handling, and best practices for instant setup</p>
                </div>
                <CodeBlock
                  code="Authorization: Bearer b0ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">S3 API — AWS Signature V4</h3>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground"><strong>1.</strong> Go to <strong>Dashboard &gt; S3 API &gt; Access Keys &gt; Create Key</strong></p>
                  <p className="text-sm text-muted-foreground"><strong>2.</strong> Name your key (e.g., &quot;CLI Access&quot;)</p>
                  <p className="text-sm text-muted-foreground"><strong>3.</strong> Copy both the Access Key ID (<code className="px-1 py-0.5 bg-muted rounded text-xs">B0IAXXXXXXXXXXXXXXXX</code>) and Secret Access Key — shown only once</p>
                  <p className="text-sm text-muted-foreground"><strong>4.</strong> Copy the <strong>S3 API Integration Guide</strong> (available in the same tab) and give it to your agent — it covers all S3 operations, error handling, and best practices</p>
                </div>
                <CodeBlock
                  code={`aws configure --profile bucket0
AWS Access Key ID: B0IAXXXXXXXXXXXXXXXX
AWS Secret Access Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Default region name: auto`}
                />
                <p className="text-sm text-muted-foreground">
                  Endpoint: <code className="px-2 py-1 bg-muted rounded text-sm">https://s3.bucket0.com</code>
                </p>
              </div>

              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">
                  <strong>Important:</strong> Both API keys and S3 credentials are shown only once at creation.
                  Store them securely. You can deactivate or delete keys anytime from the dashboard.
                </p>
              </div>
            </div>
          </Section>

          {/* AgentBucket */}
          <Section
            id="agent-bucket"
            icon={<MdOutlineSmartToy className="w-5 h-5 text-primary" />}
            title="AgentBucket API"
            description="File storage for AI agents"
            markdown={sectionMarkdown["agent-bucket"]}
          >
            <div className="space-y-6">
              <p className="text-muted-foreground">
                AgentBucket lets AI agents save files directly to your storage using API keys.
                Files land in your Agent Storage tab by default (for review before moving to drive),
                or directly in your Drive if the key is configured with &quot;My Drive&quot; destination.
              </p>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Endpoints</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">POST /api/agent-bucket/files/upload</code>
                    <p className="text-muted-foreground mt-1">Upload a file (multipart/form-data)</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">GET /api/agent-bucket/files</code>
                    <p className="text-muted-foreground mt-1">List files (paginated)</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">GET /api/agent-bucket/files/download</code>
                    <p className="text-muted-foreground mt-1">Download a file by key</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">DELETE /api/agent-bucket/files</code>
                    <p className="text-muted-foreground mt-1">Delete a file by key</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">POST /api/agent-bucket/files/folder</code>
                    <p className="text-muted-foreground mt-1">Create a folder</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Upload a File</h3>
                <p className="text-sm text-muted-foreground">
                  Send <code className="px-1 py-0.5 bg-muted rounded text-xs">multipart/form-data</code> with
                  a <code className="px-1 py-0.5 bg-muted rounded text-xs">file</code> field and
                  optional <code className="px-1 py-0.5 bg-muted rounded text-xs">filename</code> (defaults to file name).
                  Files are encrypted with AES-128-GCM automatically.
                </p>
                <CodeBlock code={codeSnippets.agentUpload.JavaScript} />
                <p className="text-sm text-muted-foreground mt-2">
                  Response includes: <code className="px-1 py-0.5 bg-muted rounded text-xs">success</code>,{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs">key</code>,{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs">fileName</code>,{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs">size</code>,{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs">destination</code> (&quot;agent&quot; or &quot;drive&quot;).
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">List Files</h3>
                <CodeBlock code={codeSnippets.agentList.JavaScript} />
                <p className="text-sm text-muted-foreground">
                  Params: <code className="px-1 py-0.5 bg-muted rounded text-xs">page</code> (default 1),{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs">pageSize</code> (default 50, max 100).
                  Each file includes: key, fileName, size, mimeType, isStarred, uploadedVia, createdAt, updatedAt.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Download a File</h3>
                <p className="text-sm text-muted-foreground">
                  Returns the binary file stream. Files are automatically decrypted. Response
                  headers include Content-Type, Content-Disposition, and Content-Length.
                </p>
                <CodeBlock code={codeSnippets.agentDownload.JavaScript} />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Delete a File</h3>
                <p className="text-sm text-muted-foreground">
                  Deletes the file and automatically releases storage quota.
                </p>
                <CodeBlock
                  code={`DELETE /api/agent-bucket/files?key=research/results.json
Authorization: Bearer b0ak_xxx...

→ { "success": true }`}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Create a Folder</h3>
                <p className="text-sm text-muted-foreground">
                  Creates a folder marker. Path cannot contain <code className="px-1 py-0.5 bg-muted rounded text-xs">..</code> or <code className="px-1 py-0.5 bg-muted rounded text-xs">//</code>.
                </p>
                <CodeBlock
                  code={`POST /api/agent-bucket/files/folder
Authorization: Bearer b0ak_xxx...
Content-Type: application/json

{ "path": "reports/daily" }

→ { "success": true, "path": "reports/daily/" }`}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Error Codes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">400</code>
                    <p className="text-muted-foreground mt-1">Missing file, filename, or invalid path</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">401</code>
                    <p className="text-muted-foreground mt-1">Missing, invalid, or expired API key</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">402</code>
                    <p className="text-muted-foreground mt-1">Plan limit, storage quota, or file size exceeded</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">404</code>
                    <p className="text-muted-foreground mt-1">File not found</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">429</code>
                    <p className="text-muted-foreground mt-1">Rate limit exceeded (100/min)</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* S3 API */}
          <Section
            id="s3-api"
            icon={<MdOutlineApi className="w-5 h-5 text-primary" />}
            title="S3-Compatible API"
            description="Use AWS SDKs, CLI, and S3 tools"
            markdown={sectionMarkdown["s3-api"]}
          >
            <div className="space-y-6">
              <p className="text-muted-foreground">
                Full S3-compatible API with AWS Signature V4. Use AWS CLI, SDKs, Cyberduck, WinSCP, rclone, and any other S3 client.
              </p>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Endpoint</h3>
                <CodeBlock code="https://s3.bucket0.com" />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Supported Operations</h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">GET /</code>
                    <p className="text-muted-foreground mt-1">ListBuckets</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">GET /{'{bucket}'}</code>
                    <p className="text-muted-foreground mt-1">ListObjectsV2</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">HEAD /{'{bucket}'}</code>
                    <p className="text-muted-foreground mt-1">HeadBucket</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">PUT /{'{bucket}'}</code>
                    <p className="text-muted-foreground mt-1">CreateBucket</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">DELETE /{'{bucket}'}</code>
                    <p className="text-muted-foreground mt-1">DeleteBucket (must be empty)</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">GET /{'{bucket}'}/{'{key}'}</code>
                    <p className="text-muted-foreground mt-1">GetObject (Range supported)</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">HEAD /{'{bucket}'}/{'{key}'}</code>
                    <p className="text-muted-foreground mt-1">HeadObject</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">PUT /{'{bucket}'}/{'{key}'}</code>
                    <p className="text-muted-foreground mt-1">PutObject (auto-creates bucket)</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">DELETE /{'{bucket}'}/{'{key}'}</code>
                    <p className="text-muted-foreground mt-1">DeleteObject (idempotent)</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Behavior</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>Buckets auto-create on first PutObject — no need to CreateBucket first</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>DeleteObject returns 204 even if the object doesn&apos;t exist (idempotent)</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>GetObject supports Range requests (returns 206 Partial Content)</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>PutObject enforces plan storage and file size limits with atomic quota reservation</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>DeleteBucket requires the bucket to be empty first</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>ListObjectsV2 supports prefix, delimiter, max-keys, and continuation-token</span></li>
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">List Buckets</h3>
                <CodeBlock code={codeSnippets.s3ListBuckets.JavaScript} />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Upload a File</h3>
                <CodeBlock code={codeSnippets.s3Upload.JavaScript} />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Download a File</h3>
                <p className="text-sm text-muted-foreground">
                  Response includes standard S3 headers: Content-Type, Content-Length, ETag, Last-Modified, Accept-Ranges.
                </p>
                <CodeBlock code={codeSnippets.s3Download.JavaScript} />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">AWS CLI</h3>
                <CodeBlock
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
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">S3 Error Codes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">AccessDenied</code>
                    <p className="text-muted-foreground mt-1">Invalid signature or expired credentials</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">NoSuchBucket</code>
                    <p className="text-muted-foreground mt-1">Bucket does not exist</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">NoSuchKey</code>
                    <p className="text-muted-foreground mt-1">Object does not exist</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">BucketNotEmpty</code>
                    <p className="text-muted-foreground mt-1">Cannot delete non-empty bucket</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">QuotaExceeded</code>
                    <p className="text-muted-foreground mt-1">Storage limit reached</p>
                  </div>
                  <div className="p-3 rounded-lg border border-border">
                    <code className="text-primary">EntityTooLarge</code>
                    <p className="text-muted-foreground mt-1">File exceeds plan size limit</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* SDK Examples */}
          <Section
            id="sdks"
            icon={<Code className="w-5 h-5 text-primary" />}
            title="SDK Examples"
            description="Code examples in JavaScript, Python, Go, and Rust"
          >
            <div className="space-y-6">
              <div className="flex gap-2 border-b border-border">
                {SDK_LANGUAGES.map((lang) => (
                  <TabButton
                    key={lang}
                    active={activeLanguage === lang}
                    onClick={() => setActiveLanguage(lang)}
                  >
                    {lang}
                  </TabButton>
                ))}
              </div>

              <div className="space-y-8">
                <h3 className="text-lg font-semibold text-foreground mt-2">AgentBucket</h3>

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">Upload File</h4>
                  <CodeBlock code={codeSnippets.agentUpload[activeLanguage]} />
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">List Files</h4>
                  <CodeBlock code={codeSnippets.agentList[activeLanguage]} />
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">Download File</h4>
                  <CodeBlock code={codeSnippets.agentDownload[activeLanguage]} />
                </div>

                <h3 className="text-lg font-semibold text-foreground mt-4">S3-Compatible API</h3>

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">List Buckets</h4>
                  <CodeBlock code={codeSnippets.s3ListBuckets[activeLanguage]} />
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">Upload</h4>
                  <CodeBlock code={codeSnippets.s3Upload[activeLanguage]} />
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">Download</h4>
                  <CodeBlock code={codeSnippets.s3Download[activeLanguage]} />
                </div>
              </div>
            </div>
          </Section>

          {/* Rate Limits */}
          <Section
            id="rate-limits"
            icon={<Zap className="w-5 h-5 text-primary" />}
            title="Rate Limits"
            description="API request limits per user"
            markdown={sectionMarkdown["rate-limits"]}
          >
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Request Limits</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3">Operation</th>
                        <th className="text-left py-2 px-3">Limit</th>
                        <th className="text-left py-2 px-3">Window</th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b border-border"><td className="py-2 px-3">File Upload</td><td className="py-2 px-3">100</td><td className="py-2 px-3">per minute</td></tr>
                      <tr className="border-b border-border"><td className="py-2 px-3">General API</td><td className="py-2 px-3">200</td><td className="py-2 px-3">per minute</td></tr>
                      <tr className="border-b border-border"><td className="py-2 px-3">Share Links</td><td className="py-2 px-3">100</td><td className="py-2 px-3">per hour</td></tr>
                      <tr className="border-b border-border"><td className="py-2 px-3">S3 Connection Test</td><td className="py-2 px-3">15</td><td className="py-2 px-3">per minute</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Handling 429 Responses</h3>
                <p className="text-sm text-muted-foreground">
                  When rate limited, the response includes headers to help you retry:
                </p>
                <CodeBlock
                  code={`X-RateLimit-Limit: 100        # max requests allowed
X-RateLimit-Remaining: 0      # requests remaining
X-RateLimit-Reset: 1713024060 # Unix timestamp when limit resets`}
                />
                <ul className="space-y-2 text-sm text-muted-foreground mt-3">
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>Implement exponential backoff — wait for the reset timestamp before retrying</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>Cache file listings to reduce API calls</span></li>
                  <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>Store API keys server-side — never expose them in client code</span></li>
                </ul>
              </div>
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}

export const meta = () => nextMeta(constructMetadata({
  title: "Storage & AgentBucket API Docs",
  description: "Bucket0 API documentation for cloud storage, AgentBucket for AI agents, external buckets, teams, and S3-compatible access.",
}));
