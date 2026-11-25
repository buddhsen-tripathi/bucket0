/**
 * OAuth bridge crypto — the bucket0.com side of the trust boundary with the
 * remote MCP Worker (mcp.bucket0.com). Must stay byte-for-byte compatible with
 * `bucket0-mcp/src/crypto.ts`:
 *
 *   - AES-256-GCM, key = SHA-256(OAUTH_BRIDGE_SECRET), random 12-byte IV.
 *     Code format: b64url(iv) + "." + b64url(ciphertext || authTag).
 *   - HMAC-SHA256 (hex) over `${code}.${state}` proves the callback is ours.
 *
 * The minted b0ak_ key only ever leaves this server encrypted inside the code.
 */

import { createHash, createHmac, createCipheriv, randomBytes } from "crypto";

const aesKey = (secret: string): Buffer => createHash("sha256").update(secret).digest(); // 32 bytes

/** Encrypt a JSON payload into the one-time code the Worker will decrypt. */
export function encryptCode(secret: string, json: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([ciphertext, tag]);
  return `${iv.toString("base64url")}.${blob.toString("base64url")}`;
}

/** HMAC-SHA256 (hex) — matches the Worker's hmacSign/hmacVerify. */
export function bridgeSign(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}
