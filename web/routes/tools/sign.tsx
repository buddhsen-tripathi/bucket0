
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Loader2,
  Download,
  RotateCcw,
  PenLine,
  Type,
  Upload,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "sign")!;

type SignatureMethod = "draw" | "type" | "upload";

const METHOD_ICONS = {
  draw: PenLine,
  type: Type,
  upload: Upload,
} as const;

const METHOD_LABELS = {
  draw: "Draw",
  type: "Type",
  upload: "Upload",
} as const;

// ---------------------------------------------------------------------------
// SignaturePlacement - renders a PDF page, click to place, drag to reposition
// ---------------------------------------------------------------------------
function SignaturePlacement({
  file,
  pageNumber,
  signatureUrl,
  position,
  onPositionChange,
}: {
  file: File;
  pageNumber: number;
  signatureUrl: string;
  position: { x: number; y: number } | null;
  onPositionChange: (pos: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [sigImg, setSigImg] = useState<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const CANVAS_WIDTH = 600;

  // Load signature image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSigImg(img);
    img.src = signatureUrl;
  }, [signatureUrl]);

  // Render PDF page
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
      setCanvasSize({
        width: scaledViewport.width,
        height: scaledViewport.height,
      });

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

  // Click on empty canvas area to place signature
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !pdfDimensions) return;
      const rect = canvas.getBoundingClientRect();
      const displayScaleX = canvas.width / rect.width;
      const displayScaleY = canvas.height / rect.height;
      const canvasX = (e.clientX - rect.left) * displayScaleX;
      const canvasY = (e.clientY - rect.top) * displayScaleY;
      const scaleX = pdfDimensions.width / canvas.width;
      const scaleY = pdfDimensions.height / canvas.height;
      onPositionChange({ x: canvasX * scaleX, y: canvasY * scaleY });
    },
    [pdfDimensions, onPositionChange]
  );

  // Start dragging the signature overlay
  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const canvas = canvasRef.current;
      if (!canvas || !pdfDimensions || !position) return;

      const canvasRect = canvas.getBoundingClientRect();
      // Calculate where the signature currently is in display pixels
      const pdfToDisplayX = canvasRect.width / pdfDimensions.width;
      const pdfToDisplayY = canvasRect.height / pdfDimensions.height;
      const sigDisplayX = position.x * pdfToDisplayX + canvasRect.left;
      const sigDisplayY = position.y * pdfToDisplayY + canvasRect.top;
      // Offset between pointer and signature's top-left
      dragOffsetRef.current = {
        x: e.clientX - sigDisplayX,
        y: e.clientY - sigDisplayY,
      };

      setIsDragging(true);

      const handleMove = (ev: PointerEvent) => {
        const cr = canvas.getBoundingClientRect();
        const toDisplayX = cr.width / pdfDimensions.width;
        const toDisplayY = cr.height / pdfDimensions.height;
        const newDisplayX = ev.clientX - dragOffsetRef.current.x - cr.left;
        const newDisplayY = ev.clientY - dragOffsetRef.current.y - cr.top;
        onPositionChange({
          x: newDisplayX / toDisplayX,
          y: newDisplayY / toDisplayY,
        });
      };

      const handleUp = () => {
        setIsDragging(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [pdfDimensions, position, onPositionChange]
  );

  // Compute signature overlay position + size in CSS display pixels.
  // Position state is in PDF coordinates; we convert back to display.
  const overlayStyle = (() => {
    if (!position || !pdfDimensions || !canvasSize || !sigImg) return null;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const cX = (position.x / pdfDimensions.width) * canvasSize.width;
    const cY = (position.y / pdfDimensions.height) * canvasSize.height;
    const displayScaleX = rect.width / canvasSize.width;
    const displayScaleY = rect.height / canvasSize.height;
    const sigPdfWidth = Math.min(200, sigImg.width);
    const sigPdfHeight = (sigPdfWidth / sigImg.width) * sigImg.height;
    const sigDisplayW =
      (sigPdfWidth / pdfDimensions.width) * canvasSize.width * displayScaleX;
    const sigDisplayH =
      (sigPdfHeight / pdfDimensions.height) *
      canvasSize.height *
      displayScaleY;
    return {
      left: cX * displayScaleX,
      top: cY * displayScaleY,
      width: sigDisplayW,
      height: sigDisplayH,
    };
  })();

  return (
    <div ref={containerRef} className="relative inline-block">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="rounded-lg shadow-sm cursor-crosshair max-w-full"
        style={{ maxWidth: CANVAS_WIDTH }}
      />
      {overlayStyle && (
        <img
          src={signatureUrl}
          alt="Signature"
          draggable={false}
          className={cn(
            "absolute select-none touch-none",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{
            left: overlayStyle.left,
            top: overlayStyle.top,
            width: overlayStyle.width,
            height: overlayStyle.height,
          }}
          onPointerDown={handleDragStart}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function SignPage() {
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

  const file = files[0] ?? null;

  // Signature creation state
  const [method, setMethod] = useState<SignatureMethod>("draw");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);

  // Draw state
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Type state
  const [typedName, setTypedName] = useState("");

  // Upload state
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);

  // Page selection state
  const [pageCount, setPageCount] = useState(0);
  const [selectedPage, setSelectedPage] = useState(1);

  // Signature placement state
  const [signaturePosition, setSignaturePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Get page count when file changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!file) {
      setPageCount(0);
      setSelectedPage(1);
      setSignaturePosition(null);
      setSignatureConfirmed(false);
      setSignatureDataUrl(null);
      return;
    }
    let cancelled = false;
    async function loadPageCount() {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const buf = await file!.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
        if (!cancelled) {
          setPageCount(pdfDoc.getPageCount());
          setSelectedPage(1);
          setSignaturePosition(null);
        }
      } catch {
        if (!cancelled) setPageCount(0);
      }
    }
    loadPageCount();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // ---------------------------------------------------------------------------
  // Set up drawing canvas context
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [method]);

  // ---------------------------------------------------------------------------
  // Drawing handlers
  // ---------------------------------------------------------------------------
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = sigCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const point = "touches" in e ? e.touches[0] : e;
      return {
        x: (point.clientX - rect.left) * scaleX,
        y: (point.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = sigCanvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const { x, y } = getCanvasPoint(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
      setHasDrawn(true);
    },
    [getCanvasPoint]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      const canvas = sigCanvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const { x, y } = getCanvasPoint(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getCanvasPoint]
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = sigCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Re-apply stroke style after clear
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasDrawn(false);
    setSignatureDataUrl(null);
    setSignatureConfirmed(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Type tab: convert typed name to data URL
  // ---------------------------------------------------------------------------
  const getTypedSignatureDataUrl = useCallback((): string | null => {
    if (!typedName.trim()) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    ctx.font =
      "48px 'Brush Script MT', 'Segoe Script', 'Dancing Script', cursive";
    ctx.fillStyle = "#000";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, 20, 100);
    return canvas.toDataURL("image/png");
  }, [typedName]);

  // ---------------------------------------------------------------------------
  // Upload tab handler
  // ---------------------------------------------------------------------------
  const handleSigUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => setUploadedSig(reader.result as string);
      reader.readAsDataURL(f);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Get the current signature data URL based on active method
  // ---------------------------------------------------------------------------
  const getSignatureDataUrl = useCallback((): string | null => {
    if (method === "draw") {
      if (!hasDrawn) return null;
      return sigCanvasRef.current?.toDataURL("image/png") ?? null;
    }
    if (method === "type") return getTypedSignatureDataUrl();
    if (method === "upload") return uploadedSig;
    return null;
  }, [method, hasDrawn, getTypedSignatureDataUrl, uploadedSig]);

  // ---------------------------------------------------------------------------
  // Confirm signature (lock it in and move to placement step)
  // ---------------------------------------------------------------------------
  const confirmSignature = useCallback(() => {
    const url = getSignatureDataUrl();
    if (!url) return;
    setSignatureDataUrl(url);
    setSignatureConfirmed(true);
    setSignaturePosition(null);
  }, [getSignatureDataUrl]);

  // ---------------------------------------------------------------------------
  // Reset signature (go back to step 1)
  // ---------------------------------------------------------------------------
  const resetSignature = useCallback(() => {
    setSignatureConfirmed(false);
    setSignatureDataUrl(null);
    setSignaturePosition(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Apply signature to PDF
  // ---------------------------------------------------------------------------
  const handleSign = useCallback(async () => {
    const sigDataUrl = signatureDataUrl;
    if (!file || !sigDataUrl || !signaturePosition) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const buf = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

      // Convert data URL to Uint8Array
      const base64 = sigDataUrl.split(",")[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++)
        bytes[i] = binaryStr.charCodeAt(i);

      // Embed the image
      let sigImage;
      if (sigDataUrl.includes("image/png")) {
        sigImage = await pdfDoc.embedPng(bytes);
      } else {
        sigImage = await pdfDoc.embedJpg(bytes);
      }

      // Scale signature to reasonable size (max 200pt wide)
      const sigWidth = Math.min(200, sigImage.width);
      const sigHeight = (sigWidth / sigImage.width) * sigImage.height;

      const page = pdfDoc.getPages()[selectedPage - 1];
      const { height } = page.getSize();

      // signaturePosition is in PDF coordinates with origin top-left (from canvas)
      // pdf-lib uses origin bottom-left, so flip Y
      page.drawImage(sigImage, {
        x: signaturePosition.x,
        y: height - signaturePosition.y - sigHeight,
        width: sigWidth,
        height: sigHeight,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], {
        type: "application/pdf",
      });
      setResult(
        blob,
        `${file.name.replace(/\.pdf$/i, "")}_signed.pdf`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Signing failed: ${err.message}`
          : "An unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    file,
    signatureDataUrl,
    signaturePosition,
    selectedPage,
    setIsProcessing,
    setError,
    setResult,
  ]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const canConfirmSignature =
    (method === "draw" && hasDrawn) ||
    (method === "type" && typedName.trim().length > 0) ||
    (method === "upload" && uploadedSig !== null);

  const canApplySignature =
    signatureConfirmed && signatureDataUrl && signaturePosition && !isProcessing;

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File drop zone - hidden when result is shown */}
        {!result && (
          <FileDropZone
            accept=".pdf"
            files={files}
            onFiles={addFiles}
            onRemove={removeFile}
            label="Drop your PDF here or click to browse"
            sublabel="Select a PDF to sign"
          />
        )}

        {/* Step 1: Create Signature */}
        {file && !result && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Create Signature
              </h3>
              {signatureConfirmed && (
                <span className="ml-auto flex items-center gap-1 text-xs text-success dark:text-success font-medium">
                  <Check className="w-3.5 h-3.5" />
                  Confirmed
                </span>
              )}
            </div>

            {/* Method tabs */}
            {!signatureConfirmed && (
              <>
                <div className="flex gap-2">
                  {(["draw", "type", "upload"] as const).map((m) => {
                    const Icon = METHOD_ICONS[m];
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={cn(
                          "flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2",
                          method === m
                            ? "bg-primary/10 border-primary text-foreground ring-2 ring-primary/30"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {METHOD_LABELS[m]}
                      </button>
                    );
                  })}
                </div>

                {/* Draw tab content */}
                {method === "draw" && (
                  <div className="space-y-3">
                    <div className="border border-border rounded-lg p-4 bg-white">
                      <canvas
                        ref={sigCanvasRef}
                        width={400}
                        height={200}
                        className="w-full rounded-lg cursor-crosshair touch-none"
                        style={{ maxWidth: 400 }}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Draw your signature above
                      </p>
                      {hasDrawn && (
                        <button
                          type="button"
                          onClick={clearSignature}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Type tab content */}
                {method === "type" && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="Type your name"
                      className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                    />
                    {typedName.trim() && (
                      <div className="border border-border rounded-lg p-4 bg-white">
                        <p
                          className="text-4xl text-black truncate"
                          style={{
                            fontFamily:
                              "'Brush Script MT', 'Segoe Script', 'Dancing Script', cursive",
                          }}
                        >
                          {typedName}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Upload tab content */}
                {method === "upload" && (
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSigUpload}
                      className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-border file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-muted file:cursor-pointer file:transition-colors"
                    />
                    {uploadedSig && (
                      <div className="border border-border rounded-lg p-4 bg-white">
                        <img
                          src={uploadedSig}
                          alt="Uploaded signature"
                          className="max-h-24 object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Confirm button */}
                <Button
                  onClick={confirmSignature}
                  disabled={!canConfirmSignature}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Use This Signature
                </Button>
              </>
            )}

            {/* Confirmed state: show small preview with edit button */}
            {signatureConfirmed && signatureDataUrl && (
              <div className="flex items-center gap-4">
                <div className="border border-border rounded-lg p-3 bg-white">
                  <img
                    src={signatureDataUrl}
                    alt="Your signature"
                    className="h-12 object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={resetSignature}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Change signature
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Place Signature */}
        {file && signatureConfirmed && signatureDataUrl && !result && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Place Signature
              </h3>
            </div>

            {/* Page navigator */}
            {pageCount > 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPage((p) => Math.max(1, p - 1));
                      setSignaturePosition(null);
                    }}
                    disabled={selectedPage <= 1}
                    className="p-1.5 rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium text-foreground">
                    Page {selectedPage} of {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPage((p) => Math.min(pageCount, p + 1));
                      setSignaturePosition(null);
                    }}
                    disabled={selectedPage >= pageCount}
                    className="p-1.5 rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <label
                      htmlFor="goto-page"
                      className="text-xs text-muted-foreground"
                    >
                      Go to
                    </label>
                    <input
                      id="goto-page"
                      type="number"
                      min={1}
                      max={pageCount}
                      value=""
                      placeholder={String(selectedPage)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (val >= 1 && val <= pageCount) {
                          setSelectedPage(val);
                          setSignaturePosition(null);
                          e.target.value = "";
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseInt(
                            (e.target as HTMLInputElement).value,
                            10
                          );
                          if (val >= 1 && val <= pageCount) {
                            setSelectedPage(val);
                            setSignaturePosition(null);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                      className="w-16 h-8 px-2 text-center text-sm bg-background border border-border rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Page preview with click-to-place */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Click to place your signature, then drag to reposition
              </p>
              <div className="overflow-auto rounded-lg border border-border bg-muted/30 p-4 flex justify-center">
                <SignaturePlacement
                  file={file}
                  pageNumber={selectedPage}
                  signatureUrl={signatureDataUrl}
                  position={signaturePosition}
                  onPositionChange={setSignaturePosition}
                />
              </div>
              {signaturePosition && (
                <p className="text-xs text-success dark:text-success flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Signature positioned on page {selectedPage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Action buttons */}
        {file && !result && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleSign}
              disabled={!canApplySignature}
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing PDF...
                </>
              ) : (
                <>
                  <PenLine className="w-4 h-4 mr-2" />
                  Apply Signature
                </>
              )}
            </Button>
          </div>
        )}

        {/* Result section */}
        {result && (
          <div className="space-y-4">
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success dark:text-success text-sm flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              Signature applied successfully. Click &quot;Download&quot; to save
              your file.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={download} size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download {resultFilename}
              </Button>
              <Button onClick={reset} variant="ghost" size="lg">
                <RotateCcw className="w-4 h-4 mr-2" />
                Sign Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Sign PDF Online Free | Bucket0",
  description:
    "Add your signature to a PDF by drawing, typing, or uploading an image. Fast, free, and secure — no uploads to any server. Sign PDFs entirely in your browser with Bucket0.",
});
