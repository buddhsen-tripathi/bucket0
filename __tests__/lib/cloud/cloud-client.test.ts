import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CloudClient } from "@/lib/cloud/cloud-client";

describe("CloudClient.listFolder", () => {
  const client = new CloudClient();
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ok(body: unknown) {
    return { ok: true, json: async () => body } as unknown as Response;
  }

  const okListBody = (extra: Record<string, unknown> = {}) => ({
    path: "",
    folders: [],
    files: [],
    pagination: { offset: 0, limit: 100, totalItems: 0, hasMore: false },
    sort: "name",
    order: "asc",
    usage: 0,
    limit: 1,
    plan: "free",
    ...extra,
  });

  it("hits /list with no query string at the root", async () => {
    fetchMock.mockResolvedValue(ok(okListBody()));
    await client.listFolder();
    expect(fetchMock).toHaveBeenCalledWith("/api/cloud/files/list");
  });

  it("encodes path, offset, limit, sort, order", async () => {
    fetchMock.mockResolvedValue(ok(okListBody({ path: "maskG/", sort: "modified", order: "desc" })));
    await client.listFolder("maskG/", { offset: 50, limit: 25, sort: "modified", order: "desc" });
    const called = fetchMock.mock.calls[0][0] as string;
    expect(called).toContain("path=maskG%2F");
    expect(called).toContain("offset=50");
    expect(called).toContain("limit=25");
    expect(called).toContain("sort=modified");
    expect(called).toContain("order=desc");
  });

  it("encodes the starred flag", async () => {
    fetchMock.mockResolvedValue(ok(okListBody()));
    await client.listFolder("", { starred: true });
    expect(fetchMock.mock.calls[0][0] as string).toContain("starred=1");
  });

  it("encodes the recent flag", async () => {
    fetchMock.mockResolvedValue(ok(okListBody()));
    await client.listFolder("", { recent: true });
    expect(fetchMock.mock.calls[0][0] as string).toContain("recent=1");
  });

  it("encodes retryFailed when retryFailedThumbnails is set", async () => {
    fetchMock.mockResolvedValue(ok(okListBody()));
    await client.listFolder("", { retryFailedThumbnails: true });
    expect(fetchMock.mock.calls[0][0] as string).toContain("retryFailed=1");
  });

  it("parses folders + files, converts timestamps to Date, and surfaces pagination", async () => {
    fetchMock.mockResolvedValue(
      ok(okListBody({
        folders: [{ name: "maskG", path: "maskG/", createdAt: "2024-01-02T00:00:00.000Z" }],
        files: [{ key: "x.mp4", size: 10, lastModified: "2024-01-03T00:00:00.000Z", etag: "", hasThumbnail: true, mimeType: "video/mp4", isStarred: false }],
        pagination: { offset: 0, limit: 100, totalItems: 73, hasMore: true },
        usage: 5,
        limit: 100,
        plan: "free",
      })),
    );
    const res = await client.listFolder("");
    expect(res.folders).toHaveLength(1);
    expect(res.folders[0].createdAt).toBeInstanceOf(Date);
    expect(res.files[0].lastModified).toBeInstanceOf(Date);
    expect(res.pagination).toEqual({ offset: 0, limit: 100, totalItems: 73, hasMore: true });
    expect(res).toMatchObject({ path: "", sort: "name", order: "asc", usage: 5, limit: 100, plan: "free" });
  });

  it("tolerates a response missing folders/files/pagination", async () => {
    fetchMock.mockResolvedValue(ok({ path: "", sort: "name", order: "asc", usage: 0, limit: 1, plan: "free" }));
    const res = await client.listFolder();
    expect(res.folders).toEqual([]);
    expect(res.files).toEqual([]);
    expect(res.pagination).toMatchObject({ offset: 0, totalItems: 0, hasMore: false });
  });

  it("throws a friendly error on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false } as unknown as Response);
    await expect(client.listFolder()).rejects.toThrow("Unable to load your files");
  });
});

describe("CloudClient URL methods", () => {
  const client = new CloudClient();

  it('getDownloadUrl("photo.jpg") returns correct path', () => {
    expect(client.getDownloadUrl("photo.jpg")).toBe(
      "/api/cloud/download?key=photo.jpg"
    );
  });

  it("getDownloadUrl encodes folder paths and spaces", () => {
    const url = client.getDownloadUrl("folder/my file.pdf");
    expect(url).toBe("/api/cloud/download?key=folder%2Fmy%20file.pdf");
  });

  it("getDownloadUrl encodes & and = characters", () => {
    const url = client.getDownloadUrl("file&name=test.txt");
    expect(url).toBe("/api/cloud/download?key=file%26name%3Dtest.txt");
  });

  it('getViewUrl("photo.jpg") returns correct path', () => {
    expect(client.getViewUrl("photo.jpg")).toBe(
      "/api/cloud/view?key=photo.jpg"
    );
  });

  it("both methods are synchronous (return string, not Promise)", () => {
    const download = client.getDownloadUrl("test.txt");
    const view = client.getViewUrl("test.txt");

    expect(typeof download).toBe("string");
    expect(typeof view).toBe("string");

    // Verify they're not Promises
    expect(download).not.toBeInstanceOf(Promise);
    expect(view).not.toBeInstanceOf(Promise);
  });
});
