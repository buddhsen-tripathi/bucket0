
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Loader2,
  Download,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "jpg-to-pdf")!;

type PageSize = "fit" | "a4";

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const A4_PADDING = 40;

/** Convert a WebP file to PNG via an offscreen canvas, returning an ArrayBuffer for pdf-lib. */
async function convertWebpToPng(file: File): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to convert WebP image to PNG."));
      },
      "image/png"
    );
  });

  return blob.arrayBuffer();
}

/** Scale image dimensions to fit within a bounding box while preserving aspect ratio. */
function fitWithinBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number
): { width: number; height: number } {
  const scaleX = boxW / imgW;
  const scaleY = boxH / imgH;
  const scale = Math.min(scaleX, scaleY, 1); // never upscale
  return {
    width: imgW * scale,
    height: imgH * scale,
  };
}

export default function JpgToPdfPage() {
  const {
    files,
    addFiles,
    removeFile,
    reorderFiles,
    result,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    setResult,
    download,
    reset,
  } = usePdfTool({ multiple: true });

  const [pageSize, setPageSize] = useState<PageSize>("fit");
  const [progress, setProgress] = useState<string | null>(null);

  // Generate preview URLs for uploaded images
  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  // Revoke old object URLs on cleanup
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const moveUp = useCallback(
    (index: number) => {
      if (index > 0) reorderFiles(index, index - 1);
    },
    [reorderFiles]
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index < files.length - 1) reorderFiles(index, index + 1);
    },
    [reorderFiles, files.length]
  );

  const handleConvert = useCallback(async () => {
    if (files.length === 0) {
      setError("Please add at least one image file.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress("Preparing PDF...");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Processing image ${i + 1} of ${files.length}...`);

        const isWebp = file.type === "image/webp";
        const isPng = file.type === "image/png";

        let img;
        if (isWebp) {
          // pdf-lib does not support WebP; convert to PNG first
          const pngBytes = await convertWebpToPng(file);
          img = await pdfDoc.embedPng(pngBytes);
        } else if (isPng) {
          const bytes = await file.arrayBuffer();
          img = await pdfDoc.embedPng(bytes);
        } else {
          // Treat everything else as JPEG (JPG, JPEG)
          const bytes = await file.arrayBuffer();
          img = await pdfDoc.embedJpg(bytes);
        }

        const imgWidth = img.width;
        const imgHeight = img.height;

        if (pageSize === "fit") {
          // Page matches image dimensions exactly
          const page = pdfDoc.addPage([imgWidth, imgHeight]);
          page.drawImage(img, {
            x: 0,
            y: 0,
            width: imgWidth,
            height: imgHeight,
          });
        } else {
          // A4: center the image on the page, scaled to fit within padded area
          const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
          const maxW = A4_WIDTH - A4_PADDING * 2;
          const maxH = A4_HEIGHT - A4_PADDING * 2;
          const { width: drawW, height: drawH } = fitWithinBox(
            imgWidth,
            imgHeight,
            maxW,
            maxH
          );

          // Center on page
          const x = (A4_WIDTH - drawW) / 2;
          const y = (A4_HEIGHT - drawH) / 2;
          page.drawImage(img, { x, y, width: drawW, height: drawH });
        }
      }

      setProgress("Saving PDF...");
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      setResult(blob, "images.pdf");
    } catch (err) {
      setError(
        err instanceof Error
          ? `PDF creation failed: ${err.message}`
          : "An unexpected error occurred while creating the PDF."
      );
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [files, pageSize, setIsProcessing, setError, setResult]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File drop zone */}
        <FileDropZone
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          maxFiles={50}
          files={files}
          onFiles={addFiles}
          onRemove={removeFile}
          label="Drop your images here or click to browse"
          sublabel="Up to 50 JPG, PNG, or WebP files (100MB each)"
        />

        {/* Image previews with reorder controls */}
        {files.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Image Order
              </h3>
              <p className="text-xs text-muted-foreground">
                {files.length} {files.length === 1 ? "image" : "images"} selected
              </p>
            </div>

            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-3 bg-muted/40 rounded-sm px-3 py-2 hover:bg-muted/60 transition-colors"
                >
                  {/* Sequence number */}
                  <span className="text-xs font-mono text-muted-foreground w-6 text-center shrink-0">
                    {index + 1}
                  </span>

                  {/* Image thumbnail */}
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                    <img
                      src={previewUrls[index]}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* File name */}
                  <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
                    {file.name}
                  </p>

                  {/* Reorder and remove controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveUp(index)}
                      disabled={index === 0 || isProcessing}
                      aria-label={`Move ${file.name} up`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveDown(index)}
                      disabled={index === files.length - 1 || isProcessing}
                      aria-label={`Move ${file.name} down`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeFile(index)}
                      disabled={isProcessing}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page size option */}
        {files.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">Page Size</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPageSize("fit")}
                disabled={isProcessing}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-3 transition-all",
                  "text-sm hover:border-primary/50",
                  pageSize === "fit"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-muted/30"
                )}
              >
                <span className="font-medium text-foreground">
                  Fit to Image
                </span>
                <span className="text-xs text-muted-foreground">
                  Each page matches image size
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPageSize("a4")}
                disabled={isProcessing}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-3 transition-all",
                  "text-sm hover:border-primary/50",
                  pageSize === "a4"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-muted/30"
                )}
              >
                <span className="font-medium text-foreground">A4</span>
                <span className="text-xs text-muted-foreground">
                  Standard 595 x 842pt, centered
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Progress display */}
        {isProcessing && progress && (
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            {progress}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleConvert}
            disabled={isProcessing || files.length === 0}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating PDF...
              </>
            ) : (
              "Create PDF"
            )}
          </Button>

          {result && (
            <>
              <Button onClick={download} variant="outline" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download images.pdf
              </Button>
              <Button onClick={reset} variant="ghost" size="lg">
                <RotateCcw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
            </>
          )}
        </div>

        {/* Success message */}
        {result && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success dark:text-success text-sm">
            PDF created successfully from {files.length}{" "}
            {files.length === 1 ? "image" : "images"}. Click &quot;Download&quot; to save your file.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "JPG to PDF Online Free | Bucket0",
  description:
    "Convert JPG, PNG, or WebP images into a single PDF document. Fast, free, and secure — no uploads to any server. Convert images to PDF entirely in your browser with Bucket0.",
});
