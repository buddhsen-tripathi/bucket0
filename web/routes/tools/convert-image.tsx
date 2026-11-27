
import { useState, useCallback, useMemo, useEffect } from "react";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { exceedsCanvasLimit } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "convert-image")!;

type OutputFormat = "png" | "jpeg" | "webp" | "avif" | "bmp";

const FORMAT_OPTIONS: { id: OutputFormat; label: string; ext: string; mime: string }[] = [
  { id: "png", label: "PNG", ext: "png", mime: "image/png" },
  { id: "jpeg", label: "JPG", ext: "jpg", mime: "image/jpeg" },
  { id: "webp", label: "WebP", ext: "webp", mime: "image/webp" },
  { id: "avif", label: "AVIF", ext: "avif", mime: "image/avif" },
  { id: "bmp", label: "BMP", ext: "bmp", mime: "image/bmp" },
];

export default function ConvertImagePage() {
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

  const [format, setFormat] = useState<OutputFormat>("png");

  const currentFormat = useMemo((): OutputFormat | null => {
    if (!file) return null;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "jpeg";
    if (ext === "png" || ext === "webp" || ext === "avif" || ext === "bmp") return ext as OutputFormat;
    return null;
  }, [file]);

  const availableFormats = useMemo(
    () => FORMAT_OPTIONS.filter((f) => f.id !== currentFormat),
    [currentFormat]
  );

  // Auto-select first available format when file changes
  useEffect(() => {
    if (availableFormats.length > 0 && currentFormat === format) {
      setFormat(availableFormats[0].id);
    }
  }, [availableFormats, currentFormat, format]);


  const handleConvert = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      if (exceedsCanvasLimit(imageEl.naturalWidth, imageEl.naturalHeight)) {
        setError("Image is too large (max 16384px per side). Resize it first.");
        setIsProcessing(false);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = imageEl.naturalWidth;
      canvas.height = imageEl.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageEl, 0, 0);

      const selected = FORMAT_OPTIONS.find((f) => f.id === format)!;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error(`Failed to convert to ${selected.label}.`));
          },
          selected.mime,
          format === "jpeg" ? 0.92 : undefined
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}.${selected.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, format, setIsProcessing, setError, setResult]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        <FileDropZone
          accept="image/*"
          files={file ? [file] : []}
          onFiles={(files) => setFile(files[0] || null)}
          onRemove={() => setFile(null)}
          label="Drop your image here or click to browse"
          sublabel="PNG, JPG, WebP, AVIF, BMP up to 100MB"
        />

        {file && imageUrl && (
          <>
            {/* Preview */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
              <div className="flex justify-center">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="max-h-64 rounded-lg object-contain"
                />
              </div>
              {imageEl && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {imageEl.naturalWidth} x {imageEl.naturalHeight}px
                </p>
              )}
            </div>

            {/* Format selection */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-foreground">Convert to</h3>
              <div className={cn("grid gap-2", availableFormats.length <= 4 ? "grid-cols-4" : "grid-cols-5")}>
                {availableFormats.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormat(opt.id)}
                    disabled={isProcessing}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-3 transition-all",
                      "text-sm hover:border-primary/50",
                      format === opt.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-muted/30"
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
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
            onClick={handleConvert}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              "Convert"
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
            Image converted successfully. Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Convert Image Online Free | Bucket0",
  description:
    "Convert images between formats — PNG, JPG, WebP, AVIF, and BMP. Fast, free, and secure — no uploads to any server. Convert images entirely in your browser with Bucket0.",
});
