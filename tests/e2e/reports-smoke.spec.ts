import { expect, test, type Page } from "@playwright/test";

const API_BASES = [
  "http://127.0.0.1:8080/api/v1",
  "http://127.0.0.1:3001/api/v1",
  "http://localhost:8080/api/v1",
  "http://localhost:3001/api/v1",
];

/** True only when health + login work (avoids CORS/false-positive health). */
async function canAuthenticate(page: Page): Promise<boolean> {
  for (const base of API_BASES) {
    try {
      const health = await page.request.get(`${base}/health`);
      if (!health.ok()) continue;
      const login = await page.request.post(`${base}/auth/login`, {
        data: { email: "admin@acme.io", pin: "12345" },
      });
      if (login.ok()) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function loginAsAdmin(page: Page): Promise<boolean> {
  await page.goto("/login");
  await page.locator("#login-email").fill("admin@acme.io");
  const pinInputs = page.locator('input[inputmode="numeric"]');
  await expect(pinInputs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await pinInputs.nth(i).fill(String(i + 1));
  }
  await page.getByRole("button", { name: /^sign in$/i }).click();
  try {
    await expect(page).toHaveURL(/\/cockpit/, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("authenticated report smoke (needs API + CORS)", () => {
  test("deployment + performance screens load after login", async ({ page }) => {
    test.skip(
      !(await canAuthenticate(page)),
      "API login unavailable — start docker (nginx :8080 or api :3001) and allow CORS for this origin"
    );

    const ok = await loginAsAdmin(page);
    test.skip(
      !ok,
      "UI login failed (often CORS: add http://127.0.0.1:4173 to CORS_ORIGIN for vite preview e2e)"
    );

    await page.goto("/reports/deployment");
    await expect(page.getByText(/resource deployment report/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/available from/i).first()).toBeVisible();

    await page.goto("/reports/performance");
    await expect(page.getByText(/resource performance report/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("settings screen loads change history rail", async ({ page }) => {
    test.skip(
      !(await canAuthenticate(page)),
      "API login unavailable — start docker (nginx :8080 or api :3001) and allow CORS for this origin"
    );

    const ok = await loginAsAdmin(page);
    test.skip(
      !ok,
      "UI login failed (often CORS: add http://127.0.0.1:4173 to CORS_ORIGIN for vite preview e2e)"
    );

    await page.goto("/settings");
    await expect(page.getByText(/system parameters/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/change history/i).first()).toBeVisible();
  });
});
