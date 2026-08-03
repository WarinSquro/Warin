export type StorageProvider = "filesystem" | "s3" | "azure";

export type PutOptions = {
  contentType?: string;
  metadata?: Record<string, string>;
};

export type StoredObject = {
  key: string;
  size?: number;
  contentType?: string;
  etag?: string;
};

export type SignedUrlOptions = {
  expiresInSeconds?: number;
  download?: boolean;
};

export type FilesystemStorageOptions = {
  rootDir: string;
  /** Optional public/base URL prefix for stored objects */
  baseUrl?: string;
};

export type S3StorageOptions = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export type AzureStorageOptions = {
  container: string;
  connectionString?: string;
  accountName?: string;
  accountKey?: string;
};

export type StorageModuleOptions = {
  provider?: StorageProvider;
  filesystem?: FilesystemStorageOptions;
  s3?: S3StorageOptions;
  azure?: AzureStorageOptions;
};

export const STORAGE_OPTIONS = Symbol("STORAGE_OPTIONS");
export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");

export interface StorageDriver {
  put(key: string, body: Buffer, opts?: PutOptions): Promise<StoredObject>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl?(key: string, opts?: SignedUrlOptions): Promise<string>;
}
