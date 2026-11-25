
import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { getOutputFormat, exceedsCanvasLimit } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "watermark-image")!;

type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "tile";

const POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "center", label: "Center" },
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
  { id: "tile", label: "Tile (Repeat)" },
];

interface WatermarkSettings {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  position: WatermarkPosition;
}

const DEFAULT_SETTINGS: WatermarkSettings = {
  text: "Watermark",
  fontSize: 48,
  color: "#ffffff",
  opacity: 30,
  rotation: -30,
  position: "center",
};

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  settings: WatermarkSettings
) {
  const { text, fontSize, color, opacity, rotation, position } = settings;
  if (!text.trim()) return;

  ctx.save();
  ctx.globalAlpha = opacity / 100;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const radians = (rotation * Math.PI) / 180;

  if (position === "tile") {
    // Tile across the entire image
    const metrics = ctx.measureText(text);
    const textW = metrics.width + 60;
    const textH = fontSize + 40;

    for (let y = -h; y < h * 2; y += textH) {
      for (let x = -w; x < w * 2; x += textW) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(radians);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
  } else {
    let x: number;
    let y: number;
    const pad = fontSize * 0.8;

    switch (position) {
      case "top-left":
        x = pad;
        y = pad;
        break;
      case "top-right":
        x = w - pad;
        y = pad;
        break;
      case "bottom-left":
        x = pad;
        y = h - pad;
        break;
      case "bottom-right":
        x = w - pad;
        y = h - pad;
        break;
      case "center":
      default:
        x = w / 2;
        y = h / 2;
        break;
    }

    ctx.translate(x, y);
    ctx.rotate(radians);
    ctx.fillText(text, 0, 0);
  }

  ctx.restore();
}

export default function WatermarkImagePage() {
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

  const [settings, setSettings] = useState<WatermarkSettings>({
    ...DEFAULT_SETTINGS,
  });
  const previewRef = useRef<HTMLCanvasElement>(null);

  const update = useCallback(
    <K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Live preview
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !imageEl) return;

    const containerWidth = canvas.parentElement?.clientWidth || 600;
    const maxH = 400;
    const natW = imageEl.naturalWidth;
    const natH = imageEl.naturalHeight;
    const scale = Math.min(containerWidth / natW, maxH / natH, 1);
    const drawW = Math.round(natW * scale);
    const drawH = Math.round(natH * scale);

    canvas.width = drawW;
    canvas.height = drawH;
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(imageEl, 0, 0, drawW, drawH);

    // Scale font size for preview
    const previewSettings = {
      ...settings,
      fontSize: Math.round(settings.fontSize * scale),
    };
    drawWatermark(ctx, drawW, drawH, previewSettings);
  }, [imageEl, settings]);

  const handleApply = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    if (!settings.text.trim()) {
      setError("Please enter watermark text.");
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
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageEl, 0, 0);

      drawWatermark(ctx, canvas.width, canvas.height, settings);

      const fmt = getOutputFormat(file.name);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to apply watermark."));
          },
          fmt.mime,
          fmt.quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-watermarked.${fmt.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, settings, setIsProcessing, setError, setResult]);

  const resetAll = useCallback(() => {
    reset();
    setSettings({ ...DEFAULT_SETTINGS });
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
            {/* Live preview */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
              <div className="flex justify-center">
                <canvas ref={previewRef} className="rounded-lg" />
              </div>
            </div>

            {/* Watermark controls */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-medium text-foreground">Watermark Settings</h3>

              {/* Text */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Text</label>
                <input
                  type="text"
                  value={settings.text}
                  onChange={(e) => update("text", e.target.value)}
                  placeholder="Enter watermark text"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
                />
              </div>

              {/* Font size */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className="text-xs text-muted-foreground">Font Size</label>
                  <span className="text-xs font-mono text-foreground">{settings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={200}
                  step={4}
                  value={settings.fontSize}
                  onChange={(e) => update("fontSize", Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              {/* Color and opacity row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.color}
                      onChange={(e) => update("color", e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.color}
                      onChange={(e) => update("color", e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs font-mono text-foreground"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-xs text-muted-foreground">Opacity</label>
                    <span className="text-xs font-mono text-foreground">{settings.opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={settings.opacity}
                    onChange={(e) => update("opacity", Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              {/* Rotation */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className="text-xs text-muted-foreground">Rotation</label>
                  <span className="text-xs font-mono text-foreground">{settings.rotation}°</span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={5}
                  value={settings.rotation}
                  onChange={(e) => update("rotation", Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              {/* Position */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Position</label>
                <div className="flex flex-wrap gap-2">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => update("position", p.id)}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded-lg border transition-colors",
                        settings.position === p.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
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
              "Apply Watermark"
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
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
            Watermark applied successfully. Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Watermark Image Online Free | Bucket0",
  description:
    "Add a text watermark to your image with custom position, size, color, and opacity. Fast, free, and secure — no uploads to any server. Watermark images entirely in your browser with Bucket0.",
});
