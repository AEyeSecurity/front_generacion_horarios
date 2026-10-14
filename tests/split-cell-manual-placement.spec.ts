import { expect, test, type Page } from "@playwright/test";
import { classifySplitCellPlacements } from "../lib/split-placement-state";
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

type Placement = {
  id?: number | string;
  placement_id?: number | string;
  source_cell_id?: number | string;
  source_cell?: number | string;
  day_index?: number;
  start_slot?: number;
  end_slot?: number;
  assigned_participants?: Array<number | string>;
};

function entityId(value: Record<string, unknown>, label: string): number | string {
  const id = value.id ?? value.placement_id;
  if (typeof id === "number" || typeof id === "string") return id;
  throw new Error(`Missing ${label} id.`);
}

function placementFromResponse(value: Record<string, unknown>): Placement {
  const placement = value.placement;
  if (placement && typeof placement === "object") return placement as Placement;
  return value as Placement;
}

async function readDraftPlacements(page: Page, gridId: number): Promise<Placement[]> {
  const raw = await requestJson<Record<string, unknown>>(page, "GET", `/api/grids/${gridId}/schedule/`);
  const schedule = raw.schedule && typeof raw.schedule === "object"
    ? (raw.schedule as Record<string, unknown>)
    : raw;
  return Array.isArray(schedule.placements) ? (schedule.placements as Placement[]) : [];
}

function durationSlots(placements: Placement[]): number[] {
  return placements.map((placement) => Number(placement.end_slot) - Number(placement.start_slot));
}

async function previewSegment(
  page: Page,
  gridId: number,
  cellId: number | string,
  scheduleId: number | string,
  dayIndex: number,
  startSlot: number,
) {
  const preview = await requestJson<Record<string, unknown>>(
    page,
    "POST",
    `/api/grids/${gridId}/cells/${cellId}/placement-preview/`,
    {
      mode: "PLACE_UNASSIGNED_CELL",
      schedule_id: scheduleId,
      duration_slots: 1,
      split_segment: true,
      candidate_placements: [{ day_index: dayIndex, start_slot: startSlot }],
    },
  );
  const slots = Array.isArray(preview.slot_map) ? preview.slot_map as Array<Record<string, unknown>> : [];
  expect(Number(preview.duration_slots)).toBe(1);
  expect(slots.some((slot) => slot.status === "VALID" || slot.status === "WARNING")).toBe(true);
}

test("places and moves both segments of a split Cell independently", async ({ page }) => {
  const resources = newResourceTracker();
  await ensureAuthenticated(page);

  try {
    const grid = await createTestGrid(page, resources, uniqueName("E2E Split Placement Grid"));
    await requestJson(page, "PATCH", `/api/grids/${grid.id}/`, { days_enabled: [0, 1] });
    const participant = await createParticipant(page, resources, grid.id, uniqueName("E2E Split"), "Participant");
    const participantId = entityId(participant, "participant");
    const timeRange = await createTimeRange(page, resources, grid.id, uniqueName("E2E Split Range"));
    const cell = await createMinimalCell(page, resources, {
      gridId: grid.id,
      participantId,
      timeRangeId: entityId(timeRange, "time range"),
      name: uniqueName("E2E Split Cell"),
      durationMinutes: 120,
      splitPartsMin: [60, 60],
    });
    const cellId = entityId(cell, "cell");
    const scheduleResponse = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/${grid.id}/schedule/`,
      {},
    );
    const scheduleRecord = scheduleResponse.schedule && typeof scheduleResponse.schedule === "object"
      ? (scheduleResponse.schedule as Record<string, unknown>)
      : scheduleResponse;
    const scheduleId = entityId(scheduleRecord, "schedule");

    expect(classifySplitCellPlacements([1, 1], []).state).toBe("UNPLACED");
    await previewSegment(page, grid.id, cellId, scheduleId, 0, 0);
    const firstResponse = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/${grid.id}/cells/${cellId}/place/`,
      {
        mode: "PLACE_UNASSIGNED_CELL",
        schedule_id: scheduleId,
        duration_slots: 1,
        split_segment: true,
        day_index: 0,
        start_slot: 0,
        selected_participant_ids: [Number(participantId)],
      },
    );
    const firstPlacement = placementFromResponse(firstResponse);

    let placements = (await readDraftPlacements(page, grid.id)).filter(
      (placement) => String(placement.source_cell_id ?? placement.source_cell) === String(cellId),
    );
    expect(placements).toHaveLength(1);
    expect(classifySplitCellPlacements([1, 1], durationSlots(placements))).toEqual({
      state: "PARTIALLY_PLACED",
      remainingSegmentSlots: [1],
    });

    await previewSegment(page, grid.id, cellId, scheduleId, 1, 0);
    const secondResponse = await requestJson<Record<string, unknown>>(
      page,
      "POST",
      `/api/grids/${grid.id}/cells/${cellId}/place/`,
      {
        mode: "PLACE_UNASSIGNED_CELL",
        schedule_id: scheduleId,
        duration_slots: 1,
        split_segment: true,
        day_index: 1,
        start_slot: 0,
        selected_participant_ids: [Number(participantId)],
      },
    );
    const secondPlacement = placementFromResponse(secondResponse);

    placements = (await readDraftPlacements(page, grid.id)).filter(
      (placement) => String(placement.source_cell_id ?? placement.source_cell) === String(cellId),
    );
    expect(placements).toHaveLength(2);
    expect(new Set(placements.map((placement) => String(placement.id ?? placement.placement_id))).size).toBe(2);
    expect(placements.every((placement) => placement.assigned_participants?.map(String).includes(String(participantId)))).toBe(true);
    expect(classifySplitCellPlacements([1, 1], durationSlots(placements)).state).toBe("FULLY_PLACED");

    for (const [placement, dayIndex] of [[firstPlacement, 0], [secondPlacement, 1]] as const) {
      const placementId = placement.id ?? placement.placement_id;
      expect(placementId).toBeTruthy();
      const moved = placementFromResponse(await requestJson<Record<string, unknown>>(
        page,
        "POST",
        `/api/grids/${grid.id}/cells/${cellId}/place/`,
        {
          mode: "MOVE_ASSIGNED_CELL",
          schedule_id: scheduleId,
          placement_id: placementId,
          day_index: dayIndex,
          start_slot: 1,
        },
      ));
      expect(String(moved.id ?? moved.placement_id)).toBe(String(placementId));
      expect(moved.start_slot).toBe(1);
    }
  } finally {
    await cleanupResources(page, resources);
  }
});
