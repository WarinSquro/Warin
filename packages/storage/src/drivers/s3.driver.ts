import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PutOptions, SignedUrlOptions, StoredObject, StorageDriver, S3StorageOptions } from "../types";

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    if (!options.bucket || !options.region) {
      throw new Error("s3.bucket and s3.region are required");
    }
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? !!options.endpoint,
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
          : undefined,
    });
  }

  async put(key: string, body: Buffer, opts?: PutOptions): Promise<StoredObject> {
    const res = await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: opts?.contentType,
        Metadata: opts?.metadata,
      })
    );
    return { key, size: body.byteLength, contentType: opts?.contentType, etag: res.ETag };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key })
    );
    return streamToBuffer(res.Body);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: key,
      ResponseContentDisposition: opts?.download ? `attachment; filename="${key.split("/").pop()}"` : undefined,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts?.expiresInSeconds ?? 3600 });
  }
}
