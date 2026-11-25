/**
 * Media service: HTTP wrapper around the native thumbnail generators.
 *
 *   POST /thumbnail?kind=image|video|pdf[&width=&height=&quality=&format=]
 *   body: raw file bytes, content-type: the file's mime type
 *   -> image/webp bytes
 *
 * Protected by MEDIA_SERVICE_TOKEN when set. Intended for a Cloudflare
 * Container (or any Node host with ffmpeg, graphicsmagick, and ghostscript).
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { MAX_THUMBNAIL_BYTES, readThumbnailBody, ThumbnailBodyTooLarge } from "./body-limit";
import {
  generateImageThumbnail,
  generatePdfThumbnail,
  generateVideoThumbnail,
  type ThumbnailOptions,
} from "./thumbnail-native";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "bucket0-media" }));

app.post("/thumbnail", async (c) => {
  const token = process.env.MEDIA_SERVICE_TOKEN;
  if (token && c.req.header("authorization") !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const kind = c.req.query("kind");
  if (kind !== "image" && kind !== "video" && kind !== "pdf") {
    return c.json({ error: "kind must be image, video, or pdf" }, 400);
  }

  const length = Number(c.req.header("content-length") || 0);
  if (length > MAX_THUMBNAIL_BYTES) {
    return c.json({ error: `Body exceeds ${MAX_THUMBNAIL_BYTES} bytes` }, 413);
  }

  const options: ThumbnailOptions = {};
  const width = c.req.query("width");
  const height = c.req.query("height");
  const quality = c.req.query("quality");
  const format = c.req.query("format");
  if (width) options.width = Number(width);
  if (height) options.height = Number(height);
  if (quality) options.quality = Number(quality);
  if (format === "webp" || format === "jpeg" || format === "png") options.format = format;

  const mimeType = c.req.header("content-type") || "application/octet-stream";

  try {
    const buffer = await readThumbnailBody(c.req.raw.body);
    const thumbnail =
      kind === "image"
        ? await generateImageThumbnail(buffer, options)
        : kind === "video"
          ? await generateVideoThumbnail(buffer, options, mimeType)
          : await generatePdfThumbnail(buffer, options);
    return new Response(new Uint8Array(thumbnail), {
      headers: { "content-type": `image/${options.format ?? "webp"}` },
    });
  } catch (error) {
    if (error instanceof ThumbnailBodyTooLarge) return c.json({ error: error.message }, 413);
    console.error("thumbnail failed", { kind, mimeType, error });
    return c.json({ error: "Thumbnail generation failed" }, 500);
  }
});

const port = Number(process.env.PORT || 8080);
serve({ fetch: app.fetch, port }, () => {
  console.log(`bucket0-media listening on :${port}`);
});
