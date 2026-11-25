import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ rows: [{ branch_id: "br-cf-test", schema_ready: true }] })),
  storage: vi.fn(async () => ({ objectRead: "verified" })),
  auth: vi.fn(async () => 1),
}));
vi.mock("@/lib/shared/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/cloud/system-service", () => ({ systemStorage: { checkReadAccess: mocks.storage } }));
vi.mock("@/server/compat/clerk", () => ({ clerkClient: async () => ({ users: { getCount: mocks.auth } }) }));
import { GET as handleGet } from "@/server/routes/api/health/route";
import { requestContext } from "@/server/context";

const env = {
  BACKGROUND_QUEUE: { send: vi.fn() },
  RATE_LIMITS: { getByName: vi.fn() },
  THUMBNAILS: { get: vi.fn(), put: vi.fn(), list: vi.fn(async () => ({ objects: [] })) },
  MEDIA_CONTAINER: { getByName: () => ({ fetch: async () => new Response("ok") }) },
};
const ctx = { props: {}, waitUntil: vi.fn(), passThroughOnException: vi.fn() };
function GET(req: NextRequest) {
  return requestContext.run({ request: req, env, ctx }, () => handleGet(req));
}
function request(authorization = "Bearer test-readiness-token") {
  return new NextRequest("https://worker.example/api/health?check=bindings", { headers: { authorization } });
}
describe("protected live binding checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HEALTH_CHECK_TOKEN", "test-readiness-token");
    vi.stubEnv("DATABASE_URL", "postgresql://example:example@ep-cf-test-pooler.example.invalid/db");
    vi.stubEnv("MEDIA_SERVICE_URL", "");
    mocks.execute.mockResolvedValue({ rows: [{ branch_id: "br-cf-test", schema_ready: true }] });
    mocks.storage.mockResolvedValue({ objectRead: "verified" });
    mocks.auth.mockResolvedValue(1);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("leaves the public liveness probe independent of credentials and services", async () => {
    const response = await GET(new NextRequest("https://worker.example/api/health"));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ok");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rejects incorrect tokens before accessing a provider", async () => {
    expect((await GET(request("Bearer incorrect"))).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("disables deep checks when the operator token is not configured", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", "");
    expect((await GET(request())).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("verifies the connected branch, schema, and bindings without revealing credentials", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.checks.database).toMatchObject({ branchId: "br-cf-test", schemaReady: true });
    expect(body.checks.storage.objectRead).toBe("verified");
    expect(body.checks.media).toMatchObject({ status: "ok", transport: "private-container" });
    expect(body.checks.infrastructure).toMatchObject({ status: "ok", thumbnails: "verified" });
    expect(JSON.stringify(body)).not.toContain("postgresql://");
  });
  it("fails readiness if the upload schema is absent", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ branch_id: "br-cf-test", schema_ready: false }] });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect((await response.json()).checks.database.status).toBe("error");
  });
  it("does not serialize provider errors containing credentials", async () => {
    mocks.storage.mockRejectedValueOnce(new Error("secret-credential-must-not-be-returned"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-credential-must-not-be-returned");
  });
  it("fails readiness when a binding is missing", async () => {
    const req = request();
    const response = await requestContext.run({ request: req, env: { ...env, THUMBNAILS: undefined }, ctx }, () => handleGet(req));
    expect(response.status).toBe(503);
    expect((await response.json()).checks.infrastructure.status).toBe("error");
  });
  it("fails readiness on invalid encryption key lengths", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "invalid");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect((await response.json()).checks.encryption.status).toBe("error");
  });
});
