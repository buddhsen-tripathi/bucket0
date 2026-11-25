
import { useState, useEffect, useCallback, useRef } from "react";
import type { Credential, Bucket, NewCredential } from "./types";

interface UseS3ApiDataProps {
  onBucketsLoaded?: (buckets: Bucket[]) => void;
}

export function useS3ApiData({ onBucketsLoaded }: UseS3ApiDataProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>("free");
  const [error, setError] = useState<string | null>(null);

  // Refs to prevent infinite loops
  const onBucketsLoadedRef = useRef(onBucketsLoaded);
  const hasInitiallyLoaded = useRef(false);

  useEffect(() => {
    onBucketsLoadedRef.current = onBucketsLoaded;
  }, [onBucketsLoaded]);

  // S3 API is now enabled for all plans (including free)
  const isS3ApiEnabled = true;
  // Max 5 secrets for all paid plans, 1 for free
  const maxKeys = plan === "free" ? 1 : 5;
  // Bucket limits: free=1, starter=10, pro=50, scale=100
  const maxBuckets = plan === "free" ? 1 : plan === "starter" ? 10 : plan === "pro" ? 50 : 100;

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh && hasInitiallyLoaded.current) return;

    setLoading(true);
    try {
      const [planRes, credRes, bucketRes] = await Promise.all([
        fetch("/api/user/plan"),
        fetch("/api/s3-api/credentials"),
        fetch("/api/s3-api/bucket"),
      ]);

      if (planRes.ok) {
        const data = await planRes.json();
        setPlan(data.plan || "free");
      }

      if (credRes.ok) {
        const data = await credRes.json();
        setCredentials(data.credentials || []);
      }

      if (bucketRes.ok) {
        const data = await bucketRes.json();
        const bucketList = data.buckets || [];
        setBuckets(bucketList);
        onBucketsLoadedRef.current?.(bucketList);
      }

      hasInitiallyLoaded.current = true;
    } catch (err) {
      console.error("Failed to fetch S3 API data:", err);
      setError("Failed to load S3 API data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createCredential = async (name: string): Promise<NewCredential | null> => {
    setError(null);
    try {
      const res = await fetch("/api/s3-api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        // Refresh credentials list
        const refreshRes = await fetch("/api/s3-api/credentials");
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setCredentials(refreshData.credentials || []);
        }
        return {
          accessKeyId: data.credential.accessKeyId,
          secretAccessKey: data.credential.secretAccessKey,
          name: data.credential.name,
        };
      } else {
        setError(data.error || "Failed to create access key");
        return null;
      }
    } catch (err) {
      console.error("Failed to create credential:", err);
      setError("Failed to create access key");
      return null;
    }
  };

  const deleteCredential = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/s3-api/credentials?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== id));
        return true;
      }
      const data = await res.json();
      setError(data.error || "Failed to delete access key");
      return false;
    } catch (err) {
      console.error("Failed to delete credential:", err);
      setError("Failed to delete access key");
      return false;
    }
  };

  const createBucket = async (name: string): Promise<Bucket | null> => {
    try {
      const res = await fetch("/api/s3-api/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (res.ok) {
        const newBucket = data.bucket;
        const updatedBuckets = [...buckets, newBucket];
        setBuckets(updatedBuckets);
        onBucketsLoadedRef.current?.(updatedBuckets);
        return newBucket;
      } else {
        throw new Error(data.error || "Failed to create bucket");
      }
    } catch (err) {
      console.error("Failed to create bucket:", err);
      throw err;
    }
  };

  const deleteBucket = async (bucketId: string, force: boolean = false): Promise<{
    success: boolean;
    error?: string;
    notEmpty?: boolean;
  }> => {
    const bucket = buckets.find(b => b.id === bucketId);
    if (!bucket) return { success: false, error: "Bucket not found" };

    try {
      const url = force
        ? `/api/s3-api/bucket?name=${encodeURIComponent(bucket.name)}&force=true`
        : `/api/s3-api/bucket?name=${encodeURIComponent(bucket.name)}`;

      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();

      if (res.ok) {
        const updatedBuckets = buckets.filter(b => b.id !== bucketId);
        setBuckets(updatedBuckets);
        onBucketsLoadedRef.current?.(updatedBuckets);
        return { success: true };
      } else {
        const isNotEmpty = data.error === "Bucket is not empty";
        if (!isNotEmpty) {
          setError(data.error || "Failed to delete bucket");
        }
        return {
          success: false,
          error: data.error,
          notEmpty: isNotEmpty,
        };
      }
    } catch (err) {
      console.error("Failed to delete bucket:", err);
      setError("Failed to delete bucket");
      return { success: false, error: "Failed to delete bucket" };
    }
  };

  return {
    credentials,
    buckets,
    loading,
    plan,
    error,
    setError,
    isS3ApiEnabled,
    maxKeys,
    maxBuckets,
    fetchData,
    createCredential,
    deleteCredential,
    createBucket,
    deleteBucket,
  };
}
