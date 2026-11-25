import { describe, it, expect, vi } from "vitest";

// catalog-service.ts imports @/lib/shared/db, which throws at load if DATABASE_URL
// is unset. We only care about the pure path-derivation helpers here.
vi.mock("@/lib/shared/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ cloudFolders: {} }));

import { deriveFolderPath, ancestorFolderPaths } from "@/lib/cloud/catalog-service";

describe("deriveFolderPath", () => {
  it("returns the parent folder ending in '/'", () => {
    expect(deriveFolderPath("u1", "users/u1/maskG/360p/x.mp4")).toBe("maskG/360p/");
    expect(deriveFolderPath("u1", "users/u1/maskG/x.mp4")).toBe("maskG/");
  });

  it("returns '' for a file at the drive root", () => {
    expect(deriveFolderPath("u1", "users/u1/notes.txt")).toBe("");
  });

  it("returns the parent for a folder-marker key (trailing slash)", () => {
    expect(deriveFolderPath("u1", "users/u1/maskG/")).toBe("");
    expect(deriveFolderPath("u1", "users/u1/maskG/360p/")).toBe("maskG/");
  });

  it("returns '' when the key does not start with the user's prefix", () => {
    expect(deriveFolderPath("u1", "users/other/maskG/x.mp4")).toBe("");
    expect(deriveFolderPath("u1", "completely/different.txt")).toBe("");
  });

  it("handles deeply nested paths", () => {
    expect(deriveFolderPath("u1", "users/u1/a/b/c/d/e.png")).toBe("a/b/c/d/");
  });
});

describe("ancestorFolderPaths", () => {
  it("root-first list of every ancestor including the path itself", () => {
    expect(ancestorFolderPaths("a/b/c/")).toEqual(["a/", "a/b/", "a/b/c/"]);
  });

  it("single-segment path returns just itself", () => {
    expect(ancestorFolderPaths("maskG/")).toEqual(["maskG/"]);
  });

  it("empty string returns an empty array (drive root has no ancestors)", () => {
    expect(ancestorFolderPaths("")).toEqual([]);
  });

  it("tolerates duplicate slashes", () => {
    expect(ancestorFolderPaths("a//b/")).toEqual(["a/", "a/b/"]);
  });
});
