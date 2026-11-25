import JSZip from "jszip";
import { Readable } from "node:stream";
import { openCloudFileStream, type CloudStreamFile } from "@/lib/cloud/file-stream";

/** JSZip opens lazy sources in archive order and pauses them with the response. */
export function createFolderZipStream(
  userId: string,
  rootName: string,
  folderPaths: string[],
  files: Array<CloudStreamFile & { archivePath: string }>,
): ReadableStream<Uint8Array> {
  const zip = new JSZip();
  zip.folder(rootName);
  for (const path of folderPaths) zip.folder(`${rootName}/${path}`);
  const abort = new AbortController();
  const sources: Readable[] = [];
  let onError: (error: unknown) => void = () => {};
  for (const file of files) {
    const source = Readable.from((async function* () {
      let input: Readable | undefined;
      try {
        input = await openCloudFileStream(userId, file, abort.signal);
        for await (const chunk of input) yield chunk;
      } catch (error) {
        onError(error);
      } finally {
        input?.destroy();
      }
    })(), { objectMode: false, highWaterMark: 64 * 1024 });
    sources.push(source);
    zip.file(`${rootName}/${file.archivePath}`, source);
  }

  const archive = zip.generateInternalStream({
    type: "uint8array",
    streamFiles: true,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  let stopped = false;
  const stop = () => {
    stopped = true;
    archive.pause();
    abort.abort();
    for (const source of sources) source.destroy();
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onError = (error) => {
        if (!stopped) {
          stop();
          controller.error(error);
        }
      };
      archive.on("data", (chunk) => {
        if (stopped) return;
        controller.enqueue(chunk);
        archive.pause();
      });
      archive.on("end", () => {
        if (!stopped) {
          stopped = true;
          controller.close();
        }
      });
      archive.on("error", onError);
    },
    pull() { archive.resume(); },
    cancel() { stop(); },
  }, { highWaterMark: 0 });
}
