/**
 * Native thumbnail generation (sharp, ffmpeg, graphicsmagick + ghostscript).
 * Runs in the media service container, never in the Worker.
 */

import sharp from "sharp";
import { fromBuffer } from "pdf2pic";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cloudLog = { error: (fields: unknown, msg: string) => console.error(msg, fields) };

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "jpeg" | "png";
}

const DEFAULT_OPTIONS: Required<ThumbnailOptions> = {
  width: 400,
  height: 400,
  quality: 85,
  format: "webp",
};

/**
 * Generate thumbnail from image buffer with aspect-ratio-aware sizing
 * For square/near-square images: 400x400px
 * For landscape: 400px width, height scaled proportionally (max 400px)
 * For portrait: 400px height, width scaled proportionally (max 400px)
 */
export async function generateImageThumbnail(
  buffer: Buffer,
  options: ThumbnailOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Get image metadata to determine aspect ratio
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 400;
    const height = metadata.height || 400;
    const aspectRatio = width / height;

    let resizeOptions: sharp.ResizeOptions;

    if (aspectRatio >= 0.9 && aspectRatio <= 1.1) {
      // Square or near-square (aspect ratio between 0.9 and 1.1)
      // Use exact 400x400 with cover to fill the space
      resizeOptions = {
        width: opts.width,
        height: opts.height,
        fit: "cover",
        position: "center",
      };
    } else if (aspectRatio > 1.1) {
      // Landscape (wider than tall)
      // Scale to 400px width, maintain aspect ratio
      resizeOptions = {
        width: opts.width,
        height: undefined,
        fit: "inside",
        withoutEnlargement: true,
      };
    } else {
      // Portrait (taller than wide)
      // Scale to 400px height, maintain aspect ratio
      resizeOptions = {
        width: undefined,
        height: opts.height,
        fit: "inside",
        withoutEnlargement: true,
      };
    }

    const thumbnail = await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF orientation
      .resize(resizeOptions)
      [opts.format]({ quality: opts.quality })
      .toBuffer();

    return thumbnail;
  } catch (error) {
    cloudLog.error({ err: error }, "Image thumbnail generation failed");
    throw new Error("Failed to generate image thumbnail");
  }
}

/**
 * Generate thumbnail from video (first frame)
 * Uses ffmpeg to extract first frame, then processes with sharp for aspect-ratio-aware sizing
 */
export async function generateVideoThumbnail(
  buffer: Buffer,
  options: ThumbnailOptions = {},
  mimeType: string = "video/mp4"
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const ffmpeg = require("fluent-ffmpeg");
    const { tmpdir } = require("os");
    const { join } = require("path");
    const { writeFile, unlink, readFile } = require("fs/promises");
    const { randomUUID } = require("crypto");

    // Get extension from mime type
    const extMap: Record<string, string> = {
      "video/mp4": ".mp4",
      "video/webm": ".webm",
      "video/quicktime": ".mov",
      "video/x-msvideo": ".avi",
      "video/x-matroska": ".mkv",
    };
    const ext = extMap[mimeType] || ".mp4";

    // Write video to temp file (ffmpeg needs seekable file for screenshots)
    const tempId = randomUUID();
    const tempVideoPath = join(tmpdir(), `video_${tempId}${ext}`);
    const tempFramePath = join(tmpdir(), `frame_${tempId}.png`);

    await writeFile(tempVideoPath, buffer);

    // Extract first frame using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .screenshots({
          timestamps: [0],
          filename: `frame_${tempId}.png`,
          folder: tmpdir(),
          size: "?x400",
        })
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`ffmpeg error: ${err.message}`)));
    });

    // Read frame and process with sharp
    const frameBuffer = await readFile(tempFramePath);
    const thumbnail = await generateImageThumbnail(frameBuffer, opts);

    // Cleanup temp files
    await unlink(tempVideoPath).catch(() => {});
    await unlink(tempFramePath).catch(() => {});

    return thumbnail;
  } catch (error) {
    cloudLog.error({ err: error }, "Video thumbnail generation failed");
    throw new Error("Failed to generate video thumbnail");
  }
}

/**
 * Generate thumbnail from PDF (first page)
 * Uses pdf2pic to convert first page to image, then processes with sharp
 * Requires GraphicsMagick or ImageMagick + Ghostscript installed on system
 */
export async function generatePdfThumbnail(
  buffer: Buffer,
  options: ThumbnailOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const { tmpdir } = require("os");
    const { join } = require("path");
    const { writeFile, unlink, readFile } = require("fs/promises");
    const { randomUUID } = require("crypto");

    // pdf2pic requires a file path, so write buffer to temp file
    const tempId = randomUUID();
    const tempPdfPath = join(tmpdir(), `pdf_${tempId}.pdf`);

    await writeFile(tempPdfPath, buffer);

    // Convert first page to image
    const converter = fromBuffer(buffer, {
      density: 150, // DPI for rendering
      saveFilename: `pdf_${tempId}`,
      savePath: tmpdir(),
      format: "png",
      width: 800, // Render at higher res for quality
      height: 800,
    });

    const result = await converter(1); // Convert page 1

    if (!result.path) {
      throw new Error("PDF conversion failed - no output path");
    }

    // Read the generated image and process with sharp
    const pngBuffer = await readFile(result.path);
    const thumbnail = await generateImageThumbnail(pngBuffer, opts);

    // Cleanup temp files
    await unlink(tempPdfPath).catch(() => {});
    await unlink(result.path).catch(() => {});

    return thumbnail;
  } catch (error) {
    cloudLog.error({ err: error }, "PDF thumbnail generation failed");
    throw new Error("Failed to generate PDF thumbnail");
  }
}
