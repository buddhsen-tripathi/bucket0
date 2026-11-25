
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "ocr")!;
const MAX_PAGES = 25;

interface ExtractedPage {
  pageNum: number;
  text: string;
  imageBlob: Blob;
}

export default function OcrPdfPage() {
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
  const [progressLabel, setProgressLabel] = useState("Idle");
  const [progressValue, setProgressValue] = useState(0);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  const file = files[0] ?? null;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    async function loadPageCount() {
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(await file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const count = src.getPageCount();
      if (cancelled) return;

      if (count > MAX_PAGES) {
        setError(
          `This PDF has ${count} pages. OCR currently supports up to ${MAX_PAGES} pages.`
        );
        removeFile(0);
        return;
      }

      setPageCount(count);
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

  const handleOcr = useCallback(async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProgressLabel("Preparing OCR engine...");
    setProgressValue(0);
    setExtractedPages([]);
    setPreviewMode(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let worker: any = null;
    try {
      const pdfjsLib = await import("pdfjs-dist");
      const { PDFDocument } = await import("pdf-lib");
      const { createWorker } = await import("tesseract.js");

      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

      const pdfjsBuffer = await file.arrayBuffer();
      const srcPdfJs = await pdfjsLib.getDocument({ data: pdfjsBuffer }).promise;

      worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (typeof message.progress === "number") {
            const pct = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
            setProgressValue(pct);
          }
          if (typeof message.status === "string") {
            setProgressLabel(message.status);
          }
        },
      });

      const pages: ExtractedPage[] = [];

      for (let i = 1; i <= srcPdfJs.numPages; i++) {
        setProgressLabel(`Processing page ${i} of ${srcPdfJs.numPages}...`);

        const jsPage = await srcPdfJs.getPage(i);
        const viewport = jsPage.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not initialize canvas context.");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await jsPage.render({ canvasContext: ctx, viewport } as any).promise;

        const imageBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error("Failed to rasterize a page for OCR."));
            },
            "image/jpeg",
            0.92
          );
        });

        const { data } = await worker.recognize(imageBlob);
        const extractedText = (data.text || "").trim();

        pages.push({
          pageNum: i,
          text: extractedText,
          imageBlob,
        });
      }

      setExtractedPages(pages);
      setPreviewMode(true);
      setProgressValue(100);
      setProgressLabel("OCR complete - reviewing results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR failed.");
    } finally {
      if (worker) {
        await worker.terminate();
      }
      setIsProcessing(false);
    }
  }, [file, setError, setIsProcessing]);

  const handleFinalize = useCallback(async () => {
    if (!file || extractedPages.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setProgressLabel("Creating final PDF...");

    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfLibBuffer = await file.arrayBuffer();
      const srcPdfLib = await PDFDocument.load(pdfLibBuffer, {
        ignoreEncryption: true,
      });
      const outPdf = await PDFDocument.create();
      const hiddenFont = await outPdf.embedFont(StandardFonts.Helvetica);

      for (const page of extractedPages) {
        const imageBytes = await page.imageBlob.arrayBuffer();
        const pageImage = await outPdf.embedJpg(imageBytes);
        const srcPage = srcPdfLib.getPage(page.pageNum - 1);
        const size = srcPage.getSize();

        const outPage = outPdf.addPage([size.width, size.height]);
        outPage.drawImage(pageImage, {
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
        });

        if (page.text.length > 0) {
          outPage.drawText(page.text.slice(0, 40000), {
            x: 2,
            y: size.height - 2,
            size: 1.5,
            lineHeight: 1.8,
            maxWidth: size.width - 4,
            color: rgb(0, 0, 0),
            opacity: 0.01,
            font: hiddenFont,
          });
        }
      }

      const output = await outPdf.save();
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(
        new Blob([output as BlobPart], { type: "application/pdf" }),
        `${baseName}-ocr.pdf`
      );

      setPreviewMode(false);
      setProgressValue(100);
      setProgressLabel("PDF ready for download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PDF.");
    } finally {
      setIsProcessing(false);
    }
  }, [file, extractedPages, setError, setIsProcessing, setResult]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {!previewMode ? (
          <>
            <FileDropZone
              accept=".pdf"
              multiple={false}
              files={files}
              onFiles={addFiles}
              onRemove={() => removeFile(0)}
              label="Drop your PDF here or click to browse"
              sublabel="Single PDF up to 100MB"
            />

            {file && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-medium text-foreground">OCR Settings</h3>
                  {pageCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {pageCount} {pageCount === 1 ? "page" : "pages"}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  OCR runs locally in your browser and currently uses English recognition. The output
                  preserves page visuals and adds searchable text.
                </p>

                {(isProcessing || progressValue > 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{progressLabel}</span>
                      <span>{progressValue}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${progressValue}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleOcr} disabled={!file || isProcessing} size="lg">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running OCR...
                  </>
                ) : (
                  "Run OCR"
                )}
              </Button>

              <Button
                onClick={() => {
                  reset();
                  setProgressLabel("Idle");
                  setProgressValue(0);
                  setPageCount(0);
                }}
                variant="ghost"
                size="lg"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Review Extracted Text</h2>
              <p className="text-sm text-muted-foreground">
                Check the extracted text below. You can select and copy any text before finalizing the PDF.
              </p>

              <div className="space-y-4 max-h-96 overflow-y-auto bg-background rounded-lg p-4 border border-border">
                {extractedPages.map((page) => (
                  <div key={page.pageNum} className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Page {page.pageNum}
                    </h3>
                    <div className="bg-muted/50 rounded p-3 text-sm text-foreground leading-relaxed select-text">
                      {page.text || (
                        <span className="text-muted-foreground italic">No text detected on this page</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4">
                <Button onClick={handleFinalize} disabled={isProcessing} size="lg">
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating PDF...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Finalize PDF
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => {
                    setPreviewMode(false);
                    setExtractedPages([]);
                    setProgressValue(0);
                    setProgressLabel("Idle");
                  }}
                  variant="outline"
                  size="lg"
                  disabled={isProcessing}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </>
        )}

        {result && (
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">PDF Ready</p>
              <p className="text-xs text-muted-foreground">{resultFilename}</p>
            </div>
            <Button onClick={download} size="lg">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "OCR PDF Online Free | Bucket0",
  description:
    "Run OCR in your browser to make scanned PDFs text-searchable. Fast, free, and secure — no uploads to any server. OCR PDFs entirely in your browser with Bucket0.",
});
