
import { useState, useCallback, useMemo } from "react";
import {
  Loader2,
  Download,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { getOutputFormat } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "rotate-image")!;

type Rotation = 0 | 90 | 180 | 270;

export default function RotateImagePage() {
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

  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const rotateLeft = useCallback(() => {
    setRotation((r) => (((r - 90 + 360) % 360) as Rotation));
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((r) => (((r + 90) % 360) as Rotation));
  }, []);

  const previewTransform = useMemo(() => {
    const transforms: string[] = [];
    if (rotation !== 0) transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push("scaleX(-1)");
    if (flipV) transforms.push("scaleY(-1)");
    return transforms.join(" ");
  }, [rotation, flipH, flipV]);

  const handleApply = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    if (rotation === 0 && !flipH && !flipV) {
      setError("No transformations applied.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { naturalWidth: w, naturalHeight: h } = imageEl;
      const swapDims = rotation === 90 || rotation === 270;
      const canvasW = swapDims ? h : w;
      const canvasH = swapDims ? w : h;

      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d")!;

      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.drawImage(imageEl, -w / 2, -h / 2);

      const fmt = getOutputFormat(file.name);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to transform image."));
          },
          fmt.mime,
          fmt.quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-rotated.${fmt.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, rotation, flipH, flipV, setIsProcessing, setError, setResult]);

  const resetAll = useCallback(() => {
    reset();
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  }, [reset]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        <FileDropZone
          accept="image/*"
          files={file ? [file] : []}
          onFiles={(files) => setFile(files[0] || null)}
          onRemove={() => resetAll()}
          label="Drop your image here or click to browse"
          sublabel="Any image format up to 100MB"
        />

        {file && imageUrl && imageEl && (
          <>
            {/* Preview with transforms */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
              <div className="flex justify-center overflow-hidden">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="max-h-72 object-contain rounded-lg transition-transform duration-300"
                  style={{ transform: previewTransform }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-medium text-foreground">Transform</h3>

              {/* Rotation */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Rotation: {rotation}°</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={rotateLeft}
                    disabled={isProcessing}
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    90° Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={rotateRight}
                    disabled={isProcessing}
                  >
                    <RotateCw className="w-4 h-4 mr-1.5" />
                    90° Right
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRotation(180)}
                    disabled={isProcessing}
                  >
                    180°
                  </Button>
                </div>
              </div>

              {/* Flip */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Flip</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFlipH((v) => !v)}
                    disabled={isProcessing}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors",
                      flipH
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                    )}
                  >
                    <FlipHorizontal className="w-4 h-4" />
                    Horizontal
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipV((v) => !v)}
                    disabled={isProcessing}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors",
                      flipV
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                    )}
                  >
                    <FlipVertical className="w-4 h-4" />
                    Vertical
                  </button>
                </div>
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
            onClick={handleApply}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              "Apply"
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
            Image transformed successfully. Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Rotate & Flip Image Online Free | Bucket0",
  description:
    "Rotate images 90/180/270 degrees or flip horizontally and vertically. Fast, free, and secure — no uploads to any server. Rotate and flip images entirely in your browser with Bucket0.",
});
