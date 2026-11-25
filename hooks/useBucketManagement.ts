import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/react-router";
import { S3Config, s3Service } from "@/lib/s3/s3-service";
import { secureSetItem, secureGetItem } from "@/lib/cloud/client-encryption";

type Provider = "aws" | "r2" | "azure" | "digitalocean" | "backblaze" | "other";
type StorageMode = "local" | "cloud";

export interface Bucket extends S3Config {
  id: string;
  name: string;
  provider: Provider;
}

interface CloudBucketConfig {
  id: string;
  name: string;
  provider: string;
  bucketName: string;
  region: string;
  endpoint?: string | null;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

const LOCAL_STORAGE_KEY = "bucket0-buckets-encrypted";
const ACTIVE_BUCKET_KEY = "bucket0-active-bucket";

/**
 * Manages bucket configurations with two storage modes:
 * - cloud (default): Encrypted server-side storage, syncs across devices
 * - local: Encrypted localStorage, credentials never leave device
 */
export function useBucketManagement(storageMode: StorageMode = "cloud") {
  const { user } = useUser();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [activeBucketId, setActiveBucketId] = useState<string | null>(null);
  const [config, setConfig] = useState<S3Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Load active bucket ID from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ACTIVE_BUCKET_KEY);
      if (stored) {
        setActiveBucketId(stored);
      }
    }
  }, []);

  // Load buckets from BOTH cloud and local, merge them
  // Preference only affects where NEW buckets are saved
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    if (initializedRef.current) return;

    async function loadBuckets() {
      setIsLoading(true);
      setError(null);

      try {
        // Load from both sources
        const [cloudBuckets, localBuckets] = await Promise.all([
          loadCloudBuckets(),
          loadLocalBuckets(),
        ]);

        // Merge: cloud first, then local (dedupe by ID)
        const cloudIds = new Set(cloudBuckets.map(b => b.id));
        const uniqueLocalBuckets = localBuckets.filter(b => !cloudIds.has(b.id));
        const allBuckets = [...cloudBuckets, ...uniqueLocalBuckets];

        setBuckets(allBuckets);
        autoSelectBucket(allBuckets);
        initializedRef.current = true;
      } catch (err) {
        console.error("Failed to load buckets:", err);
        setError(err instanceof Error ? err.message : "Failed to load buckets");
        setBuckets([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadBuckets();
  }, [user?.id]);

  // Load from cloud (database) - returns buckets array
  async function loadCloudBuckets(): Promise<Bucket[]> {
    try {
      const response = await fetch("/api/s3/config");
      if (!response.ok) {
        console.error("Failed to load cloud buckets:", response.status);
        return [];
      }

      const data = await response.json();
      return (data.configurations || []).map(
        (cfg: CloudBucketConfig) => ({
          id: cfg.id,
          name: cfg.name,
          provider: cfg.provider as Provider,
          bucketName: cfg.bucketName,
          region: cfg.region,
          endpoint: cfg.endpoint || undefined,
          forcePathStyle: cfg.forcePathStyle || false,
          accessKeyId: "",
          secretAccessKey: "",
        })
      );
    } catch (err) {
      console.error("Error loading cloud buckets:", err);
      return [];
    }
  }

  // Load from local encrypted storage - returns buckets array
  async function loadLocalBuckets(): Promise<Bucket[]> {
    if (!user?.id) return [];

    try {
      const encryptedData = await secureGetItem(LOCAL_STORAGE_KEY, user.id);
      if (encryptedData) {
        const parsed = JSON.parse(encryptedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error("Failed to load local buckets:", err);
    }

    return [];
  }

  // Auto-select a bucket if none selected
  function autoSelectBucket(loadedBuckets: Bucket[]) {
    if (loadedBuckets.length === 0) return;

    const storedActive = localStorage.getItem(ACTIVE_BUCKET_KEY);
    const found = storedActive && loadedBuckets.find((b) => b.id === storedActive);
    const targetId = found ? storedActive : loadedBuckets[0].id;

    if (targetId !== activeBucketId) {
      setActiveBucketId(targetId);
    }
  }

  // Persist active bucket ID
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (activeBucketId) {
      localStorage.setItem(ACTIVE_BUCKET_KEY, activeBucketId);
    } else {
      localStorage.removeItem(ACTIVE_BUCKET_KEY);
    }
  }, [activeBucketId]);

  // Save local buckets when they change (always, regardless of preference)
  useEffect(() => {
    if (!user?.id || !initializedRef.current) return;

    // Filter to only local buckets (those with "local-" prefix)
    const localBuckets = buckets.filter(b => b.id.startsWith("local-"));

    async function saveLocalBuckets() {
      try {
        await secureSetItem(LOCAL_STORAGE_KEY, JSON.stringify(localBuckets), user!.id);
      } catch (err) {
        console.error("Failed to save local buckets:", err);
      }
    }

    saveLocalBuckets();
  }, [buckets, user?.id]);

  // Configure s3Service when active bucket changes
  // Detects storage location from bucket ID, NOT from preference
  useEffect(() => {
    if (!activeBucketId || buckets.length === 0) {
      setConfig(null);
      return;
    }

    const foundBucket = buckets.find((b) => b.id === activeBucketId);
    if (!foundBucket) {
      setConfig(null);
      return;
    }

    // Determine if bucket is local or cloud based on ID prefix
    const isLocalBucket = activeBucketId.startsWith("local-");
    const bucket = foundBucket;

    async function configureBucket() {
      try {
        if (isLocalBucket) {
          // Local bucket - credentials already in bucket object
          s3Service.configure(bucket);
          setConfig(bucket);
        } else {
          // Cloud bucket - fetch credentials from server
          const response = await fetch(`/api/s3/config?id=${activeBucketId}`);
          if (!response.ok) {
            throw new Error("Failed to fetch bucket credentials");
          }

          const data = await response.json();
          const fullConfig: Bucket = {
            id: data.id,
            name: data.name,
            provider: data.provider as Provider,
            bucketName: data.bucketName,
            region: data.region,
            endpoint: data.endpoint || undefined,
            forcePathStyle: data.forcePathStyle || false,
            accessKeyId: data.accessKeyId,
            secretAccessKey: data.secretAccessKey,
          };

          s3Service.configure(fullConfig);
          setConfig(fullConfig);
        }
        setError(null);
      } catch (err) {
        console.error("Failed to configure bucket:", err);
        setError("Failed to load bucket credentials");
        setConfig(null);
      }
    }

    configureBucket();
  }, [activeBucketId, buckets]);

  // Add bucket
  const addBucket = useCallback(
    async (bucket: Omit<Bucket, "id">): Promise<string> => {
      setIsSyncing(true);
      setError(null);

      try {
        if (storageMode === "cloud") {
          const response = await fetch("/api/s3/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: bucket.name.trim(),
              provider: bucket.provider,
              bucketName: bucket.bucketName.trim(),
              region: bucket.region.trim(),
              endpoint: bucket.endpoint?.trim() || null,
              forcePathStyle: bucket.forcePathStyle || false,
              accessKeyId: bucket.accessKeyId.trim(),
              secretAccessKey: bucket.secretAccessKey.trim(),
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to save bucket");
          }

          const data = await response.json();
          const newBucket: Bucket = {
            ...bucket,
            id: data.configuration.id,
            accessKeyId: "",
            secretAccessKey: "",
          };

          setBuckets((prev) => [...prev, newBucket]);
          setActiveBucketId(newBucket.id);
          return newBucket.id;
        } else {
          // Local storage
          const newBucket: Bucket = {
            ...bucket,
            id: `local-${Date.now()}`,
            accessKeyId: bucket.accessKeyId.trim(),
            secretAccessKey: bucket.secretAccessKey.trim(),
          };

          setBuckets((prev) => [...prev, newBucket]);
          setActiveBucketId(newBucket.id);
          s3Service.configure(newBucket);
          setConfig(newBucket);
          return newBucket.id;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add bucket";
        setError(message);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [storageMode]
  );

  // Edit bucket - detects local vs cloud based on bucket ID
  const editBucket = useCallback(
    async (id: string, bucket: Omit<Bucket, "id">) => {
      setIsSyncing(true);
      setError(null);

      const isLocalBucket = id.startsWith("local-");

      try {
        if (isLocalBucket) {
          // Local storage - update with credentials
          const updatedBucket: Bucket = {
            ...bucket,
            id,
            accessKeyId: bucket.accessKeyId.trim(),
            secretAccessKey: bucket.secretAccessKey.trim(),
          };

          setBuckets((prev) => prev.map((b) => (b.id === id ? updatedBucket : b)));

          if (activeBucketId === id) {
            s3Service.configure(updatedBucket);
            setConfig(updatedBucket);
          }
        } else {
          // Cloud storage - update via API
          const response = await fetch("/api/s3/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              name: bucket.name.trim(),
              provider: bucket.provider,
              bucketName: bucket.bucketName.trim(),
              region: bucket.region.trim(),
              endpoint: bucket.endpoint?.trim() || null,
              forcePathStyle: bucket.forcePathStyle || false,
              accessKeyId: bucket.accessKeyId.trim(),
              secretAccessKey: bucket.secretAccessKey.trim(),
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to update bucket");
          }

          // Update local state (without credentials for cloud mode)
          setBuckets((prev) =>
            prev.map((b) =>
              b.id === id
                ? { ...bucket, id, accessKeyId: "", secretAccessKey: "" }
                : b
            )
          );

          // Re-fetch credentials if active
          if (activeBucketId === id) {
            const configResponse = await fetch(`/api/s3/config?id=${id}`);
            if (configResponse.ok) {
              const data = await configResponse.json();
              const fullConfig: Bucket = {
                id: data.id,
                name: data.name,
                provider: data.provider as Provider,
                bucketName: data.bucketName,
                region: data.region,
                endpoint: data.endpoint || undefined,
                forcePathStyle: data.forcePathStyle || false,
                accessKeyId: data.accessKeyId,
                secretAccessKey: data.secretAccessKey,
              };
              s3Service.configure(fullConfig);
              setConfig(fullConfig);
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update bucket";
        setError(message);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [activeBucketId]
  );

  // Delete bucket - detects local vs cloud based on bucket ID
  const deleteBucket = useCallback(
    async (id: string) => {
      setIsSyncing(true);
      setError(null);

      const isLocalBucket = id.startsWith("local-");

      try {
        // Only call API for cloud buckets
        if (!isLocalBucket) {
          const response = await fetch(`/api/s3/config?id=${id}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to delete bucket");
          }
        }

        // Update local state (works for both modes)
        const remaining = buckets.filter((b) => b.id !== id);
        setBuckets(remaining);

        if (activeBucketId === id) {
          if (remaining.length > 0) {
            setActiveBucketId(remaining[0].id);
          } else {
            setActiveBucketId(null);
            setConfig(null);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete bucket";
        setError(message);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [activeBucketId, buckets]
  );

  // Select bucket
  const selectBucket = useCallback(
    (bucketId: string) => {
      if (bucketId === activeBucketId) return;
      setActiveBucketId(bucketId);
    },
    [activeBucketId]
  );

  // Refresh buckets from both sources
  const refreshBuckets = useCallback(async () => {
    initializedRef.current = false;
    setIsLoading(true);

    try {
      const [cloudBuckets, localBuckets] = await Promise.all([
        loadCloudBuckets(),
        loadLocalBuckets(),
      ]);

      const cloudIds = new Set(cloudBuckets.map(b => b.id));
      const uniqueLocalBuckets = localBuckets.filter(b => !cloudIds.has(b.id));
      const allBuckets = [...cloudBuckets, ...uniqueLocalBuckets];

      setBuckets(allBuckets);
      autoSelectBucket(allBuckets);
      initializedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Handle quick config save (used by dev mode S3Config modal)
  const handleConfigSave = useCallback((newConfig: S3Config) => {
    s3Service.configure(newConfig);
    setConfig(newConfig);
    // Also save to localStorage for dev mode persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("s3-config", JSON.stringify(newConfig));
    }
  }, []);

  return {
    // State
    buckets,
    activeBucketId,
    config,
    isLoading,
    isSyncing,
    error,

    // Actions
    addBucket,
    editBucket,
    deleteBucket,
    selectBucket,
    refreshBuckets,

    // Handler names used by the dashboard components
    handleAddBucket: addBucket,
    handleEditBucket: editBucket,
    handleDeleteBucket: deleteBucket,
    handleBucketSelect: selectBucket,
    handleConfigSave,
  };
}
