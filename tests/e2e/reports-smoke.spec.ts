import { expect, test } from "@playwright/test";
import { findHealthyApi, loginControlledAdmin } from "./auth-fixture";

test.describe("authenticated report smoke (needs API + CORS)", () => {
  test("deployment + performance screens load after login", async ({ page }) => {
    test.skip(
      !(await findHealthyApi(page.request)),
      "API unavailable — start Docker (nginx :8080 or api :3001)"
    );

    await loginControlledAdmin(page);
    await expect(page).toHaveURL(/\/cockpit/, { timeout: 20_000 });

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
      !(await findHealthyApi(page.request)),
      "API unavailable — start Docker (nginx :8080 or api :3001)"
    );

    await loginControlledAdmin(page);
    await expect(page).toHaveURL(/\/cockpit/, { timeout: 20_000 });

    await page.goto("/settings");
    await expect(page.getByText(/system parameters/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/change history/i).first()).toBeVisible();
  });
});
