
import { useState, useCallback } from "react";

interface UsePdfToolOptions {
  accept?: string;
  multiple?: boolean;
}

interface UsePdfToolReturn {
  files: File[];
  setFiles: (files: File[]) => void;
  addFiles: (newFiles: File[]) => void;
  removeFile: (index: number) => void;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
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

export function usePdfTool(options: UsePdfToolOptions = {}): UsePdfToolReturn {
  const { multiple = false } = options;
  const [files, setFilesState] = useState<File[]>([]);
  const [result, setResultState] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState("output.pdf");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFiles = useCallback((newFiles: File[]) => {
    setFilesState(newFiles);
    setResultState(null);
    setError(null);
  }, []);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      setFilesState((prev) => (multiple ? [...prev, ...newFiles] : newFiles));
      setResultState(null);
      setError(null);
    },
    [multiple]
  );

  const removeFile = useCallback((index: number) => {
    setFilesState((prev) => prev.filter((_, i) => i !== index));
    setResultState(null);
  }, []);

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    setFilesState((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
    setResultState(null);
  }, []);

  const setResult = useCallback((blob: Blob | null, filename?: string) => {
    setResultState(blob);
    if (filename) setResultFilename(filename);
  }, []);

  const reset = useCallback(() => {
    setFilesState([]);
    setResultState(null);
    setResultFilename("output.pdf");
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
    files,
    setFiles,
    addFiles,
    removeFile,
    reorderFiles,
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
