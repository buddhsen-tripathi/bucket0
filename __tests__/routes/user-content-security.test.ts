import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "@/server/compat/next-server";
import { USER_CONTENT_SANDBOX_CSP } from "@/lib/shared/user-content";

const selectResults: unknown[][] = [];
const limit = vi.fn(async () => selectResults.shift() ?? []);
const chain = { from: () => chain, where: () => chain, limit };

const getFileStream = vi.fn();
const getTeamFileStream = vi.fn();
const getFile = vi.fn();
const shareStream = vi.fn();
const shareFolderZip = vi.fn();

vi.mock("@/lib/shared/db", () => ({ db: { select: () => chain } }));
vi.mock("@/db/schema", () => ({
  cloudFiles: {}, cloudFolders: {}, shareLinks: {}, teamShareLinks: {}, teamFiles: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), asc: vi.fn(), sql: vi.fn(),
}));
vi.mock("@/server/compat/clerk", () => ({ auth: vi.fn(async () => ({ userId: "user_1" })) }));
vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: { getFileStream, getTeamFileStream },
}));
vi.mock("@/lib/cloud/encryption-service", () => ({
  createDecryptStream: vi.fn(),
}));
vi.mock("@/lib/cloud/encrypted-range", () => ({
  getEncryptedRangeForPlaintextRange: vi.fn(() => null),
}));
vi.mock("@/lib/payments/rate-limit", () => ({
  RateLimiters: { shareStream, shareFolderZip },
  createRateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/shared/logger", () => {
  const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { cloudLog: log, teamLog: log, agentLog: log };
});
vi.mock("@/lib/teams/route-helpers", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_1" })),
  requireTeamPermission: vi.fn(async () => null),
}));
vi.mock("@/lib/teams/permission-service", () => ({ Permission: { DOWNLOAD: "canDownload" } }));
vi.mock("@/lib/teams/team-file-service", () => ({ teamFileService: { getFile } }));
vi.mock("@/lib/agent/agent-route-helpers", () => ({
  requireAgentAuth: vi.fn(async () => ({ userId: "user_1" })),
}));
vi.mock("@/lib/cloud/folder-zip-stream", () => ({ createFolderZipStream: vi.fn() }));

const PAYLOAD = "<script>fetch('/api/user/profile')</script>";

