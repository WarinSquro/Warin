import { mkdir, readFile, unlink, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import type { PutOptions, SignedUrlOptions, StoredObject, StorageDriver, FilesystemStorageOptions } from "../types";

function assertSafeKey(key: string) {
  if (!key || key.includes("\0") || path.isAbsolute(key) || key.split(/[/\\]/).includes("..")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

export class FilesystemStorageDriver implements StorageDriver {
  constructor(private readonly options: FilesystemStorageOptions) {
    if (!options.rootDir) throw new Error("filesystem.rootDir is required");
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    return path.join(this.options.rootDir, key);
  }

  async put(key: string, body: Buffer, opts?: PutOptions): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return {
      key,
      size: body.byteLength,
      contentType: opts?.contentType,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, _opts?: SignedUrlOptions): Promise<string> {
    assertSafeKey(key);
    if (this.options.baseUrl) {
      return `${this.options.baseUrl.replace(/\/$/, "")}/${key}`;
    }
    return `file://${this.resolve(key)}`;
  }
}
