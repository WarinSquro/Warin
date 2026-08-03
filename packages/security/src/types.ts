export type SecurityModuleOptions = {
  /** Optional pepper mixed into HMAC search hashes */
  hmacPepper?: string;
  argon2?: {
    memoryCost?: number;
    timeCost?: number;
    parallelism?: number;
  };
};

export const SECURITY_OPTIONS = Symbol("SECURITY_OPTIONS");