function fileRecord(mimeType: string, fileName: string) {
  return {
    iv: null, authTag: null, mimeType, fileName,
    fileSize: PAYLOAD.length, encrypted: false, encryptionMode: "none",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function storageBody() {
  return { Body: { transformToWebStream: () => new Response(PAYLOAD).body } };
}

const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://bucket0.test${url}`, { headers });

beforeEach(() => {
  selectResults.length = 0;
  vi.clearAllMocks();
  shareStream.mockResolvedValue({ success: true });
  shareFolderZip.mockResolvedValue({ success: true });
  getFileStream.mockImplementation(async () => storageBody());
  getTeamFileStream.mockImplementation(async () => storageBody());
});

const ACTIVE_CASES: Array<[string, string]> = [
  ["text/html", "evil.html"],
  ["application/octet-stream", "evil.html"],
  ["", "evil.svg"],
  ["application/xhtml+xml", "evil.xhtml"],
];

describe("share stream serves active user content under a sandbox CSP", () => {
  it.each(ACTIVE_CASES)("Drive share stream: %s %s", async (mime, name) => {
    const { GET } = await import("@/server/routes/api/cloud/share/stream/route");
    selectResults.push(
      [{ id: "link1", isActive: true, accessType: "anyone", targetType: "file", userId: "owner", fileKey: name, fileName: name }],
      [fileRecord(mime, name)],
    );
    const res = await GET(req("/api/cloud/share/stream?id=link1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(USER_CONTENT_SANDBOX_CSP);
  });

  it.each(ACTIVE_CASES)("team share stream: %s %s", async (mime, name) => {
    const { GET } = await import("@/server/routes/api/teams/share/stream/route");
    selectResults.push(
      [{ id: "link1", isActive: true, accessType: "anyone", teamId: "team1", fileKey: name, fileName: name }],
      [fileRecord(mime, name)],
    );
    const res = await GET(req("/api/teams/share/stream?id=link1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(USER_CONTENT_SANDBOX_CSP);
  });

  it("Drive share stream keeps passive previews (image) on the app CSP", async () => {
    const { GET } = await import("@/server/routes/api/cloud/share/stream/route");
    selectResults.push(
      [{ id: "link1", isActive: true, accessType: "anyone", targetType: "file", userId: "owner", fileKey: "a.png", fileName: "a.png" }],
      [fileRecord("image/png", "a.png")],
    );
    const res = await GET(req("/api/cloud/share/stream?id=link1"));
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(res.headers.has("Content-Security-Policy")).toBe(false);
  });
});

describe("owner and team view routes serve active user content under a sandbox CSP", () => {
  it.each(ACTIVE_CASES)("Drive view: %s %s", async (mime, name) => {
    const { GET } = await import("@/server/routes/api/cloud/view/route");
    selectResults.push([fileRecord(mime, name)]);
    const res = await GET(req(`/api/cloud/view?key=${name}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(USER_CONTENT_SANDBOX_CSP);
  });

  it.each(ACTIVE_CASES)("team view: %s %s", async (mime, name) => {
    const { GET } = await import("@/server/routes/api/teams/[teamId]/files/view/route");
    getFile.mockResolvedValue(fileRecord(mime, name));
    const res = await GET(req(`/api/teams/team1/files/view?key=${name}`), {
      params: Promise.resolve({ teamId: "team1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(USER_CONTENT_SANDBOX_CSP);
  });

  it("team view keeps passive previews (PDF) on the app CSP", async () => {
    const { GET } = await import("@/server/routes/api/teams/[teamId]/files/view/route");
    getFile.mockResolvedValue(fileRecord("application/pdf", "doc.pdf"));
    const res = await GET(req("/api/teams/team1/files/view?key=doc.pdf"), {
      params: Promise.resolve({ teamId: "team1" }),
    });
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.has("Content-Security-Policy")).toBe(false);
  });
});

describe("agent download serves active user content under a sandbox CSP", () => {
  it("text/html agent download carries the sandbox CSP", async () => {
    const { GET } = await import("@/server/routes/api/agent-bucket/files/download/route");
    selectResults.push([fileRecord("text/html", "evil.html")]);
    const res = await GET(req("/api/agent-bucket/files/download?key=evil.html"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(USER_CONTENT_SANDBOX_CSP);
  });
});

describe("anonymous share limiters key on cf-connecting-ip, not X-Forwarded-For", () => {
  const spoofed = { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.77, 203.0.113.9", "x-real-ip": "198.51.100.78" };

  it("Drive share stream", async () => {
    const { GET } = await import("@/server/routes/api/cloud/share/stream/route");
    await GET(req("/api/cloud/share/stream", spoofed));
    expect(shareStream).toHaveBeenCalledWith("203.0.113.9");
  });

  it("team share stream", async () => {
    const { GET } = await import("@/server/routes/api/teams/share/stream/route");
    await GET(req("/api/teams/share/stream", spoofed));
    expect(shareStream).toHaveBeenCalledWith("203.0.113.9");
  });

  it("shared folder listing", async () => {
    const { GET } = await import("@/server/routes/api/cloud/share/folder/route");
    await GET(req("/api/cloud/share/folder", spoofed));
    expect(shareStream).toHaveBeenCalledWith("203.0.113.9");
  });

  it("shared folder ZIP download", async () => {
    const { GET } = await import("@/server/routes/api/cloud/share/folder/download/route");
    await GET(req("/api/cloud/share/folder/download", spoofed));
    expect(shareFolderZip).toHaveBeenCalledWith("203.0.113.9");
  });
});
