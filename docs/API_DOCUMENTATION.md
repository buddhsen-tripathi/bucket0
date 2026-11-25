# Bucket0 API Documentation

**Base URL:** `https://bucket0.com/api`

**Authentication:** All endpoints require Clerk session authentication unless marked `PUBLIC`

---

## Table of Contents

1. [Cloud Storage](#cloud-storage)
2. [External S3 Buckets](#external-s3-buckets)
3. [Teams](#teams)
   - [Team CRUD](#get-teams)
   - [Members & Invitations](#get-teamsteamidmembers)
   - [Roles](#get-teamsteamidroles)
   - [Files](#get-teamsteamidfiles)
   - [Activity & Chat](#get-teamsteamidactivity)
4. [User Management](#user-management)
5. [Billing (Polar)](#billing-polar)
6. [System](#system)
7. [S3 API Gateway](#s3-api-gateway)
8. [S3 API Dashboard Routes](#s3-api-dashboard-routes)
9. [Agent Bucket](#agent-bucket)
10. [Error Codes](#error-codes)
11. [Appendix](#appendix)

---

## Cloud Storage

### POST /cloud/upload
Upload files (multipart uploads stream through encryption to R2; thumbnails are queued)

| Field | Description |
|-------|-------------|
| **Purpose** | Upload file to user's cloud storage |
| **Body** | `multipart/form-data { file: File, filename: string }` |
| **Response** | `{ success: true, key: string }` |
| **Guards** | Auth required |
| **Rate Limit** | 100 uploads/min |
| **Validation** | File size vs plan limit, storage quota check, filename sanitization. JSON (presigned) requests require `size` to be a nonnegative safe integer (400 otherwise) |
| **Errors** | 409 when the key already belongs to an Agent Storage file (Drive and Agent Storage never overwrite each other) |

### POST /cloud/upload/chunked/init
Initialize chunked upload for large files (>10MB)

| Field | Description |
|-------|-------------|
| **Purpose** | Start multipart upload, reserve quota atomically |
| **Body** | `{ filename: string, size: number, contentType: string }` |
| **Response** | `{ uploadId: string, key: string, chunkSize: number, encrypt: boolean, quotaReserved: number, isOverwrite: boolean }` |
| **Guards** | Auth required |
| **Rate Limit** | 100 uploads/min |
| **Validation** | File size vs plan, atomic quota reservation, prevents concurrent same-file uploads (409 Conflict) |

Upload leases and quota reservations are persisted in `chunked_uploads`. Completion saves file metadata and settles the reservation atomically. A smaller overwrite releases the size difference only after completion; aborts release only the recorded reservation and are idempotent. Completion uses a five-minute lease: concurrent completion/cancel requests return 409, and a timed-out completion can be retried after lease expiry. Ambiguous completion responses are reconciled against the R2 object's upload token. Cleanup is scoped to the authenticated user and processes up to 100 stale reservations per call.

### POST /cloud/upload/chunked/part
Upload individual chunk

| Field | Description |
|-------|-------------|
| **Purpose** | Upload single part of multipart upload |
| **Body** | `multipart/form-data { uploadId, key, partNumber, chunk: Blob, encrypt }` |
| **Response** | `{ etag: string, partNumber: number }` |
| **Guards** | Auth required |
| **Validation** | Fixed 8 MiB parts (final part may be smaller); 8 MiB + 64 KiB multipart body cap; part number 1-10000, size/encryption/final part verified against shared reservation |

### POST /cloud/upload/chunked/complete
Complete multipart upload

| Field | Description |
|-------|-------------|
| **Purpose** | Finalize chunked upload, save metadata, trigger thumbnail |
| **Body** | `{ uploadId, key, parts: [{partNumber, etag}], size, contentType, encrypted }` |
| **Response** | `{ success: true, key: string }` |
| **Guards** | Auth required |

### DELETE /cloud/upload/chunked/complete
Abort chunked upload

| Field | Description |
|-------|-------------|
| **Purpose** | Cancel failed upload, rollback quota |
| **Body** | `{ uploadId: string, key: string }` (`size`/`isOverwrite` from older clients are ignored; persisted reservation determines rollback) |
| **Response** | `{ success: true }` |
| **Guards** | Auth required |

### GET /cloud/upload/chunked/cleanup
Get chunked upload stats

| Field | Description |
|-------|-------------|
| **Purpose** | Monitor the authenticated user's active chunked uploads |
| **Response** | `{ activeUploads, totalReservedBytes, oldestUploadAgeMinutes, staleCount }` |
| **Guards** | Auth required |

### POST /cloud/upload/chunked/cleanup
Cleanup stale uploads

| Field | Description |
|-------|-------------|
| **Purpose** | Remove abandoned uploads (>1 hour old) |
| **Body** | `{ thresholdMinutes?: number }` (default: 60, min: 15) |
| **Response** | `{ cleaned, failed, total, stats }` |
| **Guards** | Auth required |

### POST /cloud/upload/cancel
Cancel queued upload

| Field | Description |
|-------|-------------|
| **Purpose** | Cancel upload waiting in queue (not active uploads) |
| **Body** | `{ filename: string }` |
| **Response** | `{ success: true, cancelled: true, quotaRolledBack: boolean }` |
| **Guards** | Auth required |
| **Errors** | 404 if not found, 409 if already active |

### GET /cloud/upload/cancel
Get upload queue status

| Field | Description |
|-------|-------------|
| **Purpose** | Check upload status or overall queue stats |
| **Params** | `?filename=xxx` (optional) |
| **Response** | Single file: `{ filename, status, queuePosition, canCancel }` <br> Overall: `{ activeUploads, queuedUploads, memoryUsageGB, canAcceptImmediately }` |
| **Guards** | Auth required |

### GET /cloud/download
Stream file download with decryption

| Field | Description |
|-------|-------------|
| **Purpose** | Download file with automatic decryption |
| **Params** | `?key=string` |
| **Response** | Binary stream with `Content-Disposition: attachment` |
| **Guards** | Auth required |
| **Features** | Range requests (unencrypted files), auto-detects encryption mode |

### POST /cloud/download
Get download URL

| Field | Description |
|-------|-------------|
| **Purpose** | Get internal download endpoint URL |
| **Body** | `{ key: string }` |
| **Response** | `{ downloadUrl: string }` |
| **Guards** | Auth required |

### GET /cloud/view
Stream file for inline preview

| Field | Description |
|-------|-------------|
| **Purpose** | View file with `Content-Disposition: inline` |
| **Params** | `?key=string` |
| **Response** | Binary stream with decryption, range support |
| **Guards** | Auth required |

### GET /cloud/files
List user's cloud files (paginated)

| Field | Description |
|-------|-------------|
| **Purpose** | Get file list with usage stats |
| **Params** | `?limit=50&offset=0` (max 100) |
| **Response** | `{ files: [], usage, limit, plan, maxFileSize, pagination: { total, offset, limit, hasMore } }` |
| **Guards** | Auth required |
| **Features** | Auto-triggers missing thumbnail generation (up to 5 per request) |

### DELETE /cloud/delete
Delete file or folder

| Field | Description |
|-------|-------------|
| **Purpose** | Delete from R2 and database, rollback quota |
| **Body** | `{ key: string }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required |
| **Features** | Handles folders (trailing `/`), deactivates share links, deletes thumbnails |
| **Notes** | My Drive only. A folder delete leaves Agent Storage files under the same path (their R2 objects and share links) in place; a single-file delete of a key owned by Agent Storage returns 404 |

### POST /cloud/folder
Create folder

| Field | Description |
|-------|-------------|
| **Purpose** | Create folder marker (0-byte object with trailing slash) |
| **Body** | `{ folderPath: string }` |
| **Response** | `{ success: true, key: string }` |
| **Guards** | Auth required |
| **Validation** | Blocks path traversal (`..`, `//`), sanitizes special characters |
| **Notes** | Folders are not encrypted. Creates object ending with `/` which file listing identifies as directory |

### POST /cloud/star
Toggle file starred status

| Field | Description |
|-------|-------------|
| **Purpose** | Mark/unmark file as starred |
| **Body** | `{ key: string, starred: boolean }` |
| **Response** | `{ success: true, key, isStarred }` |
| **Guards** | Auth required |

### GET /cloud/thumbnail
Serve file thumbnail

| Field | Description |
|-------|-------------|
| **Purpose** | Get WebP thumbnail for file |
| **Params** | `?key=string` |
| **Response** | WebP image (cached 1 year) |
| **Guards** | Auth required |
| **Errors** | 404 if no thumbnail available |

### POST /cloud/share
Create share link

| Field | Description |
|-------|-------------|
| **Purpose** | Generate public/protected share link with permissions |
| **Body** | `{ key: string, targetType?: "file" | "folder", accessType?: "anyone" | "protected", allowDownload?: boolean, allowAddToDrive?: boolean }` |
| **Response** | `{ shareUrl, linkId, accessType, allowDownload, allowAddToDrive, targetType }` |
| **Guards** | Auth required |
| **Rate Limit** | 100 links/hour |
| **Defaults** | `targetType: "file"`, `allowDownload: true`, `allowAddToDrive: true` |
| **Notes** | Folder share keys are relative Drive paths ending with `/`; folder links are browse/download-only and force `allowAddToDrive: false`. |

### GET /cloud/share
Get share link info

| Field | Description |
|-------|-------------|
| **Purpose** | Check if file or folder has active share link |
| **Params** | `?key=string&targetType=file|folder` |
| **Response** | `{ exists: boolean, shareUrl?, linkId?, accessCount?, accessType?, allowDownload?, allowAddToDrive?, targetType? }` |
| **Guards** | Auth required |

### DELETE /cloud/share
Revoke share link

| Field | Description |
|-------|-------------|
| **Purpose** | Deactivate share link |
| **Body** | `{ linkId: string }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required (owner only) |

### GET /cloud/share/links
List all active share links

| Field | Description |
|-------|-------------|
| **Purpose** | Get all user's active share links |
| **Response** | `{ links: [] }` |
| **Guards** | Auth required |

### GET /cloud/share/stream
Stream shared file

| Field | Description |
|-------|-------------|
| **Purpose** | Stream file via share link |
| **Params** | File link: `?id=linkId&download=true|false` <br> Folder link child file: `?id=linkId&key=relative/file.txt&download=true|false` |
| **Response** | Binary stream with decryption |
| **Guards** | None for "anyone" links, Auth for "protected" links |
| **Features** | Range requests, auto-decryption, folder child access constrained to shared folder prefix |
| **Security** | Non-passive content types (anything other than images, audio, video, PDF, plain text) are served with `Content-Security-Policy: sandbox`, so uploaded HTML/SVG cannot run script on the app origin. The same applies to every route that returns stored user bytes (cloud view/download, team view/download/share stream, agent download, S3 GetObject/HeadObject and dashboard download). Rate limits key on `cf-connecting-ip` |

### GET /cloud/share/folder
List shared folder contents

| Field | Description |
|-------|-------------|
| **Purpose** | List direct child folders and files for a folder share link |
| **Params** | `?id=linkId&path=optional/subfolder/` |
| **Response** | `{ linkId, rootPath, path, name, allowDownload, folders: [], files: [] }` |
| **Guards** | None for "anyone" links, Auth for "protected" links |
| **Rate Limit** | Share stream limiter |
| **Notes** | `path` is relative to the shared folder root. Folder paths always end with `/`. |

### GET /cloud/share/folder/download
Download shared folder as ZIP

| Field | Description |
|-------|-------------|
| **Purpose** | Build and download a ZIP archive for a folder share link |
| **Params** | `?id=linkId` |
| **Response** | `application/zip` attachment |
| **Guards** | None for "anyone" links, Auth for "protected" links |
| **Rate Limit** | 10 ZIP generations/minute/IP |
| **Validation** | Link must be an active folder link with `allowDownload: true`; max 500 files, 1000 folders, 250 MB original file data |
| **Features** | Preserves nested folder structure and empty folders, decrypts files before adding them to the ZIP |

### POST /cloud/share/add-to-drive
Save shared file to user's drive

| Field | Description |
|-------|-------------|
| **Purpose** | Copy a shared file to the authenticated user's personal cloud storage |
| **Body** | `{ shareLinkId: string, shareType: "personal" | "team" }` |
| **Response** | `{ success: true, fileName: string, fileKey: string }` |
| **Guards** | Auth required |
| **Validation** | Share link must exist and be active, `allowAddToDrive` must be true, quota reserved atomically before the copy and released if the copy or insert fails |
| **Errors** | 401 (not authenticated), 403 (not allowed or insufficient quota), 404 (share link not found), 409 (already saved) |
| **Features** | Decrypts source file, re-encrypts for target user, tracks source via `sourceShareLinkId` to prevent duplicates |
| **Notes** | Users cannot save their own files (personal shares only). Returns 409 if user already saved this share link. A unique index on `(user_id, source_share_link_id, source_share_type)` also returns 409 for a concurrent second save; that request releases its reservation and removes its own copy. |

### POST /cloud/validate-upload
Pre-flight upload validation

| Field | Description |
|-------|-------------|
| **Purpose** | Check if upload would be allowed (saves bandwidth) |
| **Body** | `{ filename: string, size: number }` |
| **Response** | `{ allowed: boolean, isOverwrite?, limits: { plan, storageUsage, maxFileSize, remainingStorage } }` |
| **Guards** | Auth required |

---

## External S3 Buckets

### GET /s3/config
List S3 configurations

| Field | Description |
|-------|-------------|
| **Purpose** | Get all user's bucket configs (without credentials) |
| **Response** | `{ configurations: [{ id, name, provider, bucketName, region, endpoint, forcePathStyle }] }` |
| **Guards** | Auth required |

### GET /s3/config?id=xxx
Get specific configuration (with credentials)

| Field | Description |
|-------|-------------|
| **Purpose** | Get single config with decrypted credentials |
| **Params** | `?id=configId` |
| **Response** | `{ id, name, provider, bucketName, region, endpoint, forcePathStyle, accessKeyId, secretAccessKey }` |
| **Guards** | Auth required |

### POST /s3/config
Create S3 configuration

| Field | Description |
|-------|-------------|
| **Purpose** | Add new external bucket connection |
| **Body** | `{ name, provider, bucketName, region, endpoint?, forcePathStyle?, accessKeyId, secretAccessKey }` |
| **Response** | `{ success: true, configuration: { id, name, provider } }` |
| **Guards** | Auth required |
| **Validation** | Plan bucket limits (Free: 1, Starter: 10, Pro: 25, Scale: 100), credentials encrypted at rest |

### PUT /s3/config
Update S3 configuration

| Field | Description |
|-------|-------------|
| **Purpose** | Update existing bucket config |
| **Body** | `{ id, ...partial config fields }` |
| **Response** | `{ success: true, configuration: { id, name } }` |
| **Guards** | Auth required |

### DELETE /s3/config
Delete S3 configuration

| Field | Description |
|-------|-------------|
| **Purpose** | Soft delete bucket config |
| **Params** | `?id=configId` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required |

### POST /s3/test
Test S3 connection

| Field | Description |
|-------|-------------|
| **Purpose** | Verify bucket credentials work |
| **Body** | `{ config: S3Config }` |
| **Response** | `{ success: boolean, message?: string, error?: string }` |
| **Guards** | Auth required |

### POST /s3/files
List files in external bucket

| Field | Description |
|-------|-------------|
| **Purpose** | List bucket contents with pagination |
| **Body** | `{ config, continuationToken?, maxKeys?, prefix?, loadAll? }` |
| **Response** | `{ files: [], isTruncated, nextContinuationToken?, totalLoaded }` |
| **Guards** | Auth required |
| **Features** | `loadAll=true` fetches all files (max 100k) |

### POST /s3/upload
Upload to external bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Upload file or create folder |
| **Body** | File: `multipart/form-data { file, config: JSON }` <br> Folder: `{ config, key, isEmptyFolder: true }` |
| **Response** | `{ success: true, key: string }` |
| **Guards** | Auth required |

### POST /s3/download
Get presigned download URL

| Field | Description |
|-------|-------------|
| **Purpose** | Generate temporary download URL |
| **Body** | `{ config, key, expiresIn?: 3600 }` |
| **Response** | `{ downloadUrl: string, expiresIn }` |
| **Guards** | Auth required |

### POST /s3/view
Get presigned view URL

| Field | Description |
|-------|-------------|
| **Purpose** | Generate temporary inline view URL |
| **Body** | `{ config, key, expiresIn?: 3600 }` |
| **Response** | `{ viewUrl: string }` |
| **Guards** | Auth required |

### DELETE /s3/delete
Delete from external bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Delete file from user's external bucket |
| **Body** | `{ config, key }` |
| **Response** | `{ success: true, message: string }` |
| **Guards** | Auth required |

---

## Teams

### GET /teams
List user's teams

| Field | Description |
|-------|-------------|
| **Purpose** | Get all teams user owns or is member of |
| **Response** | `{ teams: [{ ...team, role: "owner"|"member", isOwner }] }` |
| **Guards** | Auth required |

### POST /teams
Create team

| Field | Description |
|-------|-------------|
| **Purpose** | Create new team (owner becomes first member) |
| **Body** | `{ name: string }` |
| **Response** | `{ team: { ...team, role: "owner" }, limits: { maxMembers, maxStorageBytes, ownerStorageUsage } }` |
| **Guards** | Auth required |
| **Validation** | Name 2-100 chars, Starter+ plan required, team limit per plan |

### GET /teams/[teamId]
Get team details

| Field | Description |
|-------|-------------|
| **Purpose** | Get team info with permissions and quota |
| **Response** | `{ team, permissions, settings, quota, features }` |
| **Guards** | Auth + team member |

### PATCH /teams/[teamId]
Update team

| Field | Description |
|-------|-------------|
| **Purpose** | Update team name or settings |
| **Body** | `{ name?: string, settings?: object }` |
| **Response** | `{ team }` |
| **Guards** | Auth + team owner |

### DELETE /teams/[teamId]
Delete team

| Field | Description |
|-------|-------------|
| **Purpose** | Delete team and all associated data |
| **Response** | `{ success: true, message }` |
| **Guards** | Auth + team owner |
| **Effects** | Deletes files, members, invitations, messages, activity logs; rolls back owner quota |

### GET /teams/[teamId]/members
List team members

| Field | Description |
|-------|-------------|
| **Purpose** | Get all members with permissions and Clerk user data |
| **Response** | `{ members: [{ userId, role, permissions, user, joinedAt }], total }` |
| **Guards** | Auth + team member |

### PATCH /teams/[teamId]/members/[userId]
Update member permissions

| Field | Description |
|-------|-------------|
| **Purpose** | Modify member's permissions |
| **Body** | `{ roleId?, canUpload?, canDownload?, canDelete?, canShare?, canManageMembers?, canViewActivity?, canChat? }` |
| **Response** | `{ member }` |
| **Guards** | Auth + canManageMembers permission |
| **Validation** | Only owner can grant canManageMembers |

### DELETE /teams/[teamId]/members/[userId]
Remove team member

| Field | Description |
|-------|-------------|
| **Purpose** | Remove member from team (or leave if self) |
| **Response** | `{ success: true, message }` |
| **Guards** | Auth + (self OR canManageMembers OR owner) |
| **Validation** | Cannot remove owner |

### GET /teams/[teamId]/invitations
List pending invitations

| Field | Description |
|-------|-------------|
| **Purpose** | Get all pending team invitations |
| **Response** | `{ invitations: [] }` |
| **Guards** | Auth + canManageMembers |

### POST /teams/[teamId]/invitations
Send invitation

| Field | Description |
|-------|-------------|
| **Purpose** | Invite user by email |
| **Body** | `{ email, roleId?, canUpload?, canDownload?, canDelete?, canShare?, canManageMembers?, canViewActivity?, canChat? }` |
| **Response** | `{ invitation, emailSent, acceptUrl? }` |
| **Guards** | Auth + canManageMembers |
| **Validation** | Email format, member limit, duplicate check, 7-day expiry |

### DELETE /teams/[teamId]/invitations/[invitationId]
Revoke invitation

| Field | Description |
|-------|-------------|
| **Purpose** | Cancel pending invitation |
| **Response** | `{ success: true }` |
| **Guards** | Auth + canManageMembers |

### POST /teams/[teamId]/invitations/[invitationId]/resend
Resend invitation email

| Field | Description |
|-------|-------------|
| **Purpose** | Resend invitation email (max 3 times) |
| **Response** | `{ success: true, emailSent: boolean }` |
| **Guards** | Auth + canManageMembers |

### POST /teams/invitations/accept
Accept invitation

| Field | Description |
|-------|-------------|
| **Purpose** | Accept team invitation via token |
| **Body** | `{ token: string }` |
| **Response** | `{ success: true, message, team: { id, name, slug } }` |
| **Guards** | Auth required |
| **Validation** | Token validity, invitation email must match one of the user's verified email addresses (case-insensitive), expiry check, member limit |

### GET /teams/[teamId]/files
List team files

| Field | Description |
|-------|-------------|
| **Purpose** | Get paginated team file list |
| **Params** | `?limit=50&offset=0&sortBy=createdAt&sortOrder=desc` |
| **Response** | `{ files: [], total, usage, fileCount, storageLimit, availableStorage, hasMore }` |
| **Guards** | Auth + canDownload |

### POST /teams/[teamId]/files/upload
Upload team file

| Field | Description |
|-------|-------------|
| **Purpose** | Upload file to team storage |
| **Body** | `multipart/form-data { file, filename }` (filename can include path like `folder/file.pdf`) |
| **Response** | `{ success: true, key: string, size: number }` |
| **Guards** | Auth + canUpload |
| **Rate Limit** | 100 uploads/min |
| **Validation** | Quota (owner's plan), atomic reservation, rollback on failure |
| **Notes** | Activity logging is batched by client via `/activity/batch` endpoint (prevents log flooding on folder uploads) |

### POST /teams/[teamId]/files/folder
Create team folder

| Field | Description |
|-------|-------------|
| **Purpose** | Create folder marker in team storage (0-byte object with trailing slash) |
| **Body** | `{ folderPath: string }` |
| **Response** | `{ success: true, key: string }` |
| **Guards** | Auth + canUpload |
| **Validation** | Blocks path traversal (`..`, `//`), sanitizes special characters |
| **Notes** | Folders are not encrypted. Creates object ending with `/` which file listing identifies as directory |

### DELETE /teams/[teamId]/files/delete
Delete team file

| Field | Description |
|-------|-------------|
| **Purpose** | Delete file from team storage |
| **Body** | `{ key: string }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth + current team member + (canDelete OR uploader OR owner) |
| **Notes** | Deleting a file or folder deactivates team share links for the deleted key(s) |

### GET /teams/[teamId]/files/download
Download team file

| Field | Description |
|-------|-------------|
| **Purpose** | Stream team file with decryption |
| **Params** | `?key=string` |
| **Response** | Binary stream |
| **Guards** | Auth + canDownload |

### GET /teams/[teamId]/files/view
View team file

| Field | Description |
|-------|-------------|
| **Purpose** | Stream team file inline |
| **Params** | `?key=string` |
| **Response** | Binary stream with `Content-Disposition: inline` |
| **Guards** | Auth + canDownload |

### GET /teams/[teamId]/files/thumbnail
Get team file thumbnail

| Field | Description |
|-------|-------------|
| **Purpose** | Serve WebP thumbnail |
| **Params** | `?key=string` |
| **Response** | WebP image |
| **Guards** | Auth + team member |

### POST /teams/[teamId]/files/share
Create team file share link

| Field | Description |
|-------|-------------|
| **Purpose** | Generate share link for team file with permissions |
| **Body** | `{ key, expiresInHours?, accessType?: "anyone" | "protected", allowDownload?: boolean, allowAddToDrive?: boolean }` |
| **Response** | `{ shareUrl, linkId, accessType, allowDownload, allowAddToDrive, expiresAt? }` |
| **Guards** | Auth + canShare |
| **Defaults** | `allowDownload: true`, `allowAddToDrive: true` |
| **Notes** | URLs use `/ts/{linkId}` prefix (different from personal `/s/` shares) |

### GET /teams/[teamId]/files/share
Check team file share status

| Field | Description |
|-------|-------------|
| **Purpose** | Check if team file has an active share link |
| **Params** | `?key=string` |
| **Response** | `{ exists: boolean, shareUrl?, linkId?, accessCount?, accessType?, allowDownload?, allowAddToDrive?, expiresAt? }` |
| **Guards** | Auth + team member |

### DELETE /teams/[teamId]/files/share
Revoke team file share link

| Field | Description |
|-------|-------------|
| **Purpose** | Deactivate share link for team file |
| **Body** | `{ linkId: string }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth + (canShare OR owner) |

### GET /teams/[teamId]/activity
Get team activity log

| Field | Description |
|-------|-------------|
| **Purpose** | View team activity (uploads, deletes, member changes) |
| **Params** | `?limit=50&offset=0&action=&resourceType=` |
| **Response** | `{ activities: [], total, hasMore }` |
| **Guards** | Auth + canViewActivity |
| **Feature Gate** | activityLogsEnabled (plan-based) |

### GET /teams/[teamId]/activity/stream
Real-time activity stream (SSE)

| Field | Description |
|-------|-------------|
| **Purpose** | Stream real-time activity updates via Server-Sent Events |
| **Params** | `?since=timestamp` (ISO date, returns activities after this time) |
| **Response** | SSE stream: `data: { activities: [], timestamp }` every 5 seconds |
| **Guards** | Auth + canViewActivity (or owner). Permission and plan gate are re-checked every 30 seconds; the stream closes when access is lost |
| **Feature Gate** | activityLogsEnabled (plan-based) |
| **Headers** | `Content-Type: text/event-stream`, `Cache-Control: no-cache` |
| **Notes** | Polls DB every 5 seconds, sends empty arrays if no new activity |

### POST /teams/[teamId]/activity/batch
Log batch upload activity

| Field | Description |
|-------|-------------|
| **Purpose** | Log a single activity entry for batch/folder uploads (prevents log flooding) |
| **Body** | `{ fileNames: string[], totalSize: number }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth + team member |
| **Notes** | Called by client after folder upload completes. Auto-detects folder prefix to show "Uploaded folder/ (N files)" |

### GET /teams/[teamId]/messages
Get team messages

| Field | Description |
|-------|-------------|
| **Purpose** | Get team chat messages |
| **Params** | `?limit=50&offset=0&fileId=` |
| **Response** | `{ messages: [], total, hasMore }` |
| **Guards** | Auth + canChat |
| **Feature Gate** | chatEnabled (plan-based) |

### POST /teams/[teamId]/messages
Send team message

| Field | Description |
|-------|-------------|
| **Purpose** | Send chat message or file comment |
| **Body** | `{ content: string, fileId?, parentId? }` |
| **Response** | `{ message: { ...message, user } }` |
| **Guards** | Auth + canChat |
| **Validation** | Content max 5000 chars |
| **Feature Gate** | chatEnabled (plan-based) |

### GET /teams/[teamId]/messages/stream
Real-time chat stream (SSE)

| Field | Description |
|-------|-------------|
| **Purpose** | Stream real-time chat messages via Server-Sent Events |
| **Params** | `?since=timestamp&fileId=` (ISO date, optional file filter) |
| **Response** | SSE stream: `data: { messages: [], timestamp }` every 2 seconds |
| **Notes** | Requires canChat (or owner) and plan `chatEnabled`; re-checked every 30 seconds and the stream closes when access is lost |
| **Guards** | Auth + canChat |
| **Feature Gate** | chatEnabled (plan-based) |
| **Headers** | `Content-Type: text/event-stream`, `Cache-Control: no-cache` |
| **Notes** | Polls DB every 2 seconds (faster than activity), sends empty arrays if no new messages |

### POST /teams/[teamId]/transfer
Transfer team ownership

| Field | Description |
|-------|-------------|
| **Purpose** | Transfer ownership to another member |
| **Body** | `{ newOwnerId: string }` |
| **Response** | `{ success: true, message }` |
| **Guards** | Auth + team owner |
| **Validation** | New owner must be member, have Starter+ plan, have enough storage quota |
| **Effects** | Transfers storage accounting between users |

### PATCH /teams/[teamId]/settings
Update team settings

| Field | Description |
|-------|-------------|
| **Purpose** | Update default member permissions for new members |
| **Body** | `{ defaultCanUpload?, defaultCanDownload?, defaultCanDelete?, defaultCanShare? }` |
| **Response** | `{ team }` |
| **Guards** | Auth + team owner |
| **Notes** | These defaults apply to newly invited members, not existing ones |

### GET /teams/[teamId]/roles
List team roles

| Field | Description |
|-------|-------------|
| **Purpose** | Get all custom roles defined for the team |
| **Response** | `{ roles: [{ id, name, teamId, canUpload, canDownload, canDelete, canShare, canManageMembers, canViewActivity, canChat, createdAt }] }` |
| **Guards** | Auth + team member |

### POST /teams/[teamId]/roles
Create team role

| Field | Description |
|-------|-------------|
| **Purpose** | Create a new reusable permission role |
| **Body** | `{ name, canUpload?, canDownload?, canDelete?, canShare?, canManageMembers?, canViewActivity?, canChat? }` |
| **Response** | `{ role: { id, name, ...permissions } }` |
| **Guards** | Auth + team owner |
| **Validation** | Name required, max 10 roles per team |

### PATCH /teams/[teamId]/roles/[roleId]
Update role permissions

| Field | Description |
|-------|-------------|
| **Purpose** | Modify an existing role's permissions |
| **Body** | `{ name?, canUpload?, canDownload?, canDelete?, canShare?, canManageMembers?, canViewActivity?, canChat? }` |
| **Response** | `{ role }` |
| **Guards** | Auth + team owner |
| **Validation** | Role must belong to team |

### DELETE /teams/[teamId]/roles/[roleId]
Delete role

| Field | Description |
|-------|-------------|
| **Purpose** | Delete a custom role |
| **Response** | `{ success: true }` |
| **Guards** | Auth + team owner |
| **Effects** | Sets `roleId = null` for all members using this role (keeps individual permissions) |

### POST /teams/[teamId]/roles/[roleId]/assign
Bulk assign role to members

| Field | Description |
|-------|-------------|
| **Purpose** | Assign a role to multiple members at once |
| **Body** | `{ memberIds: string[] }` |
| **Response** | `{ success: true, assigned: number }` |
| **Guards** | Auth + canManageMembers (owner required for roles with canManageMembers) |
| **Validation** | Cannot assign role to owner, role must belong to team |

### GET /teams/[teamId]/invitations/[invitationId]
Get invitation details

| Field | Description |
|-------|-------------|
| **Purpose** | Get specific invitation info |
| **Response** | `{ invitation: { id, email, status, expiresAt, resendCount, permissions } }` |
| **Guards** | Auth + canManageMembers |

### GET /teams/share/stream `PUBLIC`
Stream team shared file

| Field | Description |
|-------|-------------|
| **Purpose** | Stream file via team share link (for /ts/ URLs) |
| **Params** | `?id=linkId&download=true|false` |
| **Response** | Binary stream with decryption |
| **Guards** | None for "anyone" links, Auth for "protected" links |
| **Features** | Range requests, auto-decryption (supports all encryption modes) |
| **Notes** | Uses `teamShareLinks` table, separate from personal `/s/` shares |

---

## User Management

### GET /user
Get user info

| Field | Description |
|-------|-------------|
| **Purpose** | Get current user's database record |
| **Response** | `{ id, email, plan, storageUsage, fileCount, createdAt }` |
| **Guards** | Auth required |

### DELETE /user
Delete account (GDPR)

| Field | Description |
|-------|-------------|
| **Purpose** | Permanently delete user and all data |
| **Response** | `{ success: true, message }` |
| **Guards** | Auth required |
| **Effects** | Deletes: R2 files, cloudFiles, shareLinks, s3Configurations, subscriptions, user record |

### GET /user/plan
Get subscription plan

| Field | Description |
|-------|-------------|
| **Purpose** | Get user's current plan and usage |
| **Response** | `{ plan, storageUsage, fileCount }` |
| **Guards** | Auth required |

### GET /user/password
Check if password set

| Field | Description |
|-------|-------------|
| **Purpose** | Check authentication methods |
| **Response** | `{ hasPassword, authMethods: { password, oauth, oauthProviders } }` |
| **Guards** | Auth required |

### POST /user/password
Set/change password

| Field | Description |
|-------|-------------|
| **Purpose** | Set password (OAuth users) or change existing |
| **Body** | `{ currentPassword?, newPassword }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required |
| **Rate Limit** | 3/hour |
| **Validation** | Min 8 chars, current password verification if exists |

### GET /user/sessions
List active sessions

| Field | Description |
|-------|-------------|
| **Purpose** | Get all user's active Clerk sessions |
| **Response** | `{ sessions: [{ id, lastActiveAt, browser, ipAddress, city, country, isMobile }] }` |
| **Guards** | Auth required |

### DELETE /user/sessions
Revoke session

| Field | Description |
|-------|-------------|
| **Purpose** | Log out specific session |
| **Body** | `{ sessionId: string }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required; the session must belong to the caller |
| **Errors** | 404 when the session does not exist or belongs to another user |

---

## Billing (Polar)

### POST /polar/checkout
Create checkout session

| Field | Description |
|-------|-------------|
| **Purpose** | Start subscription checkout flow |
| **Body** | `{ interval?: "yearly"|"monthly", plan?: "starter"|"pro"|"scale" }` |
| **Response** | `{ url: string }` |
| **Guards** | Auth required |

### POST /polar/webhook
Handle subscription events

| Field | Description |
|-------|-------------|
| **Purpose** | Process Polar webhook events |
| **Body** | Svix signed payload |
| **Response** | `{ received: true }` |
| **Guards** | Svix signature verification |
| **Events** | subscription.created, .updated, .active, .canceled, .revoked |

### POST /polar/sync
Sync subscription status

| Field | Description |
|-------|-------------|
| **Purpose** | Sync plan from subscription table |
| **Response** | `{ success: true, plan, subscriptionStatus? }` |
| **Guards** | Auth required |

### GET /polar/portal
Get customer portal URL

| Field | Description |
|-------|-------------|
| **Purpose** | Get Polar customer portal for subscription management |
| **Response** | `{ url: string }` |
| **Guards** | Auth required |
| **Errors** | 404 if no subscription |

---

## System

### GET /health
Health check

| Field | Description |
|-------|-------------|
| **Purpose** | API health status |
| **Response** | `{ status: "ok", timestamp, service: "bucket0-web" }` |
| **Guards** | PUBLIC |

`GET /health?check=bindings` runs operator-only, read-only checks for Neon connectivity and the upload migration, R2 list/object reads, Clerk backend access, encryption key formats, and media health (when configured). Requires `Authorization: Bearer <HEALTH_CHECK_TOKEN>`; unauthorized requests return 401 before accessing providers. Returns 200 (`ready`) or 503 (`not_ready`), with `Cache-Control: no-store`; no credential values or object keys are returned. A disabled media service is reported separately and is not required for core readiness. Billing/email/embedding credentials are not exercised by this probe.

### POST /feedback
Submit feedback

| Field | Description |
|-------|-------------|
| **Purpose** | Submit bug report, feature request, or other feedback |
| **Body** | `{ type: "bug"|"feature"|"other", message: string, context?: object }` |
| **Response** | `{ success: true, id }` |
| **Guards** | Auth required |
| **Rate Limit** | 5/hour |

### GET /feedback
Get user's feedback

| Field | Description |
|-------|-------------|
| **Purpose** | List user's own feedback submissions |
| **Response** | `{ feedback: [] }` |
| **Guards** | Auth required |

### POST /webhooks/clerk
Handle Clerk events

| Field | Description |
|-------|-------------|
| **Purpose** | Process Clerk webhook events (user lifecycle) |
| **Body** | Svix signed payload |
| **Response** | `{ message: string }` |
| **Guards** | Svix signature verification (`CLERK_WEBHOOK_SECRET`) |
| **Events** | `user.created` (create DB record), `user.updated` (update email), `user.deleted` (cascade delete all data) |
| **Effects** | user.deleted: Deletes R2 files, cloudFiles, shareLinks, s3Configurations, subscriptions, user record |

### POST /contact `PUBLIC`
Submit contact form message

| Field | Description |
|-------|-------------|
| **Purpose** | Submit a contact form message (no auth required) |
| **Body** | `{ name: string, email: string, subject: string, message: string, _t?: number }` |
| **Response** | `{ success: true, id: string, message: "Message sent successfully" }` |
| **Guards** | PUBLIC |
| **Rate Limit** | 5/hour per IP |
| **Validation** | Name 2-100 chars, email format + disposable domain block, subject must be one of: `general`, `support`, `billing`, `partnership`, `feedback`, `other`, message 10-5000 chars |
| **Anti-spam** | Timing check (`_t` < 3s = bot), spam phrase detection, excessive URL detection, ALL CAPS detection, HTML/script injection rejection |
| **Notes** | Spam and bot submissions are silently accepted (returns success) to avoid tipping off the sender |

---

## S3 API Gateway

**Endpoint:** `https://s3.bucket0.com` (the Worker routes to `/api/s3-api/` internally)

**Authentication:** AWS Signature V4, through either an `Authorization` header or a presigned URL with `X-Amz-*` query parameters. Both use existing credentials created via the S3 API Dashboard (see [S3 API Credentials](#post-s3-apicredentials)). Query signatures require the signed host and headers, reject expired/revoked credentials and ambiguous authentication, and expire after 1–604800 seconds. Header-signed requests must sign `x-amz-date`, be within 15 minutes of server time (`RequestTimeTooSkewed`), use a credential scope date matching `x-amz-date`, and send a hex `x-amz-content-sha256` that matches the body (`XAmzContentSHA256Mismatch`); `UNSIGNED-PAYLOAD` and `STREAMING-*` values are unchanged. Bucket or key segments equal to `.` or `..` are rejected with `InvalidArgument`. PutObject and DeleteObject hold a short per-object lock (`s3_object_leases`, 120-second expiry) while they read the old size and change quota; a concurrent write or delete of the same key gets 409 `OperationAborted` and can retry. Temporary STS credentials are not supported.

**Response Format:** XML (matching S3 API conventions). Errors return S3-style XML error responses.

### GET /
ListBuckets

| Field | Description |
|-------|-------------|
| **Purpose** | List all buckets owned by the authenticated user |
| **Response** | XML `<ListAllMyBucketsResult>` with `<Buckets>` list |
| **Guards** | AWS Signature V4 |
| **Headers** | `Content-Type: application/xml`, `x-amz-request-id` |

### GET /{bucket}
ListObjectsV2

| Field | Description |
|-------|-------------|
| **Purpose** | List objects in a bucket |
| **Params** | `?prefix=`, `?delimiter=`, `?max-keys=1000`, `?continuation-token=` |
| **Response** | XML `<ListBucketResult>` with `<Contents>` and `<CommonPrefixes>` |
| **Guards** | AWS Signature V4 |
| **Notes** | Auto-creates bucket on first access if it does not exist |

### HEAD /{bucket}
HeadBucket

| Field | Description |
|-------|-------------|
| **Purpose** | Check if a bucket exists |
| **Response** | `200` with `x-amz-bucket-region: auto` header |
| **Guards** | AWS Signature V4 |
| **Errors** | `NoSuchBucket` if bucket does not exist |

### PUT /{bucket}
CreateBucket

| Field | Description |
|-------|-------------|
| **Purpose** | Create a new bucket |
| **Response** | `200` with `Location: /{bucket}` header |
| **Guards** | AWS Signature V4 |
| **Errors** | `BucketAlreadyExists` (409), `InvalidBucketName` (400) |

### DELETE /{bucket}
DeleteBucket

| Field | Description |
|-------|-------------|
| **Purpose** | Delete an empty bucket |
| **Response** | `204 No Content` |
| **Guards** | AWS Signature V4 |
| **Errors** | `NoSuchBucket`, `BucketNotEmpty` if bucket contains objects |

### GET /{bucket}/{key}
GetObject

| Field | Description |
|-------|-------------|
| **Purpose** | Download an object from a bucket |
| **Headers** | Optional `Range` header for partial content |
| **Response** | Binary stream with `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `Accept-Ranges` headers |
| **Guards** | AWS Signature V4 |
| **Errors** | `NoSuchKey` if object does not exist |
| **Features** | Range requests supported (returns `206 Partial Content` with `Content-Range`) |

### HEAD /{bucket}/{key}
HeadObject

| Field | Description |
|-------|-------------|
| **Purpose** | Get object metadata without downloading the body |
| **Response** | `200` with `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `Accept-Ranges` headers |
| **Guards** | AWS Signature V4 |
| **Errors** | `NoSuchKey` if object does not exist |

### PUT /{bucket}/{key}
PutObject

| Field | Description |
|-------|-------------|
| **Purpose** | Upload an object to a bucket |
| **Body** | Raw binary data |
| **Headers** | `Content-Type` (defaults to `application/octet-stream`) |
| **Response** | `200` with `ETag` header |
| **Guards** | AWS Signature V4 |
| **Validation** | Quota check (storage limit + file size limit per plan), atomic quota reservation with rollback on failure |
| **Notes** | Auto-creates bucket if it does not exist. Replacing an existing object adjusts quota for the size difference |
| **Errors** | `QuotaExceeded`, `EntityTooLarge`, `InternalError` |

### DELETE /{bucket}/{key}
DeleteObject

| Field | Description |
|-------|-------------|
| **Purpose** | Delete an object from a bucket |
| **Response** | `204 No Content` |
| **Guards** | AWS Signature V4 |
| **Notes** | Returns `204` even if the object does not exist (S3 idempotency). Releases quota on successful delete |

### Multipart upload limitation and workaround

S3 gateway multipart initiation/completion (`POST ?uploads` or `POST ?uploadId`),
parts (`PUT ?uploadId&partNumber`), and aborts (`DELETE ?uploadId`) are unsupported
and return `InvalidRequest`. Parts and aborts never fall through to overwrite or
delete the target object.

For small files, use an explicit `PutObjectCommand` rather than an SDK transfer
manager that automatically initiates multipart uploads. For example, with an
existing configured AWS SDK v3 client:

```ts
import { PutObjectCommand } from "@aws-sdk/client-s3";

await client.send(new PutObjectCommand({
  Bucket: "your-bucket",
  Key: "example.txt",
  Body: new TextEncoder().encode("Example file"),
  ContentType: "text/plain",
}));
```

Configure the client with endpoint `https://s3.bucket0.com`, region `auto`,
`forcePathStyle: true`, and the existing Bucket0 key pair. Use
`requestChecksumCalculation: "WHEN_REQUIRED"` to avoid optional streaming
checksum framing. Presigned `GetObjectCommand` and `PutObjectCommand` URLs are
also supported using `getSignedUrl` from `@aws-sdk/s3-request-presigner`.

Single PUT requests remain subject to the plan, edge request, and Worker memory
limits; the gateway buffers their bodies. Use small payloads (for example, below
10 MiB), rather than relying on this workaround for large transfers. Larger
personal-drive files can use the web app's existing chunked uploader. Those files
belong to Drive, a separate destination from an S3 API bucket. Full S3 multipart
support remains separate feature work.

---

## S3 API Dashboard Routes

**Base URL:** `/api/s3-api`

**Authentication:** Clerk session (standard dashboard auth, not AWS Signature V4)

These endpoints are used by the Bucket0 web dashboard to manage S3 API buckets, files, and credentials.

### POST /s3-api/bucket
Create a new S3 API bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Create a new bucket via dashboard |
| **Body** | `{ name: string }` |
| **Response** | `{ bucket: { id, name, storageUsed, storageUsedFormatted, objectCount, createdAt } }` |
| **Guards** | Auth required |
| **Errors** | 400 `INVALID_NAME`, 403 `BUCKET_LIMIT_EXCEEDED`, 404 `USER_NOT_FOUND`, 409 `ALREADY_EXISTS` |

### GET /s3-api/bucket
List buckets or get bucket info

| Field | Description |
|-------|-------------|
| **Purpose** | List all buckets or get single bucket details |
| **Params** | `?name=xxx` (optional, returns single bucket with fresh R2 stats) |
| **Response** | List: `{ buckets: [{ id, name, storageUsed, storageUsedFormatted, objectCount, isActive, createdAt }] }` <br> Single: `{ bucket: { id, name, storageUsed, storageUsedFormatted, objectCount, isActive, createdAt, updatedAt } }` |
| **Guards** | Auth required |

### DELETE /s3-api/bucket
Delete a bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Delete a bucket and optionally all its objects |
| **Params** | `?name=xxx&force=true` (`force` deletes all objects first) |
| **Response** | `{ success: true, deletedObjects: number, freedBytes: number }` |
| **Guards** | Auth required |
| **Errors** | 400 (missing name), 404 (bucket not found), 409 (bucket not empty and `force` not set, or with `force` an object was being written/deleted by another request or added during the delete; objects already removed stay removed and the bucket is kept, so retry) |
| **Notes** | `force` deletes in pages of 1000 and takes the same per-object `s3_object_leases` locks as PutObject/DeleteObject, crediting sizes read while the locks are held |

### GET /s3-api/files
List files in a bucket

| Field | Description |
|-------|-------------|
| **Purpose** | List files in a bucket for the dashboard UI |
| **Params** | `?bucket=xxx&prefix=` |
| **Response** | `{ files: [{ key, name, size, sizeFormatted, lastModified, etag, isFolder }], prefix, bucketName }` |
| **Guards** | Auth required |
| **Notes** | Returns folders (from common prefixes) and files combined. Folders have `isFolder: true`, `size: 0` |

### DELETE /s3-api/files
Delete a file from a bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Delete a file and release quota |
| **Params** | `?bucket=xxx&key=xxx` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required |
| **Errors** | 400 (missing params), 404 (bucket or file not found), 409 (another change to this file is in progress), 500 (storage delete failed; quota unchanged) |

### POST /s3-api/files/upload
Upload a file to a bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Upload a file via the dashboard |
| **Params** | `?bucket=xxx&key=xxx` |
| **Body** | Raw binary data |
| **Headers** | `Content-Type` (defaults to `application/octet-stream`) |
| **Response** | `{ success: true, etag, key, size }` |
| **Guards** | Auth required |
| **Validation** | Quota check, atomic reservation with rollback (also when the R2 write fails). Replacing existing objects adjusts quota for size difference |
| **Errors** | 400 (missing params), 403 (quota exceeded), 404 (bucket not found), 409 (another change to this file is in progress) |

### GET /s3-api/files/download
Download a file from a bucket

| Field | Description |
|-------|-------------|
| **Purpose** | Stream file download from a bucket |
| **Params** | `?bucket=xxx&key=xxx&inline=true` (`inline` optional, defaults to attachment) |
| **Response** | Binary stream with `Content-Type`, `Content-Length`, `Content-Disposition`, `ETag`, `Last-Modified`, `Accept-Ranges` headers |
| **Guards** | Auth required |
| **Features** | Range requests supported (returns `206 Partial Content`) |
| **Errors** | 400 (missing params), 404 (bucket or file not found) |

### POST /s3-api/credentials
Create a new S3 API access key

| Field | Description |
|-------|-------------|
| **Purpose** | Generate access key and secret key pair for S3 API authentication |
| **Body** | `{ name: string }` (defaults to "Untitled Key") |
| **Response** | `{ credential: { id, accessKeyId, secretAccessKey, name, createdAt }, warning: "Store the secret access key securely. It will not be shown again." }` |
| **Guards** | Auth required |
| **Errors** | 403 (credential limit exceeded), 404 `USER_NOT_FOUND` |
| **Notes** | `secretAccessKey` is only returned once at creation time |

### GET /s3-api/credentials
List S3 API access keys

| Field | Description |
|-------|-------------|
| **Purpose** | List all access keys (secrets are never returned) |
| **Response** | `{ credentials: [{ id, accessKeyId, name, lastUsedAt, isActive, expiresAt, createdAt }] }` |
| **Guards** | Auth required |

### DELETE /s3-api/credentials
Delete an S3 API access key

| Field | Description |
|-------|-------------|
| **Purpose** | Delete an access key |
| **Params** | `?id=xxx` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required |
| **Errors** | 400 (missing ID), 404 (credential not found), 409 (cannot delete last key while buckets exist) |

---

## Agent Bucket

**Base URL:** `/api/agent-bucket`

**Authentication:** Two auth modes depending on the endpoint:
- **Bearer token** (`Authorization: Bearer b0ak_...`) for file operations (upload, download, list, delete, folder)
- **Clerk session** for key management and dashboard file listing

Agent Bucket allows AI agents and CLI tools to upload/download files programmatically. Files are stored in the same R2 path as personal files (`users/{userId}/...`) but can be routed to either the Agent Storage tab or My Drive based on per-key destination settings.

### POST /agent-bucket/keys
Create a new agent API key

| Field | Description |
|-------|-------------|
| **Purpose** | Generate an agent API key for programmatic access |
| **Body** | `{ name: string, destination?: "agent" \| "drive", destinationFolder?: string }` |
| **Response** | `{ key: { id, apiKey, keyPrefix, name, destination, destinationFolder, createdAt }, warning: "Store the API key securely. It will not be shown again." }` |
| **Guards** | Auth required (Clerk session) |
| **Errors** | 400 (invalid `destinationFolder`: non-string, leading `/`, backslash, or empty/`.`/`..` segment), 403 (key limit exceeded), 404 `USER_NOT_FOUND` |
| **Notes** | `apiKey` (prefixed `b0ak_...`) is only returned once at creation time. `destination` defaults to `"agent"` |

### GET /agent-bucket/keys
List agent API keys

| Field | Description |
|-------|-------------|
| **Purpose** | List all agent API keys (secrets are never returned, only prefixes) |
| **Response** | `{ keys: [{ id, keyPrefix, name, destination, destinationFolder, lastUsedAt, isActive, expiresAt, createdAt }] }` |
| **Guards** | Auth required (Clerk session) |

### PATCH /agent-bucket/keys
Update agent API key settings

| Field | Description |
|-------|-------------|
| **Purpose** | Update key name, destination, folder, or active status |
| **Body** | `{ id: string, name?: string, destination?: "agent" \| "drive", destinationFolder?: string \| null, isActive?: boolean }` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required (Clerk session) |
| **Errors** | 400 (missing key ID or invalid `destinationFolder`), 404 (key not found) |

### DELETE /agent-bucket/keys
Delete an agent API key

| Field | Description |
|-------|-------------|
| **Purpose** | Delete an agent API key |
| **Params** | `?id=xxx` |
| **Response** | `{ success: true }` |
| **Guards** | Auth required (Clerk session) |
| **Errors** | 400 (missing key ID), 404 (key not found) |

### POST /agent-bucket/files/upload
Upload a file via agent API

| Field | Description |
|-------|-------------|
| **Purpose** | Upload a file using Bearer token auth. Destination (Agent Storage or My Drive) is determined by the key's settings |
| **Body** | `multipart/form-data { file: File, filename?: string }` |
| **Response** | `{ success: true, key: string, fileName: string, size: number, destination: "agent" \| "drive" }` |
| **Guards** | Bearer token (`Authorization: Bearer b0ak_...`) |
| **Rate Limit** | 100 uploads/min |
| **Validation** | File size vs plan limit, storage quota check, filename sanitization |
| **Features** | Queued thumbnail generation for images/videos/PDFs, encryption (AES-128-GCM chunked), streaming upload |
| **Notes** | When `destination="drive"` and `destinationFolder` is set on the key, files are placed in that folder. `isAgentUpload` flag is set based on destination |
| **Errors** | 409 when the key already belongs to a file on the other surface (Drive vs Agent Storage); 400 if the key's stored `destinationFolder` is invalid |

### GET /agent-bucket/files/download
Download an agent file

| Field | Description |
|-------|-------------|
| **Purpose** | Download a file uploaded via agent API |
| **Params** | `?key=xxx` (relative key, e.g., `reports/data.csv`) |
| **Response** | Binary stream with `Content-Type`, `Content-Disposition: attachment`, `Content-Length` headers |
| **Guards** | Bearer token (`Authorization: Bearer b0ak_...`) |
| **Errors** | 400 (missing key), 404 (file not found or not an agent upload) |
| **Features** | Auto-decryption (supports all encryption modes: none, chunked_gcm, chunked_gcm_mp) |

### GET /agent-bucket/files
List agent files (Bearer auth)

| Field | Description |
|-------|-------------|
| **Purpose** | List files uploaded via agent API with pagination |
| **Params** | `?page=1&pageSize=50` (pageSize max 100) |
| **Response** | `{ files: [{ key, fileName, size, mimeType, isStarred, uploadedVia, createdAt, updatedAt }], pagination: { total, page, pageSize, hasMore } }` |
| **Guards** | Bearer token (`Authorization: Bearer b0ak_...`) |
| **Notes** | Only returns files with `isAgentUpload=true` |

### DELETE /agent-bucket/files
Delete an agent file (Bearer auth)

| Field | Description |
|-------|-------------|
| **Purpose** | Delete a file uploaded via agent API |
| **Params** | `?key=xxx` (relative key) |
| **Response** | `{ success: true }` |
| **Guards** | Bearer token (`Authorization: Bearer b0ak_...`) |
| **Errors** | 400 (missing key), 404 (file not found or not an agent upload) |
| **Effects** | Deletes from R2, removes DB record, decrements user storage quota and file count |

### GET /agent-bucket/files/list
List agent files (Dashboard / Clerk auth)

| Field | Description |
|-------|-------------|
| **Purpose** | List agent files for the dashboard UI |
| **Params** | `?page=1&pageSize=50` (pageSize max 100) |
| **Response** | `{ files: [{ key, fileName, size, mimeType, isStarred, uploadedVia, hasThumbnail, createdAt, updatedAt }], pagination: { total, page, pageSize, hasMore } }` |
| **Guards** | Auth required (Clerk session) |
| **Notes** | Same data as Bearer-auth list but includes `hasThumbnail` field. Used by the dashboard Agent Storage tab |

### POST /agent-bucket/files/folder
Create a folder via agent API

| Field | Description |
|-------|-------------|
| **Purpose** | Create a folder marker (0-byte object with trailing slash) |
| **Body** | `{ path: string }` (e.g., `"reports"` or `"reports/daily"`) |
| **Response** | `{ success: true, path: string }` |
| **Guards** | Bearer token (`Authorization: Bearer b0ak_...`) |
| **Validation** | Blocks path traversal (`..`, `//`), sanitizes special characters, rejects empty paths |

### POST /agent-bucket/files/move-to-drive
Move or copy an agent file to My Drive

| Field | Description |
|-------|-------------|
| **Purpose** | Move or copy a file from Agent Storage to My Drive |
| **Body** | `{ fileKey: string, mode: "move" \| "copy", folder?: string \| null }` |
| **Response** | `{ success: true, fileName: string, fileKey: string, mode: "move" \| "copy" }` |
| **Guards** | Auth required (Clerk session) |
| **Errors** | 400 (missing fileKey, invalid mode, or `folder` that is absolute or contains empty, `.` or `..` segments), 404 (agent file not found) |
| **Move behavior** | `folder=null`: instant boolean flip (`isAgentUpload` false), zero R2 operations. `folder` set: R2 CopyObject + delete old + DB update |
| **Copy behavior** | R2 CopyObject + new DB row + quota increment |
| **Notes** | Filename conflicts are resolved by appending a timestamp. Only operates on files with `isAgentUpload=true` |

---

### POST /agent-bucket/files/share
Create a public share/streaming link for a file

| Field | Description |
|-------|-------------|
| **Purpose** | Mint a public share link for a file (video, image, audio, any type). Returns a branded viewer-page URL and a direct streaming URL. |
| **Body** | `{ key: string, allowDownload?: boolean }` — `key` is the relative file key (e.g. `videos/clip.mp4`) |
| **Response** | `{ success: true, linkId: string, shareUrl: string, streamUrl: string }` |
| **Guards** | Bearer token auth (`Authorization: Bearer b0ak_...`) |
| **Errors** | 400 (missing/invalid key), 404 (file not found), 429 (rate limit) |
| **URLs** | `shareUrl` = `/s/{id}` viewer page (video player with seek). `streamUrl` = `/api/cloud/share/stream?id={id}`, server-proxied with HTTP range support — drops straight into a `<video>` tag. No R2 details are exposed. |
| **Notes** | Only operates on files with `isAgentUpload=true` (Agent Storage). Reuses an existing active link for the same file. Links are `accessType=anyone`, `allowAddToDrive=false`. Rate limit: 100/hour. |

---

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid request body or parameters |
| 401 | `UNAUTHORIZED` | Authentication required or session expired |
| 402 | `PAYMENT_REQUIRED` | Plan upgrade required (quota, file size, bucket limit) |
| 403 | `FORBIDDEN` | Permission denied |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource conflict (duplicate upload, existing member, already saved share link) |
| 410 | `GONE` | Resource expired (invitation) |
| 413 | `PAYLOAD_TOO_LARGE` | File exceeds size limit |
| 429 | `RATE_LIMIT` | Too many requests |
| 500 | `SERVER_ERROR` | Internal server error |

### Error Response Format
```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

## Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| File Upload | 100 | 1 minute |
| Share Links | 100 | 1 hour |
| Password Change | 3 | 1 hour |
| Feedback Submit | 5 | 1 hour |
| Contact Form | 5 | 1 hour (per IP) |

---

## Plan Limits

| Plan | Storage | Max File | Buckets | Teams | Members/Team | Features |
|------|---------|----------|---------|-------|--------------|----------|
| Free | 5 GB | 1 GB | 1 | 0 | - | Share links |
| Starter | 150 GB | 5 GB | 10 | 1 | 3 | Share links, Activity logs (30d) |
| Pro | 700 GB | 15 GB | 25 | 1 | 5 | Share links, Activity logs (90d), Chat, API |
| Scale | 2 TB | 15 GB | 100 | 2 | 10 | Share links, Activity logs (180d), Chat, API |

---

## Appendix

### Encryption Modes

Files are encrypted using AES-128-GCM. The `encryptionMode` field in database records indicates how to decrypt:

| Mode | Description | Decryption Method |
|------|-------------|-------------------|
| `none` | Not encrypted (archives, executables) | Stream directly |
| `chunked_gcm` | Chunked streaming encryption (8MB chunks) | `createDecryptStream` - chunk-by-chunk decryption |
| `chunked_gcm_mp` | Chunked encryption via multipart upload | Same as `chunked_gcm` |

**Skip-Encryption File Types:**
- Executables: `.exe`, `.msi`, `.apk`, `.dmg`, `.pkg`, `.deb`, `.rpm`, `.appimage`
- Archives: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz`
- Disk images: `.iso`, `.img`

### Team Permissions

Seven granular permissions control team member access:

| Permission | Description |
|------------|-------------|
| `canUpload` | Upload files to team storage |
| `canDownload` | Download/view team files |
| `canDelete` | Delete team files |
| `canShare` | Create/manage share links for team files |
| `canManageMembers` | Invite members, update permissions, remove members |
| `canViewActivity` | View team activity logs |
| `canChat` | Send/view team chat messages |

**Default Permissions (configurable via settings):**
- `canUpload`: true
- `canDownload`: true
- `canDelete`: false
- `canShare`: false

### Constants

| Constant | Value | Context |
|----------|-------|---------|
| `CHUNK_SIZE` | 8 MB | Upload chunk size for chunked uploads |
| `STREAMING_THRESHOLD` | 25 MB | Team uploads larger than this stream; smaller ones are buffered |
| `MAX_PART_NUMBER` | 10,000 | S3/R2 multipart upload limit |
| `MIN_PART_SIZE` | 5 MB | S3/R2 minimum for non-final parts |
| `CACHE_TTL_THUMBNAIL` | 1 year | Thumbnail cache duration |
| `INVITATION_EXPIRY` | 7 days | Team invitation validity |
| `MAX_RESEND_COUNT` | 3 | Max invitation email resends |
| `MAX_ROLES_PER_TEAM` | 10 | Custom roles limit |
| `SSE_ACTIVITY_INTERVAL` | 5 sec | Activity stream polling interval |
| `SSE_CHAT_INTERVAL` | 2 sec | Chat stream polling interval |
| `STALE_UPLOAD_THRESHOLD` | 60 min | Chunked upload cleanup threshold |

### Storage Paths

| Type | Path Pattern | Example |
|------|--------------|---------|
| Personal file | `users/{userId}/{filename}` | `users/user_abc123/photo.jpg` |
| Team file | `teams/{teamId}/{filename}` | `teams/team_xyz789/report.pdf` |
| Thumbnail (`THUMBNAILS` bucket) | `{scope}/{ownerId}/{fileId}/{version}.webp`, stored in the DB as `cf-thumbnail:{path}` | `personal/user_abc123/f1/0123456789abcdef.webp` |
| S3 API object | `s3/{userId}/{bucket}/{key}` | `s3/user_abc123/my-bucket/data.csv` |
| Agent file | `users/{userId}/{filename}` | `users/user_abc123/agent-report.pdf` (shared path with personal files, distinguished by `isAgentUpload` flag) |

### Share Link URLs

| Type | URL Pattern | Table |
|------|-------------|-------|
| Personal share | `/s/{linkId}` | `shareLinks` |
| Team share | `/ts/{linkId}` | `teamShareLinks` |

### Share Link Permissions

Share links have two permission flags that control viewer capabilities:

| Permission | Default | Description |
|------------|---------|-------------|
| `allowDownload` | `true` | Show Download button in toolbar. When `false`, browser download controls are also restricted (video/audio `controlsList`, image drag-to-save, context menus). |
| `allowAddToDrive` | `true` | Show "Save to Drive" button allowing viewers to copy the file to their personal storage. |

**Note:** PDF files retain full browser controls (zoom, page navigation) regardless of `allowDownload` setting, as selective control hiding is not supported by browser PDF viewers.

### Saved Share Link Tracking

When a user saves a shared file to their drive via "Save to Drive", the `cloudFiles` record includes:

| Field | Description |
|-------|-------------|
| `sourceShareLinkId` | The ID of the share link the file was saved from |
| `sourceShareType` | `"personal"` or `"team"` indicating share link type |

This prevents duplicate saves - if a user tries to save the same share link again, the API returns `409 Conflict` with `{ error: "Already saved" }`.
