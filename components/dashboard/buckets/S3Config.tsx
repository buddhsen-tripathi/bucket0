
import { useState, useEffect } from "react";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, X, AlertCircle } from "lucide-react";
import { S3Config as S3ConfigType, s3Service } from "@/lib/s3/s3-service";

interface S3ConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: S3ConfigType) => void;
  currentConfig?: S3ConfigType;
}

export default function S3Config({
  isOpen,
  onClose,
  onSave,
  currentConfig,
}: S3ConfigProps) {
  const [config, setConfig] = useState<S3ConfigType>({
    accessKeyId: "",
    secretAccessKey: "",
    bucketName: "",
    region: "",
    endpoint: "",
  });

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    } else {
      // Reset to default when there's no config (e.g., on disconnect/reset)
      setConfig({
        accessKeyId: "",
        secretAccessKey: "",
        bucketName: "",
        region: "",
        endpoint: "",
      });
    }
  }, [currentConfig]);

  useEffect(() => {
    // Reset form state when modal is closed
    if (!isOpen) {
      setConnectionStatus("idle");
      setErrorMessage("");
    }
  }, [isOpen]);

  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus("idle");
    setErrorMessage("");

    try {
      const service = s3Service.configure(config);
      const success = await service.testConnection();

      if (success) {
        setConnectionStatus("success");
        onSave(config);
        onClose();
      } else {
        setConnectionStatus("error");
        setErrorMessage("Connection failed. Please check your credentials.");
      }
    } catch {
      setConnectionStatus("error");
      setErrorMessage("Unable to connect. Please verify your credentials and try again.");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const isFormValid =
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucketName &&
    config.region;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-8 py-6 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Storage Configuration</h2>
              <p className="text-muted-foreground mt-1">Configure your S3-compatible storage provider</p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-sm hover:bg-muted transition-colors"
              >
                <X size={20} className="text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="p-8 space-y-6">

          {/* Access Key ID */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-foreground">
              Access Key ID
            </label>
            <input
              type="text"
              value={config.accessKeyId}
              onChange={(e) =>
                setConfig((prev: S3ConfigType) => ({
                  ...prev,
                  accessKeyId: e.target.value,
                }))
              }
              className="w-full px-4 py-3 border border-border rounded-sm bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-muted transition-all"
              placeholder="Enter your access key ID"
            />
          </div>

          {/* Secret Access Key */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-foreground">
              Secret Access Key
            </label>
            <div className="relative">
              <input
                type={showSecretKey ? "text" : "password"}
                value={config.secretAccessKey}
                onChange={(e) =>
                  setConfig((prev: S3ConfigType) => ({
                    ...prev,
                    secretAccessKey: e.target.value,
                  }))
                }
                className="w-full px-4 py-3 pr-12 border border-border rounded-sm bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-muted transition-all"
                placeholder="Enter your secret access key"
              />
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded-sm transition-colors"
              >
                {showSecretKey ? (
                  <EyeOff size={18} className="text-muted-foreground" />
                ) : (
                  <Eye size={18} className="text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          {/* Bucket Name */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-foreground">
              Bucket Name
            </label>
            <input
              type="text"
              value={config.bucketName}
              onChange={(e) =>
                setConfig((prev: S3ConfigType) => ({
                  ...prev,
                  bucketName: e.target.value,
                }))
              }
              className="w-full px-4 py-3 border border-border rounded-sm bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-muted transition-all"
              placeholder="Enter bucket name"
            />
          </div>

          {/* Region */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-foreground">
              Region
            </label>
            <input
              type="text"
              value={config.region}
              onChange={(e) =>
                setConfig((prev: S3ConfigType) => ({
                  ...prev,
                  region: e.target.value,
                }))
              }
              className="w-full px-4 py-3 border border-border rounded-sm bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-muted transition-all"
              placeholder="us-east-1"
            />
            <p className="text-sm text-muted-foreground">
              Examples: us-east-1, eu-west-1, ap-south-1, auto
            </p>
          </div>

          {/* Optional Endpoint */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-foreground">
              Endpoint URL{" "}
              <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              type="url"
              value={config.endpoint || ""}
              onChange={(e) =>
                setConfig((prev: S3ConfigType) => ({
                  ...prev,
                  endpoint: e.target.value,
                }))
              }
              className="w-full px-4 py-3 border border-border rounded-sm bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-muted transition-all"
              placeholder="https://your-s3-endpoint.com"
            />
            <p className="text-sm text-muted-foreground">
              Only required for non-AWS S3 providers (Cloudflare R2, DigitalOcean, MinIO, etc.)
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <XCircle className="text-destructive mt-0.5 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-destructive">Error</p>
                  <p className="text-sm text-destructive/80 mt-1">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {connectionStatus === "success" && (
            <div className="bg-success/10 border border-success/20 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="text-success mt-0.5 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-success dark:text-success">Success</p>
                  <p className="text-sm text-success dark:text-success/80 mt-1">Connection successful!</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={testConnection}
              disabled={!isFormValid || isTestingConnection}
              className="flex-1 bg-foreground text-background px-6 py-4 rounded-sm hover:bg-foreground/90 transition-colors font-semibold text-lg flex items-center justify-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            >
              {isTestingConnection ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Testing & Saving...
                </>
              ) : (
                "Test Connection & Save"
              )}
            </button>
          </div>

          {/* Info Banner */}
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-primary mt-0.5 flex-shrink-0" size={20} />
              <div>
                <p className="text-sm font-medium text-foreground">Getting Started</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This unified interface works with any S3-compatible storage provider.
                </p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                  <li>• <strong className="text-foreground">AWS S3:</strong> Leave endpoint empty, use your AWS region</li>
                  <li>• <strong className="text-foreground">Cloudflare R2:</strong> Use endpoint: https://[account-id].r2.cloudflarestorage.com</li>
                  <li>• <strong className="text-foreground">DigitalOcean:</strong> Use endpoint: https://[region].digitaloceanspaces.com</li>
                  <li>• <strong className="text-foreground">MinIO:</strong> Use your MinIO server endpoint (e.g., http://localhost:9000)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
