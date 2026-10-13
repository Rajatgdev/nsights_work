import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Storage, StorageKey, PutOptions, StoredObject } from './index.js';

/**
 * Railway Volume storage driver.
 * Writes objects as files under a base directory (the mounted volume path).
 * Keys are treated as POSIX-style relative paths; traversal outside the base
 * is rejected.
 */
export class VolumeStorage implements Storage {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
  }

  private pathFor(key: StorageKey): string {
    const normalised = key.replace(/^\/+/, '');
    const full = resolve(this.base, normalised);
    if (full !== this.base && !full.startsWith(this.base + sep)) {
      throw new Error(`Storage key escapes base directory: ${key}`);
    }
    return full;
  }

  async put(
    key: StorageKey,
    body: Buffer | Uint8Array,
    _opts?: PutOptions,
  ): Promise<StoredObject> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await writeFile(p, buf);
    return { key, size: buf.byteLength, contentType: _opts?.contentType };
  }

  async get(key: StorageKey): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async getStream(key: StorageKey): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.pathFor(key));
  }

  async exists(key: StorageKey): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: StorageKey): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<number> {
    const dir = this.pathFor(prefix);
    let count = 0;
    try {
      const entries = await readdir(dir, { withFileTypes: true, recursive: true });
      count = entries.filter((e) => e.isFile()).length;
    } catch {
      /* missing prefix = nothing to delete */
    }
    await rm(dir, { recursive: true, force: true });
    return count;
  }

  async stat(key: StorageKey): Promise<StoredObject | null> {
    try {
      const s = await stat(this.pathFor(key));
      return { key, size: s.size };
    } catch {
      return null;
    }
  }
}
