# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## IMPORTANT: Reference Documentation

**Before implementing any new feature or making changes, consult these documentation files:**

| Document | Purpose | Location |
|----------|---------|----------|
| **API Documentation** | Complete API reference with all endpoints, request/response formats, guards, and error codes | [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) |
| **State Management** | State architecture, custom hooks, caching strategies, and action flows | [`docs/STATE_MANAGEMENT.md`](docs/STATE_MANAGEMENT.md) |

These documents serve as the **single source of truth** for understanding the application's backend API contracts and frontend state management patterns.

---

## Project Overview

Bucket0 is a cloud storage SaaS platform built with React Router 8 (framework mode on Vite) and Hono, running on Cloudflare Workers. It provides:
- Encrypted file storage on Cloudflare R2
- External S3 bucket management (AWS, DigitalOcean, Backblaze, Azure, etc.)
- Team collaboration with granular permissions
- Subscription billing via Polar with metered usage
- File sharing with access controls
- Asynchronous thumbnail generation for images, videos, and PDFs
- Free browser-based PDF tools (merge, split, extract, protect, unlock, sign, redact, watermark, organize, page numbers, JPG-to-PDF)
- Free browser-based image tools (resize, rotate, crop, compress, convert, watermark, filter)

## Quick Reference

### Development Commands

```bash
bun run dev              # Vite dev server; the Worker runs in workerd (reads .dev.vars)
bun run build            # Run tests, then react-router build (client + Worker bundle)
bun run preview          # Serve the production build locally in workerd
bun run typecheck        # react-router typegen + tsc --noEmit
bun run lint             # Run ESLint
bun run deploy           # Build and `wrangler deploy`
bunx drizzle-kit generate   # Generate migration from schema
bunx drizzle-kit migrate    # Run pending migrations
bunx drizzle-kit push       # Create/update the schema from db/schema.ts
bunx drizzle-kit studio     # Open Drizzle Studio
```

Node 22.22+ (or 24) is required for the build; Bun is the package manager.

### Pre-Deploy Verification

Always run before deploying:
1. `bun run typecheck` and `bun run build` — must pass with zero errors
2. `bun run lint` — must pass clean
3. Grep for `console.log` in committed code — remove any debugging logs
4. Verify no `NEXT_PUBLIC_` vars expose sensitive data
5. Review recent changes with `git diff` for accidental secret exposure

### Environment Setup

Copy `.env.example` to `.env.local` (client-visible `NEXT_PUBLIC_*` values for Vite, and the database URL that `drizzle.config.ts` reads) and create `.dev.vars` with the Worker runtime values. In a deployed Worker, every runtime secret is configured separately (`wrangler secret put` or `wrangler secret bulk`); changing `.dev.vars` only changes local runtime configuration.

`wrangler.jsonc` declares the required Cloudflare bindings: `BACKGROUND_QUEUE` (with a dead-letter queue) for thumbnail and memory-index jobs, the `THUMBNAILS` R2 bucket for generated thumbnails, `RATE_LIMITS` for durable per-actor counters, and `MEDIA_CONTAINER`, which runs the native media service from `media/Dockerfile`. The binding getters in `server/bindings.ts` throw when a binding is missing; there are no fallbacks. `bun run dev` simulates the same bindings locally and builds the media container, so Docker must be running for both `dev` and `deploy`. To develop without Docker, set `"dev": { "enable_containers": false }` in `wrangler.jsonc` and point `MEDIA_SERVICE_URL` at a media service run from `media/` (thumbnails fail otherwise). Optional `HEALTH_CHECK_TOKEN` enables protected live readiness checks at `/api/health?check=bindings`; secret values are never included in the response.

The SSR Vite environment must resolve Node dependency entry points consistently with `nodejs_compat`. `worker-node-dependency-resolution` removes the browser condition from the SSR environment; mixing S3's Node runtime with browser exports from `@aws-sdk/core` otherwise throws `emitWarningIfUnsupportedVersion is not a function` before any storage request. Client resolution remains unchanged. Verify SDK storage in workerd as well as Node tests.

