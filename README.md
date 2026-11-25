# Bucket0

Cloud storage SaaS built with React Router, Hono, and Cloudflare Workers — encrypted file storage on Cloudflare R2, external S3 bucket management, team collaboration, subscription billing, and free browser-based PDF and image tools.

**Live:** [bucket0.com](https://bucket0.com)

## Features

- **Cloud storage** — AES-128-GCM encrypted uploads to Cloudflare R2 with chunked uploads for large files
- **S3-compatible API** — Access Bucket0 storage via AWS CLI, SDKs, and any S3 client (`s3.bucket0.com`)
- **External buckets** — Connect AWS, Cloudflare R2, DigitalOcean, Backblaze, Azure, MinIO, and other S3-compatible providers
- **Team workspaces** — Shared storage with granular permissions, activity logs, and team chat
- **File sharing** — Public and password-protected share links
- **AgentBucket** — REST API for AI agents to upload, list, and download files programmatically
- **Billing** — Subscription plans via Polar with metered usage
- **Free tools** — 23 browser-based PDF and image tools (merge, split, OCR, resize, compress, and more) — files never leave the device

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router 8 (Vite, SSR) + Hono on Cloudflare Workers |
| Language | TypeScript |
| Database | Neon PostgreSQL + Drizzle ORM |
| Auth | Clerk |
| Storage | Cloudflare R2 + AWS S3 SDK |
| Billing | Polar |
| UI | React 19, Tailwind CSS 4, Radix UI, Framer Motion |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) and Node.js 22.22+ (or 24)
- PostgreSQL database ([Neon](https://neon.tech) recommended)
- Cloudflare R2 bucket
- [Clerk](https://clerk.com) application
- [Polar](https://polar.sh) account (for billing)
- [Docker](https://www.docker.com) running locally (builds the media container for `bun run dev` and `bun run deploy`)

### Setup

1. Clone the repository and install dependencies:

```bash
bun install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Fill in `.env.local` (see `.env.example` for every variable), then copy it to `.dev.vars`, which is what the Worker reads at runtime. Generate the encryption keys with:

```bash
openssl rand -hex 16   # ENCRYPTION_KEY (file encryption)
openssl rand -hex 32   # CREDENTIAL_ENCRYPTION_KEY (S3 credentials)
```

4. Create the schema. The memory feature uses pgvector, so enable it first (Neon supports it out of the box):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
bunx drizzle-kit push
```

`drizzle.config.ts` reads `DATABASE_URL` from `.env.local`.

5. Start the development server:

```bash
bun run dev
```

Open the URL Vite prints (http://localhost:5173 by default). The dev server simulates the queue, thumbnail bucket and Durable Objects locally, and builds the media container from `media/Dockerfile`, so Docker must be running. To work without Docker, add `"dev": { "enable_containers": false }` to `wrangler.jsonc` and set `MEDIA_SERVICE_URL` in `.dev.vars` to a media service you run from `media/` (see [`media/README.md`](media/README.md)); without it, thumbnail jobs fail and are retried.

### Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server (Worker runs in workerd) |
| `bun run build` | Run tests and build client + Worker |
| `bun run preview` | Serve the production build locally |
| `bun run deploy` | Build and deploy with Wrangler |
| `bun run typecheck` | Route typegen + `tsc` |
| `bun run lint` | Run ESLint |
| `bun run test` | Run Vitest test suite |
| `bunx drizzle-kit generate` | Generate migration from schema changes |
| `bunx drizzle-kit push` | Sync the database schema with `db/schema.ts` |
| `bunx drizzle-kit studio` | Open Drizzle Studio |

## Project Structure

```
workers/app.ts  # Cloudflare Worker entry
server/
  app.ts        # Hono app, route mounting, guards, React Router fallback
  routes/       # API route handlers (cloud, s3, teams, polar, user, agent-bucket, .well-known)
web/
  root.tsx      # Document shell and providers
  routes.ts     # Route table
  routes/       # Pages (dashboard, tools, docs, share, auth)
media/          # Thumbnail service (sharp, ffmpeg, ghostscript), runs in a Cloudflare Container
db/
  schema.ts     # Drizzle PostgreSQL schema
hooks/          # Custom React state hooks
lib/            # Business logic (cloud, s3, teams, payments, shared)
components/     # React components
docs/           # API and state management documentation
```

### File and Folder Conventions

- Drive UI/API keys are relative to the user's Drive root, for example `photos/cat.jpg` or `photos/`.
- Persisted `cloud_files.fileKey` values include the storage prefix: `users/{userId}/{relativeKey}`.
- Folder paths are first-class rows in `cloud_folders`; `path` and `parentPath` are relative paths and folders always end with `/`.
- Use `folderPath` on `cloud_files` for folder-scoped listing instead of deriving folders from live R2 listings.
- New API routes live under `server/routes/api/{feature}/.../route.ts`; feature UI components live under `components/{feature}/`.
- Share-link code for Drive belongs under `server/routes/api/cloud/share/*` and `components/share/*`; team sharing remains under `server/routes/api/teams/*`.

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) | API endpoints, request/response formats, guards, error codes |
| [`docs/STATE_MANAGEMENT.md`](docs/STATE_MANAGEMENT.md) | State architecture, custom hooks, caching strategies |
| [`CLAUDE.md`](CLAUDE.md) | Architecture overview and development guidelines |

## Deployment

Bucket0 deploys as a single Cloudflare Worker. `wrangler.jsonc` expects these resources, which you create once in your own Cloudflare account:

- an R2 bucket for file storage (used through the S3 API with `R2_*` credentials)
- an R2 bucket named `bucket0-thumbnails` for generated thumbnails
- queues named `bucket0-background` and `bucket0-background-dlq` for thumbnail and indexing jobs
- the `RATE_LIMITS` Durable Object and the `MEDIA_CONTAINER` Container, both created on first deploy

The media container is built from `media/Dockerfile`, so Docker has to be running when you deploy. Add your domains as `routes` in `wrangler.jsonc` if you don't want to use the `workers.dev` URL.

Upload the runtime secrets (the same keys as `.env.example`) with `wrangler secret put` or `wrangler secret bulk`, then:

```bash
bun run deploy
```

`HEALTH_CHECK_TOKEN` is optional. When set, `/api/health?check=bindings` checks the database, storage, auth, encryption and the Cloudflare bindings, and the response never includes secret values.

Before deploying, run `bun run typecheck`, `bun run build` and `bun run lint`, and make sure nothing sensitive ends up in a `NEXT_PUBLIC_*` variable. Those are bundled into the client.

### Analytics

Google Analytics and AdSense are off unless you set `NEXT_PUBLIC_GA_MEASUREMENT_ID` or `NEXT_PUBLIC_ADSENSE_CLIENT_ID` at build time.

## Contributing

This repository is a public snapshot of the Bucket0 source. Issues and pull requests are welcome. For security problems, please email team@bucket0.com instead of opening a public issue.

## License

Bucket0 is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, the AGPL requires you to offer your users the source of that version.
