import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), get: vi.fn() }));
vi.mock("@/server/bindings", () => ({ getThumbnailBucket: () => ({ list: mocks.list, delete: mocks.remove, get: mocks.get }) }));
import { deleteGeneratedThumbnails, getGeneratedThumbnail } from "@/lib/cloud/thumbnail-storage";
beforeEach(() => { vi.clearAllMocks(); });
describe("generated thumbnail storage", () => {
  it("deletes every version of selected files across pages without deleting neighboring files", async () => {
    mocks.list.mockResolvedValueOnce({ objects: [{ key: "personal/u1/f1/v1.webp" }, { key: "personal/u1/f2/v1.webp" }], truncated: true, cursor: "next" })
      .mockResolvedValueOnce({ objects: [{ key: "personal/u1/f1/v2.webp" }, { key: "personal/u1/f3/v1.webp" }], truncated: false });
    await deleteGeneratedThumbnails("personal", "u1", ["f1", "f3"]);
    expect(mocks.list).toHaveBeenNthCalledWith(1, { prefix: "personal/u1/", cursor: undefined, limit: 1000 });
    expect(mocks.list).toHaveBeenNthCalledWith(2, { prefix: "personal/u1/", cursor: "next", limit: 1000 });
    expect(mocks.remove.mock.calls).toEqual([[['personal/u1/f1/v1.webp']], [['personal/u1/f1/v2.webp', 'personal/u1/f3/v1.webp']]]);
  });
  it("scopes account/team cleanup to its owner prefix", async () => {
    mocks.list.mockResolvedValue({ objects: [{ key: "team/t1/f1/v1.webp" }], truncated: false });
    await deleteGeneratedThumbnails("team", "t1");
    expect(mocks.list).toHaveBeenCalledWith({ prefix: "team/t1/", cursor: undefined, limit: 1000 });
    expect(mocks.remove).toHaveBeenCalledWith(["team/t1/f1/v1.webp"]);
  });
  it("does not turn an empty file selection into an account-wide cleanup", async () => {
    await deleteGeneratedThumbnails("personal", "u1", []);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("reads generated thumbnails from the thumbnail bucket", async () => {
    mocks.get.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer });
    expect(await getGeneratedThumbnail("cf-thumbnail:personal/u1/f1/v1.webp")).toEqual({ body: new Uint8Array([1, 2]) });
    expect(mocks.get).toHaveBeenCalledWith("personal/u1/f1/v1.webp");
  });
  it("treats keys outside the generated layout as missing", async () => {
    expect(await getGeneratedThumbnail("users/u1/a.webp")).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
