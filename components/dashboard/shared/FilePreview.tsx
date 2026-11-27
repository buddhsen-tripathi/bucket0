
import React, { useState, useEffect, useCallback } from "react";
import { X, Download, ExternalLink, Share2, ChevronLeft, ChevronRight } from "lucide-react";

interface PreviewableFile {
  key: string;
  name: string;
}

interface FilePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  fileKey: string;
  fileName: string;
  onDownload: () => void;
  getPreviewUrl: (key: string) => Promise<string>;
  mode?: "cloud" | "dev" | "teams";
  onShare?: () => void;
  // Navigation props
  files?: PreviewableFile[];
  onNavigate?: (file: PreviewableFile) => void;
}

export default function FilePreview({
  isOpen,
  onClose,
  fileKey,
  fileName,
  onDownload,
  getPreviewUrl,
  mode = "cloud",
  onShare,
  files,
  onNavigate,
}: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Find current index in files list for navigation
  const currentIndex = files?.findIndex((f) => f.key === fileKey) ?? -1;
  const canGoPrev = files && currentIndex > 0;
  const canGoNext = files && currentIndex < files.length - 1;

  const goToPrev = useCallback(() => {
    if (canGoPrev && files && onNavigate) {
      onNavigate(files[currentIndex - 1]);
    }
  }, [canGoPrev, files, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (canGoNext && files && onNavigate) {
      onNavigate(files[currentIndex + 1]);
    }
  }, [canGoNext, files, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goToPrev, goToNext, onClose]);

  useEffect(() => {
    if (isOpen && fileKey) {
      const loadPreview = async () => {
        try {
          setLoading(true);
          setError("");
          const url = await getPreviewUrl(fileKey);

          setPreviewUrl(url);
        } catch {
          setError("Unable to load preview. Please try again.");
        } finally {
          setLoading(false);
        }
      };

      loadPreview();
    }
  }, [isOpen, fileKey, getPreviewUrl]);

  if (!isOpen) return null;

  const getFileExtension = (filename: string) => {
    return filename.split(".").pop()?.toLowerCase() || "";
  };

  const extension = getFileExtension(fileName);

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(
    extension
  );
  const isPdf = extension === "pdf";
  const isVideo = ["mp4", "webm", "mov", "avi", "mkv"].includes(extension);
  const isAudio = ["mp3", "wav", "flac", "aac", "ogg"].includes(extension);
  const isText = ["txt", "log", "csv", "tsv"].includes(extension);

  // Code files - comprehensive list including markdown and data formats
  const isCode = [
    // JavaScript/TypeScript
    "js", "jsx", "ts", "tsx", "mjs", "cjs",
    // Web
    "html", "htm", "css", "scss", "sass", "less",
    // Python
    "py", "pyw", "pyc", "pyo", "pyd",
    // Java/JVM
    "java", "class", "jar", "kt", "kts", "groovy", "scala",
    // C/C++
    "c", "cpp", "cc", "cxx", "h", "hpp", "hxx",
    // C#/.NET
    "cs", "csx", "vb",
    // Go
    "go",
    // Rust
    "rs",
    // Ruby
    "rb", "rake",
    // PHP
    "php", "phtml",
    // Swift
    "swift",
    // Objective-C
    "m", "mm",
    // Shell/Bash
    "sh", "bash", "zsh", "fish",
    // Data/Config
    "json", "yaml", "yml", "toml", "xml", "ini", "cfg", "conf",
    // Markdown/Documentation
    "md", "mdx", "markdown", "rst",
    // SQL
    "sql",
    // Other languages
    "r", "dart", "lua", "vim", "pl", "pm", "asm", "s",
  ].includes(extension);

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-sm h-12 w-12 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Loading preview...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-destructive">
          <div className="text-6xl mb-4">❌</div>
          <h3 className="text-lg font-medium mb-2">Preview unavailable</h3>
          <p className="text-sm text-muted-foreground mb-4">Unable to load this file. Try downloading it instead.</p>
          <button
            onClick={onDownload}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors"
          >
            <Download size={16} />
            Download instead
          </button>
        </div>
      );
    }

    if (isImage) {
      return (
        <img
          src={previewUrl}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
          onError={() => setError("Unable to load image")}
        />
      );
    }

    if (isPdf || isText || isCode) {
      // For PDFs, append #toolbar=0 to hide the toolbar in Chrome/Edge
      const iframeSrc = isPdf ? `${previewUrl}#toolbar=0` : previewUrl;

      return (
        <iframe
          src={iframeSrc}
          // Sandbox user text/code (no scripts); PDFs need the unsandboxed built-in viewer
          sandbox={isPdf ? undefined : ""}
          className="w-full h-full border-0"
          title={fileName}
          onError={() => setError("Unable to load document")}
        />
      );
    }

    if (isVideo) {
      return (
        <video
          src={previewUrl}
          controls
          autoPlay
          muted
          className="max-w-full max-h-full"
          onError={() => setError("Unable to load video")}
        >
          Your browser does not support the video element.
        </video>
      );
    }

    if (isAudio) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="mb-4">
            <div className="text-6xl mb-4">🎵</div>
            <h3 className="text-lg font-medium text-foreground">{fileName}</h3>
          </div>
          <audio
            src={previewUrl}
            controls
            className="w-full max-w-md"
            onError={() => setError("Unable to load audio")}
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    // Fallback for unsupported file types
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="text-6xl mb-4">📄</div>
        <h3 className="text-lg font-medium text-foreground mb-2">{fileName}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Preview not available for this file type
        </p>
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors"
        >
          <Download size={16} />
          Download to view
        </button>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-card rounded-sm shadow-xl border border-border w-full max-w-6xl h-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {fileName}
            </h2>
            <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded">
              {extension.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-sm transition-colors"
              title="Download"
            >
              <Download size={16} />
            </button>
            {mode === "cloud" && onShare && (
              <button
                onClick={onShare}
                className="p-2 text-muted-foreground hover:text-primary dark:hover:text-primary hover:bg-primary/10 rounded-sm transition-colors"
                title="Share"
              >
                <Share2 size={16} />
              </button>
            )}
            {mode === "cloud" && (
              <button
                onClick={() => window.open(previewUrl, "_blank")}
                className="p-2 text-muted-foreground hover:text-success dark:hover:text-success hover:bg-success/10 rounded-sm transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 p-4 overflow-hidden relative">
          <div className="w-full h-full flex items-center justify-center bg-muted/50 rounded-sm overflow-hidden">
            {renderPreview()}
          </div>

          {/* Navigation Arrows */}
          {files && files.length > 1 && (
            <>
              {/* Previous Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrev();
                }}
                disabled={!canGoPrev}
                className={`absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg transition-all ${
                  canGoPrev
                    ? "hover:bg-background hover:scale-110 text-foreground"
                    : "opacity-30 cursor-not-allowed text-muted-foreground"
                }`}
                title="Previous (←)"
              >
                <ChevronLeft size={24} />
              </button>

              {/* Next Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                disabled={!canGoNext}
                className={`absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg transition-all ${
                  canGoNext
                    ? "hover:bg-background hover:scale-110 text-foreground"
                    : "opacity-30 cursor-not-allowed text-muted-foreground"
                }`}
                title="Next (→)"
              >
                <ChevronRight size={24} />
              </button>

              {/* File Counter */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border text-sm text-muted-foreground">
                {currentIndex + 1} / {files.length}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
