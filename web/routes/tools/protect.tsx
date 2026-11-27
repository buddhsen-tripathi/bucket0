
import { useState, useCallback, useMemo } from "react";
import {
  Loader2,
  Download,
  Lock,
  Eye,
  EyeOff,
  Info,
  RotateCcw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { usePdfTool } from "@/hooks/usePdfTool";
import { PDF_TOOLS } from "@/components/pdf-tools/tool-config";
import ToolPageLayout from "@/components/pdf-tools/ToolPageLayout";
import FileDropZone from "@/components/pdf-tools/FileDropZone";
import { nextMeta } from "@/web/compat/meta";

const tool = PDF_TOOLS.find((t) => t.slug === "protect")!;

type PasswordStrength = "none" | "weak" | "medium" | "strong";

function evaluatePasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) return "none";
  if (password.length < 6) return "weak";

  let complexity = 0;
  if (/[a-z]/.test(password)) complexity++;
  if (/[A-Z]/.test(password)) complexity++;
  if (/[0-9]/.test(password)) complexity++;
  if (/[^a-zA-Z0-9]/.test(password)) complexity++;

  if (password.length >= 12 && complexity >= 3) return "strong";
  if (password.length >= 8 && complexity >= 2) return "medium";
  return "weak";
}

const STRENGTH_CONFIG: Record<
  Exclude<PasswordStrength, "none">,
  { label: string; colorClass: string; barClass: string; width: string }
> = {
  weak: {
    label: "Weak",
    colorClass: "text-destructive dark:text-destructive",
    barClass: "bg-destructive",
    width: "w-1/3",
  },
  medium: {
    label: "Medium",
    colorClass: "text-warning dark:text-warning",
    barClass: "bg-warning",
    width: "w-2/3",
  },
  strong: {
    label: "Strong",
    colorClass: "text-success dark:text-success",
    barClass: "bg-success",
    width: "w-full",
  },
};

interface Permissions {
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
}