| Category | Variables |
|----------|-----------|
| Database | `DATABASE_URL` (Neon PostgreSQL) |
| Auth | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Encryption | `ENCRYPTION_KEY` (32 hex), `CREDENTIAL_ENCRYPTION_KEY` (64 hex) |
| Storage | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |
| Billing | `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, product IDs |

```bash
# Generate encryption keys
openssl rand -hex 16  # File encryption (AES-128-GCM)
openssl rand -hex 32  # Credential encryption (AES-256-GCM)
```

---

## Git & Commit Rules

- Commit in development/logical order, not alphabetical
- Keep commit messages concise, no emoji
- Use conventional-style messages: `feat:`, `fix:`, `chore:`, `refactor:`
- Never commit `.env.local` or files containing secrets

---

## UI / Design Rules

- Always match existing theme/color scheme — never introduce new colors without approval
- Mobile responsive is mandatory — test at 375px, 768px, 1024px breakpoints
- Use existing component patterns — don't create new abstractions unless necessary
- Prefer Framer Motion for animations, not raw CSS transitions
- Use shadcn/ui components as base, customize with Tailwind
- When given a screenshot reference, match it precisely — pixel-level accuracy matters
- Dark theme is the primary design language across the app
- Gradient accents are used for emphasis (buttons, highlights, headings)

---

## Code Style Rules

- Don't over-engineer — simplest solution first
- Don't add features that weren't asked for
- Don't refactor surrounding code when fixing a bug
- Don't add extra error handling, fallbacks, or validation for scenarios that can't happen
- Don't create helpers or abstractions for one-time operations
- Verify build passes before claiming work is done
- Three similar lines of code is better than a premature abstraction

---

## Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router 8 (framework mode, SSR) on Vite 8; Hono for API routes |
| Runtime | Cloudflare Workers (`nodejs_compat`), built with `@cloudflare/vite-plugin` |
| Language | TypeScript 5.9.3 (strict mode) |
| Database | Neon PostgreSQL + Drizzle ORM 0.44.7 |
| Auth | Clerk v6.39 (session-based) |
| Storage | Cloudflare R2 + AWS S3 SDK |
| Billing | Polar SaaS platform |
| Encryption | AES-128-GCM (files), AES-256-GCM (credentials) |
| Media | `media/` service (sharp, ffmpeg, graphicsmagick, ghostscript) in a private `MEDIA_CONTAINER`; optional `MEDIA_SERVICE_URL` points at an external media service instead |
| UI | React 19.2, Tailwind CSS 4.2, Radix UI, Framer Motion 12.35 |

### Directory Structure

```
/workers/app.ts       # Worker entry: delegates to the Hono app
/server
  app.ts             # Hono app: mounts routes/**/route.ts, guards, React Router fallback
  guards.ts          # Origin/browser validation, CORS, security headers (was proxy.ts)
  context.ts         # AsyncLocalStorage request context
  /compat            # next-server (NextRequest/NextResponse), clerk (auth, currentUser), headers
  /routes            # Route handlers, Next.js App Router file conventions kept
    /api
      /cloud         # R2 storage (upload, download, share, thumbnail)
      /s3            # User S3 bucket management
      /teams         # Team management API
      /polar         # Billing webhooks
      /user          # Profile, plan, sessions
    /well-known, auth.md, sitemap.txt, sitemap.xml, robots.txt
/web                  # React Router app (appDirectory)
  root.tsx           # Document shell, Clerk provider + middleware, error boundary
  routes.ts          # Explicit route table
  /routes            # Page modules (export default + meta; loaders for share pages, consent, dashboard guard)
  /compat            # link, navigation, image, meta shims replacing next/*
/media                # Thumbnail service (Hono on Node + native deps), Dockerfile for a Container

