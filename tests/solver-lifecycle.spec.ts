import { expect, test } from "@playwright/test";
import { cleanupResources, createMinimalCell, createParticipant, createTestGrid, createTimeRange,
  ensureAuthenticated, newResourceTracker, requestJson } from "./e2e-helpers";

// The isolated backend provisions the second user; this test grants Grid membership.
test.skip(!process.env.E2E_SOLVER_REVIEWER_PASSWORD, "Requires disposable two-user backend");
test.setTimeout(180_000);

test("pending candidates survive interruptions, resolve across users, and expire on input edits", async ({ page, browser }) => {
  const resources = newResourceTracker();
  await ensureAuthenticated(page);
  const reviewer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await reviewer.newPage();
  let current = page;
  try {
    const login = await other.request.post("/api/auth/login", { data: {
      email: "solver-reviewer@example.invalid", password: process.env.E2E_SOLVER_REVIEWER_PASSWORD,
    } });
    expect(login.ok()).toBeTruthy();
    const grid = await createTestGrid(page, resources);
    const participant = await createParticipant(page, resources, grid.id);
    const range = await createTimeRange(page, resources, grid.id);
    await createMinimalCell(page, resources, { gridId: grid.id, participantId: String(participant.id), timeRangeId: String(range.id) });
    const invitation = await requestJson<{ token: string }>(page, "POST", "/api/invitations", {
      grid: grid.id, type: "email", email: "solver-reviewer@example.invalid", role: "supervisor",
    });
    await requestJson(other, "POST", "/api/invitations/accept", { token: invitation.token });
    const url = `/api/grids/${grid.id}/solve-candidates`;
    const status = () => requestJson<{ state: string; run_id: number; rejection_reason: string }>(other, "GET", url);
    const solve = () => requestJson<{ run_id: number; selectable_candidate_indexes: number[] }>(other, "POST", url, { solver_params: {} }, { timeout: 120_000 });
    await page.goto(`/grid/${grid.code}`);
    const dock = page.getByTestId("solve-dock-button");
    await expect(dock).toBeEnabled();
    const initialBox = await dock.boundingBox();

    // Keep the real POST in flight long enough to inspect the loading UI, then lose
    // only its response after Django has persisted the result.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/grids/${grid.id}/solve-candidates*`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await gate;
      await route.fetch();
      await route.abort("failed");
    });
    await dock.click();
    await expect(page.getByTestId("solver-progress")).toBeVisible();
    const loadingBox = await dock.boundingBox();
    expect(loadingBox?.x).toBe(initialBox?.x);
    await expect(dock.locator(".." )).not.toContainText(/Solving\.\.\.|Resolviendo\.\.\./);
    release();
    await expect.poll(async () => (await status()).state, { timeout: 60_000 }).toBe("ready");
    await page.close();
    current = await page.context().newPage();
    await current.goto(`/grid/${grid.code}`);
    await expect(current.getByTestId("solve-pending-badge")).toBeVisible();
    await current.getByTestId("solve-dock-button").click();
    await expect(current.getByRole("button", { name: /Close and reject|Cerrar y rechazar/i })).toHaveCount(0);
    await expect(current.getByTitle(/Reject all candidates|Rechazar todas las candidaturas/i)).toBeVisible();

    await other.goto(`/grid/${grid.code}`);
    await expect(other.getByTestId("solve-pending-badge")).toBeVisible();
    await other.getByTestId("solve-dock-button").click();
    other.once("dialog", (dialog) => dialog.accept());
    await other.getByTitle(/Reject all candidates|Rechazar todas las candidaturas/i).click();
    await expect.poll(async () => (await status()).state).toBe("rejected");
    await expect(current.getByTestId("solve-pending-badge")).toHaveCount(0);
    await expect(current.getByTestId("solve-dock-button")).toBeEnabled();
    await expect(other.getByText(/Candidates rejected\. Adjust|Candidatos rechazados\./)).toHaveCount(0);

    const next = await solve();
    await expect(current.getByTestId("solve-pending-badge")).toBeVisible();
    await current.getByTestId("solve-dock-button").click();
    await current.getByTitle(/Choose this candidate|Elegir este candidato/i).click();
    await expect.poll(async () => (await status()).state).toBe("chosen");
    await expect(current.getByTestId("solve-dock-button")).toBeEnabled();
    expect(next.run_id).toBeTruthy();
    const pending = await solve();
    await expect(current.getByTestId("solve-pending-badge")).toBeVisible();
    await requestJson(other, "PATCH", `/api/grids/${grid.id}`, { day_end: "13:00:00" });
    await expect.poll(async () => (await status()).rejection_reason).toBe("input_changed");
    await expect(current.getByTestId("solve-pending-badge")).toHaveCount(0);
    await expect(current.getByTestId("solve-dock-button")).toBeEnabled();
    const stale = await other.request.post(`${url}/${pending.run_id}/choose`, { data: { candidate_index: 0 } });
    expect(stale.status()).toBe(400);
  } finally {
    await cleanupResources(current.isClosed() ? other : current, resources);
    await reviewer.close();
  }
});
