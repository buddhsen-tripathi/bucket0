/**
 * Shared types used across both Cloud (R2) and external S3 storage
 */

/** Base file object with common properties */
export interface BaseFileObject {
  key: string;
  size: number;
  lastModified: Date;
}

/** File filter options for UI */
export type FileFilter = "all" | "images" | "videos" | "documents" | "audio" | "archives" | "other";

/** View filter for dashboard sidebar navigation */
export type ViewFilter = "all" | "recent" | "starred";

/** Sort options */
export type SortField = "name" | "size" | "lastModified";
export type SortDirection = "asc" | "desc";

/** View mode options */
export type ViewMode = "list" | "grid" | "compact";
