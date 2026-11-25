
import { useState, useCallback, useEffect, useRef } from "react";

interface UseImageToolReturn {
  file: File | null;
  setFile: (file: File | null) => void;
  imageUrl: string | null;
  imageEl: HTMLImageElement | null;
  result: Blob | null;
  resultFilename: string;
  setResult: (blob: Blob | null, filename?: string) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  error: string | null;
  setError: (err: string | null) => void;
  reset: () => void;
  download: () => void;
}

export function useImageTool(): UseImageToolReturn {
  const [file, setFileState] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [result, setResultState] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState("output.png");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  const setFile = useCallback((f: File | null) => {
    setFileState(f);
    setResultState(null);
    setError(null);
  }, []);

  // Load image element and create object URL when file changes
  useEffect(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }

    if (!file) {
      setImageUrl(null);
      setImageEl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    prevUrlRef.current = url;
    setImageUrl(url);

    const img = new Image();
    img.onload = () => setImageEl(img);
    img.onerror = () => setError("Failed to load image.");
    img.src = url;

    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [file]);

  const setResult = useCallback((blob: Blob | null, filename?: string) => {
    setResultState(blob);
    if (filename) setResultFilename(filename);
  }, []);

  const reset = useCallback(() => {
    setFileState(null);
    setResultState(null);
    setResultFilename("output.png");
    setIsProcessing(false);
    setError(null);
  }, []);

  const download = useCallback(() => {
    if (!result) return;
    const url = URL.createObjectURL(result);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, resultFilename]);

  return {
    file,
    setFile,
    imageUrl,
    imageEl,
    result,
    resultFilename,
    setResult,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    reset,
    download,
  };
}
