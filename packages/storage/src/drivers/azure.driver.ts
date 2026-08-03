import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import type { PutOptions, SignedUrlOptions, StoredObject, StorageDriver, AzureStorageOptions } from "../types";

export class AzureStorageDriver implements StorageDriver {
  private readonly containerClient;

  constructor(private readonly options: AzureStorageOptions) {
    if (!options.container) throw new Error("azure.container is required");
    let service: BlobServiceClient;
    if (options.connectionString) {
      service = BlobServiceClient.fromConnectionString(options.connectionString);
    } else if (options.accountName && options.accountKey) {
      const cred = new StorageSharedKeyCredential(options.accountName, options.accountKey);
      service = new BlobServiceClient(`https://${options.accountName}.blob.core.windows.net`, cred);
    } else {
      throw new Error("Azure storage requires connectionString or accountName+accountKey");
    }
    this.containerClient = service.getContainerClient(options.container);
  }

  async put(key: string, body: Buffer, opts?: PutOptions): Promise<StoredObject> {
    const blob = this.containerClient.getBlockBlobClient(key);
    await blob.uploadData(body, {
      blobHTTPHeaders: opts?.contentType ? { blobContentType: opts.contentType } : undefined,
      metadata: opts?.metadata,
    });
    const props = await blob.getProperties();
    return { key, size: body.byteLength, contentType: opts?.contentType, etag: props.etag };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const blob = this.containerClient.getBlockBlobClient(key);
    return blob.downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    const blob = this.containerClient.getBlockBlobClient(key);
    await blob.deleteIfExists();
  }

  async exists(key: string): Promise<boolean> {
    const blob = this.containerClient.getBlockBlobClient(key);
    return blob.exists();
  }

  async getSignedUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const blob = this.containerClient.getBlockBlobClient(key);
    const startsOn = new Date();
    const expiresOn = new Date(Date.now() + (opts?.expiresInSeconds ?? 3600) * 1000);
    if (this.options.accountName && this.options.accountKey) {
      const cred = new StorageSharedKeyCredential(this.options.accountName, this.options.accountKey);
      const sas = generateBlobSASQueryParameters(
        {
          containerName: this.options.container,
          blobName: key,
          permissions: BlobSASPermissions.parse("r"),
          startsOn,
          expiresOn,
        },
        cred
      ).toString();
      return `${blob.url}?${sas}`;
    }
    return blob.url;
  }
}
