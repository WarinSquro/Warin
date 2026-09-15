import { expect, test } from "@playwright/test";
import { findHealthyApi, loginControlledAdmin } from "./auth-fixture";

test.describe("auth smoke", () => {
  test("login page renders email and PIN fields", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page
        .locator("div")
        .filter({ hasText: /^Sign in$/ })
        .first()
    ).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-pin-0")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("incomplete credentials are rejected without calling login API", async ({ page }) => {
    let loginRequests = 0;
    page.on("request", (request) => {
      if (/\/auth\/login$/.test(request.url())) loginRequests += 1;
    });

    await page.goto("/login");
    await page.locator("#login-email").fill("invalid-email");
    await page.locator("#login-pin-0").fill("1");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page.getByText("Enter a valid email and complete 5-digit PIN.")).toBeVisible();
    expect(loginRequests).toBe(0);
  });

  test("PIN fields accept digits only and reveal or hide together", async ({ page }) => {
    await page.goto("/login");
    const pinInputs = page.locator('input[inputmode="numeric"]');

    await pinInputs.first().fill("x");
    await expect(pinInputs.first()).toHaveValue("");
    await pinInputs.first().fill("7");
    await expect(pinInputs.first()).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show PIN" }).click();
    await expect(pinInputs.first()).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide PIN" })).toBeVisible();
  });

  test("forgot PIN navigation validates email before submission", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot PIN?" }).click();
    await expect(page).toHaveURL(/\/forgot-pin$/);

    const send = page.getByRole("button", { name: "Send reset link" });
    await expect(send).toBeDisabled();
    await page.getByPlaceholder("Enter email").fill("person@example.com");
    await expect(send).toBeEnabled();
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("reset PIN without a token is blocked with an actionable error", async ({ page }) => {
    await page.goto("/reset-pin");
    await expect(page.getByText("Missing or invalid reset link. Request a new one.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save new PIN" })).toBeDisabled();
  });

  test("super admin reaches cockpit when API is available", async ({ page }) => {
    test.skip(
      !(await findHealthyApi(page.request)),
      "API not running — start Docker for full login e2e"
    );

    await loginControlledAdmin(page);
    await expect(page).toHaveURL(/\/cockpit/, { timeout: 20_000 });
  });
});
