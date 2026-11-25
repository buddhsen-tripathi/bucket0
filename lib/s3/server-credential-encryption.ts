/**
 * Server-side encryption for S3 credentials
 * Uses AES-256-GCM with key from environment variable
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Get and validate credential encryption key (lazy initialization)
 */
function getEncryptionKey(): Buffer {
  const CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!CREDENTIAL_ENCRYPTION_KEY || !/^[0-9a-f]{64}$/i.test(CREDENTIAL_ENCRYPTION_KEY)) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes for AES-256). ' +
      'Generate one with: openssl rand -hex 32'
    );
  }

  return Buffer.from(CREDENTIAL_ENCRYPTION_KEY, 'hex');
}

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypt sensitive credential data (server-side only)
 */
export function encryptCredential(plaintext: string): EncryptedData {
  // Generate random IV (12 bytes for GCM)
  const iv = randomBytes(12);

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);

  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt credential data (server-side only)
 */
export function decryptCredential(
  encryptedData: string,
  iv: string,
  authTag: string
): string {
  // Create decipher
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(iv, 'hex')
  );

  // Set auth tag
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  // Decrypt
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt both accessKeyId and secretAccessKey
 */
export function encryptS3Credentials(accessKeyId: string, secretAccessKey: string) {
  // Use the same IV and separate encryption for each field
  const iv = randomBytes(12);

  // Encrypt access key ID
  const accessKeyCipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encryptedAccessKeyId = accessKeyCipher.update(accessKeyId, 'utf8', 'hex');
  encryptedAccessKeyId += accessKeyCipher.final('hex');
  const accessKeyAuthTag = accessKeyCipher.getAuthTag();

  // Encrypt secret access key (use same IV but different cipher instance)
  const secretKeyCipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encryptedSecretAccessKey = secretKeyCipher.update(secretAccessKey, 'utf8', 'hex');
  encryptedSecretAccessKey += secretKeyCipher.final('hex');
  const secretKeyAuthTag = secretKeyCipher.getAuthTag();

  // Combine auth tags (accessKey authTag + secretKey authTag)
  const combinedAuthTag = Buffer.concat([accessKeyAuthTag, secretKeyAuthTag]).toString('hex');

  return {
    encryptedAccessKeyId,
    encryptedSecretAccessKey,
    credentialsIv: iv.toString('hex'),
    credentialsAuthTag: combinedAuthTag,
  };
}

/**
 * Decrypt both S3 credentials
 */
export function decryptS3Credentials(
  encryptedAccessKeyId: string,
  encryptedSecretAccessKey: string,
  credentialsIv: string,
  credentialsAuthTag: string
) {
  const iv = Buffer.from(credentialsIv, 'hex');

  // Split combined auth tag
  const combinedAuthTagBuffer = Buffer.from(credentialsAuthTag, 'hex');
  const accessKeyAuthTag = combinedAuthTagBuffer.subarray(0, 16);
  const secretKeyAuthTag = combinedAuthTagBuffer.subarray(16, 32);

  // Decrypt access key ID
  const accessKeyDecipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  accessKeyDecipher.setAuthTag(accessKeyAuthTag);
  let accessKeyId = accessKeyDecipher.update(encryptedAccessKeyId, 'hex', 'utf8');
  accessKeyId += accessKeyDecipher.final('utf8');

  // Decrypt secret access key
  const secretKeyDecipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  secretKeyDecipher.setAuthTag(secretKeyAuthTag);
  let secretAccessKey = secretKeyDecipher.update(encryptedSecretAccessKey, 'hex', 'utf8');
  secretAccessKey += secretKeyDecipher.final('utf8');

  return {
    accessKeyId,
    secretAccessKey,
  };
}
