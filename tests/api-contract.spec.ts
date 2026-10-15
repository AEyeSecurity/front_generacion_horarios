import { expect, test } from "@playwright/test";
import {
  cleanupResources, createCategory, createMinimalCell, createParticipant,
  createTestGrid, createTimeRange, ensureAuthenticated, newResourceTracker, requestJson,
} from "./e2e-helpers";

test.skip(({ browserName }) => browserName !== "chromium", "Mutating contract checks run once in Chromium.");
test.setTimeout(180_000);

test("specialized BFF routes keep authentication mandatory", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    for (const path of ["/api/cells/123/form-bootstrap", "/api/grids/123/cells/form-options", "/api/grids/123/schedule/history"]) {
      expect((await anonymous.get(path)).status()).toBe(401);
    }
  } finally {
    await anonymous.dispose();
  }
});

test("cell bootstrap and schedule lifecycle cross the real BFF and Django contracts", async ({ page }) => {
  const resources = newResourceTracker();
  await ensureAuthenticated(page);
  try {
    const grid = await createTestGrid(page, resources, "Contract sweep grid");
    const base = `/api/grids/${grid.id}`;
    const participant = await createParticipant(page, resources, grid.id, "Contract", "Participant");
    const range = await createTimeRange(page, resources, grid.id, "Contract range");
    await createCategory(page, resources, grid.id, "Contract category");
    const cell = await createMinimalCell(page, resources, {
      gridId: grid.id, participantId: participant.id as number, timeRangeId: range.id as number, name: "Contract Cell",
    });
    const cellPath = `/api/cells/${cell.id}`;

    // These must be real endpoint responses, not legacy reconstruction on 404.
    const cards = await requestJson<Record<string, unknown>>(page, "GET", `${base}/cells/cards/`);
    expect(cards.cards ?? cards.cells).toBeTruthy();
    const options = await requestJson<Record<string, unknown>>(page, "GET", `${base}/cells/form-options/`);
    expect(options.participants).toBeTruthy();
    const bootstrap = await requestJson<{ cell: { id: number } }>(page, "GET", `${cellPath}/form-bootstrap/`);
    expect(Number(bootstrap.cell.id)).toBe(Number(cell.id));

    await page.goto(`/grid/${grid.code}/cells`);
    const bootstrapResponse = page.waitForResponse(r => new URL(r.url()).pathname.replace(/\/$/, "") === `${cellPath}/form-bootstrap` && r.request().method() === "GET" && r.status() !== 308);
    await page.getByRole("heading", { name: "Contract Cell", exact: true }).dblclick();
    expect((await bootstrapResponse).status()).toBe(200);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Failed to load data|Error al cargar los datos/i)).toHaveCount(0);
    await expect(dialog.locator('input').filter({ visible: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    const updated = await requestJson<{ name: string }>(page, "PATCH", cellPath, { name: "Contract Cell updated" });
    expect(updated.name).toBe("Contract Cell updated");

    // Missing publications are domain 404s. Missing history is not: an empty
    // grid returns an empty history even before a draft has been materialized.
    const published = await page.request.get(`${base}/published-schedule/`);
    expect(published.status()).toBe(404);
    expect((await published.json()).detail).toMatch(/No published schedule/i);
    const emptyHistory = await requestJson<{ can_undo: boolean }>(page, "GET", `${base}/schedule/history`);
    expect(emptyHistory.can_undo).toBe(false);

    const boot = await requestJson<Record<string, any>>(page, "POST", `${base}/schedule/`, {});
    const schedule = boot.schedule ?? boot;
    await requestJson(page, "GET", `${base}/screen-context/?view=draft`);
    const historyResponse = page.waitForResponse(r => new URL(r.url()).pathname.replace(/\/$/, "") === `${base}/schedule/history`);
    await page.goto(`/grid/${grid.code}`);
    expect((await historyResponse).status()).toBe(200);
    await expect(page.getByText(/Could not load draft history|No se pudo cargar el historial/i)).toHaveCount(0);

    const preview = await requestJson<Record<string, any>>(page, "POST", `${base}/cells/${cell.id}/placement-preview/`, {
      mode: "PLACE_UNASSIGNED_CELL", schedule_id: schedule.id,
      candidate_placements: [{ day_index: 0, start_slot: 0 }],
    });
    expect(Array.isArray(preview.slot_map)).toBe(true);
    const placed = await requestJson<Record<string, any>>(page, "POST", `${base}/cells/${cell.id}/place/`, {
      mode: "PLACE_UNASSIGNED_CELL", schedule_id: schedule.id, day_index: 0, start_slot: 0,
      selected_participant_ids: [participant.id],
    });
    const placement = placed.placement ?? placed;
    expect(placement.id ?? placement.placement_id).toBeTruthy();
    const placementPath = `/api/schedule-placements/${placement.id ?? placement.placement_id}`;
    const moved = await requestJson<Record<string, any>>(page, "PATCH", placementPath, { start_slot: 1, end_slot: 2 });
    expect((moved.placement ?? moved).start_slot).toBe(1);
    const history = await requestJson<{ can_undo: boolean }>(page, "GET", `${base}/schedule/history`);
    expect(history.can_undo).toBe(true);
    await requestJson(page, "POST", `${base}/schedule/history/undo`, {});
    await requestJson(page, "POST", `${base}/schedule/history/redo`, {});
    // Snapshot restoration materializes new rows; old placement IDs are stale.
    const restored = await requestJson<Record<string, any>>(page, "GET", `${base}/schedule/`);
    const restoredPlacement = (restored.schedule ?? restored).placements[0];
    expect(restoredPlacement.start_slot).toBe(1);
    const removed = await page.request.delete(`/api/schedule-placements/${restoredPlacement.id}`);
    expect(removed.status()).toBe(204);

    await page.goto(`/grid/${grid.code}/categories`);
    await expect(page.getByText("Contract category", { exact: true }).first()).toBeVisible();
    await page.goto(`/grid/${grid.code}`);
    await page.locator('[data-onboarding-target="left-dock-time-ranges"]').click();
    await expect(page.getByText("Contract range", { exact: true }).first()).toBeVisible();

    const precheck = await requestJson<{ ok: boolean }>(page, "POST", `${base}/precheck`, {});
    expect(precheck.ok).toBe(true);
    const run = await requestJson<Record<string, any>>(page, "POST", `${base}/solve-candidates`, {
      solver_params: { max_time_seconds: 3 }, candidate_min_diff_ratio: 0,
    });
    const candidate = run.candidates.find((c: { status: string }) => ["FEASIBLE", "OPTIMAL"].includes(c.status));
    expect(candidate).toBeTruthy();
    const chosen = await requestJson<Record<string, any>>(page, "POST", `${base}/solve-candidates/${run.run_id}/choose/`, { candidate_index: candidate.index });
    expect(chosen.materialized_schedule_id).toBeTruthy();
    await requestJson(page, "GET", `${base}/schedule/`);
    await requestJson(page, "GET", `/api/grids/code/${grid.code}/schedule/history/`);

    const deleted = await page.request.delete(cellPath);
    expect(deleted.status()).toBe(204);
    resources.cells = resources.cells.filter(id => String(id) !== String(cell.id));
    const missing = await page.request.get(`${cellPath}/form-bootstrap/`);
    expect(missing.status()).toBe(404);
    expect((await missing.json()).detail).toBeTruthy();
  } finally {
    await cleanupResources(page, resources);
  }
});
