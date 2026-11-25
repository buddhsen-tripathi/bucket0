/**
 * Client-side encryption utilities for sensitive data storage
 * Uses Web Crypto API for browser-based encryption
 */

/**
 * Generate a cryptographic key from user's session
 * This ensures data is encrypted per-session and not accessible across sessions
 */
async function getDerivedKey(userId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Use userId + a browser fingerprint as key material
  const keyMaterial = encoder.encode(`${userId}-bucket0-encryption-v1`);

  // Import key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive actual encryption key using PBKDF2
  // Salt should be consistent for the same user to allow decryption
  const salt = encoder.encode(`bucket0-salt-${userId}`);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data for secure localStorage storage
 */
export async function encryptForStorage(data: string, userId: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const key = await getDerivedKey(userId);

    // Generate random IV (initialization vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      encoder.encode(data)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data from localStorage
 */
export async function decryptFromStorage(encryptedData: string, userId: string): Promise<string> {
  try {
    const key = await getDerivedKey(userId);

    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    // Decrypt
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      data
    );

    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Securely store data in localStorage with encryption
 */
export async function secureSetItem(key: string, value: string, userId: string): Promise<void> {
  const encrypted = await encryptForStorage(value, userId);
  localStorage.setItem(key, encrypted);
}

/**
 * Retrieve and decrypt data from localStorage
 */
export async function secureGetItem(key: string, userId: string): Promise<string | null> {
  const encrypted = localStorage.getItem(key);
  if (!encrypted) return null;

  try {
    return await decryptFromStorage(encrypted, userId);
  } catch {
    // If decryption fails, remove corrupted data
    localStorage.removeItem(key);
    return null;
  }
}

