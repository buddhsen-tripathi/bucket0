/** Run against an isolated local PostgreSQL database with BUCKET0_TEST_POSTGRES_URL. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";
import { createChunkedUploadTracker, type UploadRow } from "@/lib/cloud/chunked-upload-tracker";
import { cloudCatalog } from "@/lib/cloud/catalog-service";

vi.mock("@/lib/cloud/catalog-service", () => ({
  cloudCatalog: { onFileWritten: vi.fn(async () => {}) },
}));

const postgresURL = process.env.BUCKET0_TEST_POSTGRES_URL;
const localDatabase = postgresURL && ["localhost", "127.0.0.1"].includes(new URL(postgresURL).hostname);
const exec = promisify(execFile);
const schema = `upload_test_${crypto.randomUUID().replaceAll("-", "")}`;
const dialect = new PgDialect();

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}
async function query(statement: string) {
  if (!postgresURL || !localDatabase) throw new Error("A local test database URL is required");
  const { stdout } = await exec("psql", [postgresURL, "-XqAt", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", statement], {
    env: { ...process.env, PGOPTIONS: `-csearch_path=${schema}` },
  });
  return stdout.trim();
}
async function execute(statement: SQL): Promise<UploadRow[]> {
  const compiled = dialect.sqlToQuery(statement);
  const args = compiled.params.map(literal).join(", ");
  const output = await query(`PREPARE upload_query AS ${compiled.sql}; EXECUTE upload_query${args ? `(${args})` : ""};`);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [id, user_id, file_key, upload_id, size, content_type, encrypted, existing_size,
      is_new_file, reserved_bytes, reserved_files, state, started_at, updated_at, operation_token] = line.split("\t");
    return { id, user_id, file_key, upload_id: upload_id || null, size, content_type,
      encrypted: encrypted === "t", existing_size, is_new_file: is_new_file === "t",
      reserved_bytes, reserved_files: Number(reserved_files), state, started_at, updated_at,
      operation_token: operation_token || null };
  });
}
const storage = {
  abortMultipartUpload: vi.fn(async () => {}),
  getFileMetadata: vi.fn(async () => ({ $metadata: {}, Metadata: {} as Record<string, string> })),
};
const first = createChunkedUploadTracker(execute, storage);
const second = createChunkedUploadTracker(execute, storage);
const args = { userId: "alice", key: "docs/file.txt", size: 100, contentType: "text/plain", encrypted: true,
  maxStorageBytes: 1000, maxFileCount: 10 };
async function reserve(key = args.key, size = args.size) {
  const result = await first.reserveUpload({ ...args, key, size });
  if (!result.success) throw new Error(`Reservation failed: ${result.reason}`);
  return result.upload;
}
async function activate(key = args.key, size = args.size) {
  const info = await reserve(key, size);
  const uploadId = crypto.randomUUID();
  await first.activateUpload(info.id, args.userId, uploadId);
  return { ...info, uploadId };
}
async function usage() {
  return query("SELECT storage_usage, file_count FROM users WHERE id='alice'");
}

describe.skipIf(!localDatabase)("shared multipart reservations (PostgreSQL)", () => {
  beforeAll(async () => {
    await query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE users (id text PRIMARY KEY, storage_usage bigint NOT NULL DEFAULT 0,
        file_count integer NOT NULL DEFAULT 0, updated_at timestamp DEFAULT now());
      CREATE TABLE cloud_files (id text PRIMARY KEY, user_id text NOT NULL, file_key text NOT NULL,
        file_name text NOT NULL, file_size bigint NOT NULL, mime_type text, encrypted boolean,
        encryption_mode text, iv text, auth_tag text, thumbnail_key text, folder_path text,
        thumbnail_attempted boolean NOT NULL DEFAULT false, updated_at timestamp DEFAULT now());`);
    // Mirrors the chunkedUploads table in db/schema.ts.
    await query(`CREATE TABLE chunked_uploads (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_key text NOT NULL,
        upload_id text,
        size bigint NOT NULL CONSTRAINT chunked_uploads_size_check CHECK (size > 0),
        content_type text NOT NULL,
        encrypted boolean NOT NULL,
        existing_size bigint NOT NULL DEFAULT 0,
        is_new_file boolean NOT NULL DEFAULT false,
        reserved_bytes bigint NOT NULL DEFAULT 0,
        reserved_files integer NOT NULL DEFAULT 0,
        state text NOT NULL DEFAULT 'pending' CONSTRAINT chunked_uploads_state_check
          CHECK (state IN ('pending', 'reserved', 'active', 'completing', 'aborting')),
        started_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        operation_token text
      );
      CREATE UNIQUE INDEX idx_chunked_uploads_user_key ON chunked_uploads(user_id, file_key);
      CREATE UNIQUE INDEX idx_chunked_uploads_user_upload ON chunked_uploads(user_id, upload_id);
      CREATE INDEX idx_chunked_uploads_updated ON chunked_uploads(updated_at);`);
  });
  afterAll(async () => { await query(`DROP SCHEMA ${schema} CASCADE`); });
  beforeEach(async () => {
    vi.clearAllMocks();
    storage.abortMultipartUpload.mockResolvedValue(undefined);
    storage.getFileMetadata.mockResolvedValue({ $metadata: {}, Metadata: {} });
    await query("TRUNCATE chunked_uploads, cloud_files, users CASCADE; INSERT INTO users(id) VALUES ('alice'), ('bob')");
  });

  it("shares filename locks, part state, and completion across independent instances", async () => {
    const info = await activate();
    expect((await second.reserveUpload(args))).toEqual({ success: false, reason: "conflict" });
    expect(await second.getUpload("alice", info.uploadId)).toMatchObject({ size: 100, key: args.key, encrypted: true });
    await second.startCompletion("alice", info.uploadId, args.key);
    await second.completeUpload("alice", info.uploadId);
    expect(await first.getUpload("alice", info.uploadId)).toBeUndefined();
    expect(await usage()).toBe("100\t1");
    expect(await query("SELECT file_size, folder_path FROM cloud_files")).toBe("100\tdocs/");
    expect((await first.reserveUpload(args)).success).toBe(true);
  });

  it("admits only one concurrent reservation for the same key", async () => {
    const result = await Promise.all([first.reserveUpload(args), second.reserveUpload(args)]);
    expect(result.filter((r) => r.success)).toHaveLength(1);
    expect(await usage()).toBe("100\t1");
  });

  it("admits only one concurrent completion attempt and rejects immediate retries", async () => {
    const info = await activate();
    const claimed = await Promise.all([
      first.startCompletion("alice", info.uploadId, args.key),
      second.startCompletion("alice", info.uploadId, args.key),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    expect(claimed.find(Boolean)?.operationToken).toBeTruthy();
    expect(await second.startCompletion("alice", info.uploadId, args.key)).toBeUndefined();
    expect(await usage()).toBe("100\t1");
  });

  it("allows a stale completion retry and prevents older attempts from releasing its lease", async () => {
    const info = await activate();
    const original = await first.startCompletion("alice", info.uploadId, args.key);
    if (!original) throw new Error("Expected original completion lease");
    await query("UPDATE chunked_uploads SET updated_at=now()-interval '6 minutes'");
    const retry = await second.startCompletion("alice", info.uploadId, args.key);
    if (!retry) throw new Error("Expected replacement completion lease");
    expect(retry.operationToken).not.toBe(original.operationToken);

    await first.resumeUpload("alice", info.uploadId, original.operationToken);
    expect(await second.getUpload("alice", info.uploadId)).toMatchObject({
      state: "completing", operationToken: retry.operationToken,
    });
    await second.resumeUpload("alice", info.uploadId, retry.operationToken);
    expect(await first.getUpload("alice", info.uploadId)).toMatchObject({
      state: "active", operationToken: null,
    });
    expect(await second.abortUpload("alice", info.uploadId, args.key)).toBe(true);
    expect(await usage()).toBe("0\t0");
  });

  it("enforces byte and file limits atomically across different keys", async () => {
    const result = await Promise.all([first.reserveUpload({ ...args, maxStorageBytes: 150 }),
      second.reserveUpload({ ...args, key: "other.txt", maxStorageBytes: 150 })]);
    expect(result.filter((r) => r.success)).toHaveLength(1);
    expect(await usage()).toBe("100\t1");
    const denied = await first.reserveUpload({ ...args, key: "third.txt", maxFileCount: 1 });
    expect(denied).toEqual({ success: false, reason: "quota" });
    expect((await first.getStats("alice")).activeCount).toBe(1);
  });

  it("rolls back a reservation once when abort requests race or repeat", async () => {
    const info = await activate();
    await Promise.all([first.abortUpload("alice", info.uploadId, args.key), second.abortUpload("alice", info.uploadId, args.key)]);
    await second.abortUpload("alice", info.uploadId, args.key);
    expect(await usage()).toBe("0\t0");
    expect((await first.getStats("alice")).activeCount).toBe(0);
  });

  it("settles a previously aborted multipart upload even if R2 returns NoSuchUpload", async () => {
    const info = await activate();
    storage.abortMultipartUpload.mockRejectedValueOnce(Object.assign(new Error("Already aborted"), { name: "NoSuchUpload" }));
    expect(await second.abortUpload("alice", info.uploadId, args.key)).toBe(true);
    expect(await usage()).toBe("0\t0");
    expect(await first.getUpload("alice", info.uploadId)).toBeUndefined();
  });

  it("retains quota after an abort transport failure so another instance can retry safely", async () => {
    const info = await activate();
    storage.abortMultipartUpload.mockRejectedValueOnce(new Error("Connection reset"));
    await expect(first.abortUpload("alice", info.uploadId, args.key)).rejects.toThrow("Connection reset");
    expect(await usage()).toBe("100\t1");
    expect((await second.getUpload("alice", info.uploadId))?.state).toBe("aborting");
    await second.abortUpload("alice", info.uploadId, args.key);
    expect(await usage()).toBe("0\t0");
  });

  it("does not release overwritten-file quota until the smaller replacement commits", async () => {
    await query("UPDATE users SET storage_usage=200,file_count=1 WHERE id='alice'; INSERT INTO cloud_files(id,user_id,file_key,file_name,file_size) VALUES ('old','alice','users/alice/docs/file.txt','docs/file.txt',200)");
    const canceled = await activate();
    expect(await usage()).toBe("200\t1");
    await second.abortUpload("alice", canceled.uploadId, args.key);
    expect(await usage()).toBe("200\t1");
    const completed = await activate();
    await second.startCompletion("alice", completed.uploadId, args.key);
    await second.completeUpload("alice", completed.uploadId);
    await first.completeUpload("alice", completed.uploadId);
    expect(await usage()).toBe("100\t1");
    expect(await query("SELECT id FROM cloud_files")).toBe("old");
  });

  it("keeps metadata and reservation if finalization fails, then recovers without double charging", async () => {
    const info = await activate();
    await first.startCompletion("alice", info.uploadId, args.key);
    await query("ALTER TABLE cloud_files ADD CONSTRAINT simulate_failure CHECK (file_size < 10)");
    await expect(second.completeUpload("alice", info.uploadId)).rejects.toThrow();
    expect((await first.getUpload("alice", info.uploadId))?.state).toBe("completing");
    expect(await usage()).toBe("100\t1");
    await query("ALTER TABLE cloud_files DROP CONSTRAINT simulate_failure; UPDATE chunked_uploads SET updated_at=now()-interval '2 hours'");
    storage.getFileMetadata.mockResolvedValue({ $metadata: {}, Metadata: { "upload-token": info.id } });
    expect(await second.cleanupStaleUploads("alice")).toMatchObject({ cleaned: 1, failed: 0 });
    expect(await usage()).toBe("100\t1");
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(cloudCatalog.onFileWritten).toHaveBeenCalledWith("alice", "users/alice/docs/file.txt", { isAgentUpload: false });
  });

  it("cleans stale reservations across instances and scopes cleanup to the authenticated owner", async () => {
    await activate();
    await query("UPDATE chunked_uploads SET updated_at=now()-interval '2 hours'");
    expect(await second.cleanupStaleUploads("bob")).toEqual({ cleaned: 0, failed: 0, total: 0 });
    expect(await usage()).toBe("100\t1");
    expect(await second.cleanupStaleUploads("alice")).toEqual({ cleaned: 1, failed: 0, total: 1 });
    expect(await usage()).toBe("0\t0");
    expect(storage.abortMultipartUpload).toHaveBeenCalledOnce();
  });

  it("rejects a mismatched key and never aborts a completing reservation", async () => {
    const info = await activate();
    expect(await second.abortUpload("alice", info.uploadId, "other.txt")).toBe(false);
    await first.startCompletion("alice", info.uploadId, args.key);
    expect(await second.abortUpload("alice", info.uploadId, args.key)).toBe(false);
    expect(await usage()).toBe("100\t1");
  });
});
