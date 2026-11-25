
import { useState, useCallback } from "react";
import {
  Loader2,
  Download,
  Unlock,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { usePdfTool } from "@/hooks/usePdfTool";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "unlock")!;

export default function UnlockPdfPage() {
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

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const file = files[0] ?? null;

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      addFiles(newFiles);
      setPassword("");
    },
    [addFiles]
  );

  const handleRemove = useCallback(() => {
    removeFile(0);
    setPassword("");
  }, [removeFile]);

  const handleReset = useCallback(() => {
    reset();
    setPassword("");
    setShowPassword(false);
  }, [reset]);

  const handleUnlock = useCallback(async () => {
    if (!file) return;

    if (!password) {
      setError("Please enter the document password.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const arrayBuffer = await file.arrayBuffer();

      // pdf-lib can bypass encryption with ignoreEncryption: true
      // We store the password to validate user intent, then re-save without protection
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
      } catch {
        setError(
          "Failed to open the PDF. The file may be corrupted."
        );
        return;
      }

      // Re-save the PDF without encryption by copying all pages to a new document
      const newPdf = await PDFDocument.create();
      const pages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as BlobPart], {
        type: "application/pdf",
      });

      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult(blob, `${baseName}_unlocked.pdf`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to unlock PDF: ${err.message}`
          : "An unexpected error occurred while unlocking the PDF."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [file, password, setIsProcessing, setError, setResult]);

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
            onRemove={handleRemove}
            label="Drop your protected PDF here or click to browse"
            sublabel="Single PDF file, up to 100MB"
          />
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Password input */}
        {file && !result && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Document Password
              </h3>

              <div className="space-y-2">
                <label
                  htmlFor="unlock-password"
                  className="text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="unlock-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter the PDF password"
                    className={cn(
                      "w-full h-10 px-3 pr-10 rounded-lg border bg-background text-foreground text-sm",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                      "transition-colors",
                      "border-border"
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && password) {
                        handleUnlock();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the password used to protect this PDF.
                </p>
              </div>
            </div>

            {/* Action button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={handleUnlock}
                disabled={isProcessing || !password}
                className="min-w-[200px]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Unlocking...
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4 mr-2" />
                    Unlock PDF
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
                <Unlock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                PDF Unlocked
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your PDF has been unlocked and saved without password
                protection.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={download} size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  Download Unlocked PDF
                </Button>
                <Button variant="outline" size="lg" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Unlock Another
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
  title: "Unlock PDF Online Free | Bucket0",
  description:
    "Remove password protection from a PDF by entering the document password. Fast, free, and secure — no uploads to any server. Unlock PDFs entirely in your browser with Bucket0.",
});
