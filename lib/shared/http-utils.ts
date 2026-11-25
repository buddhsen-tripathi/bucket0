/**
 * Shared file utility functions
 * Range header parsing and content type detection
 */

/**
 * Parse HTTP Range header into start/end byte positions
 */
export function parseRange(
  rangeHeader: string | null,
  fileSize: number
): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const range = rangeHeader.replace("bytes=", "");
  const parts = range.split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= fileSize) {
    return null;
  }

  return { start, end };
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  // Documents
  pdf: "application/pdf",
  // Archives
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  // Text/Plain files
  txt: "text/plain",
  log: "text/plain",
  csv: "text/plain",
  tsv: "text/plain",
  // Markdown
  md: "text/plain",
  mdx: "text/plain",
  markdown: "text/plain",
  rst: "text/plain",
  // Web
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  scss: "text/plain",
  sass: "text/plain",
  less: "text/plain",
  // JavaScript/TypeScript
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/plain",
  tsx: "text/plain",
  mjs: "text/javascript",
  cjs: "text/javascript",
  // Data/Config
  json: "application/json",
  yaml: "text/plain",
  yml: "text/plain",
  toml: "text/plain",
  xml: "application/xml",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  // Programming languages
  py: "text/plain",
  pyw: "text/plain",
  java: "text/plain",
  kt: "text/plain",
  kts: "text/plain",
  groovy: "text/plain",
  scala: "text/plain",
  c: "text/plain",
  cpp: "text/plain",
  cc: "text/plain",
  cxx: "text/plain",
  h: "text/plain",
  hpp: "text/plain",
  hxx: "text/plain",
  cs: "text/plain",
  go: "text/plain",
  rs: "text/plain",
  rb: "text/plain",
  rake: "text/plain",
  php: "text/plain",
  swift: "text/plain",
  m: "text/plain",
  mm: "text/plain",
  r: "text/plain",
  dart: "text/plain",
  lua: "text/plain",
  pl: "text/plain",
  pm: "text/plain",
  sql: "text/plain",
  // Shell
  sh: "text/plain",
  bash: "text/plain",
  zsh: "text/plain",
  fish: "text/plain",
  // Other config/data
  gitignore: "text/plain",
  dockerignore: "text/plain",
  editorconfig: "text/plain",
  prettierrc: "text/plain",
  eslintrc: "text/plain",
};

/**
 * Get MIME content type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return CONTENT_TYPE_MAP[ext || ""] || "application/octet-stream";
}

/**
 * Client IP for rate limiting. Cloudflare sets cf-connecting-ip and it cannot be
 * spoofed by the client; x-forwarded-for keeps any client-supplied first hop, so
 * it is only a local-development fallback.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
