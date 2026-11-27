
import { useState, useCallback, useEffect } from "react";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { mayHaveTransparency } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "compress-image")!;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CompressImagePage() {
  const {
    file,
    setFile,
    imageUrl,
    imageEl,
    result,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    setResult,
    download,
    reset,
  } = useImageTool();

  const [quality, setQuality] = useState(60);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [outputFormat, setOutputFormat] = useState<"jpeg" | "webp">("jpeg");

  // Live estimate: compress in background whenever quality or format changes
  useEffect(() => {
    if (!imageEl) {
      setEstimatedSize(null);
      return;
    }

    let cancelled = false;

    const estimate = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = imageEl.naturalWidth;
      canvas.height = imageEl.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageEl, 0, 0);

      const mime = outputFormat === "webp" ? "image/webp" : "image/jpeg";

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), mime, quality / 100);
      });

      if (!cancelled && blob) {
        setEstimatedSize(blob.size);
      }
    };

    // Debounce
    const timer = setTimeout(estimate, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [imageEl, quality, outputFormat]);

  const handleCompress = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = imageEl.naturalWidth;
      canvas.height = imageEl.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageEl, 0, 0);

      const mime = outputFormat === "webp" ? "image/webp" : "image/jpeg";
      const ext = outputFormat === "webp" ? "webp" : "jpg";

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to compress image."));
          },
          mime,
          quality / 100
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-compressed.${ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, quality, outputFormat, setIsProcessing, setError, setResult]);

  const savings =
    file && estimatedSize !== null
      ? Math.round((1 - estimatedSize / file.size) * 100)
      : null;

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        <FileDropZone
          accept="image/*"
          files={file ? [file] : []}
          onFiles={(files) => setFile(files[0] || null)}
          onRemove={() => reset()}
          label="Drop your image here or click to browse"
          sublabel="Any image format up to 100MB"
        />

        {file && imageUrl && imageEl && (
          <>
            {/* Preview + info */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
              <div className="flex justify-center">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="max-h-64 rounded-lg object-contain"
                />
              </div>
              <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{imageEl.naturalWidth} x {imageEl.naturalHeight}px</span>
                <span>Original: {formatFileSize(file.size)}</span>
              </div>
            </div>

            {/* Compression controls */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              {/* Output format */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Output Format</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOutputFormat("jpeg")}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      outputFormat === "jpeg"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    JPEG
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputFormat("webp")}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      outputFormat === "webp"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    WebP
                  </button>
                </div>
                {file && mayHaveTransparency(file.name) && outputFormat === "jpeg" && (
                  <p className="text-xs text-warning dark:text-warning">
                    This image may have transparency. JPEG does not support transparency — transparent areas will appear black. Use WebP to preserve it.
                  </p>
                )}
              </div>

              {/* Quality */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <h3 className="text-sm font-medium text-foreground">Quality</h3>
                  <span className="text-sm font-mono text-foreground">{quality}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground px-0.5">
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((q) => (
                    <span key={q} className={quality === q ? "text-foreground font-medium" : ""}>{q}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Default is 60%. At 100% the image is re-encoded at maximum quality, which may produce a larger file than the original.
                </p>
              </div>

              {/* Size estimate */}
              {estimatedSize !== null && (
                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Estimated size: </span>
                    <span className="font-medium text-foreground">
                      {formatFileSize(estimatedSize)}
                    </span>
                  </div>
                  {savings !== null && (
                    <span
                      className={`text-sm font-medium ${
                        savings > 0
                          ? "text-success dark:text-success"
                          : "text-warning dark:text-warning"
                      }`}
                    >
                      {savings > 0 ? `${savings}% smaller` : `${Math.abs(savings)}% larger`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleCompress}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Compressing...
              </>
            ) : (
              "Compress"
            )}
          </Button>

          {result && (
            <>
              <Button onClick={download} variant="outline" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button onClick={reset} variant="ghost" size="lg">
                <RotateCcw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
            </>
          )}
        </div>

        {result && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success dark:text-success text-sm">
            Image compressed successfully ({formatFileSize(result.size)}).
            Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Compress Image Online Free | Bucket0",
  description:
    "Reduce image file size with an adjustable quality slider and live preview. Fast, free, and secure — no uploads to any server. Compress images entirely in your browser with Bucket0.",
});
