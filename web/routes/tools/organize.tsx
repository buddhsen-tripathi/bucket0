
import { useState, useCallback, useRef } from "react";
import { Loader2, Download, GripVertical, X, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { usePdfTool } from "@/hooks/usePdfTool";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import PdfPagePreview from "@/components/pdf-tools/PdfPagePreview";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "organize")!;
const MAX_PAGES = 200;

export default function OrganizePdfPage() {
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
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [removedPages, setRemovedPages] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const file = files[0] ?? null;

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      addFiles(newFiles);
      setPageOrder([]);
      setRemovedPages(new Set());
      setPageCount(0);

      if (newFiles.length > 0) {
        try {
          const { PDFDocument } = await import("pdf-lib");
          const arrayBuffer = await newFiles[0].arrayBuffer();
          const pdf = await PDFDocument.load(arrayBuffer);
          const count = pdf.getPageCount();
          if (count > MAX_PAGES) {
            setError(
              `This PDF has ${count} pages. The organizer supports up to ${MAX_PAGES} pages for smooth thumbnail rendering.`
            );
            removeFile(0);
            return;
          }
          setPageCount(count);
          setPageOrder(Array.from({ length: count }, (_, i) => i));
        } catch {
          setError("Failed to read PDF file. Please ensure it is a valid PDF.");
        }
      }
    },
    [addFiles, setError, removeFile]
  );

  const handleRemoveFile = useCallback(() => {
    removeFile(0);
    setPageCount(0);
    setPageOrder([]);
    setRemovedPages(new Set());
  }, [removeFile]);

  const toggleRemovePage = useCallback((pageIdx: number) => {
    setRemovedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIdx)) {
        next.delete(pageIdx);
      } else {
        next.add(pageIdx);
      }
      return next;
    });
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      // Store the index for the drop handler
      e.dataTransfer.setData("text/plain", String(index));
      // Use a slight delay to allow the browser to create the drag image
      requestAnimationFrame(() => {
        setDragIndex(index);
      });
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIndex !== null && index !== dragIndex) {
        setDragOverIndex(index);
      }
    },
    [dragIndex]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      dragCounter.current++;
      if (dragIndex !== null && index !== dragIndex) {
        setDragOverIndex(index);
      }
    },
    [dragIndex]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setDragOverIndex(null);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      dragCounter.current = 0;
      const fromIndex = dragIndex;

      if (fromIndex === null || fromIndex === dropIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }

      setPageOrder((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(dropIndex, 0, moved);
        return updated;
      });

      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  }, []);

  const activePages = pageOrder.filter((idx) => !removedPages.has(idx));
  const hasChanges =
    removedPages.size > 0 ||
    pageOrder.some((pageIdx, i) => pageIdx !== i);
  const canApply = activePages.length > 0 && hasChanges;

  const handleApply = useCallback(async () => {
    if (!file || activePages.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const arrayBuffer = await file.arrayBuffer();
      const src = await PDFDocument.load(arrayBuffer);
      const out = await PDFDocument.create();

      for (const pageIdx of pageOrder) {
        if (!removedPages.has(pageIdx)) {
          const [page] = await out.copyPages(src, [pageIdx]);
          out.addPage(page);
        }
      }

      const bytes = await out.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(blob, "organized.pdf");
    } catch {
      setError("Failed to organize PDF. The file may be corrupted or protected.");
    } finally {
      setIsProcessing(false);
    }
  }, [file, pageOrder, removedPages, activePages.length, setIsProcessing, setError, setResult]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File upload */}
        {!result && (
          <FileDropZone
            accept=".pdf"
            multiple={false}
            files={files}
            onFiles={handleFiles}
            onRemove={handleRemoveFile}
            label="Drop your PDF here or click to browse"
            sublabel="Single PDF file, up to 100MB and 200 pages"
          />
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Page grid with drag-and-drop reordering */}
        {file && pageCount > 0 && !result && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-muted-foreground">
                {pageCount} {pageCount === 1 ? "page" : "pages"}
                {removedPages.size > 0 && (
                  <span className="text-destructive">
                    {" "}&middot; {removedPages.size} marked for removal
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Drag to reorder &middot; Click <span className="font-mono">&times;</span> to remove
              </div>
            </div>

            {/* Page thumbnails grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {pageOrder.map((pageIdx, orderIndex) => {
                const isRemoved = removedPages.has(pageIdx);
                const isDragging = dragIndex === orderIndex;
                const isDragOver = dragOverIndex === orderIndex;

                return (
                  <div
                    key={`page-${pageIdx}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, orderIndex)}
                    onDragOver={(e) => handleDragOver(e, orderIndex)}
                    onDragEnter={(e) => handleDragEnter(e, orderIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, orderIndex)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 select-none",
                      isDragging && "opacity-40 scale-95",
                      isDragOver && !isDragging && "border-primary bg-primary/5 scale-[1.02]",
                      isRemoved
                        ? "border-destructive/40 bg-destructive/5"
                        : !isDragOver && !isDragging
                          ? "border-border bg-card hover:border-muted-foreground/30"
                          : "",
                      "cursor-grab active:cursor-grabbing"
                    )}
                  >
                    {/* Drag handle */}
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-card/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRemovePage(pageIdx);
                      }}
                      className={cn(
                        "absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm z-10",
                        isRemoved
                          ? "bg-destructive text-destructive-foreground opacity-100"
                          : "bg-card/90 border border-border opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:border-destructive/30"
                      )}
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* Thumbnail */}
                    <div className="relative overflow-hidden rounded-lg flex items-center justify-center w-full aspect-[1/1.414]">
                      <PdfPagePreview file={file} pageNumber={pageIdx + 1} width={140} />

                      {/* Red overlay for removed pages */}
                      {isRemoved && (
                        <div className="absolute inset-0 bg-destructive/20 rounded-lg flex items-center justify-center">
                          <div className="bg-destructive/90 text-destructive-foreground text-xs font-semibold px-2.5 py-1 rounded-full">
                            Removed
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Page number */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isRemoved
                            ? "text-destructive line-through"
                            : "text-muted-foreground"
                        )}
                      >
                        Page {pageIdx + 1}
                      </span>
                      {orderIndex !== pageIdx && !isRemoved && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          #{orderIndex + 1}
                        </span>
                      )}
                    </div>

                    {/* Drop indicator line */}
                    {isDragOver && !isDragging && (
                      <div className="absolute -left-[3px] top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Apply button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={handleApply}
                disabled={isProcessing || !canApply}
                className="min-w-[200px]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying Changes...
                  </>
                ) : (
                  <>
                    <ArrowDownUp className="w-4 h-4 mr-2" />
                    Apply Changes
                  </>
                )}
              </Button>
            </div>

            {/* Hint when no changes */}
            {!hasChanges && (
              <p className="text-center text-xs text-muted-foreground">
                Drag pages to reorder or click the &times; button to remove pages, then apply your changes.
              </p>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="text-center space-y-4">
            <div className="p-6 bg-card border border-border rounded-xl">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <ArrowDownUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                PDF Organized
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your PDF has been reorganized with {activePages.length}{" "}
                {activePages.length === 1 ? "page" : "pages"}.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={download} size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  Download Organized PDF
                </Button>
                <Button variant="outline" size="lg" onClick={reset}>
                  Organize Another
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
  title: "Organize PDF Online Free | Bucket0",
  description:
    "Reorder, remove, or rearrange pages in your PDF with drag and drop. Fast, free, and secure — no uploads to any server. Organize PDFs entirely in your browser with Bucket0.",
});
