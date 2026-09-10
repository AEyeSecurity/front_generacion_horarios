import { expect, test } from "@playwright/test";
import {
  cleanupResources,
  createCategory,
  createCategoryValue,
  createMinimalCell,
  createParticipant,
  createTestGrid,
  createTimeRange,
  ensureAuthenticated,
  newResourceTracker,
  uniqueName,
} from "./e2e-helpers";

test.skip(({ browserName }) => browserName !== "chromium", "Destructive deployed-backend E2E runs in Chromium only.");
test.setTimeout(120_000);

test("creates grid entities and renders them in their grid pages", async ({ page }) => {
  const resources = newResourceTracker();

  await ensureAuthenticated(page);

  try {
    const grid = await createTestGrid(page, resources, uniqueName("E2E Entity Grid"));
    const participantName = uniqueName("E2E Ada");
    const participantSurname = "Lovelace";
    const categoryName = uniqueName("E2E Category");
    const categoryValueName = uniqueName("E2E Category Value");
    const timeRangeName = uniqueName("E2E Morning");
    const cellName = uniqueName("E2E Cell");

    const participant = await createParticipant(
      page,
      resources,
      grid.id,
      participantName,
      participantSurname,
    );
    const timeRange = await createTimeRange(page, resources, grid.id, timeRangeName);
    const category = await createCategory(page, resources, grid.id, categoryName);
    await createCategoryValue(page, resources, category.id as number | string, categoryValueName);
    const cell = await createMinimalCell(page, resources, {
      gridId: grid.id,
      participantId: participant.id as number | string,
      timeRangeId: timeRange.id as number | string,
      name: cellName,
    });

    const directCellResponse = await page.request.get(
      `/api/cells/${cell.id}/`,
    );

    expect(directCellResponse.ok()).toBe(true);

    const cellsResponse = await page.request.get(
      `/api/cells?grid=${grid.id}`,
    );

    const cellsText = await cellsResponse.text();

    console.log("GRID:", grid);
    console.log("CREATED CELL:", cell);
    console.log("CELLS STATUS:", cellsResponse.status());
    console.log("CELLS BODY:", cellsText.slice(0, 5000));

    expect(
      cellsResponse.ok(),
      `GET /api/cells?grid=${grid.id} failed (${cellsResponse.status()}): ${cellsText.slice(0, 2000)}`,
    ).toBe(true);


    await page.goto(
      `/grid/${encodeURIComponent(grid.code)}/participants`,
      { waitUntil: "domcontentloaded" },
    );

    await expect(
      page.getByText(
        new RegExp(participantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ),
    ).toBeVisible();

    await page.goto(`/grid/${encodeURIComponent(grid.code)}/categories`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(categoryName)).toBeVisible();

    await page.goto(`/grid/${encodeURIComponent(grid.code)}/cells`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.getByText(cellName)).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByText(participantName)).toBeVisible();
  } finally {
    await cleanupResources(page, resources);
  }
});
