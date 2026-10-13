/**
 * Storage abstraction — replaces S3 from the original spec.
 *
 * Default driver = Railway Volume (local filesystem on a persistent disk).
 * Files are PRIVATE: there are no public URLs. The app serves bytes through
 * signed application routes (e.g. GET /api/files/:token), so this interface
 * deliberately returns streams/buffers rather than presigned URLs.
 *
 * A future S3/R2 driver can implement the same interface with zero call-site
 * changes — switch via STORAGE_DRIVER.
 */

export type StorageKey = string; // e.g. "exports/{firmId}/{exportId}.pptx"

export interface PutOptions {
  contentType?: string;
  /** Optional TTL hint in seconds (volume driver records it; cleanup job enforces). */
  expiresInSeconds?: number;
}

export interface StoredObject {
  key: StorageKey;
  size: number;
  contentType?: string;
}

export interface Storage {
  put(key: StorageKey, body: Buffer | Uint8Array, opts?: PutOptions): Promise<StoredObject>;
  get(key: StorageKey): Promise<Buffer>;
  getStream(key: StorageKey): Promise<NodeJS.ReadableStream>;
  exists(key: StorageKey): Promise<boolean>;
  delete(key: StorageKey): Promise<void>;
  /** Remove every object under a prefix (firm deletion / retention). */
  deletePrefix(prefix: string): Promise<number>;
  stat(key: StorageKey): Promise<StoredObject | null>;
}

export { VolumeStorage } from './volume.js';

import { VolumeStorage } from './volume.js';

let singleton: Storage | null = null;

/** Build the configured storage driver (memoised). */
export function getStorage(): Storage {
  if (singleton) return singleton;
  const driver = process.env.STORAGE_DRIVER ?? 'volume';
  switch (driver) {
    case 'volume':
      singleton = new VolumeStorage(process.env.STORAGE_DIR ?? './.storage');
      return singleton;
    // case 's3': singleton = new S3Storage(...); return singleton;  // future
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  }
}

// Logical S3-equivalent prefixes (spec §4.4)
export const STORAGE_PREFIX = {
  uploads: 'uploads',
  assets: 'assets',
  exports: 'exports',
} as const;
