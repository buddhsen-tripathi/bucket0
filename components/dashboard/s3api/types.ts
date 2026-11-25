export interface Credential {
  id: string;
  accessKeyId: string;
  name: string;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Bucket {
  id: string;
  name: string;
  storageUsed: number;
  storageUsedFormatted: string;
  objectCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface NewCredential {
  accessKeyId: string;
  secretAccessKey: string;
  name: string;
}