/lib                 # Core business logic
  /shared            # Shared utilities (db, types, encryption-utils, http-utils)
  /cloud             # R2 services (encryption, upload, thumbnails)
  /s3                # S3 client wrapper
  /teams             # Team services (files, quota, permissions, activity)
  /payments          # Billing (plans, rate-limit)

/hooks               # Custom React hooks (see STATE_MANAGEMENT.md)
/components          # React components
  /home-page         # Landing page sections (Hero, Features, Pricing, FAQ, etc.)
  /share             # Public share-link UI (toolbar, protected media, folder browser)
  /pdf-tools         # PDF tool UI components and configuration
/db/schema.ts        # Drizzle PostgreSQL schema
/docs                # API and State Management documentation
```

### Route handler conventions

- A route module under `server/routes/**/route.ts` exports `GET`/`POST`/... handlers with the Next.js signature `(request: NextRequest, { params })`. `server/app.ts` derives the URL from the file path (`[teamId]` becomes `:teamId`, `[[...path]]` becomes a catch-all) and registers it with Hono. Static paths win over dynamic ones.
- Import `NextRequest`/`NextResponse` from `@/server/compat/next-server` and `auth`/`currentUser`/`clerkClient` from `@/server/compat/clerk`. `auth()` verifies the Clerk session once per request through the AsyncLocalStorage context.
- Pages get auth the same way inside loaders (`await auth()`), or through `@clerk/react-router` hooks on the client.
- Never read `process.env` at module scope into a constant; read it inside functions. Workers evaluate modules during deploy validation before secrets exist.
- No timers (`setInterval`) at module scope; Workers reject them.
- Required catalog writes must be awaited. Use `await runInBackground(work)` from `server/context` for bounded optional work (Workers `waitUntil`, 30-second post-response limit); request middleware also retains API mutations through rollback on disconnect.
- Chunked upload locks/reservations live in Postgres (`chunked_uploads`); all tracker operations are async. Never replace them with isolate-local Maps.
- S3 PutObject/DeleteObject (gateway and dashboard) hold a per-object Postgres lease (`s3_object_leases`) around the size read and quota change. Add-to-drive relies on a partial unique index on `cloud_files(user_id, source_share_link_id, source_share_type)`. Both are part of `db/schema.ts`.
- Folder ZIPs stream with backpressure. Thumbnails are generated only by the background queue consumer (`workers/background.ts`), which streams the source to media and writes the result to the `THUMBNAILS` bucket; the media service accepts up to 64 MiB per complete source.
- Do not use `fetch` against the app's own origin from the Worker; call the service directly or move the fetch to the client.

### Drive File and Folder Conventions

Drive code uses two key forms. Keep them distinct:

- **Relative Drive keys**: client/API/share-link keys such as `docs/report.pdf` or `docs/`.
- **Persisted storage keys**: `cloud_files.fileKey` values such as `users/{userId}/docs/report.pdf`.

Folder rules:

- Folder paths are relative to the Drive root and always end with `/`.
- Empty folders live in `cloud_folders`; do not rely on live R2 list results to discover folder structure.
- `cloud_folders.path` is the full relative folder path, and `cloud_folders.parentPath` is the relative parent path.
- `cloud_files.folderPath` is the parent folder for folder-scoped listing.
- Synthetic folder display items use trailing-slash keys so `FileList` can distinguish directories.
- Drive share links store relative keys in `share_links.fileKey`; folder links use `targetType = "folder"` and a trailing-slash key.
- Team files and Drive files are separate surfaces. Do not put team sharing routes/components under Drive share paths.

### Database Schema

**Key tables** (see `/db/schema.ts`):

| Table | Purpose |
|-------|---------|
| `users` | Clerk ID, plan, storageUsage, fileCount |
| `cloudFiles` | Personal file metadata (isolated from teams) |
| `teamFiles` | Team file metadata (isolated from personal) |
| `teams` | Team entity with storageUsage, fileCount |
| `teamMembers` | Membership with 7 granular permissions |
| `teamInvitations` | Pending invites with expiry |
| `activityLogs` | Team activity tracking |
| `shareLinks` | Public/protected file sharing |
| `s3Configurations` | Encrypted external S3 credentials |
| `subscriptions` | Polar subscription lifecycle |

**Important patterns:**
- Personal files: `cloudFiles` table, stored at `users/{userId}/{filename}`
- Team files: `teamFiles` table, stored at `teams/{teamId}/{filename}`
- **Atomic quota updates** using SQL expressions (prevents race conditions)
- **Dual quota tracking** for teams: owner's `users.storageUsage` (source of truth) + `teams.storageUsage` (display)

---

## Key Implementation Patterns

### File Upload Flow

**Personal uploads** (see `docs/API_DOCUMENTATION.md` → Cloud Storage):
- Small files (≤10MB): `/api/cloud/upload` → buffer → encrypt → R2
- Large files (>10MB): `/api/cloud/upload/chunked/*` → multipart S3 upload

**Team uploads** (see `docs/API_DOCUMENTATION.md` → Teams → Files):
- Route: `/api/teams/[teamId]/files/upload`
- Atomic quota reservation BEFORE R2 upload
- Rollback on failure
- Batch activity logging (prevents log flooding)

### State Management

**See `docs/STATE_MANAGEMENT.md` for complete details.**

Key patterns:
- **No external state library** - Pure React primitives
- **10 custom hooks** form the core state layer
- **Pessimistic updates by default** (safer)
- **Optimistic updates** only for star operations
- **Module-level caching** with explicit invalidation
- **HMR-safe singletons** using `globalThis` pattern

**Core hooks:**
| Hook | Purpose |
|------|---------|
| `useDashboardState` | UI mode, modals, navigation |
| `useBucketManagement` | S3 bucket CRUD, credentials |
| `useFileOperations` | File loading for cloud/dev modes |
| `usePaginatedFiles` | Server-side pagination |
| `useUploadState` | Personal file upload lifecycle |
| `useTeamUploadState` | Team file upload with XHR progress |
| `useDeleteState` | Delete with 5-second undo window |
| `usePdfTool` | PDF tool file/result lifecycle |
| `useImageTool` | Image tool file/result lifecycle |

### Authentication

- `web/routes/dashboard.tsx` loader redirects signed-out users to `/sign-in`; `server/guards.ts` holds the API origin checks
- Custom sign-up/sign-in pages using `useSignUp`/`useSignIn` from `@clerk/react-router/legacy`; `SignedIn`/`SignedOut` come from `components/clerk-compat.tsx`
- User profile data from Clerk (not stored in DB)
- Google OAuth only (GitHub removed)

### Team Permissions

7 granular permissions per member:

| Permission | Description |
|------------|-------------|
| `canUpload` | Upload files to team storage |
| `canDelete` | Delete team files |
| `canShare` | Create share links |
| `canManageMembers` | Invite/remove members |
| `canManageRoles` | Create/edit/delete roles |
| `canViewActivity` | View team activity logs |
| `canChat` | Send messages in team chat |

**Route helpers** (`lib/teams/route-helpers.ts`):
```typescript
requireAuth()                              // → userId or 401
requireTeamPermission(teamId, userId, perm) // → null or 403
requireTeamOwner(teamId, userId)           // → null or 403
requireTeamMember(teamId, userId)          // → null or 403
```

### Encryption

| Type | Algorithm | Key |
|------|-----------|-----|
| File content | Chunked AES-128-GCM | `ENCRYPTION_KEY` |
| S3 credentials | AES-256-GCM | `CREDENTIAL_ENCRYPTION_KEY` |

- Streaming encryption/decryption for large files
- Some file types skip encryption (archives, executables, disk images)

---

## Common Development Tasks

### Adding a new API endpoint

1. Create route in `/server/routes/api/{path}/route.ts` (picked up automatically by `server/app.ts`)
2. Add auth: `const { userId } = await auth()` (from `@/server/compat/clerk`)
3. For team routes: use `requireTeamPermission()`
4. Update `docs/API_DOCUMENTATION.md` with the new endpoint

### Adding a new state hook

1. Create hook in `/hooks/useXxx.ts`
2. Follow existing patterns (see `STATE_MANAGEMENT.md`)
3. Update `docs/STATE_MANAGEMENT.md` with the new hook

### Modifying database schema

1. Edit `/db/schema.ts`
2. Run `bunx drizzle-kit generate`
3. Run `bunx drizzle-kit migrate`

### Adding team functionality

1. Check `docs/API_DOCUMENTATION.md` → Teams section for existing endpoints
2. Use `teamFileService` for file operations
3. Use `teamQuotaService` for quota management
4. Use `activityService` for logging
5. Use route helpers for auth/permission checks

### Adding a new PDF/Image tool

1. Create page at `/web/routes/tools/{tool-name}.tsx` with `export const meta = () => nextMeta({...})`, add the slug to `TOOLS` in `web/routes.ts`
2. Add tool config in `components/pdf-tools/tool-config.ts`
3. Tools run entirely client-side (no server processing)
4. Follow existing tool page patterns for consistent UX

### Building landing page sections

1. Components live in `/components/home-page/`
2. Use dark theme with gradient accents
3. Use Framer Motion for scroll animations and transitions
4. Use shadcn/ui as base components
5. Must be responsive at 375px, 768px, 1024px

---

## Security Checklist

- Never expose sensitive env vars in client code (`NEXT_PUBLIC_` prefix = client-visible)
- Scan for exposed API keys, tokens, and credentials before every deploy
- Validate all user input at API boundaries
- Use `requireAuth()` / `requireTeamPermission()` on every protected route
- Check that presigned URLs have appropriate expiry (1hr upload, 5min view)
- Never commit `.env.local`, `credentials.json`, or similar files

---

## Important Notes

- **Never commit `.env.local`** - Contains sensitive keys
- **Atomic quota operations** - Always use `reserveQuotaAtomic()` before uploads
- **Team isolation** - Team files are completely separate from personal files
- **Batch activity logging** - Use `/api/teams/{teamId}/activity/batch` for folder uploads
- **Cache invalidation** - Call `invalidateTeamFilesCache(teamId)` after mutations
- **R2 presigned URLs expire** - 1 hour for uploads, 5 min for views
- **HMR persistence** - Use `globalThis` pattern for in-memory singletons in dev
- **Module naming conflict** - Do NOT create `lib/shared/file-utils.ts` — it conflicts with the existing `lib/shared/file-utils.tsx` (React component).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build failures | Use Node 22.22+/24, run `bun install`, delete `build/` and `.react-router/` |
| Deploy fails with "Script startup exceeded" or env undefined at startup | Something reads `process.env` or starts a timer at module scope; make it lazy |
| Pages 500 with "clerkMiddleware() not detected" | `web/root.tsx` must export `middleware = [clerkMiddleware()]` |
| Upload errors | Check plan limits, rate limit (100/min), R2 credentials |
| DB connection | Verify `DATABASE_URL`, check Neon isn't paused |
| Thumbnail fails | Check `MEDIA_CONTAINER` (or `MEDIA_SERVICE_URL` if set), the background queue/DLQ, and private media health |
| Chunked upload state errors | `chunked_uploads` must exist (`bunx drizzle-kit push`); leases and quota reservations live in Postgres |
| 409 on upload | Another upload for same file in progress |
| OAuth issues | Check Clerk dashboard, SSO callback URLs |

---

## Documentation Maintenance

When making changes:

1. **API changes** → Update `docs/API_DOCUMENTATION.md`
2. **State/hook changes** → Update `docs/STATE_MANAGEMENT.md`
3. **Architecture changes** → Update this file (`CLAUDE.md`)

These three documents together provide complete context for understanding and extending the application.
