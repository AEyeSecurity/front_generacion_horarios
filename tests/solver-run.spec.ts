import { expect, test } from "@playwright/test";
import {
  cleanupResources,
  createMinimalCell,
  createParticipant,
  createTestGrid,
  createTimeRange,
  ensureAuthenticated,
  newResourceTracker,
  requestJson,
  uniqueName,
} from "./e2e-helpers";

test.skip(({ browserName }) => browserName !== "chromium", "Destructive deployed-backend E2E runs in Chromium only.");
test.setTimeout(180_000);

test("runs the solver candidate flow on a disposable grid", async ({ page }) => {
  const resources = newResourceTracker();

  await ensureAuthenticated(page);

  try {
    const grid = await createTestGrid(page, resources, uniqueName("E2E Solver Grid"));
    const participant = await createParticipant(page, resources, grid.id, uniqueName("E2E Solver"), "Participant");
    const timeRange = await createTimeRange(page, resources, grid.id, uniqueName("E2E Solver Range"));
    await createMinimalCell(page, resources, {
      gridId: grid.id,
      participantId: participant.id as number | string,
      timeRangeId: timeRange.id as number | string,
      name: uniqueName("E2E Solver Cell"),
    });

    const precheck = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/${grid.id}/precheck/`,
      {},
      { timeout: 60_000 },
    );

    expect(precheck).toBeTruthy();

    const solve = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/${grid.id}/solve-candidates/`,
      {
        solver_params: {},
        candidate_min_diff_ratio: 0.1,
      },
      { timeout: 120_000 },
    );

    expect(solve).toBeTruthy();
    expect(Array.isArray(solve.candidates)).toBe(true);
    expect((solve.candidates as unknown[]).length).toBeGreaterThan(0);
    expect(solve.run_id ?? solve.preference ?? solve.precheck).toBeTruthy();
  } finally {
    await cleanupResources(page, resources);
  }
});
