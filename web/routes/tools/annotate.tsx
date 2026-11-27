
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Hand,
  Highlighter,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { usePdfTool } from "@/hooks/usePdfTool";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import PdfPagePreview from "@/components/pdf-tools/PdfPagePreview";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "annotate")!;
const MAX_PAGES = 40;
const PREVIEW_CANVAS_WIDTH = 640;

type AnnotateMode = "highlight" | "text";

interface AnnotationBase {
  id: string;
}

interface HighlightAnnotation extends AnnotationBase {
  type: "highlight";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface TextAnnotation extends AnnotationBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

type Annotation = HighlightAnnotation | TextAnnotation;

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  const normalized = cleaned.length === 3
    ? cleaned.split("").map((c) => c + c).join("")
    : cleaned;

  const intVal = Number.parseInt(normalized, 16);
  return {
    r: ((intVal >> 16) & 255) / 255,
    g: ((intVal >> 8) & 255) / 255,
    b: (intVal & 255) / 255,
  };
}

function makeAnnotationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTextBounds(annotation: TextAnnotation) {
  const estimatedWidth = Math.max(40, annotation.text.length * annotation.fontSize * 0.56);
  const estimatedHeight = annotation.fontSize * 1.25;
  return {
    width: estimatedWidth,
    height: estimatedHeight,
  };
}

