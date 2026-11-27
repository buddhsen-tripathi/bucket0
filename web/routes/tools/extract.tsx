
import { useCallback, useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2, Download, RotateCcw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "extract")!;

/**
 * Parses a range string like "1, 3-5, 8" into an array of 0-based page indices.
 * Validates against the total page count.
 */
function parsePageRanges(
  input: string,
  totalPages: number
): { pages: number[]; error: string | null } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { pages: [], error: "Please enter page numbers or ranges." };
  }

  const pages: Set<number> = new Set();
  const parts = trimmed.split(",");

  for (const part of parts) {
    const segment = part.trim();
    if (!segment) continue;

    const rangeMatch = segment.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);

      if (start < 1 || end < 1) {
        return { pages: [], error: `Invalid range "${segment}": page numbers start at 1.` };
      }
      if (start > totalPages || end > totalPages) {
        return {
          pages: [],
          error: `Invalid range "${segment}": document only has ${totalPages} page${totalPages === 1 ? "" : "s"}.`,
        };
      }
      if (start > end) {
        return { pages: [], error: `Invalid range "${segment}": start page must be less than or equal to end page.` };
      }

      for (let i = start; i <= end; i++) {
        pages.add(i - 1); // Convert to 0-based
      }
    } else {
      const pageNum = parseInt(segment, 10);
      if (isNaN(pageNum) || segment !== String(pageNum)) {
        return { pages: [], error: `Invalid entry "${segment}": please use numbers and ranges like "1, 3-5, 8".` };
      }
      if (pageNum < 1) {
        return { pages: [], error: `Invalid page number "${segment}": page numbers start at 1.` };
      }
      if (pageNum > totalPages) {
        return {
          pages: [],
          error: `Page ${pageNum} does not exist. The document has ${totalPages} page${totalPages === 1 ? "" : "s"}.`,
        };
      }
      pages.add(pageNum - 1); // Convert to 0-based
    }
  }

  if (pages.size === 0) {
    return { pages: [], error: "No valid pages specified." };
  }

  // Sort pages in ascending order
  const sorted = Array.from(pages).sort((a, b) => a - b);
  return { pages: sorted, error: null };
}

export default function ExtractPagesPage() {
  const {
    files,
    addFiles,
    removeFile,
    result,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    setResult,
    download,
    reset,
  } = usePdfTool({ multiple: false });

  const [pageCount, setPageCount] = useState<number>(0);
  const [pageRange, setPageRange] = useState("");

  // Read page count when file changes
  useEffect(() => {
    const file = files[0];
    if (!file) {
      setPageCount(0);
      setPageRange("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
        if (!cancelled) {
          setPageCount(pdf.getPageCount());
        }
      } catch {
        if (!cancelled) {
          setPageCount(0);
          setError("Could not read this PDF. The file may be corrupted.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [files, setError]);

  const handleExtract = useCallback(async () => {
    const file = files[0];
    if (!file || pageCount === 0) return;

    const { pages, error: parseError } = parsePageRanges(pageRange, pageCount);
    if (parseError) {
      setError(parseError);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
      });
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(sourcePdf, pages);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const bytes = await newPdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(blob, "extracted.pdf");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to extract pages: ${err.message}`
          : "An unexpected error occurred while extracting pages."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [files, pageCount, pageRange, setIsProcessing, setError, setResult]);

  const sourceFile = files[0];

  // Preview: parse and count pages for display
  const parsedPreview =
    sourceFile && pageCount > 0 && pageRange.trim()
      ? parsePageRanges(pageRange, pageCount)
      : null;
  const validPageCount = parsedPreview?.pages?.length ?? 0;

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File drop zone */}
        <FileDropZone
          accept=".pdf"
          multiple={false}
          files={files}
          onFiles={addFiles}
          onRemove={removeFile}
          label="Drop your PDF here or click to browse"
          sublabel="Select a PDF file to extract pages from"
        />

        {/* File info and page selection */}
        {sourceFile && pageCount > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            {/* Page count info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {sourceFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pageCount} page{pageCount === 1 ? "" : "s"} available
                </p>
              </div>
            </div>

            {/* Page range input */}
            <div className="space-y-2">
              <label
                htmlFor="extract-pages"
                className="text-sm font-medium text-foreground"
              >
                Pages to Extract
              </label>
              <input
                id="extract-pages"
                type="text"
                value={pageRange}
                onChange={(e) => {
                  setPageRange(e.target.value);
                  setError(null);
                }}
                placeholder={`e.g., 1, 3-5, ${pageCount}`}
                className={cn(
                  "w-full px-4 py-2.5 rounded-lg border bg-background text-foreground text-sm",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                  "border-border"
                )}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Enter page numbers and ranges separated by commas.
                </p>
                {validPageCount > 0 && !parsedPreview?.error && (
                  <p className="text-xs text-primary font-medium">
                    {validPageCount} page{validPageCount === 1 ? "" : "s"}{" "}
                    selected
                  </p>
                )}
              </div>
            </div>

            {/* Quick select buttons */}
            {pageCount > 1 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Quick select:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPageRange("1");
                      setError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                  >
                    First page
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPageRange(String(pageCount));
                      setError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                  >
                    Last page
                  </button>
                  {pageCount > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const odds = Array.from(
                          { length: pageCount },
                          (_, i) => i + 1
                        )
                          .filter((n) => n % 2 === 1)
                          .join(", ");
                        setPageRange(odds);
                        setError(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                    >
                      Odd pages
                    </button>
                  )}
                  {pageCount > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const evens = Array.from(
                          { length: pageCount },
                          (_, i) => i + 1
                        )
                          .filter((n) => n % 2 === 0)
                          .join(", ");
                        setPageRange(evens);
                        setError(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                    >
                      Even pages
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPageRange(`1-${pageCount}`);
                      setError(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                  >
                    All pages
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Action buttons */}
        {sourceFile && pageCount > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleExtract}
              disabled={isProcessing || !pageRange.trim()}
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : validPageCount > 0 && !parsedPreview?.error ? (
                `Extract ${validPageCount} Page${validPageCount === 1 ? "" : "s"}`
              ) : (
                "Extract Pages"
              )}
            </Button>

            {result && (
              <>
                <Button onClick={download} variant="outline" size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  Download extracted.pdf
                </Button>
                <Button onClick={reset} variant="ghost" size="lg">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Start Over
                </Button>
              </>
            )}
          </div>
        )}

        {/* Success message */}
        {result && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success dark:text-success text-sm">
            Pages extracted successfully. Click &quot;Download&quot; to save your file.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Extract PDF Pages Online Free | Bucket0",
  description:
    "Extract specific pages from a PDF to create a new document. Fast, free, and secure — no uploads to any server. Extract PDF pages entirely in your browser with Bucket0.",
});
