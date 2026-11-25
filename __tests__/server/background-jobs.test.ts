import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { requestContext } from "@/server/context";

const mocks = vi.hoisted(() => ({ rows: vi.fn(), update: vi.fn(), open: vi.fn(), thumbnail: vi.fn(), put: vi.fn(), remove: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/shared/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: mocks.rows }) }) }),
  update: () => ({ set: () => ({ where: mocks.update }) }),
} }));
vi.mock("@/lib/cloud/file-stream", () => ({ openCloudFileStream: mocks.open, cloudFileToWebStream: () => new ReadableStream() }));
vi.mock("@/lib/cloud/thumbnail-service", () => ({ requestThumbnail: mocks.thumbnail, supportsThumbnail: () => true, isImageType: () => true, isVideoType: () => false }));
vi.mock("@/lib/agent/memory-service", () => ({ indexFile: vi.fn(), isTextLike: () => true }));
vi.mock("@/lib/shared/logger", () => ({ cloudLog: { error: mocks.error } }));
import { consumeBackground } from "@/workers/background";
import { parseBackgroundJob, enqueueThumbnail } from "@/lib/cloud/background-jobs";
import { checkRateLimit } from "@/lib/payments/rate-limit";

const version = "2026-10-29 12:01:02.123456";
const job = { kind: "thumbnail", scope: "personal", fileId: "file1", version };
const ctx = { props: {}, waitUntil: vi.fn(), passThroughOnException: vi.fn() };
function batch(body: unknown = job) {
  const message = { id: "message1", timestamp: new Date(), body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
  return { queue: "test", messages: [message], metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } }, ackAll: vi.fn(), retryAll: vi.fn() };
}
const env = { THUMBNAILS: { get: vi.fn(), put: mocks.put, delete: mocks.remove } };
const file = { id: "file1", userId: "u1", fileKey: "users/u1/a.png", mimeType: "image/png", fileSize: 50, encrypted: false, encryptionMode: "none", thumbnailKey: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.mockResolvedValue([file]);
  mocks.open.mockImplementation(async () => Readable.from([Buffer.from("source")]));
  mocks.thumbnail.mockResolvedValue(Buffer.from("webp"));
  mocks.put.mockResolvedValue({});
  mocks.update.mockReturnValue({ returning: async () => [{ id: "file1" }] });
});

describe("durable background work", () => {
  it("retains the full PostgreSQL version token, including microseconds", () => {
    expect(parseBackgroundJob(job)).toEqual(job);
    expect(() => parseBackgroundJob({ ...job, version: "invalid" })).toThrow();
    expect(() => parseBackgroundJob({ kind: "index", fileId: "f", version, keyId: null, maxMemoryChunks: -1 })).toThrow();
  });
  it("acknowledges stale or deleted files without reading their source", async () => {
    mocks.rows.mockResolvedValue([]);
    const work = batch();
    await consumeBackground(work, env, ctx);
    expect(work.messages[0].ack).toHaveBeenCalledOnce();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("writes generated output only through the dedicated thumbnail binding", async () => {
    const work = batch();
    await consumeBackground(work, env, ctx);
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^personal\/u1\/file1\/[0-9a-f]{16}\.webp$/), Buffer.from("webp"), { httpMetadata: { contentType: "image/webp" } });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(work.messages[0].ack).toHaveBeenCalledOnce();
    expect(work.messages[0].retry).not.toHaveBeenCalled();
  });
  it("writes team thumbnails under the team scope", async () => {
    mocks.rows.mockResolvedValue([{ id: "file1", teamId: "t1", uploadedBy: "u1", fileKey: "teams/t1/folder/a.png", mimeType: "image/png", fileSize: 50, encrypted: false, encryptionMode: "none", thumbnailKey: null }]);
    await consumeBackground(batch({ ...job, scope: "team" }), env, ctx);
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^team\/t1\/file1\/[0-9a-f]{16}\.webp$/), Buffer.from("webp"), { httpMetadata: { contentType: "image/webp" } });
    expect(mocks.open).toHaveBeenCalledWith("u1", expect.objectContaining({ teamId: "t1" }), expect.any(AbortSignal));
  });
  it("retries failed source reads and conversion without acknowledging the message", async () => {
    mocks.open.mockRejectedValueOnce(new Error("source unavailable"));
    const work = batch();
    await consumeBackground(work, env, ctx);
    expect(work.messages[0].retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(work.messages[0].ack).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("does not repeat conversion after an acknowledged thumbnail is redelivered", async () => {
    const first = batch();
    await consumeBackground(first, env, ctx);
    const key = mocks.put.mock.calls[0][0];
    mocks.rows.mockResolvedValue([{ ...file, thumbnailKey: `cf-thumbnail:${key}` }]);
    const second = batch();
    await consumeBackground(second, env, ctx);
    expect(mocks.thumbnail).toHaveBeenCalledOnce();
    expect(second.messages[0].ack).toHaveBeenCalledOnce();
  });
  it("removes output when a file deletion or replacement races conversion", async () => {
    mocks.update.mockReturnValue({ returning: async () => [] });
    await consumeBackground(batch(), env, ctx);
    expect(mocks.remove).toHaveBeenCalledWith(mocks.put.mock.calls[0][0]);
  });
  it("fails closed when bindings are absent", async () => {
    await requestContext.run({ request: new Request("http://test"), env: {}, ctx }, async () => {
      await expect(enqueueThumbnail("u", "f")).rejects.toThrow("BACKGROUND_QUEUE");
      await expect(checkRateLimit("u", { maxRequests: 1, windowMs: 100 })).rejects.toThrow("RATE_LIMITS");
    });
  });
  it("uses the same opaque durable counter for repeat actor/action requests", async () => {
    const consume = vi.fn().mockResolvedValue({ success: true, limit: 1, remaining: 0, reset: 10 });
    const getByName = vi.fn((name: string) => { expect(name).toMatch(/^[0-9a-f]{64}$/); return { consume }; });
    await requestContext.run({ request: new Request("http://test"), env: { RATE_LIMITS: { getByName } }, ctx }, async () => {
      await checkRateLimit("personal-identifier", { maxRequests: 1, windowMs: 100 });
      await checkRateLimit("personal-identifier", { maxRequests: 1, windowMs: 100 });
    });
    expect(getByName.mock.calls[0][0]).toMatch(/^[0-9a-f]{64}$/);
    expect(getByName.mock.calls[0]).toEqual(getByName.mock.calls[1]);
    expect(consume).toHaveBeenCalledTimes(2);
  });
});