function AnnotationPlacement({
  file,
  pageNumber,
  mode,
  textDraft,
  textFontSize,
  highlightColor,
  textColor,
  annotations,
  selectedAnnotationId,
  onAdd,
  onUpdate,
  onSelect,
}: {
  file: File;
  pageNumber: number;
  mode: AnnotateMode;
  textDraft: string;
  textFontSize: number;
  highlightColor: string;
  textColor: string;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onAdd: (annotation: Annotation) => void;
  onUpdate: (annotationId: string, updater: (annotation: Annotation) => Annotation) => void;
  onSelect: (annotationId: string | null) => void;
}) {
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDrawingHighlight, setIsDrawingHighlight] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);

  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = PREVIEW_CANVAS_WIDTH / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      if (cancelled) return;

      setPdfDimensions({ width: viewport.width, height: viewport.height });

      const canvas = pageCanvasRef.current;
      if (!canvas) return;

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport: scaledViewport } as any).promise;

      if (!cancelled) {
        setRenderError(null);
      }
    }

    renderPage().catch(() => {
      if (!cancelled) {
        setRenderError("Failed to render this PDF page. Try re-uploading the file.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [file, pageNumber]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const pageCanvas = pageCanvasRef.current;
    if (!overlay || !pageCanvas || !pdfDimensions) return;

    overlay.width = pageCanvas.width;
    overlay.height = pageCanvas.height;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const scaleX = overlay.width / pdfDimensions.width;
    const scaleY = overlay.height / pdfDimensions.height;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    for (const annotation of annotations) {
      const isSelected = annotation.id === selectedAnnotationId;

      if (annotation.type === "highlight") {
        const x = annotation.x * scaleX;
        const y = annotation.y * scaleY;
        const width = annotation.width * scaleX;
        const height = annotation.height * scaleY;

        ctx.fillStyle = `${annotation.color}55`;
        ctx.fillRect(x, y, width, height);

        ctx.strokeStyle = isSelected ? "#22D3EE" : `${annotation.color}D9`;
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.strokeRect(x, y, width, height);
      } else {
        const x = annotation.x * scaleX;
        const y = annotation.y * scaleY;
        const drawSize = Math.max(12, annotation.fontSize * scaleX * 0.9);

        ctx.font = `${drawSize}px ui-sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillStyle = annotation.color;
        ctx.fillText(annotation.text, x, y);

        if (isSelected) {
          const bounds = getTextBounds(annotation);
          ctx.strokeStyle = "#22D3EE";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(
            x - 4,
            y - 4,
            bounds.width * scaleX + 8,
            bounds.height * scaleY + 8
          );
        }
      }
    }

    if (currentRect) {
      ctx.fillStyle = `${highlightColor}55`;
      ctx.strokeStyle = `${highlightColor}CC`;
      ctx.lineWidth = 2;
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
    }
  }, [annotations, currentRect, highlightColor, pdfDimensions, selectedAnnotationId]);

  const getCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const toPdfCoords = useCallback((canvasX: number, canvasY: number) => {
    const canvas = overlayRef.current;
    if (!canvas || !pdfDimensions) return null;

    const scaleX = pdfDimensions.width / canvas.width;
    const scaleY = pdfDimensions.height / canvas.height;

    return {
      x: canvasX * scaleX,
      y: canvasY * scaleY,
    };
  }, [pdfDimensions]);

  const hitTest = useCallback((pdfX: number, pdfY: number) => {
    for (let i = annotations.length - 1; i >= 0; i -= 1) {
      const annotation = annotations[i];
      if (annotation.type === "highlight") {
        const inRect =
          pdfX >= annotation.x &&
          pdfX <= annotation.x + annotation.width &&
          pdfY >= annotation.y &&
          pdfY <= annotation.y + annotation.height;
        if (inRect) return annotation;
      } else {
        const bounds = getTextBounds(annotation);
        const inText =
          pdfX >= annotation.x &&
          pdfX <= annotation.x + bounds.width &&
          pdfY >= annotation.y &&
          pdfY <= annotation.y + bounds.height;
        if (inText) return annotation;
      }
    }

    return null;
  }, [annotations]);

  const startDrag = useCallback((annotation: Annotation, pdfX: number, pdfY: number) => {
    setDraggingAnnotationId(annotation.id);
    onSelect(annotation.id);
    dragOffsetRef.current = {
      x: pdfX - annotation.x,
      y: pdfY - annotation.y,
    };
  }, [onSelect]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    if (!point) return;

    const pdfPoint = toPdfCoords(point.x, point.y);
    if (!pdfPoint || !pdfDimensions) return;

    const hit = hitTest(pdfPoint.x, pdfPoint.y);
    if (hit) {
      startDrag(hit, pdfPoint.x, pdfPoint.y);
      return;
    }

    if (mode === "text") {
      if (!textDraft.trim()) return;
      onAdd({
        id: makeAnnotationId(),
        type: "text",
        x: pdfPoint.x,
        y: pdfPoint.y,
        text: textDraft.trim(),
        color: textColor,
        fontSize: textFontSize,
      });
      return;
    }

    if (mode === "highlight") {
      setIsDrawingHighlight(true);
      setStartPoint(point);
      setCurrentRect({ x: point.x, y: point.y, w: 0, h: 0 });
      onSelect(null);
    }
  }, [
    getCanvasPoint,
    hitTest,
    mode,
    onAdd,
    onSelect,
    pdfDimensions,
    startDrag,
    textColor,
    textDraft,
    textFontSize,
    toPdfCoords,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    if (!point || !pdfDimensions) return;

    const pdfPoint = toPdfCoords(point.x, point.y);
    if (!pdfPoint) return;

    if (draggingAnnotationId) {
      const annotation = annotations.find((item) => item.id === draggingAnnotationId);
      const dragOffset = dragOffsetRef.current;
      if (!annotation || !dragOffset) return;

      const nextX = clamp(pdfPoint.x - dragOffset.x, 0, pdfDimensions.width - 4);
      const nextY = clamp(pdfPoint.y - dragOffset.y, 0, pdfDimensions.height - 4);

      onUpdate(draggingAnnotationId, (current) => {
        if (current.type === "highlight") {
          return {
            ...current,
            x: clamp(nextX, 0, Math.max(0, pdfDimensions.width - current.width)),
            y: clamp(nextY, 0, Math.max(0, pdfDimensions.height - current.height)),
          };
        }

        const bounds = getTextBounds(current);
        return {
          ...current,
          x: clamp(nextX, 0, Math.max(0, pdfDimensions.width - bounds.width)),
          y: clamp(nextY, 0, Math.max(0, pdfDimensions.height - bounds.height)),
        };
      });

      return;
    }

    if (!isDrawingHighlight || !startPoint || mode !== "highlight") return;

    setCurrentRect({
      x: Math.min(startPoint.x, point.x),
      y: Math.min(startPoint.y, point.y),
      w: Math.abs(point.x - startPoint.x),
      h: Math.abs(point.y - startPoint.y),
    });
  }, [
    annotations,
    draggingAnnotationId,
    getCanvasPoint,
    isDrawingHighlight,
    mode,
    onUpdate,
    pdfDimensions,
    startPoint,
    toPdfCoords,
  ]);

  const handlePointerUp = useCallback(() => {
    if (draggingAnnotationId) {
      setDraggingAnnotationId(null);
      dragOffsetRef.current = null;
      return;
    }

    if (!isDrawingHighlight || !currentRect || mode !== "highlight") {
      setIsDrawingHighlight(false);
      setStartPoint(null);
      setCurrentRect(null);
      return;
    }

    if (currentRect.w < 6 || currentRect.h < 6) {
      setIsDrawingHighlight(false);
      setStartPoint(null);
      setCurrentRect(null);
      return;
    }

    const topLeft = toPdfCoords(currentRect.x, currentRect.y);
    const bottomRight = toPdfCoords(currentRect.x + currentRect.w, currentRect.y + currentRect.h);

    if (topLeft && bottomRight) {
      onAdd({
        id: makeAnnotationId(),
        type: "highlight",
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
        color: highlightColor,
      });
    }

    setIsDrawingHighlight(false);
    setStartPoint(null);
    setCurrentRect(null);
  }, [currentRect, draggingAnnotationId, highlightColor, isDrawingHighlight, mode, onAdd, toPdfCoords]);

  return (
    <div className="space-y-3">
      {renderError && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {renderError}
        </div>
      )}

      <div className="overflow-auto rounded-lg border border-border bg-muted/30 p-4 flex justify-center">
        <div className="relative inline-block">
          <canvas
            ref={pageCanvasRef}
            className="rounded-lg shadow-sm block max-w-full h-auto"
            style={{ maxWidth: PREVIEW_CANVAS_WIDTH }}
          />
          <canvas
            ref={overlayRef}
            className={cn(
              "absolute inset-0 rounded-lg max-w-full h-auto touch-none",
              draggingAnnotationId
                ? "cursor-grabbing"
                : mode === "highlight"
                  ? "cursor-crosshair"
                  : "cursor-cell"
            )}
            style={{ maxWidth: PREVIEW_CANVAS_WIDTH }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === "highlight"
          ? "Drag to draw highlights. Click existing annotations to move them."
          : "Click to place text. Click existing annotations to move them."}
      </p>
    </div>
  );
}

export default function AnnotatePdfPage() {
  const {
    files,
    addFiles,
    removeFile,
    result,
    resultFilename,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    setResult,
    download,
    reset,
  } = usePdfTool();

  const [pageCount, setPageCount] = useState(0);
  const [selectedPage, setSelectedPage] = useState(1);
  const [mode, setMode] = useState<AnnotateMode>("highlight");
  const [highlightColor, setHighlightColor] = useState("#FACC15");
  const [textColor, setTextColor] = useState("#EF4444");
  const [textDraft, setTextDraft] = useState("Comment");
  const [textFontSize, setTextFontSize] = useState(18);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationsByPage, setAnnotationsByPage] = useState<Record<number, Annotation[]>>({});

  const file = files[0] ?? null;

  useEffect(() => {
    if (!file) {
      setPageCount(0);
      setSelectedPage(1);
      setAnnotationsByPage({});
      setSelectedAnnotationId(null);
      return;
    }

    let cancelled = false;

    async function loadPageCount() {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const count = pdf.getPageCount();

      if (cancelled) return;

      if (count > MAX_PAGES) {
        setError(`This PDF has ${count} pages. Annotate supports up to ${MAX_PAGES} pages.`);
        removeFile(0);
        return;
      }

      setPageCount(count);
      setSelectedPage(1);
      setAnnotationsByPage({});
      setSelectedAnnotationId(null);
      setError(null);
    }

    loadPageCount().catch(() => {
      if (!cancelled) {
        setError("Failed to read PDF file. Please upload a valid PDF.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [file, removeFile, setError]);

  const currentAnnotations = annotationsByPage[selectedPage] ?? [];

  const addAnnotation = useCallback((annotation: Annotation) => {
    setAnnotationsByPage((prev) => {
      const next = {
        ...prev,
        [selectedPage]: [...(prev[selectedPage] ?? []), annotation],
      };
      return next;
    });
    setSelectedAnnotationId(annotation.id);
  }, [selectedPage]);

  const updateAnnotation = useCallback((annotationId: string, updater: (annotation: Annotation) => Annotation) => {
    setAnnotationsByPage((prev) => ({
      ...prev,
      [selectedPage]: (prev[selectedPage] ?? []).map((annotation) => {
        if (annotation.id !== annotationId) return annotation;
        return updater(annotation);
      }),
    }));
  }, [selectedPage]);

  const removeSelectedAnnotation = useCallback(() => {
    if (!selectedAnnotationId) return;

    setAnnotationsByPage((prev) => ({
      ...prev,
      [selectedPage]: (prev[selectedPage] ?? []).filter((annotation) => annotation.id !== selectedAnnotationId),
    }));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId, selectedPage]);

  const clearCurrentPage = useCallback(() => {
    setAnnotationsByPage((prev) => ({
      ...prev,
      [selectedPage]: [],
    }));
    setSelectedAnnotationId(null);
  }, [selectedPage]);

  const totalAnnotations = useMemo(
    () => Object.values(annotationsByPage).reduce((sum, pageAnnotations) => sum + pageAnnotations.length, 0),
    [annotationsByPage]
  );

  const handleApply = useCallback(async () => {
    if (!file || totalAnnotations === 0) {
      setError("Add at least one highlight or text annotation before applying.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const font = await pdf.embedFont(StandardFonts.Helvetica);

      for (let pageIdx = 0; pageIdx < pdf.getPageCount(); pageIdx += 1) {
        const pageNo = pageIdx + 1;
        const page = pdf.getPage(pageIdx);
        const { height, width } = page.getSize();
        const pageAnnotations = annotationsByPage[pageNo] ?? [];

        for (const annotation of pageAnnotations) {
          if (annotation.type === "highlight") {
            const c = hexToRgb01(annotation.color);
            page.drawRectangle({
              x: annotation.x,
              y: height - annotation.y - annotation.height,
              width: annotation.width,
              height: annotation.height,
              color: rgb(c.r, c.g, c.b),
              opacity: 0.35,
            });
          } else {
            const c = hexToRgb01(annotation.color);
            page.drawText(annotation.text, {
              x: clamp(annotation.x, 0, Math.max(0, width - 30)),
              y: clamp(height - annotation.y - annotation.fontSize, 0, Math.max(0, height - annotation.fontSize)),
              size: annotation.fontSize,
              color: rgb(c.r, c.g, c.b),
              font,
              maxWidth: Math.max(60, width - annotation.x - 8),
              lineHeight: annotation.fontSize * 1.2,
            });
          }
        }
      }

      const out = await pdf.save();
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(new Blob([out as BlobPart], { type: "application/pdf" }), `${baseName}-annotated.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to annotate PDF.");
    } finally {
      setIsProcessing(false);
    }
  }, [annotationsByPage, file, setError, setIsProcessing, setResult, totalAnnotations]);

  const selectedAnnotation = currentAnnotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null;

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {!result && (
          <FileDropZone
            accept=".pdf"
            multiple={false}
            files={files}
            onFiles={addFiles}
            onRemove={() => removeFile(0)}
            label="Drop your PDF here or click to browse"
            sublabel="Single PDF up to 100MB"
          />
        )}

        {file && pageCount > 0 && !result && (
          <>
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Configure Annotation
                </h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {pageCount} pages • {totalAnnotations} annotation{totalAnnotations === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMode("highlight")}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full border transition-colors",
                    mode === "highlight"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  Highlight
                </button>
                <button
                  type="button"
                  onClick={() => setMode("text")}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full border transition-colors",
                    mode === "text"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  Text
                </button>
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full border border-border text-muted-foreground">
                  <Hand className="w-3.5 h-3.5" />
                  Drag to reposition
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Highlight color</label>
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={(e) => setHighlightColor(e.target.value)}
                    className="h-10 w-full rounded border border-border bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Text color</label>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-10 w-full rounded border border-border bg-background"
                  />
                </div>
              </div>

              {mode === "text" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Text content</label>
                    <input
                      type="text"
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      className="w-full h-10 px-3 rounded border border-border bg-background text-sm"
                      placeholder="Type annotation text"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Text size</label>
                    <input
                      type="number"
                      value={textFontSize}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setTextFontSize(clamp(Number.isFinite(value) ? value : 18, 10, 48));
                      }}
                      min={10}
                      max={48}
                      className="w-full h-10 px-3 rounded border border-border bg-background text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Place And Refine
                </h3>
              </div>

              {pageCount > 1 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Select Page ({selectedPage} of {pageCount})
                  </label>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNo) => (
                      <button
                        key={pageNo}
                        type="button"
                        onClick={() => {
                          setSelectedPage(pageNo);
                          setSelectedAnnotationId(null);
                        }}
                        className={cn(
                          "shrink-0 rounded-lg border-2 transition-all overflow-hidden",
                          pageNo === selectedPage
                            ? "border-primary ring-2 ring-primary"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        <PdfPagePreview file={file} pageNumber={pageNo} width={100} />
                        <p className="text-xs text-center py-1 text-muted-foreground">
                          {pageNo}
                          {(annotationsByPage[pageNo]?.length ?? 0) > 0 && ` • ${annotationsByPage[pageNo]!.length}`}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnnotationPlacement
                file={file}
                pageNumber={selectedPage}
                mode={mode}
                textDraft={textDraft}
                textFontSize={textFontSize}
                highlightColor={highlightColor}
                textColor={textColor}
                annotations={currentAnnotations}
                selectedAnnotationId={selectedAnnotationId}
                onAdd={addAnnotation}
                onUpdate={updateAnnotation}
                onSelect={setSelectedAnnotationId}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeSelectedAnnotation}
                  disabled={!selectedAnnotation}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCurrentPage}
                  disabled={currentAnnotations.length === 0}
                >
                  Clear Page {selectedPage}
                </Button>
                {selectedAnnotation && (
                  <span className="text-xs text-muted-foreground">
                    Selected: {selectedAnnotation.type === "highlight" ? "Highlight" : "Text"}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {file && !result && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleApply}
              disabled={isProcessing || totalAnnotations === 0}
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying Annotations...
                </>
              ) : (
                "Apply Annotations"
              )}
            </Button>
            <Button
              onClick={() => {
                reset();
                setPageCount(0);
                setSelectedPage(1);
                setSelectedAnnotationId(null);
                setAnnotationsByPage({});
              }}
              variant="ghost"
              size="lg"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success dark:text-success text-sm flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              Annotations applied successfully. Download your new PDF.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={download} size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download {resultFilename}
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setPageCount(0);
                  setSelectedPage(1);
                  setSelectedAnnotationId(null);
                  setAnnotationsByPage({});
                }}
                variant="ghost"
                size="lg"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Annotate Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Annotate PDF Online Free | Bucket0",
  description:
    "Add highlights and inline text comments directly onto your PDF pages. Fast, free, and secure — no uploads to any server. Annotate PDFs entirely in your browser with Bucket0.",
});
