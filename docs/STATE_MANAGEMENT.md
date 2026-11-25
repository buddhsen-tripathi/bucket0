# State Management Documentation

> **Source documentation** for understanding state management patterns, data flows, and component interactions in the Bucket0 web application.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Global State Providers](#2-global-state-providers)
3. [Custom Hooks (Core State Layer)](#3-custom-hooks-core-state-layer)
4. [Singleton Services](#4-singleton-services)
5. [Component State Patterns](#5-component-state-patterns)
6. [Caching Strategies](#6-caching-strategies)
7. [State Update Patterns](#7-state-update-patterns)
8. [Action Flows](#8-action-flows)
9. [State Sharing Patterns](#9-state-sharing-patterns)
10. [localStorage Keys Reference](#10-localstorage-keys-reference)
11. [Best Practices](#11-best-practices)

---

## 1. Architecture Overview

### Design Philosophy

Bucket0 uses a **custom hooks-based state management architecture** with **NO external state management libraries** (no Redux, Zustand, Jotai, React Query, etc.). All state is managed through React's built-in primitives.

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| No external state library | Reduced bundle size, simpler debugging |
| Custom hooks for feature isolation | Clean separation of concerns |
| Module-level caching | Simple, effective for single-user scenarios |
| `globalThis` for singletons | Survives HMR in development |
| localStorage for preferences | SSR-safe, encrypted for sensitive data |
| Pessimistic updates by default | Reliable, error-resistant |

### State Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT PROVIDERS                            │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  ThemeProvider   │  │  ToastProvider   │                    │
│  │  (theme state)   │  │  (notifications) │                    │
│  └──────────────────┘  └──────────────────┘                    │
├─────────────────────────────────────────────────────────────────┤
│                    CUSTOM HOOKS LAYER                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │useDashboardState│  │useBucketManage- │  │useFileOperations│ │
│  │  (UI state)     │  │    ment         │  │  (file data)    │ │
│  └─────────────────┘  │ (S3 buckets)    │  └─────────────────┘ │
│                       └─────────────────┘                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ useUploadState  │  │ useDeleteState  │  │useTeamUploadSta-│ │
│  │ (upload flow)   │  │ (delete flow)   │  │     te          │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │usePaginatedFiles│  │ useLocalStorage │                      │
│  │(cloud pagination)│  │ (persistence)   │                      │
│  └─────────────────┘  └─────────────────┘                      │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  usePdfTool     │  │  useImageTool   │                      │
│  │ (PDF tools)     │  │ (image tools)   │                      │
│  └─────────────────┘  └─────────────────┘                      │
├─────────────────────────────────────────────────────────────────┤
│                    SINGLETON SERVICES                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │chunkedUploadTrack│  │    s3Service     │  │  cloudClient  │ │
│  │       er         │  │ (S3 client)      │  │ (upload API)  │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    COMPONENT STATE                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ FileList, TeamFiles, Dashboard - Local useState/useRef   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Global State Providers

### 2.1 Theme Provider

**File:** `components/ThemeProvider.tsx`

| Property | Details |
|----------|---------|
| **Purpose** | Theme switching (light/dark/system) |
| **Scope** | App-wide via `<ThemeProvider>` wrapper |
| **Persistence** | localStorage (`theme` key) |
| **Access** | `useTheme()` hook |

**State Variables:**

```typescript
interface ThemeState {
  theme: "light" | "dark" | "system";
  resolvedTheme: "light" | "dark";
  mounted: boolean;  // Hydration safety flag
}
```

**Update Flow:**

```
User clicks theme toggle
        ↓
setTheme("dark")
        ↓
localStorage.setItem("theme", "dark")
        ↓
document.documentElement.className updated
        ↓
matchMedia listener syncs with OS preference (if "system")
```

---

### 2.2 Toast Provider

**File:** `components/ui/toast.tsx`

| Property | Details |
|----------|---------|
| **Purpose** | Global toast notification system |
| **Scope** | App-wide via `<Toaster>` wrapper |
| **Access** | `useToast()` hook |

**State Variables:**

```typescript
interface ToastState {
  toasts: Toast[];  // Max 5 toasts
  counterRef: number;  // Auto-incrementing ID
}

interface Toast {
  id: number;
  message: string;
  variant: "default" | "success" | "error" | "warning";
}
```

**Behavior:**
- Maximum 5 toasts visible at once (FIFO queue)
- Auto-dismiss after 4 seconds
- New toast removes oldest if at capacity

**Usage:**

```typescript
const { toast } = useToast();
toast("File uploaded successfully", "success");
toast("Upload failed", "error");
```

---

## 3. Custom Hooks (Core State Layer)

### 3.1 useLocalStorage

**File:** `hooks/useLocalStorage.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Sync React state with localStorage |
| **SSR Safety** | Checks `typeof window !== "undefined"` |
| **Error Handling** | Catches JSON parse/stringify failures |

**Signature:**

```typescript
function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void]
```

**Used By:**
- `useDashboardState` (mode persistence)
- `useBucketManagement` (active bucket ID)
- Various components (view preferences)

---

### 3.2 useDashboardState

**File:** `hooks/useDashboardState.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Core dashboard UI state management |
| **Persistence** | Dashboard mode persisted to localStorage |
| **Reset Behavior** | Clears UI state when mode changes |

**State Variables:**

```typescript
interface DashboardState {
  // Mode (persisted)
  mode: "cloud" | "dev" | "profile" | "teams";

  // View filters
  viewFilter: "all" | "recent" | "starred";

  // Navigation
  currentPath: string;

  // Modals
  showSettings: boolean;
  showManageBuckets: boolean;
  editBucketId: string | null;
  showStoragePreference: boolean;
  showCreateFolder: boolean;

  // File modals
  previewFile: FileObject | null;
  shareFile: FileObject | null;
}
```

**State Flow Diagram:**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Cloud      │ ←─→ │     Dev      │ ←─→ │   Profile    │
│   Mode       │     │    Mode      │     │    Mode      │
└──────────────┘     └──────────────┘     └──────────────┘
       ↓                    ↓                    ↓
  Cloud Files          S3 Files            User Settings
  Drive View           Bucket View         Account View
```

---

### 3.3 useBucketManagement

**File:** `hooks/useBucketManagement.ts`

| Property | Details |
|----------|---------|
| **Purpose** | S3 bucket configuration CRUD |
| **Storage Modes** | Cloud (server) or Local (encrypted localStorage) |
| **Credential Security** | AES-256-GCM encryption for local storage |

**State Variables:**

```typescript
interface BucketManagementState {
  // Bucket list (merged from cloud + local)
  buckets: Bucket[];

  // Active bucket
  activeBucketId: string | null;  // Persisted to localStorage
  config: S3Config | null;

  // Loading states
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
}
```

**Dual Storage Mode Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Buckets                             │
│  ┌────────────────────┐    ┌────────────────────┐          │
│  │  Cloud Storage     │    │  Local Storage     │          │
│  │  (/api/s3/config)  │    │  (localStorage)    │          │
│  └─────────┬──────────┘    └─────────┬──────────┘          │
│            │                         │                      │
│            └──────────┬──────────────┘                      │
│                       ↓                                     │
│              Merge (cloud takes precedence)                 │
│                       ↓                                     │
│              Set buckets state                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Operations:**

| Operation | API Call | State Update |
|-----------|----------|--------------|
| Load buckets | `GET /api/s3/config` | Sets `buckets` array |
| Add bucket | `POST /api/s3/config` | Appends to `buckets` |
| Update bucket | `PUT /api/s3/config/[id]` | Updates bucket in list |
| Delete bucket | `DELETE /api/s3/config/[id]` | Removes from list |
| Activate bucket | None (local) | Sets `activeBucketId`, configures `s3Service` |

---

### 3.4 usePaginatedFiles

**File:** `hooks/usePaginatedFiles.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Server-side paginated file listing |
| **Buffer Size** | Fetches 100 files per API call |
| **Progressive Loading** | Auto-fetches next page on scroll |

**State Variables:**

```typescript
interface PaginatedFilesState {
  allFiles: CloudFileObject[];  // Buffered files

  // Pagination
  currentPage: number;
  pageSize: 10 | 25 | 50;
  paginationInfo: PaginationInfo | null;

  // Loading
  loading: boolean;
  loadingMore: boolean;

  // Usage stats
  usageStats: {
    used: number;
    limit: number;
    plan: string;
  } | null;
}
```

**Ref-based Tracking:**

```typescript
// Prevents duplicate fetches
const fetchedOffset = useRef(0);
const isFetching = useRef(false);
```

**Pagination Flow:**

```
Initial Load
    ↓
Fetch page 1 (100 files)
    ↓
User scrolls / clicks "Load More"
    ↓
Check: isFetching.current === false?
    ↓ Yes
Set isFetching.current = true
    ↓
Fetch next 100 files
    ↓
Append to allFiles
    ↓
Update fetchedOffset
    ↓
Set isFetching.current = false
```

---

### 3.5 useFileOperations

**File:** `hooks/useFileOperations.ts`

| Property | Details |
|----------|---------|
| **Purpose** | File operations for cloud and dev modes |
| **Caching** | In-memory cache per bucket (5-min TTL) |
| **Race Condition Prevention** | Verifies config during async ops |

**State Variables:**

```typescript
interface FileOperationsState {
  // Dev mode files
  devFiles: S3FileObject[] | null;
  devLoading: boolean;
  connected: boolean;
  error: string | null;

  // Dev mode pagination
  devCurrentPage: number;
  devPageSize: PageSize;
}
```

**Cache Structure:**

```typescript
const devFilesCacheRef = useRef<DevFilesCache>({});

interface DevFilesCache {
  [bucketKey: string]: {
    files: S3FileObject[];
    timestamp: number;  // For TTL check
  };
}

// Cache key format
const cacheKey = `${bucketName}-${region}-${endpoint}`;
```

**Mode-Aware Loading:**

```
loadFiles(forceRefresh)
        ↓
    mode === "cloud"?
   /              \
  Yes              No
   ↓                ↓
loadCloudFiles()  loadDevFiles()
   ↓                ↓
Returns cloud     Checks cache (5-min TTL)
files from          ↓
usePaginatedFiles  Cache valid?
                  /         \
                Yes          No
                 ↓            ↓
           Return cache   Fetch from S3
                              ↓
                         Update cache
```

---

### 3.6 useUploadState

**File:** `hooks/useUploadState.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Personal file upload lifecycle |
| **Duplicate Detection** | Checks existing filenames before upload |
| **Folder Support** | Preserves `webkitRelativePath` |
| **Retry Support** | Keeps original `File` reference |

**State Variables:**

```typescript
interface UploadState {
  uploading: boolean;
  uploadItems: UploadItem[];
  duplicateFiles: DuplicateFileItem[];  // For rename modal
  pendingUploads: {
    files: File[];
    onProgress: ProgressCallback;
  } | null;
}

interface UploadItem {
  id: string;
  name: string;
  progress: number;  // 0-100
  status: "uploading" | "success" | "error";
  error?: string;
  file?: File;  // Kept for retry
}
```

**Upload Flow:**

```
handleUpload(files)
        ↓
Check for duplicates against existing files
        ↓
    Duplicates found?
   /              \
  Yes              No
   ↓                ↓
Show rename modal  Continue
   ↓                ↓
User chooses    Create UploadItems
rename/skip         ↓
   ↓            Upload sequentially
Continue        (cloudClient.uploadFile)
                    ↓
              Update progress in state
                    ↓
              Success/Error status
                    ↓
              onUploadComplete callback
```

---

### 3.7 useTeamUploadState

**File:** `hooks/useTeamUploadState.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Team file uploads with XHR progress |
| **Cancellation** | `AbortController` per upload |
| **Activity Logging** | Batch logging after completion |

**State Variables:**

```typescript
interface TeamUploadState {
  uploading: boolean;
  uploadItems: UploadItem[];
}

// Ref for cancellation
const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
```

**Why XHR instead of Fetch:**

XHR provides `upload.onprogress` events for granular progress tracking:

```typescript
xhr.upload.onprogress = (event) => {
  if (event.lengthComputable) {
    const progress = (event.loaded / event.total) * 100;
    setUploadItems(prev =>
      prev.map(item =>
        item.id === uploadId ? { ...item, progress } : item
      )
    );
  }
};
```

**Batch Activity Logging:**

```
All uploads complete
        ↓
Collect successful uploads: { name, size }[]
        ↓
POST /api/teams/{teamId}/activity/batch
{
  fileNames: ["folder/file1.txt", "folder/file2.txt"],
  totalSize: 12345
}
        ↓
Server creates single activity entry:
"Uploaded folder/ (2 files)"
```

---

### 3.8 useDeleteState

**File:** `hooks/useDeleteState.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Delete operations with undo window |
| **Undo Window** | 5-second delay before actual deletion |
| **Bulk Support** | Confirmation modal for multi-file deletes |

**State Variables:**

```typescript
interface DeleteState {
  deletingItems: Set<string>;  // Optimistic state
  pendingDeletes: DeleteItem[];  // In undo window
  bulkDeleteKeys: string[];  // Confirmation modal
}

interface DeleteItem {
  key: string;
  name: string;
}
```

**Undo Window Flow:**

The 5-second undo timer is managed by the consuming component, not by this hook.
The hook provides `pendingDeletes`, `executeDelete`, and `undoDelete` — the component
is responsible for starting the countdown and calling `executeDelete` when it expires.

```
handleDeleteClick(file)
        ↓
Add to pendingDeletes
        ↓
Component starts 5-second timer
        ↓
    User clicks Undo?
   /              \
  Yes              No
   ↓                ↓
undoDelete()      Timer expires
(clears              ↓
 pendingDeletes)  executeDelete()
   ↓                ↓
UI restored     Mark items as deleting
                    ↓
                API call per key
                    ↓
                Clear state + callback
```

---

### 3.9 usePdfTool

**File:** `hooks/usePdfTool.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Shared state for browser-based PDF tools |
| **Scope** | Per-tool instance (each PDF tool page) |
| **File Handling** | Single or multiple file input, reordering, removal |

**Signature:**

```typescript
function usePdfTool(options?: {
  accept?: string;
  multiple?: boolean;
}): UsePdfToolReturn
```

**State Variables:**

```typescript
interface PdfToolState {
  files: File[];              // Input PDF files
  result: Blob | null;        // Processed output blob
  resultFilename: string;     // Output filename (default "output.pdf")
  isProcessing: boolean;      // Processing in progress
  error: string | null;       // Error message
}
```

**Returned Functions:**

| Function | Purpose |
|----------|---------|
| `setFiles(files)` | Replace file list (clears result and error) |
| `addFiles(newFiles)` | Append files (multi-mode) or replace (single-mode) |
| `removeFile(index)` | Remove file at index (clears result) |
| `reorderFiles(from, to)` | Move file between positions (clears result) |
| `setResult(blob, filename?)` | Set processed output blob and optional filename |
| `setIsProcessing(v)` | Toggle processing state |
| `setError(err)` | Set or clear error message |
| `reset()` | Clear all state to initial values |
| `download()` | Create temporary URL and trigger browser download of result |

**Usage:**

```typescript
const { files, addFiles, result, setResult, isProcessing, setIsProcessing, error, setError, download } = usePdfTool({ multiple: true });

// Tool page adds files, runs client-side processing, then downloads
addFiles(selectedFiles);
setIsProcessing(true);
try {
  const output = await mergePdfs(files);
  setResult(output, "merged.pdf");
} catch (err) {
  setError(err.message);
} finally {
  setIsProcessing(false);
}
download();
```

---

### 3.10 useImageTool

**File:** `hooks/useImageTool.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Shared state for browser-based image tools |
| **Scope** | Per-tool instance (each image tool page) |
| **Image Loading** | Auto-creates object URL and `HTMLImageElement` when file changes |
| **Cleanup** | Revokes previous object URLs to prevent memory leaks |

**Signature:**

```typescript
function useImageTool(): UseImageToolReturn
```

**State Variables:**

```typescript
interface ImageToolState {
  file: File | null;               // Input image file
  imageUrl: string | null;         // Object URL for preview
  imageEl: HTMLImageElement | null; // Loaded image element (for canvas ops)
  result: Blob | null;             // Processed output blob
  resultFilename: string;          // Output filename (default "output.png")
  isProcessing: boolean;           // Processing in progress
  error: string | null;            // Error message
}
```

**Returned Functions:**

| Function | Purpose |
|----------|---------|
| `setFile(file)` | Set input file (clears result and error; triggers image load) |
| `setResult(blob, filename?)` | Set processed output blob and optional filename |
| `setIsProcessing(v)` | Toggle processing state |
| `setError(err)` | Set or clear error message |
| `reset()` | Clear all state to initial values |
| `download()` | Create temporary URL and trigger browser download of result |

**Image Load Side Effect:**

```
setFile(file)
        ↓
Revoke previous object URL
        ↓
Create new object URL → imageUrl
        ↓
Create new Image() element
        ↓
    img.onload?
   /          \
  Yes          No
   ↓            ↓
imageEl set   setError("Failed to load image.")
```

**Usage:**

```typescript
const { file, setFile, imageEl, result, setResult, isProcessing, setIsProcessing, error, setError, download } = useImageTool();

// Tool page sets file, uses imageEl for canvas processing, then downloads
setFile(selectedFile);
// After imageEl is available:
setIsProcessing(true);
try {
  const output = await resizeImage(imageEl, { width: 800 });
  setResult(output, "resized.png");
} catch (err) {
  setError(err.message);
} finally {
  setIsProcessing(false);
}
download();
```

---

## 4. Singleton Services

### 4.1 chunkedUploadTracker

**File:** `lib/cloud/chunked-upload-tracker.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Track active chunked uploads (server-side) |
| **Scope** | Global singleton |
| **HMR Persistence** | Uses `globalThis` pattern |

**State:**

```typescript
class ChunkedUploadTracker {
  private activeUploads: Map<string, ChunkedUploadInfo>;
  private activeFileKeys: Map<string, string>;  // Conflict detection
}
```

**HMR-Safe Singleton Pattern:**

```typescript
const globalForTracker = globalThis as unknown as {
  chunkedUploadTracker: ChunkedUploadTracker | undefined;
};

export const chunkedUploadTracker =
  globalForTracker.chunkedUploadTracker ?? new ChunkedUploadTracker();

if (process.env.NODE_ENV !== "production") {
  globalForTracker.chunkedUploadTracker = chunkedUploadTracker;
}
```

**Key Operations:**

| Method | Purpose |
|--------|---------|
| `tryAcquireFileSlot(key)` | Atomic slot reservation |
| `upgradeFileSlot(key, uploadId)` | Associate with R2 upload ID |
| `releaseFileSlot(key)` | Free slot on completion/abort |
| `getStats()` | Get active upload statistics |
| `cleanupStaleUploads()` | Roll back >1 hour old uploads |

---

### 4.2 s3Service

**File:** `lib/s3/s3-service.ts`

| Property | Details |
|----------|---------|
| **Purpose** | S3 client wrapper for dev mode |
| **Configuration** | Set by `useBucketManagement` |

**State:**

```typescript
class S3Service {
  private config: S3Config | null = null;

  setConfig(config: S3Config) {
    this.config = config;
    this.client = this.createClient(config);
  }
}
```

---

### 4.3 cloudClient

**File:** `lib/cloud/cloud-client.ts`

| Property | Details |
|----------|---------|
| **Purpose** | Client-side cloud storage API |
| **Auto-Chunking** | Files >8MB use chunked upload |
| **Cancellation** | `AbortController` support |

**State:**

```typescript
class CloudClient {
  private activeUploads: Map<string, AbortController>;
  private activeChunkedUploads: Map<string, ChunkedUploadState>;
}
```

**Upload Decision Flow:**

```
uploadFile(file, options)
        ↓
    file.size > 8MB?
   /              \
  Yes              No
   ↓                ↓
Chunked upload    Simple upload
(multipart S3)    (single request)
```

---

## 5. Component State Patterns

### 5.1 FileList Component

**File:** `components/dashboard/shared/FileList.tsx`

**Local State:**

```typescript
// Search & Filter
const [searchQuery, setSearchQuery] = useState("");
const [fileFilter, setFileFilter] = useState<"all" | "images" | "videos" | "documents" | "archives">("all");

// View
const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
const [sortField, setSortField] = useState<SortField>("name");
const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

// Selection
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

// Thumbnails
const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});

// Optimistic updates
const [optimisticStarred, setOptimisticStarred] = useState<Map<string, boolean>>(new Map());
```

**Optimistic Star Update:**

```typescript
const handleStar = async (key: string, starred: boolean) => {
  // 1. Optimistic update
  setOptimisticStarred(prev => new Map(prev).set(key, starred));

  try {
    // 2. API call
    await fetch(`/api/cloud/star/${encodeURIComponent(key)}`, {
      method: starred ? "POST" : "DELETE"
    });

    // 3. Success: clear optimistic state
    setOptimisticStarred(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  } catch (error) {
    // 4. Error: revert optimistic update
    setOptimisticStarred(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    toast("Failed to update star", "error");
  }
};
```

---

### 5.2 TeamFiles Component

**File:** `components/dashboard/teams/TeamFiles.tsx`

**Module-Level Cache:**

```typescript
interface TeamFilesCache {
  files: TeamFile[];
  usage: number;
  fileCount: number;
  storageLimit: number;
  availableStorage: number;
  timestamp: number;
}

const teamFilesCache: Record<string, TeamFilesCache> = {};
const TEAM_FILES_CACHE_TTL = 2 * 60 * 1000;  // 2 minutes

// Cache invalidation (exported for external use)
export function invalidateTeamFilesCache(teamId: string) {
  delete teamFilesCache[teamId];
}
```

**Local State:**

```typescript
// Data
const [files, setFiles] = useState<TeamFile[]>([]);
const [usage, setUsage] = useState(0);
const [fileCount, setFileCount] = useState(0);
const [storageLimit, setStorageLimit] = useState(0);

// Loading
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

// Delete state
const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
const [pendingDelete, setPendingDelete] = useState<DeleteItem[]>([]);

// Modals & Navigation
const [previewFile, setPreviewFile] = useState<TeamFile | null>(null);
const [shareFile, setShareFile] = useState<TeamFile | null>(null);
const [currentPath, setCurrentPath] = useState("");
```

---

### 5.3 Dashboard Component

**File:** `app/dashboard/page.tsx`

**Composition Pattern:**

```typescript
export default function Dashboard() {
  // Compose multiple hooks
  const dashboardState = useDashboardState();
  const bucketOps = useBucketManagement(storagePreference);
  const fileOps = useFileOperations(dashboardState.mode, bucketOps.config);
  const uploadOps = useUploadState(/* deps */);
  const deleteOps = useDeleteState(/* deps */);

  // Local UI state
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarTeams, setSidebarTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);

  // DOM refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Side effects
  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (bucketOps.config) {
      fileOps.testConnection();
    }
  }, [bucketOps.config]);
}
```

---

## 6. Caching Strategies

### 6.1 In-Memory Caching

| Cache | Location | Key Format | TTL |
|-------|----------|------------|-----|
| Dev files | `useFileOperations` | `{bucket}-{region}-{endpoint}` | 5 minutes |
| Team files | `TeamFiles.tsx` | `{teamId}` | 2 minutes |
| Chunked uploads | `chunkedUploadTracker` | `{uploadId}` | N/A (cleaned after 1 hour) |

### 6.2 localStorage Caching

| Key | Purpose | Encryption |
|-----|---------|------------|
| `theme` | Theme preference | No |
| `bucket0-active-mode` | Dashboard mode | No |
| `bucket0-active-bucket` | Active S3 bucket ID | No |
| `bucket0-storage-preference` | Storage mode (cloud/local) | No |
| `bucket0-recent-files` | Recent file history (max 10) | No |
| `bucket0-buckets-encrypted` | S3 credentials (local mode) | AES-256-GCM |

### 6.3 Cache Invalidation Patterns

**Explicit Invalidation:**

```typescript
// After file operations
invalidateTeamFilesCache(teamId);
fetchFiles(true);  // Force refresh
```

**TTL-Based:**

```typescript
const isCacheValid = (cache: CacheEntry) => {
  return Date.now() - cache.timestamp < CACHE_TTL;
};
```

**Event-Based:**

```typescript
// After successful upload
onUploadComplete();  // Triggers refresh
```

---

## 7. State Update Patterns

### 7.1 Optimistic Updates

**Used For:** Star/unstar operations only

```typescript
// Pattern
const [optimisticState, setOptimisticState] = useState<Map<string, boolean>>(new Map());

// 1. Apply optimistic update
setOptimisticState(prev => new Map(prev).set(key, newValue));

// 2. Make API call
try {
  await apiCall();
  // 3a. Success: clear optimistic state (server is now source of truth)
  setOptimisticState(prev => { const next = new Map(prev); next.delete(key); return next; });
} catch {
  // 3b. Error: also clear (reverts to server state)
  setOptimisticState(prev => { const next = new Map(prev); next.delete(key); return next; });
}
```

### 7.2 Pessimistic Updates (Default)

**Used For:** Most operations (uploads, deletes, bucket CRUD)

```typescript
// Pattern
setLoading(true);
try {
  const result = await apiCall();
  setState(result);  // Update only after success
} catch (error) {
  setError(error.message);
} finally {
  setLoading(false);
}
```

### 7.3 Atomic State Updates

**Prevents Race Conditions:**

```typescript
// GOOD: Functional update
setUploadItems(prev => [...prev, newItem]);

// GOOD: Using Set operations
setDeletingItems(prev => new Set([...prev, key]));

// GOOD: Map operations
setOptimisticStarred(prev => new Map(prev).set(key, value));
```

### 7.4 Server-Side Atomic Updates

```typescript
// SQL-based atomic quota reservation
const result = await db.update(users)
  .set({
    storageUsage: sql`${users.storageUsage} + ${size}`
  })
  .where(
    sql`${users.id} = ${userId} AND
        (${users.storageUsage} + ${size}) <= ${maxStorageBytes}`
  )
  .returning();

// If result.length === 0, quota would be exceeded
```

---

## 8. Action Flows

### 8.1 File Upload Flow (Personal)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User selects files                                           │
│    ↓                                                            │
│ 2. handleUpload(files) in useUploadState                        │
│    ↓                                                            │
│ 3. Check for duplicates against existing files                  │
│    ├── Duplicates found → Show rename modal                     │
│    └── No duplicates → Continue                                 │
│    ↓                                                            │
│ 4. Create UploadItem for each file                              │
│    { id, name, progress: 0, status: "uploading" }               │
│    ↓                                                            │
│ 5. For each file (sequential):                                  │
│    ├── cloudClient.uploadFile(file, onProgress)                 │
│    │   ├── file.size > 8MB? → Chunked upload                    │
│    │   └── file.size ≤ 8MB? → Simple upload                     │
│    ├── Update progress in uploadItems state                     │
│    └── Set status: "success" or "error"                         │
│    ↓                                                            │
│ 6. onUploadComplete() callback                                  │
│    ├── Refresh file list                                        │
│    └── Show toast notification                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 File Upload Flow (Team)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User selects files/folder                                    │
│    ↓                                                            │
│ 2. handleUpload(files) in useTeamUploadState                    │
│    ↓                                                            │
│ 3. For each file:                                               │
│    ├── Get relative path (webkitRelativePath || file.name)      │
│    └── Combine with currentPath                                 │
│    ↓                                                            │
│ 4. Create UploadItems with XHR (for progress tracking)          │
│    ↓                                                            │
│ 5. Sequential uploads to /api/teams/{teamId}/files/upload       │
│    ├── Store AbortController for cancellation                   │
│    ├── XHR.upload.onprogress → Update state                     │
│    └── Track successful uploads                                 │
│    ↓                                                            │
│ 6. After all uploads complete:                                  │
│    ├── POST /api/teams/{teamId}/activity/batch                  │
│    │   { fileNames, totalSize }                                 │
│    └── onUploadComplete() → Refresh + invalidate cache          │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 File Delete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. handleDeleteClick(file)                                      │
│    ↓                                                            │
│ 2. Add to pendingDeletes (undo window)                          │
│    ↓                                                            │
│ 3. Add key to deletingItems (optimistic UI)                     │
│    ↓                                                            │
│ 4. Start 5-second timer                                         │
│    ↓                                                            │
│ 5. User can click "Undo" during window                          │
│    ├── Undo clicked → Remove from pendingDeletes, deletingItems │
│    └── Timer expires → Continue                                 │
│    ↓                                                            │
│ 6. Execute deletion                                             │
│    ├── DELETE /api/cloud/delete/{key}                           │
│    └── If folder: Remove all files with matching prefix         │
│    ↓                                                            │
│ 7. Update state                                                 │
│    ├── Remove from files array                                  │
│    ├── Remove from deletingItems                                │
│    └── Invalidate cache (for teams)                             │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Bucket Switch Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User clicks on bucket in sidebar                             │
│    ↓                                                            │
│ 2. setActiveBucketId(id) in useBucketManagement                 │
│    ↓                                                            │
│ 3. Save to localStorage                                         │
│    ↓                                                            │
│ 4. Load bucket credentials                                      │
│    ├── Cloud mode: GET /api/s3/config/{id}                      │
│    └── Local mode: Decrypt from localStorage                    │
│    ↓                                                            │
│ 5. Configure s3Service singleton                                │
│    s3Service.setConfig(decryptedConfig)                         │
│    ↓                                                            │
│ 6. Trigger useEffect in Dashboard                               │
│    ↓                                                            │
│ 7. Test connection + Load files                                 │
│    ├── Check cache (5-min TTL)                                  │
│    ├── Cache valid → Return cached files                        │
│    └── Cache miss → Fetch from S3                               │
└─────────────────────────────────────────────────────────────────┘
```

### 8.5 Team Activity Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. TeamActivity component mounts                                │
│    ↓                                                            │
│ 2. GET /api/teams/{teamId}/activity                             │
│    ↓                                                            │
│ 3. Server fetches activities from activityLogs table            │
│    ↓                                                            │
│ 4. Enrich with user info from Clerk                             │
│    ├── Collect unique userIds                                   │
│    ├── Batch fetch from Clerk: getUserList({ userId: [...] })   │
│    └── Map userId → { name, email, imageUrl }                   │
│    ↓                                                            │
│ 5. Return enriched activities                                   │
│    ↓                                                            │
│ 6. Render with user avatars and names                           │
│    "John Doe uploaded report.pdf"                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. State Sharing Patterns

### 9.1 Prop Drilling (Primary Pattern)

**Max Depth:** 3 levels

```
Dashboard
    ↓ props
FileList
    ↓ props
FileListTable / FileGridItem
```

**Mitigation:** Composition of focused hooks reduces prop complexity

### 9.2 Callback Props

Child components receive callbacks to trigger parent state updates:

```typescript
<FileList
  files={files}
  onDelete={deleteOps.handleDeleteClick}
  onUploadFiles={() => fileInputRef.current?.click()}
  onRefresh={() => fileOps.loadFiles(true)}
  onNavigate={setCurrentPath}
  onPreview={setPreviewFile}
  onShare={setShareFile}
/>
```

### 9.3 Refs for Non-Reactive State

| Ref | Purpose |
|-----|---------|
| `fileInputRef`, `folderInputRef` | DOM element access |
| `abortControllersRef` | Upload cancellation |
| `fetchedOffset`, `isFetching` | Pagination tracking |
| `cloudConnectedRef` | Connection state |
| `currentConfigRef` | Config validation |

---

## 10. localStorage Keys Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `theme` | `"light" \| "dark" \| "system"` | `"system"` | Theme preference |
| `bucket0-active-mode` | `"cloud" \| "dev" \| "profile" \| "teams"` | `"cloud"` | Dashboard mode |
| `bucket0-active-bucket` | `string \| null` | `null` | Active S3 bucket ID |
| `bucket0-storage-preference` | `"cloud" \| "local"` | `"cloud"` | Credential storage mode |
| `bucket0-recent-files` | `string[]` | `[]` | Recently accessed files (max 10) |
| `bucket0-buckets-encrypted` | `string` (encrypted JSON) | N/A | Encrypted bucket credentials |

---

## 11. Best Practices

### 11.1 State Updates

```typescript
// DO: Functional updates for arrays/objects
setItems(prev => [...prev, newItem]);

// DON'T: Direct mutation
items.push(newItem);
setItems(items);

// DO: Use refs for non-reactive values
const isFetching = useRef(false);

// DON'T: useState for values that don't need re-render
const [isFetching, setIsFetching] = useState(false);
```

### 11.2 Cache Invalidation

```typescript
// DO: Invalidate after mutations
await deleteFile(key);
invalidateTeamFilesCache(teamId);
fetchFiles(true);

// DON'T: Rely on automatic refresh
await deleteFile(key);
// Hope the UI updates...
```

### 11.3 Error Handling

```typescript
// DO: Handle errors at each level
try {
  const result = await apiCall();
  updateState(result);
} catch (error) {
  setError(error.message);
  toast("Operation failed", "error");
}

// DON'T: Let errors propagate silently
await apiCall();  // Hope it works...
```

### 11.4 Loading States

```typescript
// DO: Show loading states
const [loading, setLoading] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);

// DON'T: Leave UI unresponsive during operations
```

### 11.5 Optimistic Updates

```typescript
// DO: Use optimistic updates for instant feedback
// (only for reversible, low-risk operations)
setOptimisticState(prev => new Map(prev).set(key, newValue));

// DO: Revert on error
catch {
  setOptimisticState(prev => { prev.delete(key); return new Map(prev); });
}

// DON'T: Use optimistic updates for critical operations
// (like file deletion - use undo window instead)
```

---

## Summary

This application demonstrates a **mature custom state management architecture** that prioritizes:

| Principle | Implementation |
|-----------|----------------|
| **Simplicity** | No complex state libraries |
| **Performance** | Caching, refs, memoization |
| **Reliability** | Pessimistic updates, error recovery |
| **Security** | Encrypted local storage for credentials |
| **Developer Experience** | Well-organized hooks, TypeScript, HMR-safe singletons |

The state is managed through a **composition of 10 focused custom hooks** that handle specific concerns (files, uploads, deletes, buckets, PDF tools, image tools), orchestrated by a main Dashboard component or individual tool pages. This pattern scales well for this application's complexity and avoids the overhead of global state management libraries.
