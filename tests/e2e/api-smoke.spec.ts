import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PIN,
  E2E_RESTRICTED_EMAIL,
  E2E_RESTRICTED_PIN,
  findHealthyApi,
} from "./auth-fixture";

async function controlledUserToken(
  request: APIRequestContext,
  base: string,
  email: string,
  pin: string
): Promise<string> {
  const login = await request.post(`${base}/auth/login`, {
    data: { email, pin },
  });
  expect(login.ok(), `controlled user login returned ${login.status()}`).toBe(true);

  let body = (await login.json()) as {
    status?: string;
    accessToken?: string;
    continueToken?: string;
  };
  if (body.status === "session_conflict" && body.continueToken) {
    const continued = await request.post(`${base}/auth/login/continue`, {
      data: { continueToken: body.continueToken },
    });
    expect(continued.ok(), `session continuation returned ${continued.status()}`).toBe(true);
    body = (await continued.json()) as typeof body;
  }

  expect(body.accessToken).toBeTruthy();
  return body.accessToken!;
}

test.describe("live API smoke", () => {
  test("health and server clock expose valid public responses", async ({ request }) => {
    const base = await findHealthyApi(request);
    test.skip(!base, "API unavailable — start Docker");

    const health = await request.get(`${base}/health`);
    expect(health.status()).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "ok", database: "up" });

    const clock = await request.get(`${base}/health/clock`);
    expect(clock.status()).toBe(200);
    await expect(clock.json()).resolves.toMatchObject({
      timeZone: "Asia/Kolkata",
    });
  });

  test("auth DTO validation and protected-route guard return safe errors", async ({ request }) => {
    const base = await findHealthyApi(request);
    test.skip(!base, "API unavailable — start Docker");

    const invalid = await request.post(`${base}/auth/login`, {
      data: { email: "not-an-email", pin: "12x", unexpected: true },
    });
    expect(invalid.status()).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const protectedResponse = await request.get(`${base}/employees`);
    expect(protectedResponse.status()).toBe(401);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  test("forgot-PIN endpoint enforces its configured five-per-minute limit", async ({ request }) => {
    const base = await findHealthyApi(request);
    test.skip(!base, "API unavailable — start Docker");

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await request.post(`${base}/auth/forgot-pin`, {
        data: { email: "absent-e2e-account@warin.test" },
      });
      statuses.push(response.status());
    }

    expect(statuses.slice(0, 5).every((status) => status < 400)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  test("restricted user receives 403 for an unassigned module", async ({ request }) => {
    const base = await findHealthyApi(request);
    test.skip(!base, "API unavailable — start Docker");
    const accessToken = await controlledUserToken(
      request,
      base,
      E2E_RESTRICTED_EMAIL,
      E2E_RESTRICTED_PIN
    );

    const response = await request.get(`${base}/employees`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  test("controlled super-admin can read core module endpoints", async ({ request }) => {
    const base = await findHealthyApi(request);
    test.skip(!base, "API unavailable — start Docker");
    const accessToken = await controlledUserToken(request, base, E2E_ADMIN_EMAIL, E2E_ADMIN_PIN);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const endpoints = [
      "/auth/me",
      "/settings",
      "/settings/schedule",
      "/settings/audit?limit=5",
      "/settings/smtp",
      "/employees",
      "/projects",
      "/employee-project-maps",
      "/allocations",
      "/resource-leaves",
      "/resource-leaves/active-dates",
      "/confirmations",
      "/confirmations/me/productivity",
      "/masters/customers",
      "/masters/departments",
      "/masters/skill-categories",
      "/masters/skills",
      "/masters/activities",
      "/masters/activity-milestones",
      "/masters/decision-point-types",
      "/masters/employee-costs",
      "/access-rights",
      "/cockpit/summary",
      "/weekly-check-in/config",
      "/kpi/masters/categories",
      "/kpi/masters/methods",
      "/kpi/masters/units",
      "/decision-points?summary=1",
      "/team-projects",
      "/performance-card/resources",
      "/cost-analyzer",
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(`${base}${endpoint}`, { headers });
      expect(response.status(), `${endpoint} returned ${response.status()}`).toBe(200);
    }
  });
});
