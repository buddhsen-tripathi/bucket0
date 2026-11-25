import { describe, it, expect } from "vitest";
import { parseRange, getContentTypeFromExtension } from "@/lib/shared/http-utils";

describe("parseRange", () => {
  it("returns null for null header", () => {
    expect(parseRange(null, 1000)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRange("", 1000)).toBeNull();
  });

  it("returns null for non-bytes prefix", () => {
    expect(parseRange("items=0-100", 1000)).toBeNull();
  });

  it("parses bytes=0-499 correctly", () => {
    const result = parseRange("bytes=0-499", 1000);
    expect(result).toEqual({ start: 0, end: 499 });
  });

  it("parses bytes=0- (open-ended) to fileSize-1", () => {
    const result = parseRange("bytes=0-", 1000);
    expect(result).toEqual({ start: 0, end: 999 });
  });

  it("returns null when start > end", () => {
    expect(parseRange("bytes=500-100", 1000)).toBeNull();
  });

  it("returns null when start is negative", () => {
    expect(parseRange("bytes=-1-100", 1000)).toBeNull();
  });

  it("returns null when end >= fileSize", () => {
    expect(parseRange("bytes=0-1000", 1000)).toBeNull();
  });

  it("parses exact last byte", () => {
    const result = parseRange("bytes=999-999", 1000);
    expect(result).toEqual({ start: 999, end: 999 });
  });

  it("parses full file range", () => {
    const result = parseRange("bytes=0-999", 1000);
    expect(result).toEqual({ start: 0, end: 999 });
  });

  it("returns null for garbage input", () => {
    expect(parseRange("bytes=abc-def", 1000)).toBeNull();
  });
});

describe("getContentTypeFromExtension", () => {
  it("returns image/jpeg for .jpg", () => {
    expect(getContentTypeFromExtension("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(getContentTypeFromExtension("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns image/png for .png", () => {
    expect(getContentTypeFromExtension("image.png")).toBe("image/png");
  });

  it("returns video/mp4 for .mp4", () => {
    expect(getContentTypeFromExtension("video.mp4")).toBe("video/mp4");
  });

  it("returns application/pdf for .pdf", () => {
    expect(getContentTypeFromExtension("document.pdf")).toBe("application/pdf");
  });

  it("returns application/json for .json", () => {
    expect(getContentTypeFromExtension("config.json")).toBe("application/json");
  });

  it("returns text/plain for .py", () => {
    expect(getContentTypeFromExtension("script.py")).toBe("text/plain");
  });

  it("returns text/plain for .ts", () => {
    expect(getContentTypeFromExtension("index.ts")).toBe("text/plain");
  });

  it("returns application/octet-stream for unknown extension", () => {
    expect(getContentTypeFromExtension("file.xyz123")).toBe(
      "application/octet-stream"
    );
  });

  it("returns application/octet-stream for no extension", () => {
    expect(getContentTypeFromExtension("Makefile")).toBe(
      "application/octet-stream"
    );
  });

  it("handles case insensitivity via lowercase", () => {
    expect(getContentTypeFromExtension("image.PNG")).toBe("image/png");
    expect(getContentTypeFromExtension("VIDEO.MP4")).toBe("video/mp4");
  });

  it("handles nested paths correctly", () => {
    expect(getContentTypeFromExtension("folder/subfolder/file.pdf")).toBe(
      "application/pdf"
    );
  });
});
