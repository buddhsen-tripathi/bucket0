
import { useCallback } from "react";

interface ProtectedMediaProps {
  children: React.ReactNode;
  allowDownload: boolean;
}

/**
 * Wrapper component that ALWAYS prevents right-click context menu.
 * Downloads should only happen via the toolbar Download button (when allowed).
 * Note: This is a soft protection - determined users can still use dev tools, screenshots, etc.
 * The goal is to discourage casual downloading while allowing viewing.
 */
export function ProtectedMediaWrapper({ children }: ProtectedMediaProps) {
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  }, []);

  return (
    <div
      onContextMenu={handleContextMenu}
      className="select-none"
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      {children}
    </div>
  );
}

interface ProtectedVideoProps {
  src: string;
  allowDownload: boolean;
  className?: string;
}

/**
 * Video player that ALWAYS hides browser download controls.
 * Downloads should only happen via the toolbar Download button.
 */
export function ProtectedVideo({ src, className }: ProtectedVideoProps) {
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  }, []);

  return (
    <video
      src={src}
      controls
      preload="metadata"
      playsInline
      controlsList="nodownload noplaybackrate"
      disablePictureInPicture
      onContextMenu={handleContextMenu}
      className={className}
    >
      Your browser does not support the video tag.
    </video>
  );
}

interface ProtectedAudioProps {
  src: string;
  allowDownload: boolean;
  className?: string;
}

/**
 * Audio player that ALWAYS hides browser download controls.
 * Downloads should only happen via the toolbar Download button.
 */
export function ProtectedAudio({ src, className }: ProtectedAudioProps) {
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  }, []);

  return (
    <audio
      src={src}
      controls
      controlsList="nodownload"
      onContextMenu={handleContextMenu}
      className={className}
    >
      Your browser does not support the audio tag.
    </audio>
  );
}

interface ProtectedImageProps {
  src: string;
  alt: string;
  allowDownload: boolean;
  className?: string;
}

/**
 * Image that ALWAYS prevents right-click and drag-to-save.
 * Downloads should only happen via the toolbar Download button.
 */
export function ProtectedImage({ src, alt, className }: ProtectedImageProps) {
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    return false;
  }, []);

  return (
    <div
      className="relative select-none"
      onContextMenu={handleContextMenu}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        onDragStart={handleDragStart}
      />
      {/* Invisible overlay to block direct image interactions */}
      <div
        className="absolute inset-0 bg-transparent"
        style={{ pointerEvents: "auto" }}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}

interface ProtectedPdfProps {
  src: string;
  title: string;
  allowDownload: boolean;
  className?: string;
}

/**
 * PDF viewer with full browser controls (zoom, page nav, etc.).
 * Chrome's PDF viewer doesn't allow hiding just download while keeping other controls,
 * so we keep full functionality for better UX.
 */
export function ProtectedPdf({ src, title, className }: ProtectedPdfProps) {
  return (
    <iframe
      src={src}
      className={className}
      title={title}
    />
  );
}
