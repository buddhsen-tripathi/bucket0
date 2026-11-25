
import { useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2, Download, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "merge")!;

export default function MergePdfPage() {
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

  const handleMerge = useCallback(async () => {
    if (files.length < 2) {
      setError("Please add at least 2 PDF files to merge.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const merged = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }

      const bytes = await merged.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(blob, "merged.pdf");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to merge PDFs: ${err.message}`
          : "An unexpected error occurred while merging PDFs."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [files, setIsProcessing, setError, setResult]);

  const totalPages = files.length;

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File drop zone */}
        <FileDropZone
          accept=".pdf"
          multiple
          maxFiles={20}
          files={files}
          onFiles={addFiles}
          onRemove={removeFile}
          label="Drop your PDF files here or click to browse"
          sublabel="Add up to 20 PDFs to merge them into one"
        />

        {/* Reorder list */}
        {files.length > 1 && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">
                File Order
              </h3>
              <p className="text-xs text-muted-foreground">
                {files.length} files selected
              </p>
            </div>
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center gap-3 bg-muted/40 rounded-sm px-4 py-3 hover:bg-muted/60 transition-colors"
              >
                <span className="text-xs font-mono text-muted-foreground w-6 text-center shrink-0">
                  {index + 1}
                </span>
                <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
                  {file.name}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    aria-label={`Move ${file.name} up`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveDown(index)}
                    disabled={index === files.length - 1}
                    aria-label={`Move ${file.name} down`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleMerge}
            disabled={isProcessing || files.length < 2}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              `Merge ${totalPages > 1 ? `${totalPages} PDFs` : "PDFs"}`
            )}
          </Button>

          {result && (
            <>
              <Button onClick={download} variant="outline" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download merged.pdf
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
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
            PDFs merged successfully. Click &quot;Download&quot; to save your file.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Merge PDF Online Free | Bucket0",
  description:
    "Combine multiple PDF files into a single document in your preferred order. Fast, free, and secure — no uploads to any server. Merge PDFs entirely in your browser with Bucket0.",
});
