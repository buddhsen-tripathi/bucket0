/**
 * Rate limiting through durable per-actor counters (RATE_LIMITS Durable Object).
 */

import { createHash } from "node:crypto";
import { requestContext } from "@/server/context";

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Optional custom key generator
   */
  keyGenerator?: (identifier: string) => string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

function isRateLimitBinding(value: unknown): value is Env["RATE_LIMITS"] {
  return typeof value === "object" && value !== null && "getByName" in value && typeof value.getByName === "function";
}

/**
 * Check rate limit for a given identifier
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = config.keyGenerator
    ? config.keyGenerator(identifier)
    : identifier;

  const namespace = requestContext.getStore()?.env.RATE_LIMITS;
  if (!isRateLimitBinding(namespace)) throw new Error("RATE_LIMITS binding is missing");
  const name = createHash("sha256").update(key).digest("hex");
  return namespace.getByName(name).consume(config.maxRequests, config.windowMs);
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const RateLimiters = {
  /**
   * Password change: 3 requests per hour
   */
  passwordChange: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyGenerator: (id) => `password-change:${id}`,
    }),

  /**
   * File upload: 600 requests per minute (~10/s) - generous backstop for
   * bulk folder uploads; actual concurrency is throttled client-side.
   */
  fileUpload: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 600,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (id) => `file-upload:${id}`,
    }),

  /**
   * Chunked (large-file) upload init: 300 per minute - separate bucket so
   * large-file batches don't exhaust the small-file upload budget.
   */
  chunkedUploadInit: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 300,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (id) => `chunked-upload-init:${id}`,
    }),

  /**
   * Checkout: 5 requests per minute
   */
  checkout: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 5,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (id) => `checkout:${id}`,
    }),

  /**
   * API calls: 1000 requests per minute
   */
  api: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 1000,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (id) => `api:${id}`,
    }),

  /**
   * Share link creation: 500 per hour
   */
  shareLink: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 500,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyGenerator: (id) => `share-link:${id}`,
    }),

  /**
   * S3 connection test: 15 per minute
   */
  s3Test: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 15,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (id) => `s3-test:${id}`,
    }),

  /**
   * Feedback submission: 5 per hour per user
   */
  feedback: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyGenerator: (id) => `feedback:${id}`,
    }),

  /**
   * Contact form: 5 per hour per IP
   */
  contact: (ip: string) =>
    checkRateLimit(ip, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyGenerator: (ip) => `contact:${ip}`,
    }),

  /**
   * Share link streaming: 120 requests per minute per IP - video playback
   * fires many small HTTP range requests, so this needs headroom.
   */
  shareStream: (ip: string) =>
    checkRateLimit(ip, {
      maxRequests: 120,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (ip) => `share-stream:${ip}`,
    }),

  /**
   * Shared folder ZIP generation: CPU/memory heavy, so keep it tighter than
   * individual file streaming.
   */
  shareFolderZip: (ip: string) =>
    checkRateLimit(ip, {
      maxRequests: 10,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (ip) => `share-folder-zip:${ip}`,
    }),

  /**
   * Authenticated folder archive generation: CPU/memory heavy, but scoped to
   * signed-in users instead of anonymous IP traffic.
   */
  folderZip: (userId: string) =>
    checkRateLimit(userId, {
      maxRequests: 20,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: (id) => `folder-zip:${id}`,
    }),
};

/**
 * Helper to create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.floor(result.reset / 1000).toString(),
  };
}
