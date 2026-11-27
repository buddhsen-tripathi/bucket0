
import { useState, useCallback } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "page-numbers")!;

type Position =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type Format = "plain" | "page" | "fraction" | "pageOf";

const POSITION_LABELS: Record<Position, string> = {
  "top-left": "Top Left",
  "top-center": "Top Center",
  "top-right": "Top Right",
  "center-left": "Center Left",
  center: "Center",
  "center-right": "Center Right",
  "bottom-left": "Bottom Left",
  "bottom-center": "Bottom Center",
  "bottom-right": "Bottom Right",
};

const POSITION_GRID: Position[][] = [
  ["top-left", "top-center", "top-right"],
  ["center-left", "center", "center-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];

const FORMAT_OPTIONS: { value: Format; label: string; example: string }[] = [
  { value: "plain", label: "1", example: "1, 2, 3..." },
  { value: "page", label: "Page 1", example: "Page 1, Page 2..." },
  { value: "fraction", label: "1 / N", example: "1 / 10, 2 / 10..." },
  { value: "pageOf", label: "Page 1 of N", example: "Page 1 of 10..." },
];

function calculatePosition(
  pos: Position,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  fontSize: number,
  margin: number
): { x: number; y: number } {
  let x: number;
  let y: number;

  // Horizontal position
  if (pos.includes("left")) {
    x = margin;
  } else if (pos.includes("right")) {
    x = pageWidth - textWidth - margin;
  } else {
    x = (pageWidth - textWidth) / 2;
  }

  // Vertical position
  if (pos.startsWith("top")) {
    y = pageHeight - margin - fontSize;
  } else if (pos.startsWith("bottom")) {
    y = margin;
  } else {
    y = (pageHeight - fontSize) / 2;
  }

  return { x, y };
}

export default function PageNumbersPage() {
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
  } = usePdfTool();

  const [position, setPosition] = useState<Position>("bottom-center");
  const [format, setFormat] = useState<Format>("plain");
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [margin, setMargin] = useState(30);

  const file = files[0] ?? null;

  const handleAddPageNumbers = useCallback(async () => {
    if (!file) {
      setError("Please upload a PDF file first.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const pages = pdf.getPages();
      const totalPages = pages.length;

      pages.forEach((page, i) => {
        const pageNum = startNumber + i;
        let text = "";
        switch (format) {
          case "plain":
            text = `${pageNum}`;
            break;
          case "page":
            text = `Page ${pageNum}`;
            break;
          case "fraction":
            text = `${pageNum} / ${totalPages + startNumber - 1}`;
            break;
          case "pageOf":
            text = `Page ${pageNum} of ${totalPages + startNumber - 1}`;
            break;
        }

        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const { x, y } = calculatePosition(
          position,
          width,
          height,
          textWidth,
          fontSize,
          margin
        );

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      });

      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(blob, "numbered.pdf");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to add page numbers: ${err.message}`
          : "An unexpected error occurred while adding page numbers."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [file, position, format, startNumber, fontSize, margin, setIsProcessing, setError, setResult]);

  return (
    <ToolPageLayout tool={tool}>
      <div className="space-y-6">
        {/* File drop zone */}
        <FileDropZone
          accept=".pdf"
          files={files}
          onFiles={addFiles}
          onRemove={removeFile}
          label="Drop your PDF here or click to browse"
          sublabel="Select a PDF to add page numbers"
        />

        {/* Configuration options */}
        {file && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Page Number Options
            </h3>

            {/* Position grid */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Position
              </label>
              <div className="inline-flex flex-col gap-1 p-2 bg-muted/50 rounded-lg">
                {POSITION_GRID.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex gap-1">
                    {row.map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setPosition(pos)}
                        title={POSITION_LABELS[pos]}
                        className={cn(
                          "w-10 h-10 rounded-md transition-all duration-150 flex items-center justify-center",
                          "border text-xs font-medium",
                          position === pos
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/40"
                        )}
                      >
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full transition-colors",
                            position === pos
                              ? "bg-primary-foreground"
                              : "bg-muted-foreground/40"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {POSITION_LABELS[position]}
              </p>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
                className="h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none w-full"
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.example})
                  </option>
                ))}
              </select>
            </div>

            {/* Starting number, Font size, Margin in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Starting Number
                </label>
                <input
                  type="number"
                  min={1}
                  value={startNumber}
                  onChange={(e) =>
                    setStartNumber(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Font Size
                </label>
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={fontSize}
                  onChange={(e) =>
                    setFontSize(
                      Math.min(72, Math.max(6, parseInt(e.target.value) || 12))
                    )
                  }
                  className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Margin (pt)
                </label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={margin}
                  onChange={(e) =>
                    setMargin(
                      Math.min(200, Math.max(0, parseInt(e.target.value) || 30))
                    )
                  }
                  className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleAddPageNumbers}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding Page Numbers...
              </>
            ) : (
              "Add Page Numbers"
            )}
          </Button>

          {result && (
            <>
              <Button onClick={download} variant="outline" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download numbered.pdf
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
            Page numbers added successfully. Click &quot;Download&quot; to save your file.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Add Page Numbers to PDF Online Free | Bucket0",
  description:
    "Add page numbers to your PDF with customizable position and format. Fast, free, and secure — no uploads to any server. Number PDF pages entirely in your browser with Bucket0.",
});
