/**
 * Type exports for Bucket0
 *
 * Organization:
 * - shared.ts: Common types used across cloud and S3
 * - cloud.ts: Internal R2 cloud storage types (with starring, thumbnails, encryption)
 * - s3.ts: External S3 bucket types (user-connected storage)
 * - teams.ts: Team file and member types
 */

// Shared types
export * from "./shared";

// Cloud storage types (R2)
export * from "./cloud";

// External S3 types
export * from "./s3";

// Team types
export * from "./teams";
