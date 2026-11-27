
import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { getOutputFormat, exceedsCanvasLimit } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "filter-image")!;

interface FilterState {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

const DEFAULT_FILTERS: FilterState = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

const FILTER_CONTROLS: {
  key: keyof FilterState;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultVal: number;
}[] = [
  { key: "brightness", label: "Brightness", min: 0, max: 200, step: 5, unit: "%", defaultVal: 100 },
  { key: "contrast", label: "Contrast", min: 0, max: 200, step: 5, unit: "%", defaultVal: 100 },
  { key: "saturate", label: "Saturation", min: 0, max: 200, step: 5, unit: "%", defaultVal: 100 },
  { key: "blur", label: "Blur", min: 0, max: 20, step: 1, unit: "px", defaultVal: 0 },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100, step: 10, unit: "%", defaultVal: 0 },
  { key: "sepia", label: "Sepia", min: 0, max: 100, step: 10, unit: "%", defaultVal: 0 },
];

function buildFilterString(f: FilterState): string {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function isDefault(f: FilterState): boolean {
  return (
    f.brightness === 100 &&
    f.contrast === 100 &&
    f.saturate === 100 &&
    f.blur === 0 &&
    f.grayscale === 0 &&
    f.sepia === 0
  );
}

export default function FilterImagePage() {
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

  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });
  const previewRef = useRef<HTMLCanvasElement>(null);

  const updateFilter = useCallback((key: keyof FilterState, value: number) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  // Live preview on canvas
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
    ctx.filter = buildFilterString(filters);
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(imageEl, 0, 0, drawW, drawH);
  }, [imageEl, filters]);

  const handleApply = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    if (isDefault(filters)) {
      setError("No filters applied. Adjust at least one filter.");
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
      ctx.filter = buildFilterString(filters);
      ctx.drawImage(imageEl, 0, 0);

      const fmt = getOutputFormat(file.name);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to apply filters."));
          },
          fmt.mime,
          fmt.quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-filtered.${fmt.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, filters, setIsProcessing, setError, setResult]);

  const resetAll = useCallback(() => {
    reset();
    setFilters({ ...DEFAULT_FILTERS });
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
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            {/* Live preview */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
              <div className="flex justify-center">
                <canvas ref={previewRef} className="rounded-lg" />
              </div>
            </div>

            {/* Filter controls */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4 lg:max-h-[500px] lg:overflow-y-auto">
              <div className="flex items-center justify-between sticky top-0 bg-card pb-2">
                <h3 className="text-sm font-medium text-foreground">Filters</h3>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reset all
                </button>
              </div>

              {FILTER_CONTROLS.map((ctrl) => (
                <div key={ctrl.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">{ctrl.label}</label>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={filters[ctrl.key]}
                        onChange={(e) => {
                          const val = Math.max(ctrl.min, Math.min(ctrl.max, Number(e.target.value)));
                          updateFilter(ctrl.key, val);
                        }}
                        className="w-14 px-1.5 py-0.5 bg-background border border-border rounded text-xs font-mono text-foreground text-right"
                      />
                      <span className="text-xs text-muted-foreground">{ctrl.unit}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={filters[ctrl.key]}
                      onChange={(e) => updateFilter(ctrl.key, Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <button
                      type="button"
                      onClick={() => updateFilter(ctrl.key, ctrl.defaultVal)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        filters[ctrl.key] === ctrl.defaultVal
                          ? "border-transparent text-muted-foreground/50 cursor-default"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      disabled={filters[ctrl.key] === ctrl.defaultVal}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
              "Apply Filters"
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
            Filters applied successfully. Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Image Filters Online Free | Bucket0",
  description:
    "Adjust brightness, contrast, saturation, blur, and apply effects like grayscale and sepia. Fast, free, and secure — no uploads to any server. Apply image filters entirely in your browser with Bucket0.",
});
