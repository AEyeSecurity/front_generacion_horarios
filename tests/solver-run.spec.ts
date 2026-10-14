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

type SolverCandidate = {
  index?: number;
  candidate_index?: number;
};

type SolverCandidatesResponse = {
  run_id?: string | number;
  candidates?: SolverCandidate[];
  selectable_candidate_indexes?: number[];
  none_option?: {
    reason_options?: Array<string | { code?: string }>;
  };
};

function selectableCandidateIndex(solve: SolverCandidatesResponse): number {
  const explicitIndex = solve.selectable_candidate_indexes?.find((value) => Number.isFinite(Number(value)));
  if (explicitIndex != null) return Number(explicitIndex);

  const candidateIndex = solve.candidates
    ?.map((candidate, index) => Number(candidate.index ?? candidate.candidate_index ?? index))
    .find(Number.isFinite);
  if (candidateIndex != null) return candidateIndex;

  throw new Error("Solver response did not contain a selectable candidate index.");
}

function rejectionReason(solve: SolverCandidatesResponse): string {
  const option = solve.none_option?.reason_options?.[0];
  const reason = typeof option === "string" ? option : option?.code;
  if (!reason) throw new Error("Solver response did not contain a candidate rejection reason.");
  return reason;
}

test("chooses a solver candidate and exposes the chosen draft", async ({ page }) => {
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

    const solve = await requestJson<SolverCandidatesResponse>(
      page,
      "POST",
      `/api/grids/${grid.id}/solve-candidates/`,
      {
        solver_params: {},
        candidate_min_diff_ratio: 0.1,
      },
      { timeout: 120_000 },
    );

    expect(Array.isArray(solve.candidates)).toBe(true);
    expect(solve.candidates?.length).toBeGreaterThan(0);
    expect(solve.run_id).toBeTruthy();

    const candidateIndex = selectableCandidateIndex(solve);
    const chosen = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/${grid.id}/solve-candidates/${encodeURIComponent(String(solve.run_id))}/choose/`,
      { candidate_index: candidateIndex },
      { timeout: 60_000 },
    );
    const chosenSchedule =
      chosen.schedule && typeof chosen.schedule === "object"
        ? (chosen.schedule as Record<string, unknown>)
        : await requestJson<Record<string, unknown>>(page, "GET", `/api/grids/${grid.id}/schedule/`);

    expect(Number(chosenSchedule.source_candidate_index)).toBe(candidateIndex);
    expect(chosenSchedule.placements).toBeTruthy();
  } finally {
    await cleanupResources(page, resources);
  }
});

test("rejects a solver candidate run through the grid-code route", async ({ page }) => {
  const resources = newResourceTracker();

  await ensureAuthenticated(page);

  try {
    const grid = await createTestGrid(page, resources, uniqueName("E2E Solver Reject Grid"));
    const participant = await createParticipant(page, resources, grid.id, uniqueName("E2E Solver"), "Participant");
    const timeRange = await createTimeRange(page, resources, grid.id, uniqueName("E2E Solver Range"));
    await createMinimalCell(page, resources, {
      gridId: grid.id,
      participantId: participant.id as number | string,
      timeRangeId: timeRange.id as number | string,
      name: uniqueName("E2E Solver Cell"),
    });

    const solve = await requestJson<SolverCandidatesResponse>(
      page,
      "POST",
      `/api/grids/code/${encodeURIComponent(grid.code)}/solve-candidates/`,
      { solver_params: {}, candidate_min_diff_ratio: 0.1 },
      { timeout: 120_000 },
    );

    expect(solve.run_id).toBeTruthy();
    const rejected = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/code/${encodeURIComponent(grid.code)}/solve-candidates/${encodeURIComponent(String(solve.run_id))}/reject/`,
      { reason_code: rejectionReason(solve), note: "Playwright regression test" },
      { timeout: 60_000 },
    );

    expect(rejected).toBeTruthy();
  } finally {
    await cleanupResources(page, resources);
  }
});
