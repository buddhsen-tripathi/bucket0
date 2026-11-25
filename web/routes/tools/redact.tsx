
import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Download, RotateCcw, EyeOff, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { usePdfTool } from "@/hooks/usePdfTool";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import PdfPagePreview from "@/components/pdf-tools/PdfPagePreview";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "redact")!;
const MAX_PAGES = 20;

interface RedactRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/*  RedactCanvas — renders the selected page and handles drawing      */
/* ------------------------------------------------------------------ */

function RedactCanvas({
  file,
  pageNumber,
  rects,
  onAddRect,
  onRemoveRect,
}: {
  file: File;
  pageNumber: number;
  rects: RedactRect[];
  onAddRect: (rect: RedactRect) => void;
  onRemoveRect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [currentRect, setCurrentRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const CANVAS_WIDTH = 600;

  // Render the PDF page onto the background canvas
  useEffect(() => {
    let cancelled = false;

    async function render() {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = CANVAS_WIDTH / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      if (cancelled) return;
      setPdfDimensions({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport: scaledViewport } as any)
        .promise;
    }

    render().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file, pageNumber]);

  // Re-draw the overlay whenever rects or the in-progress rect change
  useEffect(() => {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas || !pdfDimensions) return;

    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const scaleX = canvas.width / pdfDimensions.width;
    const scaleY = canvas.height / pdfDimensions.height;

    // Existing committed rects
    rects.forEach((r) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(
        r.x * scaleX,
        r.y * scaleY,
        r.width * scaleX,
        r.height * scaleY
      );
      ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        r.x * scaleX,
        r.y * scaleY,
        r.width * scaleX,
        r.height * scaleY
      );
    });

    // In-progress drawing rect (canvas coordinates, not yet converted)
    if (currentRect) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        currentRect.x,
        currentRect.y,
        currentRect.w,
        currentRect.h
      );
    }
  }, [rects, currentRect, pdfDimensions]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    setStartPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDrawing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing || !startPoint) return;
      const rect = overlayRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCurrentRect({
        x: Math.min(startPoint.x, x),
        y: Math.min(startPoint.y, y),
        w: Math.abs(x - startPoint.x),
        h: Math.abs(y - startPoint.y),
      });
    },
    [drawing, startPoint]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing || !currentRect || !pdfDimensions || !canvasRef.current) {
      setDrawing(false);
      setStartPoint(null);
      setCurrentRect(null);
      return;
    }

    const canvas = canvasRef.current;
    const scaleX = pdfDimensions.width / canvas.width;
    const scaleY = pdfDimensions.height / canvas.height;

    // Only commit if the rectangle is at least 5 canvas-pixels in both dimensions
    if (currentRect.w > 5 && currentRect.h > 5) {
      onAddRect({
        x: currentRect.x * scaleX,
        y: currentRect.y * scaleY,
        width: currentRect.w * scaleX,
        height: currentRect.h * scaleY,
      });
    }

    setDrawing(false);
    setStartPoint(null);
    setCurrentRect(null);
  }, [drawing, currentRect, pdfDimensions, onAddRect]);

  return (
    <div className="space-y-3">
      {/* Canvas stack */}
      <div className="relative inline-block">
        <canvas ref={canvasRef} className="rounded-lg shadow-sm block" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 cursor-crosshair rounded-lg"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Per-page rect list */}
      {rects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rects.map((r, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground"
            >
              Rect {idx + 1}
              <button
                type="button"
                onClick={() => onRemoveRect(idx)}
                className="hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function RedactPdfPage() {
  const {
    files,
    addFiles,
    removeFile,
    result,
    setResult,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    reset,
    download,
  } = usePdfTool();

  const [pageCount, setPageCount] = useState(0);
  const [selectedPage, setSelectedPage] = useState(1);
  const [redactions, setRedactions] = useState<Record<number, RedactRect[]>>(
    {}
  );

  const file = files[0] ?? null;

  // Load page count when a file is added
  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    async function loadPageCount() {
      const { PDFDocument } = await import("pdf-lib");
      const buf = await file!.arrayBuffer();
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      const count = pdf.getPageCount();
      if (cancelled) return;

      if (count > MAX_PAGES) {
        setError(
          `This PDF has ${count} pages. The redaction tool supports up to ${MAX_PAGES} pages.`
        );
        removeFile(0);
        return;
      }

      setPageCount(count);
      setSelectedPage(1);
      setRedactions({});
    }

    loadPageCount().catch(() => {
      if (!cancelled) {
        setError(
          "Failed to read PDF file. Please ensure it is a valid PDF."
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [file, setError, removeFile]);

  // Reset state when file is removed
  const handleRemoveFile = useCallback(() => {
    removeFile(0);
    setPageCount(0);
    setSelectedPage(1);
    setRedactions({});
  }, [removeFile]);

  const handleSelectPage = useCallback((page: number) => {
    setSelectedPage(page);
  }, []);

  const handleAddRect = useCallback(
    (rect: RedactRect) => {
      setRedactions((prev) => ({
        ...prev,
        [selectedPage]: [...(prev[selectedPage] ?? []), rect],
      }));
    },
    [selectedPage]
  );

  const handleRemoveRect = useCallback(
    (index: number) => {
      setRedactions((prev) => {
        const pageRects = [...(prev[selectedPage] ?? [])];
        pageRects.splice(index, 1);
        return { ...prev, [selectedPage]: pageRects };
      });
    },
    [selectedPage]
  );

  // Total redaction count across all pages
  const totalRedactions = Object.values(redactions).reduce(
    (sum, rects) => sum + rects.length,
    0
  );

  const handleApplyRedactions = useCallback(async () => {
    if (!file || totalRedactions === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { PDFDocument, rgb } = await import("pdf-lib");
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      Object.entries(redactions).forEach(([pageNumStr, rects]) => {
        const pageIndex = parseInt(pageNumStr) - 1;
        const page = pages[pageIndex];
        if (!page) return;
        const { height } = page.getSize();

        rects.forEach((r) => {
          // Convert from canvas coordinate system (origin top-left, y downward)
          // to PDF coordinate system (origin bottom-left, y upward)
          page.drawRectangle({
            x: r.x,
            y: height - r.y - r.height,
            width: r.width,
            height: r.height,
            color: rgb(0, 0, 0),
          });
        });
      });

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(
        blob,
        `${file.name.replace(/\.pdf$/i, "")}_redacted.pdf`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to apply redactions: ${err.message}`
          : "An unexpected error occurred while applying redactions."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [file, redactions, totalRedactions, setIsProcessing, setError, setResult]);

  const currentPageRects = redactions[selectedPage] ?? [];

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File upload — hidden once we have a result */}
        {!result && (
          <FileDropZone
            accept=".pdf"
            multiple={false}
            files={files}
            onFiles={addFiles}
            onRemove={handleRemoveFile}
            label="Drop your PDF here or click to browse"
            sublabel={`Single PDF file, up to 100MB and ${MAX_PAGES} pages`}
          />
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Redaction editor */}
        {file && pageCount > 0 && !result && (
          <div className="space-y-5">
            {/* Page thumbnail strip */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                Pages
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                  (pageNum) => {
                    const pageRedactCount = (
                      redactions[pageNum] ?? []
                    ).length;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handleSelectPage(pageNum)}
                        className={cn(
                          "relative shrink-0 flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all duration-150",
                          selectedPage === pageNum
                            ? "ring-2 ring-primary border-primary bg-primary/5"
                            : "border-border bg-card hover:border-muted-foreground/30"
                        )}
                      >
                        <PdfPagePreview
                          file={file}
                          pageNumber={pageNum}
                          width={120}
                        />
                        <span className="text-xs font-medium text-muted-foreground">
                          Page {pageNum}
                        </span>
                        {pageRedactCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                            {pageRedactCount}
                          </span>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Selected page canvas */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  Page {selectedPage} of {pageCount}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {currentPageRects.length}{" "}
                  {currentPageRects.length === 1 ? "redaction" : "redactions"}{" "}
                  on this page
                </span>
              </div>

              <RedactCanvas
                file={file}
                pageNumber={selectedPage}
                rects={currentPageRects}
                onAddRect={handleAddRect}
                onRemoveRect={handleRemoveRect}
              />

              {/* Instructions */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Click and drag to draw redaction areas. Click the X on a
                  redaction to remove it.
                </span>
              </div>
            </div>

            {/* Summary and apply button */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-foreground">
                  <span className="font-semibold">{totalRedactions}</span>{" "}
                  {totalRedactions === 1 ? "redaction" : "redactions"} across{" "}
                  <span className="font-semibold">
                    {
                      Object.values(redactions).filter((r) => r.length > 0)
                        .length
                    }
                  </span>{" "}
                  {Object.values(redactions).filter((r) => r.length > 0)
                    .length === 1
                    ? "page"
                    : "pages"}
                </div>
              </div>

              <Button
                size="lg"
                onClick={handleApplyRedactions}
                disabled={isProcessing || totalRedactions === 0}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying Redactions...
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Apply Redactions
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="text-center space-y-4">
            <div className="p-6 bg-card border border-border rounded-xl">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <EyeOff className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                PDF Redacted
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {totalRedactions}{" "}
                {totalRedactions === 1 ? "area has" : "areas have"} been
                permanently blacked out.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={download} size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  Download Redacted PDF
                </Button>
                <Button variant="outline" size="lg" onClick={reset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Redact Another
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Redact PDF Online Free | Bucket0",
  description:
    "Permanently black out sensitive text and areas in your PDF document. Fast, free, and secure — no uploads to any server. Redact PDFs entirely in your browser with Bucket0.",
});
