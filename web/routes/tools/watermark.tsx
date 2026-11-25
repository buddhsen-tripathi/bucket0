
import { useState, useCallback } from "react";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import { Loader2, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import { usePdfTool } from "@/hooks/usePdfTool";
import { cn } from "@/lib/shared/utils";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "watermark")!;

type WatermarkColor = "gray" | "red" | "blue" | "green";
type WatermarkPosition = "center" | "tile";

const COLOR_OPTIONS: {
  value: WatermarkColor;
  label: string;
  bgClass: string;
  activeClass: string;
  dotClass: string;
}[] = [
  {
    value: "gray",
    label: "Gray",
    bgClass: "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600",
    activeClass: "ring-2 ring-gray-400 dark:ring-gray-500 border-gray-400 dark:border-gray-500",
    dotClass: "bg-gray-500",
  },
  {
    value: "red",
    label: "Red",
    bgClass: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
    activeClass: "ring-2 ring-red-400 dark:ring-red-500 border-red-400 dark:border-red-500",
    dotClass: "bg-red-500",
  },
  {
    value: "blue",
    label: "Blue",
    bgClass: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    activeClass: "ring-2 ring-blue-400 dark:ring-blue-500 border-blue-400 dark:border-blue-500",
    dotClass: "bg-blue-500",
  },
  {
    value: "green",
    label: "Green",
    bgClass: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800",
    activeClass: "ring-2 ring-green-400 dark:ring-green-500 border-green-400 dark:border-green-500",
    dotClass: "bg-green-500",
  },
];

const COLOR_MAP = {
  gray: rgb(0.5, 0.5, 0.5),
  red: rgb(0.8, 0.2, 0.2),
  blue: rgb(0.2, 0.2, 0.8),
  green: rgb(0.2, 0.6, 0.2),
};

export default function WatermarkPage() {
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

  const [text, setText] = useState("CONFIDENTIAL");
  const [wmFontSize, setWmFontSize] = useState(60);
  const [rotation, setRotation] = useState(45);
  const [opacity, setOpacity] = useState(0.15);
  const [color, setColor] = useState<WatermarkColor>("gray");
  const [position, setPosition] = useState<WatermarkPosition>("center");

  const file = files[0] ?? null;

  const handleAddWatermark = useCallback(async () => {
    if (!file) {
      setError("Please upload a PDF file first.");
      return;
    }

    if (!text.trim()) {
      setError("Please enter watermark text.");
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

      pages.forEach((page) => {
        const { width, height } = page.getSize();

        if (position === "center") {
          const textWidth = font.widthOfTextAtSize(text, wmFontSize);
          page.drawText(text, {
            x: width / 2 - textWidth / 2,
            y: height / 2,
            size: wmFontSize,
            font,
            color: COLOR_MAP[color],
            opacity,
            rotate: degrees(rotation),
          });
        } else {
          // Tile: repeat watermark in a grid pattern across the page
          const textWidth = font.widthOfTextAtSize(text, wmFontSize);
          const spacingX = Math.max(textWidth * 1.5, wmFontSize * 3);
          const spacingY = wmFontSize * 3;

          for (let ty = -height; ty < height * 2; ty += spacingY) {
            for (let tx = -width; tx < width * 2; tx += spacingX) {
              page.drawText(text, {
                x: tx,
                y: ty,
                size: wmFontSize,
                font,
                color: COLOR_MAP[color],
                opacity,
                rotate: degrees(rotation),
              });
            }
          }
        }
      });

      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(blob, "watermarked.pdf");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to add watermark: ${err.message}`
          : "An unexpected error occurred while adding the watermark."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [file, text, wmFontSize, rotation, opacity, color, position, setIsProcessing, setError, setResult]);

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
          sublabel="Select a PDF to add a watermark"
        />

        {/* Configuration options */}
        {file && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Watermark Options
            </h3>

            {/* Watermark text */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Text
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter watermark text"
                className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </div>

            {/* Font size and Rotation in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Font Size
                </label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={wmFontSize}
                  onChange={(e) =>
                    setWmFontSize(
                      Math.min(
                        200,
                        Math.max(10, parseInt(e.target.value) || 60)
                      )
                    )
                  }
                  className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Rotation ({rotation}&deg;)
                </label>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="w-full h-10 accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>-90&deg;</span>
                  <span>0&deg;</span>
                  <span>90&deg;</span>
                </div>
              </div>
            </div>

            {/* Opacity */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Opacity ({Math.round(opacity * 100)}%)
              </label>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
                className="w-full h-10 accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Color
              </label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setColor(opt.value)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150",
                      opt.bgClass,
                      color === opt.value
                        ? opt.activeClass
                        : "hover:opacity-80"
                    )}
                  >
                    <span
                      className={cn("w-3 h-3 rounded-full", opt.dotClass)}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Position
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPosition("center")}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-150",
                    "flex flex-col items-center gap-1.5",
                    position === "center"
                      ? "bg-primary/10 border-primary text-foreground ring-2 ring-primary/30"
                      : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {/* Center icon - single watermark in the middle */}
                  <svg
                    width="32"
                    height="24"
                    viewBox="0 0 32 24"
                    fill="none"
                    className="text-current"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="30"
                      height="22"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <text
                      x="16"
                      y="14"
                      textAnchor="middle"
                      fontSize="8"
                      fill="currentColor"
                      opacity="0.6"
                      fontWeight="bold"
                    >
                      Aa
                    </text>
                  </svg>
                  <span>Center</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPosition("tile")}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-150",
                    "flex flex-col items-center gap-1.5",
                    position === "tile"
                      ? "bg-primary/10 border-primary text-foreground ring-2 ring-primary/30"
                      : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {/* Tile icon - repeating grid */}
                  <svg
                    width="32"
                    height="24"
                    viewBox="0 0 32 24"
                    fill="none"
                    className="text-current"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="30"
                      height="22"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <text
                      x="8"
                      y="9"
                      textAnchor="middle"
                      fontSize="5"
                      fill="currentColor"
                      opacity="0.4"
                    >
                      Aa
                    </text>
                    <text
                      x="22"
                      y="9"
                      textAnchor="middle"
                      fontSize="5"
                      fill="currentColor"
                      opacity="0.4"
                    >
                      Aa
                    </text>
                    <text
                      x="15"
                      y="16"
                      textAnchor="middle"
                      fontSize="5"
                      fill="currentColor"
                      opacity="0.4"
                    >
                      Aa
                    </text>
                    <text
                      x="8"
                      y="22"
                      textAnchor="middle"
                      fontSize="5"
                      fill="currentColor"
                      opacity="0.4"
                    >
                      Aa
                    </text>
                    <text
                      x="22"
                      y="22"
                      textAnchor="middle"
                      fontSize="5"
                      fill="currentColor"
                      opacity="0.4"
                    >
                      Aa
                    </text>
                  </svg>
                  <span>Tile</span>
                </button>
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
            onClick={handleAddWatermark}
            disabled={isProcessing || !file}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding Watermark...
              </>
            ) : (
              "Add Watermark"
            )}
          </Button>

          {result && (
            <>
              <Button onClick={download} variant="outline" size="lg">
                <Download className="w-4 h-4 mr-2" />
                Download watermarked.pdf
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
            Watermark added successfully. Click &quot;Download&quot; to save
            your file.
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Watermark PDF Online Free | Bucket0",
  description:
    "Add a text watermark to every page of your PDF with custom styling. Fast, free, and secure — no uploads to any server. Watermark PDFs entirely in your browser with Bucket0.",
});
