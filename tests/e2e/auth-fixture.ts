import type { APIRequestContext, Page } from "@playwright/test";

export const E2E_ADMIN_EMAIL = "e2e-admin@warin.test";
export const E2E_ADMIN_PIN = "73915";
export const E2E_ADMIN_HRMS_ID = "E2E-ADMIN";
export const E2E_RESTRICTED_EMAIL = "e2e-restricted@warin.test";
export const E2E_RESTRICTED_PIN = "84620";
export const E2E_RESTRICTED_HRMS_ID = "E2E-RESTRICTED";

export const API_BASES = [
  "http://127.0.0.1:8080/api/v1",
  "http://127.0.0.1:3001/api/v1",
  "http://localhost:8080/api/v1",
  "http://localhost:3001/api/v1",
];

export async function findHealthyApi(request: APIRequestContext): Promise<string | null> {
  for (const base of API_BASES) {
    try {
      const health = await request.get(`${base}/health`);
      if (health.ok()) return base;
    } catch {
      // Try the next supported local API address.
    }
  }
  return null;
}

export async function loginControlledAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-email").fill(E2E_ADMIN_EMAIL);
  const pinInputs = page.locator('input[inputmode="numeric"]');
  for (let i = 0; i < E2E_ADMIN_PIN.length; i++) {
    await pinInputs.nth(i).fill(E2E_ADMIN_PIN[i]!);
  }
  await page.getByRole("button", { name: /^sign in$/i }).click();

  const continueButton = page.getByRole("button", { name: "Yes, Continue" });
  const hasConflict = await continueButton
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (hasConflict) await continueButton.click();
}
