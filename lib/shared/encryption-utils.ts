/**
 * Shared encryption utility functions
 * Determines which file types should skip encryption
 */

export const SKIP_ENCRYPTION_EXTENSIONS = new Set([
  // Executables & installers
  'exe', 'msi', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appimage',
  // Archives (already compressed, often public)
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
  // Disk images
  'iso', 'img',
]);

export const SKIP_ENCRYPTION_MIMETYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/vnd.android.package-archive',
  'application/x-apple-diskimage',
  'application/x-rpm',
  'application/x-deb',
]);

/**
 * Check if file should skip encryption based on type
 */
export function shouldSkipEncryption(filename: string, mimeType: string): boolean {
  if (SKIP_ENCRYPTION_MIMETYPES.has(mimeType)) {
    return true;
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && SKIP_ENCRYPTION_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}
