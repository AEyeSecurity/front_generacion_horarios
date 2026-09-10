import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { TEST_EMAIL, TEST_PASSWORD } from "./e2e-helpers";

const AUTH_STATE_PATH = "playwright/.auth/user.json";

test.use({ storageState: { cookies: [], origins: [] } });

test("authenticates and stores browser session", async ({ page }) => {
  const loginResponse = await test.step("log in through the auth API", async () =>
    page.request.post("/api/auth/login", {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        preferred_language: "es-AR",
      },
    }),
  );

  if (!loginResponse.ok()) {
    const body = await loginResponse.text().catch(() => "");
    const detail = extractErrorDetail(body);
    throw new Error(
      `Login setup failed (${loginResponse.status()}). Check E2E_EMAIL/E2E_PASSWORD or the deployed backend. ${detail}`,
    );
  }

  await test.step("verify authenticated dashboard access", async () => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/Dashboard|Tablero|Proyectos|Projects/i, {
      timeout: 20_000,
    });
  });

  mkdirSync("playwright/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
});

function extractErrorDetail(body: string): string {
  if (!body.trim()) return "Backend returned an empty error body.";
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; error?: unknown };
    const value = parsed.detail ?? parsed.error;
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "string" && value.trim()) return value.slice(0, 1000);
  } catch {
    // Fall through to raw-body summary.
  }
  return body.slice(0, 1000);
}
