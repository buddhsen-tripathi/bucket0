
import { useState, useCallback, useEffect } from "react";
import { Loader2, Download, RotateCcw, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { getOutputFormat } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "resize-image")!;

type ResizeMode = "pixels" | "percentage";

export default function ResizeImagePage() {
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

  const [mode, setMode] = useState<ResizeMode>("pixels");
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [percentage, setPercentage] = useState<number>(50);
  const [lockAspect, setLockAspect] = useState(true);

  // When image loads, set initial dimensions
  const handleFile = useCallback(
    (f: File | null) => {
      setFile(f);
      // Dimensions will be set when imageEl becomes available
    },
    [setFile]
  );

  // Sync dimensions when imageEl loads
  useEffect(() => {
    if (imageEl) {
      setWidth(imageEl.naturalWidth);
      setHeight(imageEl.naturalHeight);
    }
  }, [imageEl]);

  const handleWidthChange = useCallback(
    (val: number) => {
      setWidth(val);
      if (lockAspect && imageEl && imageEl.naturalWidth > 0) {
        const ratio = imageEl.naturalHeight / imageEl.naturalWidth;
        setHeight(Math.round(val * ratio));
      }
    },
    [lockAspect, imageEl]
  );

  const handleHeightChange = useCallback(
    (val: number) => {
      setHeight(val);
      if (lockAspect && imageEl && imageEl.naturalHeight > 0) {
        const ratio = imageEl.naturalWidth / imageEl.naturalHeight;
        setWidth(Math.round(val * ratio));
      }
    },
    [lockAspect, imageEl]
  );

  const handleResize = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      let targetW: number;
      let targetH: number;

      if (mode === "percentage") {
        targetW = Math.round(imageEl.naturalWidth * (percentage / 100));
        targetH = Math.round(imageEl.naturalHeight * (percentage / 100));
      } else {
        targetW = width;
        targetH = height;
      }

      if (targetW < 1 || targetH < 1) {
        setError("Dimensions must be at least 1px.");
        return;
      }

      if (targetW > 16384 || targetH > 16384) {
        setError("Maximum dimension is 16384px.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imageEl, 0, 0, targetW, targetH);

      const fmt = getOutputFormat(file.name);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to resize image."));
          },
          fmt.mime,
          fmt.quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-${targetW}x${targetH}.${fmt.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, mode, width, height, percentage, setIsProcessing, setError, setResult]);

  const resetAll = useCallback(() => {
    reset();
    setWidth(0);
    setHeight(0);
    setPercentage(50);
  }, [reset]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        <FileDropZone
          accept="image/*"
          files={file ? [file] : []}
          onFiles={(files) => handleFile(files[0] || null)}
          onRemove={() => { resetAll(); }}
          label="Drop your image here or click to browse"
          sublabel="Any image format up to 100MB"
        />

        {file && imageUrl && imageEl && (
          <>
            {/* Preview */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Original</h3>
              <div className="flex justify-center">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="max-h-64 rounded-lg object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {imageEl.naturalWidth} x {imageEl.naturalHeight}px
              </p>
            </div>

            {/* Resize controls */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">Resize Mode</h3>
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setMode("pixels")}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      mode === "pixels"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Pixels
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("percentage")}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      mode === "percentage"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Percentage
                  </button>
                </div>
              </div>

              {mode === "pixels" ? (
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Width (px)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={16384}
                      value={width}
                      onChange={(e) => handleWidthChange(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setLockAspect((v) => !v)}
                    className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors mb-0.5"
                    title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
                  >
                    {lockAspect ? (
                      <Link2 className="w-4 h-4 text-primary" />
                    ) : (
                      <Link2Off className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Height (px)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={16384}
                      value={height}
                      onChange={(e) => handleHeightChange(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Scale</span>
                    <span className="text-sm font-mono text-foreground">{percentage}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={10}
                    value={percentage}
                    onChange={(e) => setPercentage(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground px-0.5">
                    {[10, 30, 50, 70, 90, 110, 130, 150, 170, 190].map((p) => (
                      <span key={p} className={percentage === p ? "text-foreground font-medium" : ""}>{p}</span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(imageEl.naturalWidth * (percentage / 100))} x{" "}
                    {Math.round(imageEl.naturalHeight * (percentage / 100))}px
                  </p>
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
            onClick={handleResize}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resizing...
              </>
            ) : (
              "Resize"
            )}
          </Button>

          {result && (
            <>
              <Button onClick={download} variant="outline" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button onClick={resetAll} variant="ghost" size="lg">
                <RotateCcw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
            </>
          )}
        </div>

        {result && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success dark:text-success text-sm">
            Image resized successfully. Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Resize Image Online Free | Bucket0",
  description:
    "Resize images by pixels or percentage while preserving aspect ratio. Fast, free, and secure — no uploads to any server. Resize images entirely in your browser with Bucket0.",
});
