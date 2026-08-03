import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from "node:crypto";
import * as argon2 from "argon2";
import { Inject, Injectable } from "@nestjs/common";
import { SECURITY_OPTIONS, type SecurityModuleOptions } from "./types";

@Injectable()
export class HashingService {
  constructor(@Inject(SECURITY_OPTIONS) private readonly options: SecurityModuleOptions) {}

  async hash(plain: string): Promise<string> {
    const opts = this.options.argon2 ?? {};
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: opts.memoryCost ?? 19456,
      timeCost: opts.timeCost ?? 2,
      parallelism: opts.parallelism ?? 1,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}

@Injectable()
export class CryptoService {
  constructor(@Inject(SECURITY_OPTIONS) private readonly options: SecurityModuleOptions) {}

  /** Derive a 32-byte key from a passphrase (dev helper — prefer KMS in production). */
  deriveKey(passphrase: string, salt: Buffer): Buffer {
    return scryptSync(passphrase, salt, 32);
  }

  encryptAesGcm(plaintext: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64url");
  }

  decryptAesGcm(payload: string, key: Buffer): string {
    const buf = Buffer.from(payload, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  hmacSearchHash(value: string): string {
    const pepper = this.options.hmacPepper ?? "oneview-dev-pepper-change-me";
    return createHmac("sha256", pepper).update(value.normalize("NFKC").toLowerCase()).digest("hex");
  }
}

@Injectable()
export class MaskingService {
  email(value: string): string {
    const [user, domain] = value.split("@");
    if (!domain) return "***";
    const safeUser = user.length <= 2 ? "*".repeat(user.length) : `${user[0]}***${user[user.length - 1]}`;
    return `${safeUser}@${domain}`;
  }

  pin(): string {
    return "*****";
  }

  last4(value: string): string {
    if (value.length <= 4) return "****";
    return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
  }
}
