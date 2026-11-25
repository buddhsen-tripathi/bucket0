
import React, { useState, useEffect } from "react";
import { MdClose, MdAdd, MdEdit, MdDelete, MdOutlineStorage, MdLock, MdCloud, MdDevices, MdUploadFile } from "react-icons/md";
import { SiCloudflare, SiDigitalocean, SiBackblaze } from "react-icons/si";
import { TbBrandAzure } from "react-icons/tb";
import { FaAws } from "react-icons/fa6";
import { S3Config } from "@/lib/s3/s3-service";
import { getPlanLimits } from "@/lib/payments/plans";

interface Bucket extends S3Config {
  id: string;
  name: string;
  provider: "aws" | "r2" | "azure" | "digitalocean" | "backblaze" | "other";
}

interface ManageBucketsProps {
  isOpen: boolean;
  onClose: () => void;
  buckets: Bucket[];
  onAddBucket: (bucket: Omit<Bucket, "id">) => Promise<string> | string | void;
  onEditBucket: (id: string, bucket: Omit<Bucket, "id">) => Promise<void> | void;
  onDeleteBucket: (id: string) => Promise<void> | void;
  editBucketId?: string | null;
  storagePreference: "local" | "cloud";
  onStoragePreferenceClick: () => void;
}

const providerIcons = {
  aws: FaAws,
  r2: SiCloudflare,
  azure: TbBrandAzure,
  digitalocean: SiDigitalocean,
  backblaze: SiBackblaze,
  other: MdOutlineStorage,
};

const providerNames = {
  aws: "AWS S3",
  r2: "Cloudflare R2",
  azure: "Azure Blob",
  digitalocean: "DigitalOcean Spaces",
  backblaze: "Backblaze B2",
  other: "S3-Compatible",
};

