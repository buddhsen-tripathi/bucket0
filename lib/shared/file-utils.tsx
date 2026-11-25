import React from "react";
import {
  MdOutlineFolder,
  MdOutlineInsertDriveFile,
  MdOutlineImage,
  MdOutlineVideocam,
  MdOutlineMusicNote,
  MdOutlineDescription,
  MdOutlineArchive,
  MdOutlineCode,
} from "react-icons/md";

export type FileFilter = "all" | "images" | "videos" | "documents" | "audio" | "other";

/**
 * Format file size in bytes to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "-";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Format date to relative format (Today, Yesterday, X days ago, or date)
 */
export function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return "Today"; // Handle clock skew (future dates)
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

/**
 * Get the appropriate icon for a file based on its extension
 */
export function getFileIcon(
  fileName: string,
  isDirectory: boolean,
  size: number = 20
): React.ReactElement {
  const iconClass = "text-foreground";

  if (isDirectory) {
    return <MdOutlineFolder className={iconClass} size={size} />;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) {
    return <MdOutlineInsertDriveFile className={iconClass} size={size} />;
  }

  const iconMap: Record<string, typeof MdOutlineInsertDriveFile> = {
    // Images
    jpg: MdOutlineImage,
    jpeg: MdOutlineImage,
    png: MdOutlineImage,
    gif: MdOutlineImage,
    webp: MdOutlineImage,
    svg: MdOutlineImage,
    bmp: MdOutlineImage,
    ico: MdOutlineImage,
    // Videos
    mp4: MdOutlineVideocam,
    avi: MdOutlineVideocam,
    mov: MdOutlineVideocam,
    mkv: MdOutlineVideocam,
    webm: MdOutlineVideocam,
    flv: MdOutlineVideocam,
    wmv: MdOutlineVideocam,
    // Audio
    mp3: MdOutlineMusicNote,
    wav: MdOutlineMusicNote,
    flac: MdOutlineMusicNote,
    aac: MdOutlineMusicNote,
    ogg: MdOutlineMusicNote,
    m4a: MdOutlineMusicNote,
    // Documents
    pdf: MdOutlineDescription,
    doc: MdOutlineDescription,
    docx: MdOutlineDescription,
    txt: MdOutlineDescription,
    md: MdOutlineDescription,
    xls: MdOutlineDescription,
    xlsx: MdOutlineDescription,
    ppt: MdOutlineDescription,
    pptx: MdOutlineDescription,
    // Archives
    zip: MdOutlineArchive,
    rar: MdOutlineArchive,
    tar: MdOutlineArchive,
    gz: MdOutlineArchive,
    "7z": MdOutlineArchive,
    // Code
    js: MdOutlineCode,
    ts: MdOutlineCode,
    jsx: MdOutlineCode,
    tsx: MdOutlineCode,
    py: MdOutlineCode,
    html: MdOutlineCode,
    css: MdOutlineCode,
    json: MdOutlineCode,
  };

  const Icon = iconMap[extension] || MdOutlineInsertDriveFile;
  return <Icon className={iconClass} size={size} />;
}

/**
 * Get the file type category based on file extension
 */
export function getFileType(fileName: string): FileFilter {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return "all";

  const imageExts = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
  ];
  const videoExts = ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv"];
  const audioExts = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
  const docExts = [
    "pdf",
    "doc",
    "docx",
    "txt",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "md",
  ];

  if (imageExts.includes(ext)) return "images";
  if (videoExts.includes(ext)) return "videos";
  if (audioExts.includes(ext)) return "audio";
  if (docExts.includes(ext)) return "documents";
  return "all";
}

/**
 * Check if a file can be previewed in the browser
 */
export function isPreviewable(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return false;

  const previewableExts = [
    // Images
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "bmp",
    // Videos
    "mp4",
    "webm",
    // Audio
    "mp3",
    "wav",
    "ogg",
    // Documents
    "pdf",
    "txt",
  ];

  return previewableExts.includes(ext);
}
