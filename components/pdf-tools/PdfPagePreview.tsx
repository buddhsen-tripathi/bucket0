
import { useEffect, useRef, useState } from "react";

interface PdfPagePreviewProps {
  file: File;
  pageNumber: number;
  width?: number;
  className?: string;
}

export default function PdfPagePreview({
  file,
  pageNumber,
  width = 150,
  className = "",
}: PdfPagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (cancelled) return;

      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: 1 });
      const scale = width / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport: scaledViewport } as any).promise;
      if (!cancelled) setLoading(false);
    }

    render().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [file, pageNumber, width]);

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div
          className="bg-muted/50 rounded animate-pulse"
          style={{ width, height: width * 1.414 }}
        />
      )}
      <canvas
        ref={canvasRef}
        className={`rounded shadow-sm ${loading ? "hidden" : "block"}`}
      />
    </div>
  );
}
