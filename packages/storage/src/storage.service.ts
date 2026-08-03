import { Inject, Injectable } from "@nestjs/common";
import { STORAGE_DRIVER, type PutOptions, type SignedUrlOptions, type StoredObject, type StorageDriver } from "./types";

@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  put(key: string, body: Buffer, opts?: PutOptions): Promise<StoredObject> {
    return this.driver.put(key, body, opts);
  }

  getBuffer(key: string): Promise<Buffer> {
    return this.driver.getBuffer(key);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }

  getSignedUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    if (!this.driver.getSignedUrl) {
      throw new Error("Signed URLs are not supported by the active storage driver");
    }
    return this.driver.getSignedUrl(key, opts);
  }
}
