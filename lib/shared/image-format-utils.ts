/**
 * Browser-side image format utilities for the image tools.
 * No server imports — safe for "use client" components.
 */

interface OutputFormatInfo {
  mime: string;
  ext: string;
  quality: number | undefined;
}

/**
 * Determine the best output format for a file, preserving the original format
 * when the browser supports it via canvas.toBlob.
 *
 * - PNG stays PNG (lossless, supports transparency)
 * - WebP stays WebP (widely supported)
 * - JPEG/JPG stays JPEG
 * - Unsupported formats (AVIF, BMP, TIFF, etc.) fall back to PNG to preserve quality
 */
export function getOutputFormat(fileName: string): OutputFormatInfo {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "png":
      return { mime: "image/png", ext: "png", quality: undefined };
    case "webp":
      return { mime: "image/webp", ext: "webp", quality: 0.92 };
    case "jpg":
    case "jpeg":
      return { mime: "image/jpeg", ext: "jpg", quality: 0.92 };
    default:
      // AVIF, BMP, TIFF, GIF, etc. — fall back to PNG to preserve quality & transparency
      return { mime: "image/png", ext: "png", quality: undefined };
  }
}

/**
 * Check if a file likely has transparency based on its format.
 * Only PNG and WebP support alpha channels.
 */
export function mayHaveTransparency(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "png" || ext === "webp";
}

/**
 * Max canvas dimension supported by most browsers.
 */
export const MAX_CANVAS_DIMENSION = 16384;

/**
 * Check if image dimensions exceed browser canvas limits.
 */
export function exceedsCanvasLimit(width: number, height: number): boolean {
  return width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION;
}
