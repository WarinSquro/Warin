/**
 * API auth smoke (runs when DATABASE_URL is reachable).
 */
import { describe, expect, it } from "vitest";
import * as argon2 from "argon2";

describe("PIN hashing (Argon2)", () => {
  it("hashes and verifies demo PIN", async () => {
    const hash = await argon2.hash("12345", { type: argon2.argon2id });
    expect(await argon2.verify(hash, "12345")).toBe(true);
    expect(await argon2.verify(hash, "00000")).toBe(false);
  }, 20_000);
});
