import { data, type LoaderFunctionArgs, type MetaFunction } from "react-router";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { shareLinks, cloudFiles } from "@/db/schema";
import { checkIfAlreadySaved } from "@/lib/share/already-saved";
import { eq, and } from "drizzle-orm";
import Link from "@/web/compat/link";
import { Lock, FileIcon } from "lucide-react";
import { constructMetadata } from "@/lib/shared/seo";
import { getContentTypeFromExtension } from "@/lib/shared/http-utils";
import { nextMeta } from "@/web/compat/meta";
import ShareToolbar from "@/components/share/ShareToolbar";
import SharedFolderBrowser from "@/components/share/SharedFolderBrowser";
import SharedText from "@/components/share/SharedText";
import {
  ProtectedVideo,
  ProtectedAudio,
  ProtectedImage,
  ProtectedPdf,
  ProtectedMediaWrapper,
} from "@/components/share/ProtectedMedia";

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id!;
  const { userId } = await auth();

  const [shareLink] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.isActive, true)))
    .limit(1);

  if (!shareLink) {
    throw data(null, { status: 404 });
  }

  const isFolder = shareLink.targetType === "folder";
  const isProtected = shareLink.accessType === "protected";
  const base = { id, fileName: shareLink.fileName, isFolder, isProtected };

  // Protected links require authentication
  if (isProtected && !userId) {
    return { ...base, kind: "locked" as const };
  }

  await db
    .update(shareLinks)
    .set({ accessCount: shareLink.accessCount + 1 })
    .where(eq(shareLinks.id, id));

  if (isFolder) {
    return { ...base, kind: "folder" as const, allowDownload: shareLink.allowDownload };
  }

  const fullFileKey = `users/${shareLink.userId}/${shareLink.fileKey}`;
  const [fileRecord] = await db
    .select()
    .from(cloudFiles)
    .where(eq(cloudFiles.fileKey, fullFileKey))
    .limit(1);

  if (!fileRecord) {
    throw data(null, { status: 404 });
  }

  const contentType = fileRecord.mimeType || getContentTypeFromExtension(shareLink.fileKey);
  const streamUrl = `/api/cloud/share/stream?id=${id}`;
  const alreadySavedAs = await checkIfAlreadySaved(userId, id, "personal");

  return {
    ...base,
    kind: "file" as const,
    contentType,
    streamUrl,
    allowDownload: shareLink.allowDownload,
    toolbar: {
      fileName: shareLink.fileName,
      streamUrl,
      shareLinkId: id,
      shareType: "personal" as const,
      allowDownload: shareLink.allowDownload,
      allowAddToDrive: shareLink.allowAddToDrive,
      isAuthenticated: !!userId,
      alreadySavedAs,
    },
  };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData: page }) => {
  if (!page) {
    return nextMeta(
      constructMetadata({
        title: "File Not Found",
        description: "This shared file is no longer available.",
        noIndex: true,
      })
    );
  }
  const ext = page.isFolder ? "Folder" : page.fileName.split(".").pop()?.toUpperCase() || "File";
  return nextMeta(
    constructMetadata({
      title: `${page.fileName} - Shared via Bucket0`,
      description: page.isFolder
        ? `Browse ${page.fileName}, a folder shared securely via Bucket0 cloud storage.`
        : `Download or view ${page.fileName} (${ext}) shared securely via Bucket0 cloud storage.`,
      noIndex: page.isProtected,
      canonicalUrl: `https://bucket0.com/s/${page.id}`,
    })
  );
};

export default function SharePage({ loaderData: page }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  if (page.kind === "locked") {
    const noun = page.isFolder ? "folder" : "file";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-xl border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Protected {page.isFolder ? "Folder" : "File"}
          </h1>
          <p className="text-muted-foreground mb-6">
            This {noun} is only accessible to Bucket0 users. Please sign in to continue.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg text-left">
              <FileIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground truncate">{page.fileName}</span>
            </div>
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/s/${page.id}`)}`}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors inline-block text-center"
            >
              Sign in to access
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (page.kind === "folder") {
    return (
      <SharedFolderBrowser shareLinkId={page.id} folderName={page.fileName} allowDownload={page.allowDownload} />
    );
  }

  const { contentType, streamUrl, allowDownload, toolbar } = page;
  const isViewable =
    contentType.startsWith("image/") ||
    contentType === "application/pdf" ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.startsWith("text/");

  if (isViewable) {
    if (contentType.startsWith("video/")) {
      return (
        <>
          <ShareToolbar {...toolbar} />
          <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-20">
            <ProtectedVideo src={streamUrl} allowDownload={allowDownload} className="max-w-full max-h-[calc(100vh-6rem)]" />
          </div>
        </>
      );
    }

    if (contentType === "application/pdf") {
      return (
        <>
          <ShareToolbar {...toolbar} />
          <div className="min-h-screen bg-background pt-14">
            <ProtectedPdf
              src={streamUrl}
              title={page.fileName}
              allowDownload={allowDownload}
              className="w-full h-[calc(100vh-3.5rem)]"
            />
          </div>
        </>
      );
    }

    if (contentType.startsWith("audio/")) {
      return (
        <>
          <ShareToolbar {...toolbar} />
          <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-20">
            <div className="bg-card rounded-2xl shadow-xl border border-border p-8 text-center max-w-md w-full">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileIcon className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-xl font-semibold text-foreground mb-4">{page.fileName}</h1>
              <ProtectedAudio src={streamUrl} allowDownload={allowDownload} className="w-full" />
            </div>
          </div>
        </>
      );
    }

    if (contentType.startsWith("image/")) {
      return (
        <>
          <ShareToolbar {...toolbar} />
          <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-20">
            <ProtectedImage
              src={streamUrl}
              alt={page.fileName}
              allowDownload={allowDownload}
              className="max-w-full max-h-[calc(100vh-6rem)] object-contain"
            />
          </div>
        </>
      );
    }

    return (
      <>
        <ShareToolbar {...toolbar} />
        <div className="min-h-screen bg-background p-4 pt-20">
          <ProtectedMediaWrapper allowDownload={allowDownload}>
            <div className="max-w-4xl mx-auto">
              <SharedText src={streamUrl} />
            </div>
          </ProtectedMediaWrapper>
        </div>
      </>
    );
  }

  return (
    <>
      <ShareToolbar {...toolbar} />
      <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-20">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-xl border border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileIcon className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">{page.fileName}</h1>
          <p className="text-muted-foreground mb-6">
            This file is ready to download. Use the toolbar above to download or save to your drive.
          </p>
        </div>
      </div>
    </>
  );
}
