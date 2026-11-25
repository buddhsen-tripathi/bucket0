
import { useCallback, useState } from "react";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "flatten")!;
const MAX_PAGES = 120;

export default function FlattenPdfPage() {
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
    reset,
    download,
  } = usePdfTool();

  const [pageCount, setPageCount] = useState(0);
  const [quality, setQuality] = useState(90);

  const file = files[0] ?? null;

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      addFiles(newFiles);
      setPageCount(0);

      if (!newFiles[0]) return;

      try {
        const { PDFDocument } = await import("pdf-lib");
        const src = await PDFDocument.load(await newFiles[0].arrayBuffer(), {
          ignoreEncryption: true,
        });
        const count = src.getPageCount();
        if (count > MAX_PAGES) {
          setError(
            `This PDF has ${count} pages. Flatten currently supports up to ${MAX_PAGES} pages.`
          );
          removeFile(0);
          return;
        }
        setPageCount(count);
      } catch {
        setError("Failed to read PDF file. Please upload a valid PDF.");
      }
    },
    [addFiles, removeFile, setError]
  );

  const handleFlatten = useCallback(async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      const { PDFDocument } = await import("pdf-lib");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

      const inputBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: inputBuffer });
      const srcPdf = await loadingTask.promise;
      const outPdf = await PDFDocument.create();

      for (let i = 1; i <= srcPdf.numPages; i++) {
        const page = await srcPdf.getPage(i);
        const baseViewport = page.getViewport({ scale: 1 });

        const renderScale = baseViewport.width < 900 ? 2 : 1.5;
        const renderViewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not initialize canvas context.");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport: renderViewport } as any)
          .promise;

        const jpegBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error("Failed to rasterize PDF page."));
            },
            "image/jpeg",
            quality / 100
          );
        });

        const imageBytes = await jpegBlob.arrayBuffer();
        const img = await outPdf.embedJpg(imageBytes);
        const outPage = outPdf.addPage([baseViewport.width, baseViewport.height]);
        outPage.drawImage(img, {
          x: 0,
          y: 0,
          width: baseViewport.width,
          height: baseViewport.height,
        });
      }

      const outBytes = await outPdf.save();
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setResult(
        new Blob([outBytes as BlobPart], { type: "application/pdf" }),
        `${baseName}-flattened.pdf`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to flatten PDF."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [file, quality, setError, setIsProcessing, setResult]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        <FileDropZone
          accept=".pdf"
          multiple={false}
          files={files}
          onFiles={handleFiles}
          onRemove={() => removeFile(0)}
          label="Drop your PDF here or click to browse"
          sublabel="Single PDF up to 100MB"
        />

        {file && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-medium text-foreground">Flatten Settings</h3>
              {pageCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {pageCount} {pageCount === 1 ? "page" : "pages"}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Flattening converts each page into a static image layer. Form fields, annotations,
              and signatures become non-editable.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Output quality</span>
                <span className="font-mono text-foreground">{quality}%</span>
              </div>
              <input
                type="range"
                min={70}
                max={100}
                step={5}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleFlatten} disabled={!file || isProcessing} size="lg">
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Flattening...
              </>
            ) : (
              "Flatten PDF"
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
              setPageCount(0);
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
  title: "Flatten PDF Online Free | Bucket0",
  description:
    "Flatten forms and annotations into a static PDF for reliable sharing. Fast, free, and secure — no uploads to any server. Flatten PDFs entirely in your browser with Bucket0.",
});
