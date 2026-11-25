import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Fetches a shared text file through the decrypting stream endpoint and renders it. */
export default function SharedText({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        return res.text();
      })
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  if (text === null) {
    return <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />;
  }
  return (
    <pre className="bg-card rounded-lg border border-border p-4 overflow-auto text-sm text-foreground whitespace-pre-wrap">
      {text}
    </pre>
  );
}
