
import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { IMAGE_TOOLS } from "@/components/pdf-tools/tool-config";
import { useImageTool } from "@/hooks/useImageTool";
import { getOutputFormat } from "@/lib/shared/image-format-utils";
import { nextMeta } from "@/web/compat/meta";

const tool = IMAGE_TOOLS.find((t) => t.slug === "crop-image")!;

type AspectPreset = "free" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2";

const PRESETS: { id: AspectPreset; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = "none" | "move" | "draw" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const HANDLE_SIZE = 10;
const HANDLE_HALF = HANDLE_SIZE / 2;
const EDGE_TOLERANCE = 6;

function getHandleHitZones(sel: Rect) {
  return {
    nw: { x: sel.x - HANDLE_HALF, y: sel.y - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE },
    ne: { x: sel.x + sel.w - HANDLE_HALF, y: sel.y - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE },
    sw: { x: sel.x - HANDLE_HALF, y: sel.y + sel.h - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE },
    se: { x: sel.x + sel.w - HANDLE_HALF, y: sel.y + sel.h - HANDLE_HALF, w: HANDLE_SIZE, h: HANDLE_SIZE },
  };
}

function pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function hitTest(px: number, py: number, sel: Rect): DragMode {
  // Check corner handles first (highest priority)
  const handles = getHandleHitZones(sel);
  if (pointInRect(px, py, handles.nw)) return "nw";
  if (pointInRect(px, py, handles.ne)) return "ne";
  if (pointInRect(px, py, handles.sw)) return "sw";
  if (pointInRect(px, py, handles.se)) return "se";

  // Check edges
  const inX = px >= sel.x && px <= sel.x + sel.w;
  const inY = py >= sel.y && py <= sel.y + sel.h;

  if (inX && Math.abs(py - sel.y) <= EDGE_TOLERANCE) return "n";
  if (inX && Math.abs(py - (sel.y + sel.h)) <= EDGE_TOLERANCE) return "s";
  if (inY && Math.abs(px - sel.x) <= EDGE_TOLERANCE) return "w";
  if (inY && Math.abs(px - (sel.x + sel.w)) <= EDGE_TOLERANCE) return "e";

  // Check inside for move
  if (inX && inY) return "move";

  return "none";
}

function getCursorForMode(mode: DragMode): string {
  switch (mode) {
    case "move": return "grab";
    case "nw": case "se": return "nwse-resize";
    case "ne": case "sw": return "nesw-resize";
    case "n": case "s": return "ns-resize";
    case "e": case "w": return "ew-resize";
    default: return "crosshair";
  }
}

/** Build the largest centered rect with the given aspect ratio that fits in canvasW x canvasH, with padding */
function buildCenteredSelection(canvasW: number, canvasH: number, ratio: number | null): Rect {
  const padding = 0.1; // 10% padding on each side
  const availW = canvasW * (1 - padding * 2);
  const availH = canvasH * (1 - padding * 2);

  let w: number;
  let h: number;

  if (ratio === null) {
    // Free: select 80% of the image
    w = availW;
    h = availH;
  } else {
    if (availW / availH > ratio) {
      h = availH;
      w = h * ratio;
    } else {
      w = availW;
      h = w / ratio;
    }
  }

  return {
    x: (canvasW - w) / 2,
    y: (canvasH - h) / 2,
    w,
    h,
  };
}

/** Clamp rect within bounds, maintaining size */
function clampRect(r: Rect, maxW: number, maxH: number): Rect {
  let { x, y, w, h } = r;
  w = Math.min(w, maxW);
  h = Math.min(h, maxH);
  x = Math.max(0, Math.min(x, maxW - w));
  y = Math.max(0, Math.min(y, maxH - h));
  return { x, y, w, h };
}

export default function CropImagePage() {
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

  const [preset, setPreset] = useState<AspectPreset>("free");
  const [selection, setSelection] = useState<Rect | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [selAtDragStart, setSelAtDragStart] = useState<Rect | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);

  // ---- Drawing ----

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return;

    const ctx = canvas.getContext("2d")!;
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const maxH = 450;

    const natW = imageEl.naturalWidth;
    const natH = imageEl.naturalHeight;
    const scale = Math.min(containerWidth / natW, maxH / natH, 1);
    const drawW = Math.round(natW * scale);
    const drawH = Math.round(natH * scale);

    canvas.width = drawW;
    canvas.height = drawH;
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;
    scaleRef.current = scale;

    // Draw full image
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(imageEl, 0, 0, drawW, drawH);

    if (!selection || selection.w < 1 || selection.h < 1) return;

    const sel = selection;

    // Dark overlay outside selection (draw 4 rects around the selection)
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    // Top
    ctx.fillRect(0, 0, drawW, sel.y);
    // Bottom
    ctx.fillRect(0, sel.y + sel.h, drawW, drawH - sel.y - sel.h);
    // Left
    ctx.fillRect(0, sel.y, sel.x, sel.h);
    // Right
    ctx.fillRect(sel.x + sel.w, sel.y, drawW - sel.x - sel.w, sel.h);

    // Selection border
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);

    // Rule of thirds lines
    ctx.strokeStyle = "rgba(167, 139, 250, 0.3)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      const lx = sel.x + (sel.w * i) / 3;
      const ly = sel.y + (sel.h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(lx, sel.y);
      ctx.lineTo(lx, sel.y + sel.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sel.x, ly);
      ctx.lineTo(sel.x + sel.w, ly);
      ctx.stroke();
    }

    // Corner handles
    ctx.fillStyle = "#a78bfa";
    const corners = [
      [sel.x, sel.y],
      [sel.x + sel.w, sel.y],
      [sel.x, sel.y + sel.h],
      [sel.x + sel.w, sel.y + sel.h],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - HANDLE_HALF, cy - HANDLE_HALF, HANDLE_SIZE, HANDLE_SIZE);
    }

    // Edge midpoint handles
    ctx.fillStyle = "rgba(167, 139, 250, 0.8)";
    const midSize = 6;
    const midHalf = midSize / 2;
    const midpoints = [
      [sel.x + sel.w / 2, sel.y],         // N
      [sel.x + sel.w / 2, sel.y + sel.h], // S
      [sel.x, sel.y + sel.h / 2],         // W
      [sel.x + sel.w, sel.y + sel.h / 2], // E
    ];
    for (const [mx, my] of midpoints) {
      ctx.fillRect(mx - midHalf, my - midHalf, midSize, midSize);
    }
  }, [imageEl, selection]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // ---- Auto-initialize selection when image loads or preset changes ----

  useEffect(() => {
    if (!imageEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Need canvas to be sized first
    requestAnimationFrame(() => {
      const cw = canvas.width || canvas.parentElement?.clientWidth || 800;
      const ch = canvas.height || 450;
      const ratio = PRESETS.find((p) => p.id === preset)?.ratio ?? null;
      setSelection(buildCenteredSelection(cw, ch, ratio));
    });
  }, [imageEl, preset]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!imageEl || !canvasRef.current) return;
      const ratio = PRESETS.find((p) => p.id === preset)?.ratio ?? null;
      // Re-init after redraw
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setSelection(buildCenteredSelection(canvas.width, canvas.height, ratio));
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [imageEl, preset]);

  // ---- Pointer helpers ----

  const getPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, clientX - rect.left)),
      y: Math.max(0, Math.min(canvas.height, clientY - rect.top)),
    };
  }, []);

  // ---- Mouse/touch interaction ----

  const handlePointerDown = useCallback(
    (px: number, py: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (selection && selection.w > 2 && selection.h > 2) {
        const mode = hitTest(px, py, selection);
        if (mode !== "none") {
          setDragMode(mode === "move" ? "move" : mode);
          setDragOrigin({ x: px, y: py });
          setSelAtDragStart({ ...selection });
          return;
        }
      }

      // Start a new draw
      setDragMode("draw");
      setDragOrigin({ x: px, y: py });
      setSelAtDragStart(null);
      setSelection({ x: px, y: py, w: 0, h: 0 });
    },
    [selection]
  );

  const handlePointerMove = useCallback(
    (px: number, py: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cw = canvas.width;
      const ch = canvas.height;

      // Update cursor when not dragging
      if (dragMode === "none" && selection) {
        const mode = hitTest(px, py, selection);
        canvas.style.cursor = getCursorForMode(mode);
        return;
      }

      if (!dragOrigin) return;

      const ratio = PRESETS.find((p) => p.id === preset)?.ratio ?? null;

      if (dragMode === "move" && selAtDragStart) {
        // Move the selection
        const dx = px - dragOrigin.x;
        const dy = py - dragOrigin.y;
        const moved: Rect = {
          x: selAtDragStart.x + dx,
          y: selAtDragStart.y + dy,
          w: selAtDragStart.w,
          h: selAtDragStart.h,
        };
        setSelection(clampRect(moved, cw, ch));
        canvas.style.cursor = "grabbing";
        return;
      }

      if (dragMode === "draw") {
        // Draw new selection
        const x = Math.min(dragOrigin.x, px);
        const y = Math.min(dragOrigin.y, py);
        let w = Math.abs(px - dragOrigin.x);
        let h = Math.abs(py - dragOrigin.y);

        if (ratio) {
          if (w / (h || 1) > ratio) {
            w = h * ratio;
          } else {
            h = w / ratio;
          }
        }

        // Clamp
        if (x + w > cw) w = cw - x;
        if (y + h > ch) h = ch - y;

        setSelection({ x, y, w, h });
        return;
      }

      // Resize from edge/corner
      if (selAtDragStart) {
        let { x, y, w, h } = selAtDragStart;
        const dx = px - dragOrigin.x;
        const dy = py - dragOrigin.y;

        // Calculate new rect based on which handle is being dragged
        switch (dragMode) {
          case "se":
            w = Math.max(20, selAtDragStart.w + dx);
            h = Math.max(20, selAtDragStart.h + dy);
            break;
          case "sw":
            x = selAtDragStart.x + dx;
            w = Math.max(20, selAtDragStart.w - dx);
            h = Math.max(20, selAtDragStart.h + dy);
            break;
          case "ne":
            y = selAtDragStart.y + dy;
            w = Math.max(20, selAtDragStart.w + dx);
            h = Math.max(20, selAtDragStart.h - dy);
            break;
          case "nw":
            x = selAtDragStart.x + dx;
            y = selAtDragStart.y + dy;
            w = Math.max(20, selAtDragStart.w - dx);
            h = Math.max(20, selAtDragStart.h - dy);
            break;
          case "n":
            y = selAtDragStart.y + dy;
            h = Math.max(20, selAtDragStart.h - dy);
            break;
          case "s":
            h = Math.max(20, selAtDragStart.h + dy);
            break;
          case "w":
            x = selAtDragStart.x + dx;
            w = Math.max(20, selAtDragStart.w - dx);
            break;
          case "e":
            w = Math.max(20, selAtDragStart.w + dx);
            break;
        }

        // Enforce aspect ratio on resize
        if (ratio) {
          const anchorRight = dragMode === "nw" || dragMode === "sw" || dragMode === "w";
          const anchorBottom = dragMode === "nw" || dragMode === "ne" || dragMode === "n";

          if (w / (h || 1) > ratio) {
            w = h * ratio;
          } else {
            h = w / ratio;
          }

          // Adjust origin for handles that move the top-left
          if (anchorRight) {
            x = selAtDragStart.x + selAtDragStart.w - w;
          }
          if (anchorBottom) {
            y = selAtDragStart.y + selAtDragStart.h - h;
          }
        }

        // Clamp within canvas
        x = Math.max(0, x);
        y = Math.max(0, y);
        if (x + w > cw) w = cw - x;
        if (y + h > ch) h = ch - y;

        setSelection({ x, y, w, h });
      }
    },
    [dragMode, dragOrigin, selAtDragStart, selection, preset]
  );

  const handlePointerUp = useCallback(() => {
    if (dragMode === "move" && canvasRef.current) {
      canvasRef.current.style.cursor = "grab";
    }
    setDragMode("none");
    setDragOrigin(null);
    setSelAtDragStart(null);
  }, [dragMode]);

  // Mouse events
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = getPos(e.clientX, e.clientY);
      handlePointerDown(pos.x, pos.y);
    },
    [getPos, handlePointerDown]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getPos(e.clientX, e.clientY);
      handlePointerMove(pos.x, pos.y);
    },
    [getPos, handlePointerMove]
  );

  // Touch events
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getPos(touch.clientX, touch.clientY);
      handlePointerDown(pos.x, pos.y);
    },
    [getPos, handlePointerDown]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getPos(touch.clientX, touch.clientY);
      handlePointerMove(pos.x, pos.y);
    },
    [getPos, handlePointerMove]
  );

  // ---- Natural coordinates ----

  const getNaturalCrop = useCallback(() => {
    if (!selection || !imageEl) return null;
    const scale = scaleRef.current;
    return {
      x: Math.round(selection.x / scale),
      y: Math.round(selection.y / scale),
      w: Math.round(selection.w / scale),
      h: Math.round(selection.h / scale),
    };
  }, [selection, imageEl]);

  // ---- Crop action ----

  const handleCrop = useCallback(async () => {
    if (!imageEl || !file) {
      setError("Please select an image file.");
      return;
    }

    const naturalCrop = getNaturalCrop();
    if (!naturalCrop || naturalCrop.w < 1 || naturalCrop.h < 1) {
      setError("Please draw a crop area on the image.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = naturalCrop.w;
      canvas.height = naturalCrop.h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        imageEl,
        naturalCrop.x,
        naturalCrop.y,
        naturalCrop.w,
        naturalCrop.h,
        0,
        0,
        naturalCrop.w,
        naturalCrop.h
      );

      const fmt = getOutputFormat(file.name);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to crop image."));
          },
          fmt.mime,
          fmt.quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(blob, `${baseName}-cropped.${fmt.ext}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageEl, file, getNaturalCrop, setIsProcessing, setError, setResult]);

  const naturalCrop = getNaturalCrop();

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
            {/* Aspect ratio presets */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-foreground">Aspect Ratio</h3>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-lg border transition-colors",
                      preset === p.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Crop canvas */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                Drag to adjust selection, corners and edges to resize
              </h3>
              <div className="flex justify-center">
                <canvas
                  ref={canvasRef}
                  className="rounded-lg touch-none"
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={handlePointerUp}
                />
              </div>
              {naturalCrop && naturalCrop.w > 0 && naturalCrop.h > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Selection: {naturalCrop.w} x {naturalCrop.h}px
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Drag on the image to select an area
                </p>
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
            onClick={handleCrop}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cropping...
              </>
            ) : (
              "Crop"
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
            Image cropped successfully. Click &quot;Download&quot; to save.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Crop Image Online Free | Bucket0",
  description:
    "Crop images with preset aspect ratios or freeform selection. Fast, free, and secure — no uploads to any server. Crop images entirely in your browser with Bucket0.",
});
