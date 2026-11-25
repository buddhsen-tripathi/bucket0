import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { systemStorage } from "@/lib/cloud/system-service";
import { encryptChunkForMultipart } from "@/lib/cloud/encryption-service";
import { chunkedUploadTracker } from "@/lib/cloud/chunked-upload-tracker";
import { cloudLog } from "@/lib/shared/logger";


// S3/R2 multipart upload constraints
const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum for non-final parts
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB - must match init endpoint
const MAX_PART_REQUEST_BYTES = CHUNK_SIZE + 64 * 1024;
class PartBodyTooLarge extends Error {}

async function readPartFormData(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > MAX_PART_REQUEST_BYTES) {
    await request.body?.cancel();
    throw new PartBodyTooLarge();
  }
  let received = 0;
  let oversized = false;
  const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_PART_REQUEST_BYTES) {
        oversized = true;
        throw new PartBodyTooLarge();
      }
      controller.enqueue(chunk);
    },
  }));
  const init: RequestInit & { duplex: "half" } = {
    method: request.method, headers: request.headers, body, signal: request.signal, duplex: "half",
  };
  try {
    return await new Request(request.url, init).formData();
  } catch (error) {
    if (oversized) throw new PartBodyTooLarge();
    throw error;
  }
}

/**
 * POST /api/cloud/upload/chunked/part
 * Upload a single part of a chunked upload
 *
 * Request (multipart form data):
 * - uploadId: string
 * - key: string (sanitized filename)
 * - partNumber: number (1-based)
 * - chunk: Blob (the file chunk)
 * - encrypt: boolean (whether to encrypt this chunk)
 * - isFinalPart: boolean (optional, marks this as the last part - allows smaller size)
 *
 * Response:
 * - etag: string (required for completing upload)
 * - partNumber: number
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce the raw-body cap while parsing too, including chunked transfers.
    const formData = await readPartFormData(request);
    const uploadId = formData.get("uploadId") as string;
    const key = formData.get("key") as string;
    const partNumberStr = formData.get("partNumber") as string;
    const chunk = formData.get("chunk") as Blob | null;
    const encryptStr = formData.get("encrypt") as string;

    if (!uploadId || !key || !partNumberStr || !chunk) {
      return NextResponse.json(
        { error: "uploadId, key, partNumber, and chunk are required" },
        { status: 400 }
      );
    }

    const partNumber = parseInt(partNumberStr, 10);
    // S3/R2 multipart uploads support a maximum of 10,000 parts
    const MAX_PART_NUMBER = 10000;
    if (isNaN(partNumber) || partNumber < 1 || partNumber > MAX_PART_NUMBER) {
      return NextResponse.json(
        { error: `partNumber must be between 1 and ${MAX_PART_NUMBER}` },
        { status: 400 }
      );
    }

    const shouldEncrypt = encryptStr === "true";

    const uploadInfo = await chunkedUploadTracker.touchUpload(userId, uploadId);
    if (!uploadInfo || uploadInfo.key !== key) {
      return NextResponse.json({ error: "Upload not found or no longer active" }, { status: 409 });
    }
    // Use the shared reservation as the authority, including final-part size.
    const expectedTotalParts = Math.ceil(uploadInfo.size / CHUNK_SIZE);
    const isFinalPart = partNumber === expectedTotalParts;
    if (partNumber > expectedTotalParts || shouldEncrypt !== uploadInfo.encrypted) {
      return NextResponse.json({ error: "Part does not match upload reservation" }, { status: 400 });
    }

    // Validate chunk size
    // S3/R2 requires non-final parts to be at least 5MB
    if (!isFinalPart && chunk.size < MIN_PART_SIZE) {
      return NextResponse.json(
        {
          error: `Non-final parts must be at least 5MB. Got ${(chunk.size / 1024 / 1024).toFixed(2)}MB. Part ${partNumber} is not the final part.`
        },
        { status: 400 }
      );
    }

    const expectedBytes = isFinalPart ? uploadInfo.size - (partNumber - 1) * CHUNK_SIZE : CHUNK_SIZE;
    if (chunk.size !== expectedBytes) {
      return NextResponse.json({ error: "Part size does not match upload reservation" }, { status: 400 });
    }
    // Only allocate the plaintext buffer after validating the Blob size.
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    // Encrypt if needed (no header for multipart - R2 requires equal part sizes)
    let uploadBuffer: Buffer;
    if (shouldEncrypt) {
      uploadBuffer = encryptChunkForMultipart(chunkBuffer);
    } else {
      uploadBuffer = chunkBuffer;
    }

    // Upload part to R2
    const etag = await systemStorage.uploadPart(
      userId,
      key,
      uploadId,
      partNumber,
      uploadBuffer
    );

    return NextResponse.json({
      etag,
      partNumber,
    });
  } catch (error) {
    if (error instanceof PartBodyTooLarge) {
      return NextResponse.json({ error: "Upload part request exceeds the 8 MiB chunk limit" }, { status: 413 });
    }
    cloudLog.error({ err: error }, "Chunked part error");
    return NextResponse.json(
      { error: "Failed to upload part" },
      { status: 500 }
    );
  }
}
