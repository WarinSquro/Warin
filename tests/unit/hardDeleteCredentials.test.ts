import { describe, expect, it } from "vitest";
import { credentialsEmailMatches } from "../../utils/hardDeleteCredentials";

describe("credentialsEmailMatches", () => {
  it("matches ignoring case and surrounding space", () => {
    expect(credentialsEmailMatches("Admin@Acme.io", "  admin@acme.io  ")).toBe(true);
  });

  it("rejects a different email or blanks", () => {
    expect(credentialsEmailMatches("admin@acme.io", "other@acme.io")).toBe(false);
    expect(credentialsEmailMatches("admin@acme.io", "")).toBe(false);
    expect(credentialsEmailMatches(undefined, "admin@acme.io")).toBe(false);
  });
});
