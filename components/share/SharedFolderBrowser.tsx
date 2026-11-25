
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/web/compat/link";
import { Logo } from "@/components/Logo";
import { formatFileSize, getFileIcon } from "@/lib/shared/file-utils";
import { ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react";

interface SharedFolder {
  name: string;
  path: string;
  createdAt: string;
}

interface SharedFile {
  key: string;
  name: string;
  size: number;
  mimeType: string | null;
  updatedAt: string;
}

interface FolderResponse {
  path: string;
  name: string;
  allowDownload: boolean;
  folders: SharedFolder[];
  files: SharedFile[];
}

interface SharedFolderBrowserProps {
  shareLinkId: string;
  folderName: string;
  allowDownload: boolean;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SharedFolderBrowser({
  shareLinkId,
  folderName,
  allowDownload,
}: SharedFolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [data, setData] = useState<FolderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFolder = useCallback(async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/cloud/share/folder?id=${encodeURIComponent(shareLinkId)}&path=${encodeURIComponent(path)}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load folder");
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load folder");
    } finally {
      setLoading(false);
    }
  }, [shareLinkId]);

  useEffect(() => {
    loadFolder(currentPath);
  }, [currentPath, loadFolder]);

  const breadcrumbs = useMemo(() => {
    const segments = currentPath.split("/").filter(Boolean);
    return segments.map((segment, index) => ({
      name: segment,
      path: `${segments.slice(0, index + 1).join("/")}/`,
    }));
  }, [currentPath]);

  const streamUrl = (key: string, download = false) => {
    const params = new URLSearchParams({ id: shareLinkId, key });
    if (download) params.set("download", "true");
    return `/api/cloud/share/stream?${params.toString()}`;
  };

  const zipUrl = `/api/cloud/share/folder/download?id=${encodeURIComponent(shareLinkId)}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex-shrink-0">
              <Logo size={32} />
            </Link>
            <h1 className="text-sm font-medium text-foreground truncate">{folderName}</h1>
          </div>
          {allowDownload && (
            <a
              href={zipUrl}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm transition-colors flex-shrink-0"
              title="Download"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
          <button
            type="button"
            onClick={() => setCurrentPath("")}
            className={`px-2 py-1 rounded-sm hover:bg-muted hover:text-foreground ${currentPath === "" ? "text-foreground" : ""}`}
          >
            {folderName}
          </button>
          {breadcrumbs.map((crumb) => (
            <div key={crumb.path} className="flex items-center gap-1">
              <ChevronRight className="w-4 h-4" />
              <button
                type="button"
                onClick={() => setCurrentPath(crumb.path)}
                className={`px-2 py-1 rounded-sm hover:bg-muted hover:text-foreground ${currentPath === crumb.path ? "text-foreground" : ""}`}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </nav>

        <section className="border border-border rounded-sm overflow-hidden bg-card">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span className="hidden sm:block">Modified</span>
            <span>Actions</span>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading folder...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-6 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && data && data.folders.length === 0 && data.files.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">This shared folder is empty.</div>
          )}

          {!loading && !error && data && (
            <div className="divide-y divide-border">
              {data.folders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  onClick={() => setCurrentPath(folder.path)}
                  className="w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    {getFileIcon(folder.name, true, 20)}
                    <span className="text-sm font-medium text-foreground truncate">{folder.name}</span>
                  </span>
                  <span className="hidden sm:block text-xs text-muted-foreground">{formatDate(folder.createdAt)}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}

              {data.files.map((file) => (
                <div
                  key={file.key}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(file.name, false, 20)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <span className="hidden sm:block text-xs text-muted-foreground">{formatDate(file.updatedAt)}</span>
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={streamUrl(file.key)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="View"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {allowDownload && (
                      <a
                        href={streamUrl(file.key, true)}
                        className="p-2 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
