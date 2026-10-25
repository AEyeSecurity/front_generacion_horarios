import { expect, test } from "@playwright/test";
import { cleanupResources, createParticipant, createTestGrid, ensureAuthenticated, newResourceTracker, requestJson } from "./e2e-helpers";

test.setTimeout(90_000);

test("language toggle persists and a failed save keeps the previous language", async ({ page }) => {
  await ensureAuthenticated(page);
  await requestJson(page, "PATCH", "/api/whoami", { preferred_language: "en-US" });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /User menu|Menú de usuario/i }).click();
  const toggle = page.getByTitle(/Language:|Idioma:/);
  await expect(toggle).toHaveAttribute("title", "Language: EN");
  const saved = page.waitForResponse((res) => res.url().endsWith("/api/whoami") && res.request().method() === "PATCH");
  await toggle.click();
  expect((await saved).ok()).toBeTruthy();
  await expect.poll(async () => (await requestJson<{ preferred_language: string }>(page, "GET", "/api/whoami")).preferred_language).toBe("es-AR");
  await page.reload();
  await page.getByRole("button", { name: /User menu|Menú de usuario/i }).click();
  await expect(toggle).toHaveAttribute("title", "Idioma: ES");
  await page.route("**/api/whoami", (route) => route.request().method() === "PATCH" ? route.abort("failed") : route.continue());
  await toggle.click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("title", "Idioma: ES");
  expect((await requestJson<{ preferred_language: string }>(page, "GET", "/api/whoami")).preferred_language).toBe("es-AR");
});

for (const role of ["viewer", "editor"] as const) {
  test(`${role} can cancel or confirm leaving from the Top Bar`, async ({ page, browser }) => {
    test.skip(!process.env.E2E_SOLVER_REVIEWER_PASSWORD, "Requires disposable backend reviewer");
    await ensureAuthenticated(page);
    const resources = newResourceTracker();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const member = await context.newPage();
    member.setDefaultTimeout(15_000);
    let confirmLeave = false;
    const dialogs: string[] = [];
    member.on("dialog", async (dialog) => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      if (confirmLeave) await dialog.accept();
      else await dialog.dismiss();
    });
    try {
      const login = await member.request.post("/api/auth/login", { data: {
        email: "solver-reviewer@example.invalid", password: process.env.E2E_SOLVER_REVIEWER_PASSWORD,
      } });
      expect(login.ok()).toBeTruthy();
      const grid = await createTestGrid(page, resources);
      const participant = await createParticipant(page, resources, grid.id);
      const invitation = await requestJson<{ token: string }>(page, "POST", "/api/invitations", {
        grid: grid.id, type: "email", email: "solver-reviewer@example.invalid", role,
        ...(role === "editor" ? { participant_id: participant.id } : {}),
      });
      await requestJson(member, "POST", "/api/invitations/accept", { token: invitation.token });
      await member.goto(`/grid/${grid.code}`);
      const actions = member.getByRole("button", { name: /More actions|Más acciones/i });
      await actions.click();
      await member.getByRole("menuitem", { name: /Leave Grid|Abandonar grilla/i }).click();
      await expect(member.getByRole("menu")).toHaveCount(0);
      expect(dialogs).toHaveLength(1);
      expect((await member.request.get(`/api/grids/${grid.id}`)).ok()).toBeTruthy();
      await actions.click();
      confirmLeave = true;
      await member.getByRole("menuitem", { name: /Leave Grid|Abandonar grilla/i }).click();
      await expect(member).toHaveURL(/\/dashboard$/);
      expect(dialogs).toHaveLength(2);
      expect([403, 404]).toContain((await member.request.get(`/api/grids/${grid.id}`)).status());
      expect((await page.request.get(`/api/grids/${grid.id}`)).ok()).toBeTruthy();
      expect((await page.request.get(`/api/participants/${participant.id}`)).ok()).toBeTruthy();
    } finally {
      await context.close();
      await cleanupResources(page, resources);
    }
  });
}
