import { requestContext } from "@/server/context";

export function getBackgroundQueue() {
  const value = requestContext.getStore()?.env.BACKGROUND_QUEUE;
  if (!isQueue(value)) throw new Error("BACKGROUND_QUEUE binding is missing");
  return value;
}
function isQueue(value: unknown): value is Env["BACKGROUND_QUEUE"] {
  return typeof value === "object" && value !== null && "send" in value && typeof value.send === "function";
}

export function getMediaContainer() {
  const value = requestContext.getStore()?.env.MEDIA_CONTAINER;
  if (!isContainer(value)) throw new Error("MEDIA_CONTAINER binding is missing");
  return value;
}
// This boundary uses the shared Fetch API surface; browser and generated Workers
// Request/AbortSignal declarations have different platform-only fields.
function isContainer(value: unknown): value is { getByName(name: string): Pick<typeof globalThis, "fetch"> } {
  return typeof value === "object" && value !== null && "getByName" in value && typeof value.getByName === "function";
}

export function getThumbnailBucket() {
  const value = requestContext.getStore()?.env.THUMBNAILS;
  if (!isBucket(value)) throw new Error("THUMBNAILS binding is missing");
  return value;
}
function isBucket(value: unknown): value is Env["THUMBNAILS"] {
  return typeof value === "object" && value !== null && "get" in value && typeof value.get === "function" && "put" in value && typeof value.put === "function";
}
