/**
 * Thumbnail generation for images, videos, and PDFs.
 *
 * The Worker cannot run sharp/ffmpeg/ghostscript, so the pixel work happens in
 * the media service (see `media/`), reached through the MEDIA_CONTAINER binding
 * or, when set, MEDIA_SERVICE_URL. Thumbnails are produced by the background
 * queue consumer (`workers/background.ts`).
 */

import { getMediaContainer } from "@/server/bindings";

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "jpeg" | "png";
}

export async function requestThumbnail(
  kind: "image" | "video" | "pdf",
  body: Buffer | ReadableStream<Uint8Array>,
  options: ThumbnailOptions,
  mimeType?: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const serviceUrl = process.env.MEDIA_SERVICE_URL;
  const url = new URL("/thumbnail", serviceUrl || "http://media");
  url.searchParams.set("kind", kind);
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    "content-type": mimeType || "application/octet-stream",
  };
  if (process.env.MEDIA_SERVICE_TOKEN) {
    headers.authorization = `Bearer ${process.env.MEDIA_SERVICE_TOKEN}`;
  }

  // A stream avoids copying a source Buffer; regenerated thumbnails never buffer
  // the complete R2 source inside the Worker.
  const stream = body instanceof ReadableStream ? body : new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(body); controller.close(); },
  });
  const request: RequestInit & { duplex: "half" } = {
    method: "POST", headers, body: stream, signal, duplex: "half",
  };
  const response = serviceUrl
    ? await fetch(url, request)
    : await getMediaContainer().getByName("primary").fetch(url.href, request);
  if (!response.ok) {
    throw new Error(`Media service responded ${response.status} for ${kind} thumbnail`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Check if file type supports thumbnail generation
 */
export function supportsThumbnail(mimeType: string): boolean {
  const imageTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
  ];

  const videoTypes = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
  ];

  const documentTypes = ["application/pdf"];

  return imageTypes.includes(mimeType) || videoTypes.includes(mimeType) || documentTypes.includes(mimeType);
}

export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isVideoType(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}