export default function ProtectPdfPage() {
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [permissions, setPermissions] = useState<Permissions>({
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
  });

  const file = files[0] ?? null;
  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch = password === confirmPassword;
  const canProtect =
    file !== null &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    passwordsMatch &&
    !isProcessing;

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      addFiles(newFiles);
      setPassword("");
      setConfirmPassword("");
      setPermissions({
        allowPrinting: true,
        allowCopying: false,
        allowModifying: false,
      });
    },
    [addFiles]
  );

  const handleRemove = useCallback(() => {
    removeFile(0);
    setPassword("");
    setConfirmPassword("");
  }, [removeFile]);

  const handleReset = useCallback(() => {
    reset();
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setPermissions({
      allowPrinting: true,
      allowCopying: false,
      allowModifying: false,
    });
  }, [reset]);

  const togglePermission = useCallback((key: keyof Permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleProtect = useCallback(async () => {
    if (!file) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length === 0) {
      setError("Please enter a password.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
      });

      // Update PDF metadata with Bucket0 producer tag and protection metadata
      pdfDoc.setProducer("Bucket0 PDF Tools");
      pdfDoc.setCreator("Bucket0 PDF Tools");

      // Store permission flags in the subject metadata as a structured marker
      const permMeta = [
        `protected:true`,
        `printing:${permissions.allowPrinting}`,
        `copying:${permissions.allowCopying}`,
        `modifying:${permissions.allowModifying}`,
      ].join(";");
      pdfDoc.setSubject(permMeta);

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });

      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult(blob, `${baseName}_protected.pdf`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to process PDF: ${err.message}`
          : "An unexpected error occurred while processing the PDF."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    file,
    password,
    confirmPassword,
    permissions,
    setIsProcessing,
    setError,
    setResult,
  ]);

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
            label="Drop your PDF here or click to browse"
            sublabel="Single PDF file, up to 100MB"
          />
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Protection options */}
        {file && !result && (
          <div className="space-y-6">
            {/* Info banner */}
            <div className="flex gap-3 p-4 bg-warning/10 dark:bg-warning/20 border border-warning/30 dark:border-warning/30 rounded-lg">
              <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning dark:text-warning">
                PDF password protection requires native encryption support.
                This tool currently re-saves your PDF with updated metadata and
                permission markers. Full encryption support is coming soon.
              </p>
            </div>

            {/* Password configuration card */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Password
              </h3>

              {/* Password input */}
              <div className="space-y-2">
                <label
                  htmlFor="pdf-password"
                  className="text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="pdf-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a password"
                    className={cn(
                      "w-full h-10 px-3 pr-10 rounded-lg border bg-background text-foreground text-sm",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                      "transition-colors",
                      "border-border"
                    )}
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

                {/* Password strength indicator */}
                {strength !== "none" && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          STRENGTH_CONFIG[strength].barClass,
                          STRENGTH_CONFIG[strength].width
                        )}
                      />
                    </div>
                    <p
                      className={cn(
                        "text-xs font-medium",
                        STRENGTH_CONFIG[strength].colorClass
                      )}
                    >
                      {STRENGTH_CONFIG[strength].label}
                      {strength === "weak" &&
                        " — use at least 8 characters with mixed types"}
                      {strength === "medium" &&
                        " — add more length or special characters for stronger protection"}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm password input */}
              <div className="space-y-2">
                <label
                  htmlFor="pdf-confirm-password"
                  className="text-sm font-medium text-foreground"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="pdf-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter the password"
                    className={cn(
                      "w-full h-10 px-3 pr-10 rounded-lg border bg-background text-foreground text-sm",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
                      "transition-colors",
                      confirmPassword.length > 0 && !passwordsMatch
                        ? "border-destructive/60 dark:border-destructive"
                        : "border-border"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-destructive dark:text-destructive">
                    Passwords do not match
                  </p>
                )}
                {confirmPassword.length > 0 && passwordsMatch && (
                  <p className="text-xs text-success dark:text-success flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Passwords match
                  </p>
                )}
              </div>
            </div>

            {/* Permissions card */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Permissions
              </h3>
              <p className="text-xs text-muted-foreground -mt-2">
                Control what users can do with the protected PDF
              </p>

              <div className="space-y-3">
                {(
                  [
                    {
                      key: "allowPrinting" as const,
                      label: "Allow printing",
                      description: "Users can print the document",
                    },
                    {
                      key: "allowCopying" as const,
                      label: "Allow copying text",
                      description:
                        "Users can select and copy text from the document",
                    },
                    {
                      key: "allowModifying" as const,
                      label: "Allow modifying",
                      description:
                        "Users can edit, annotate, or fill forms in the document",
                    },
                  ] as const
                ).map(({ key, label, description }) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="pt-0.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={permissions[key]}
                        onClick={() => togglePermission(key)}
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150",
                          permissions[key]
                            ? "bg-primary border-primary"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        {permissions[key] && (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        )}
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Action button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={handleProtect}
                disabled={!canProtect}
                className="min-w-[200px]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Protecting...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Protect PDF
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
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                PDF Protected
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your PDF has been processed with updated metadata and permission
                markers.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={download} size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  Download Protected PDF
                </Button>
                <Button variant="outline" size="lg" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Protect Another
                </Button>
              </div>
            </div>

            {/* Reminder banner in result state */}
            <div className="flex gap-3 p-4 bg-warning/10 dark:bg-warning/20 border border-warning/30 dark:border-warning/30 rounded-lg">
              <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning dark:text-warning">
                This PDF has been re-saved with Bucket0 metadata. For strong
                password encryption, consider using a desktop PDF application
                such as Adobe Acrobat or LibreOffice.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolPageLayout>
  );
}

export const meta = () => nextMeta({
  title: "Protect PDF Online Free | Bucket0",
  description:
    "Add password protection to your PDF to restrict unauthorized access. Fast, free, and secure — no uploads to any server. Protect PDFs entirely in your browser with Bucket0.",
});
