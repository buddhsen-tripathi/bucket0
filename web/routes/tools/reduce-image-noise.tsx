
import { useCallback, useMemo, useState } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { exceedsCanvasLimit, getOutputFormat } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "reduce-image-noise")!;

function clamp(v: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, v));
}

function denoiseImageData(
  src: ImageData,
  strength: number,
  threshold: number,
  sharpen: number
): ImageData {
  const w = src.width;
  const h = src.height;
  const inData = src.data;
  const smoothed = new Uint8ClampedArray(inData.length);

  const blend = strength / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;

          const nIdx = (ny * w + nx) * 4;
          rSum += inData[nIdx];
          gSum += inData[nIdx + 1];
          bSum += inData[nIdx + 2];
          count++;
        }
      }

      const rAvg = rSum / count;
      const gAvg = gSum / count;
      const bAvg = bSum / count;

      const dr = Math.abs(inData[idx] - rAvg);
      const dg = Math.abs(inData[idx + 1] - gAvg);
      const db = Math.abs(inData[idx + 2] - bAvg);
      const diff = (dr + dg + db) / 3;

      const edgeFactor = diff > threshold ? 0.25 : 1;
      const apply = blend * edgeFactor;

      smoothed[idx] = clamp(inData[idx] * (1 - apply) + rAvg * apply);
      smoothed[idx + 1] = clamp(inData[idx + 1] * (1 - apply) + gAvg * apply);
      smoothed[idx + 2] = clamp(inData[idx + 2] * (1 - apply) + bAvg * apply);
      smoothed[idx + 3] = inData[idx + 3];
    }
  }

  if (sharpen <= 0) {
    return new ImageData(smoothed, w, h);
  }

  const out = new Uint8ClampedArray(smoothed.length);
  const sharpAmt = sharpen / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const cR = smoothed[idx];
      const cG = smoothed[idx + 1];
      const cB = smoothed[idx + 2];

      let nR = 0;
      let nG = 0;
      let nB = 0;
      let count = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (kx === 0 && ky === 0) continue;
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;

          const nIdx = (ny * w + nx) * 4;
          nR += smoothed[nIdx];
          nG += smoothed[nIdx + 1];
          nB += smoothed[nIdx + 2];
          count++;
        }
      }

      const rBlur = nR / count;
      const gBlur = nG / count;
      const bBlur = nB / count;

      out[idx] = clamp(cR + (cR - rBlur) * sharpAmt);
      out[idx + 1] = clamp(cG + (cG - gBlur) * sharpAmt);
      out[idx + 2] = clamp(cB + (cB - bBlur) * sharpAmt);
      out[idx + 3] = smoothed[idx + 3];
    }
  }

  return new ImageData(out, w, h);
}

export default function ReduceImageNoisePage() {
  const {
    file,
    setFile,
    imageUrl,
    imageEl,
    result,
    resultFilename,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    setResult,
    download,
    reset,
  } = useImageTool();

  const [strength, setStrength] = useState(45);
  const [threshold, setThreshold] = useState(22);
  const [sharpen, setSharpen] = useState(30);

  const controlsSummary = useMemo(
    () => `${strength}% denoise • threshold ${threshold} • ${sharpen}% sharpen`,
    [sharpen, strength, threshold]
  );

  const handleProcess = useCallback(async () => {
    if (!file || !imageEl) {
      setError("Please select an image file.");
      return;
    }

    if (exceedsCanvasLimit(imageEl.naturalWidth, imageEl.naturalHeight)) {
      setError("Image is too large (max 16384px per side). Resize it first.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = imageEl.naturalWidth;
      canvas.height = imageEl.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize canvas context.");

      ctx.drawImage(imageEl, 0, 0);

      const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const outData = denoiseImageData(srcData, strength, threshold, sharpen);
      ctx.putImageData(outData, 0, 0);

      const format = getOutputFormat(file.name);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to export denoised image."));
          },
          format.mime,
          format.quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-denoised.${format.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reduce image noise."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [file, imageEl, setError, setIsProcessing, setResult, sharpen, strength, threshold]);

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
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
              <div className="flex justify-center">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="max-h-72 rounded-lg object-contain"
                />
              </div>
              <div className="flex justify-center mt-2 text-xs text-muted-foreground">
                {imageEl.naturalWidth} x {imageEl.naturalHeight}px
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">Noise Reduction</h3>
                <p className="text-xs text-muted-foreground mt-1">{controlsSummary}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Denoise Strength</span>
                  <span className="font-mono text-foreground">{strength}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Edge Threshold</span>
                  <span className="font-mono text-foreground">{threshold}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Lower values smooth more aggressively. Higher values preserve more edge detail.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sharpen</span>
                  <span className="font-mono text-foreground">{sharpen}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={sharpen}
                  onChange={(e) => setSharpen(Number(e.target.value))}
                  className="w-full accent-primary"
                />
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
          <Button onClick={handleProcess} disabled={!file || isProcessing} size="lg">
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Reduce Noise"
            )}
          </Button>

          {result && (
            <Button onClick={download} variant="outline" size="lg">
              <Download className="w-4 h-4 mr-2" />
              Download ({resultFilename})
            </Button>
          )}

          <Button
            onClick={() => {
              reset();
              setStrength(45);
              setThreshold(22);
              setSharpen(30);
            }}
            variant="ghost"
            size="lg"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Reduce Image Noise Online Free | Bucket0",
  description:
    "Reduce noise and grain in low-quality images with edge-aware smoothing and optional sharpening. Fast, free, and secure — no uploads to any server. Denoise images entirely in your browser with Bucket0.",
});