export default function ManageBuckets({
  isOpen,
  onClose,
  buckets,
  onAddBucket,
  onEditBucket,
  onDeleteBucket,
  editBucketId,
  storagePreference,
  onStoragePreferenceClick,
}: ManageBucketsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showEnvImport, setShowEnvImport] = useState(false);
  const [envContent, setEnvContent] = useState("");
  const [formData, setFormData] = useState<Omit<Bucket, "id">>({
    name: "",
    provider: "aws",
    accessKeyId: "",
    secretAccessKey: "",
    bucketName: "",
    region: "us-east-1",
    endpoint: "",
    forcePathStyle: false,
  });

  // Parse .env content and map to form fields
  const parseEnvContent = (content: string) => {
    const lines = content.split("\n");
    const env: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }

    // Map common env variable names to form fields
    const accessKeyId = env.AWS_ACCESS_KEY_ID || env.ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID ||
                        env.R2_ACCESS_KEY_ID || env.DO_SPACES_KEY || env.B2_KEY_ID || "";
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY || env.SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY ||
                            env.R2_SECRET_ACCESS_KEY || env.DO_SPACES_SECRET || env.B2_APPLICATION_KEY || "";
    const bucketName = env.AWS_BUCKET || env.BUCKET_NAME || env.S3_BUCKET || env.S3_BUCKET_NAME ||
                       env.R2_BUCKET || env.R2_BUCKET_NAME || env.DO_SPACES_BUCKET || env.B2_BUCKET_NAME || "";
    const region = env.AWS_REGION || env.REGION || env.S3_REGION || env.AWS_DEFAULT_REGION ||
                   env.DO_SPACES_REGION || env.B2_REGION || "us-east-1";

    // Build endpoint - auto-construct for known providers if account ID is available
    let endpoint = env.AWS_ENDPOINT || env.S3_ENDPOINT || env.ENDPOINT || env.ENDPOINT_URL ||
                   env.R2_ENDPOINT || env.DO_SPACES_ENDPOINT || env.B2_ENDPOINT || "";

    // Auto-construct R2 endpoint if we have account ID
    const r2AccountId = env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
    if (r2AccountId && !endpoint) {
      endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com`;
    }

    // Auto-construct DigitalOcean endpoint if we have region
    const doRegion = env.DO_SPACES_REGION || env.DO_REGION;
    if (doRegion && !endpoint && env.DO_SPACES_KEY) {
      endpoint = `https://${doRegion}.digitaloceanspaces.com`;
    }

    // Auto-detect provider from endpoint or env vars
    let provider: Bucket["provider"] = "aws";
    if (endpoint.includes("r2.cloudflarestorage.com") || r2AccountId) {
      provider = "r2";
    } else if (endpoint.includes("digitaloceanspaces.com") || env.DO_SPACES_KEY) {
      provider = "digitalocean";
    } else if (endpoint.includes("backblazeb2.com") || env.B2_KEY_ID) {
      provider = "backblaze";
    } else if (endpoint.includes("blob.core.windows.net")) {
      provider = "azure";
    } else if (endpoint && !endpoint.includes("amazonaws.com")) {
      provider = "other";
    }

    // Auto-set forcePathStyle for non-AWS providers
    const forcePathStyle = provider !== "aws";

    // Set region based on provider defaults if not specified
    let finalRegion = region;
    if (provider === "r2" && (!region || region === "us-east-1")) {
      finalRegion = "auto";
    }

    setFormData(prev => ({
      ...prev,
      accessKeyId: accessKeyId || prev.accessKeyId,
      secretAccessKey: secretAccessKey || prev.secretAccessKey,
      bucketName: bucketName || prev.bucketName,
      region: finalRegion || prev.region,
      endpoint: endpoint || prev.endpoint,
      provider,
      forcePathStyle,
    }));

    setShowEnvImport(false);
    setEnvContent("");
  };

  // Fetch user plan when modal opens
  useEffect(() => {
    if (isOpen && !userPlan) {
      fetch("/api/user/plan")
        .then((res) => res.json())
        .then((data) => setUserPlan(data.plan))
        .catch(() => setUserPlan("free")); // Default to free on error
    }
  }, [isOpen, userPlan]);

  // Reset form state when modal opens/closes or auto-open edit form
  useEffect(() => {
    if (!isOpen) {
      setShowForm(false);
      setEditingId(null);
      setShowUpgradePrompt(false);
      setFormData({
        name: "",
        provider: "aws",
        accessKeyId: "",
        secretAccessKey: "",
        bucketName: "",
        region: "us-east-1",
        endpoint: "",
        forcePathStyle: false,
      });
    } else if (editBucketId) {
      // Auto-open edit form for the specified bucket
      const bucket = buckets.find(b => b.id === editBucketId);
      if (bucket) {
        setFormData({
          name: bucket.name,
          provider: bucket.provider,
          accessKeyId: bucket.accessKeyId,
          secretAccessKey: bucket.secretAccessKey,
          bucketName: bucket.bucketName,
          region: bucket.region,
          endpoint: bucket.endpoint,
          forcePathStyle: bucket.forcePathStyle,
        });
        setEditingId(editBucketId);
        setShowForm(true);
      }
    }
  }, [isOpen, editBucketId, buckets]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      if (editingId) {
        await onEditBucket(editingId, formData);
      } else {
        await onAddBucket(formData);
      }
      resetForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save bucket");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      provider: "aws",
      accessKeyId: "",
      secretAccessKey: "",
      bucketName: "",
      region: "us-east-1",
      endpoint: "",
      forcePathStyle: false,
    });
    setShowForm(false);
    setEditingId(null);
    setSaveError(null);
    setShowEnvImport(false);
    setEnvContent("");
  };

  const handleEdit = (bucket: Bucket) => {
    setFormData({
      name: bucket.name,
      provider: bucket.provider,
      accessKeyId: bucket.accessKeyId,
      secretAccessKey: bucket.secretAccessKey,
      bucketName: bucket.bucketName,
      region: bucket.region,
      endpoint: bucket.endpoint,
      forcePathStyle: bucket.forcePathStyle,
    });
    setEditingId(bucket.id);
    setShowForm(true);
  };

  const handleAddClick = () => {
    if (!userPlan) return;

    const limits = getPlanLimits(userPlan);
    if (buckets.length >= limits.maxBucketConnections) {
      setShowUpgradePrompt(true);
    } else {
      setShowForm(true);
    }
  };

  const bucketLimit = userPlan ? getPlanLimits(userPlan).maxBucketConnections : 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-sm shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Manage Buckets</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MdLock size={12} />
              Credentials encrypted {storagePreference === "cloud" ? "on server" : "locally"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onStoragePreferenceClick}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors border border-border"
              title="Change storage preference"
            >
              {storagePreference === "cloud" ? (
                <>
                  <MdCloud size={16} />
                  <span>Cloud</span>
                </>
              ) : (
                <>
                  <MdDevices size={16} />
                  <span>Local</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-sm transition-colors"
            >
              <MdClose size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showUpgradePrompt ? (
            /* Upgrade Prompt */
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MdLock size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Upgrade Your Plan
                </h3>
                <p className="text-muted-foreground mb-1">
                  You&apos;ve reached the bucket limit for your {userPlan === "free" ? "Free" : userPlan === "starter" ? "Starter" : "current"} plan.
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Current: {buckets.length}/{bucketLimit} buckets
                </p>
                <div className="bg-muted/30 border border-border rounded-sm p-4 mb-6 max-w-md mx-auto">
                  <p className="text-sm text-foreground font-medium mb-2">Paid plans include:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 text-left">
                    <li>• Starter: 10 buckets, 150 GB storage</li>
                    <li>• Pro: 25 buckets, 700 GB storage</li>
                    <li>• Scale: 100 buckets, 2 TB storage</li>
                  </ul>
                </div>
                <div className="flex gap-3 justify-center">
                  <a
                    href="/pricing"
                    target="_blank"
                    className="px-6 py-2.5 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors font-medium"
                  >
                    View Pricing
                  </a>
                  <button
                    onClick={() => setShowUpgradePrompt(false)}
                    className="px-6 py-2.5 text-foreground hover:bg-muted rounded-sm transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          ) : !showForm ? (
            <>
              {/* Bucket List */}
              {buckets.length === 0 ? (
                /* Empty State - Add First Bucket Card */
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MdOutlineStorage size={32} className="text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      Connect Your First Bucket
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Connect to AWS S3, Cloudflare R2, or any S3-compatible storage to manage your files.
                    </p>
                    <div className="bg-muted/30 border border-border rounded-sm p-4 mb-6">
                      <p className="text-sm text-foreground font-medium mb-2">Supported Providers:</p>
                      <div className="flex justify-center gap-4 mt-3">
                        <FaAws size={24} className="text-muted-foreground" title="AWS S3" />
                        <SiCloudflare size={24} className="text-muted-foreground" title="Cloudflare R2" />
                        <TbBrandAzure size={24} className="text-muted-foreground" title="Azure Blob" />
                        <SiDigitalocean size={24} className="text-muted-foreground" title="DigitalOcean Spaces" />
                        <SiBackblaze size={24} className="text-muted-foreground" title="Backblaze B2" />
                      </div>
                    </div>
                    <button
                      onClick={handleAddClick}
                      disabled={!userPlan}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <MdAdd size={20} />
                      <span>Add Your First Bucket</span>
                    </button>
                    {userPlan && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Your {userPlan === "free" ? "Free" : userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} plan allows up to {bucketLimit} bucket{bucketLimit > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Bucket List with Add Button */
                <div className="space-y-4">
                  <button
                    onClick={handleAddClick}
                    disabled={!userPlan}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-sm transition-all text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MdAdd size={20} />
                    <span className="font-medium">
                      Add New Bucket {userPlan && `(${buckets.length}/${bucketLimit})`}
                    </span>
                  </button>
                <div className="space-y-3">
                  {buckets.map((bucket) => {
                    const Icon = providerIcons[bucket.provider];
                    return (
                      <div
                        key={bucket.id}
                        className="flex items-center gap-4 p-4 bg-card border border-border rounded-sm hover:border-primary/50 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon size={20} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{bucket.name}</h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {providerNames[bucket.provider]} • {bucket.bucketName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(bucket)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
                            title="Edit"
                          >
                            <MdEdit size={18} />
                          </button>
                          <button
                            onClick={() => onDeleteBucket(bucket.id)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
                            title="Delete"
                          >
                            <MdDelete size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              )}
            </>
          ) : (
            /* Add/Edit Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* .env Import Option */}
              {!editingId && (
                <div className="border border-dashed border-border rounded-sm p-4 bg-muted/20">
                  {showEnvImport ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">
                          Paste your .env content
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowEnvImport(false);
                            setEnvContent("");
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                      <textarea
                        value={envContent}
                        onChange={(e) => setEnvContent(e.target.value)}
                        placeholder={`AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalr...
AWS_BUCKET=my-bucket
AWS_REGION=us-east-1`}
                        className="w-full h-32 px-3 py-2 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => parseEnvContent(envContent)}
                        disabled={!envContent.trim()}
                        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Parse & Auto-fill
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowEnvImport(true)}
                      className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MdUploadFile size={18} />
                      <span>Import from .env file</span>
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My Production Bucket"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">A friendly name for this bucket</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Provider <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.provider}
                      onChange={(e) => {
                        const newProvider = e.target.value as Bucket["provider"];
                        const endpointTemplates: Record<string, string> = {
                          aws: "",
                          r2: "https://<account-id>.r2.cloudflarestorage.com",
                          azure: "https://<account>.blob.core.windows.net",
                          digitalocean: "https://<region>.digitaloceanspaces.com",
                          backblaze: "https://s3.<region>.backblazeb2.com",
                          other: "",
                        };
                        const regionDefaults: Record<string, string> = {
                          aws: "us-east-1",
                          r2: "auto",
                          azure: "eastus",
                          digitalocean: "nyc3",
                          backblaze: "us-west-002",
                          other: "us-east-1",
                        };
                        setFormData({
                          ...formData,
                          provider: newProvider,
                          endpoint: endpointTemplates[newProvider] || "",
                          region: regionDefaults[newProvider] || "us-east-1",
                          forcePathStyle: newProvider === "r2" || newProvider === "digitalocean",
                        });
                      }}
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                    >
                      <option value="aws">AWS S3</option>
                      <option value="r2">Cloudflare R2</option>
                      <option value="azure">Azure Blob Storage</option>
                      <option value="digitalocean">DigitalOcean Spaces</option>
                      <option value="backblaze">Backblaze B2</option>
                      <option value="other">Other S3-Compatible</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none" className="text-muted-foreground">
                        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Access Key ID <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.accessKeyId}
                    onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Secret Access Key <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.secretAccessKey}
                    onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Bucket Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.bucketName}
                    onChange={(e) => setFormData({ ...formData, bucketName: e.target.value })}
                    placeholder="my-bucket"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Region <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder={
                      formData.provider === "aws" ? "us-east-1" :
                      formData.provider === "r2" ? "auto" :
                      formData.provider === "digitalocean" ? "nyc3" :
                      formData.provider === "backblaze" ? "us-west-002" :
                      formData.provider === "azure" ? "eastus" :
                      "us-east-1"
                    }
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.provider === "aws" && "AWS region code (e.g., us-east-1, eu-west-1)"}
                    {formData.provider === "r2" && "Use 'auto' for Cloudflare R2"}
                    {formData.provider === "digitalocean" && "Spaces region (e.g., nyc3, sfo3, sgp1)"}
                    {formData.provider === "backblaze" && "B2 region (e.g., us-west-002, eu-central-003)"}
                    {formData.provider === "azure" && "Azure region (e.g., eastus, westeurope)"}
                    {formData.provider === "other" && "Storage region identifier"}
                  </p>
                </div>
              </div>

              {/* Conditionally show endpoint field based on provider */}
              {formData.provider !== "aws" && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Endpoint {formData.provider !== "other" && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    value={formData.endpoint}
                    onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                    placeholder={
                      formData.provider === "r2" ? "https://<account-id>.r2.cloudflarestorage.com" :
                      formData.provider === "azure" ? "https://<account>.blob.core.windows.net" :
                      formData.provider === "digitalocean" ? "https://<region>.digitaloceanspaces.com" :
                      formData.provider === "backblaze" ? "https://s3.<region>.backblazeb2.com" :
                      "https://s3.example.com"
                    }
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono text-sm"
                    required={formData.provider !== "other"}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formData.provider === "r2" && "Replace <account-id> with your Cloudflare account ID"}
                    {formData.provider === "azure" && "Replace <account> with your Azure storage account name"}
                    {formData.provider === "digitalocean" && "Replace <region> with your Spaces region (e.g., nyc3, sfo3)"}
                    {formData.provider === "backblaze" && "Replace <region> with your B2 region (e.g., us-west-002)"}
                    {formData.provider === "other" && "Your S3-compatible storage endpoint URL"}
                  </p>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 bg-muted/30 border border-border rounded-sm">
                <input
                  type="checkbox"
                  id="forcePathStyle"
                  checked={formData.forcePathStyle}
                  onChange={(e) => setFormData({ ...formData, forcePathStyle: e.target.checked })}
                  disabled={formData.provider === "r2" || formData.provider === "digitalocean"}
                  className="w-4 h-4 mt-0.5 rounded border-border accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label htmlFor="forcePathStyle" className="text-sm text-foreground cursor-pointer flex-1">
                  <span className="font-medium">Force path-style URLs</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(formData.provider === "r2" || formData.provider === "digitalocean")
                      ? "Automatically enabled for this provider"
                      : "Enable if your provider requires path-style URLs (bucket.s3.region.com/file vs s3.region.com/bucket/file)"}
                  </p>
                </label>
              </div>

              {saveError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-sm text-destructive text-sm">
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving..." : editingId ? "Update Bucket" : "Add Bucket"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="px-6 py-2.5 text-foreground hover:bg-muted rounded-sm transition-colors border border-border disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
