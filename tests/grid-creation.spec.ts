import { expect, test } from "@playwright/test";
import {
  cleanupResources,
  ensureAuthenticated,
  newResourceTracker,
  uniqueName,
} from "./e2e-helpers";

test.skip(({ browserName }) => browserName !== "chromium", "Destructive deployed-backend E2E runs in Chromium only.");
test.setTimeout(120_000);

test("creates a new grid through the UI and deletes it afterwards", async ({ page }) => {
  const resources = newResourceTracker();
  const gridName = uniqueName("E2E UI Grid");

  await ensureAuthenticated(page);

  try {
    await page.goto("/grid/new");
    await expect(
      page.getByRole("heading", { name: /Create New Grid|Crear nueva grilla/i }),
    ).toBeVisible();

    await page.locator("input").first().fill(gridName);

    const cellSizeSelect = page.locator("select").first();
    await expect(cellSizeSelect).toBeEnabled({ timeout: 10_000 });
    const availableSizes = await cellSizeSelect.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    if (availableSizes.includes("60")) {
      await cellSizeSelect.selectOption("60");
    } else if (availableSizes.length > 0) {
      await cellSizeSelect.selectOption(availableSizes[0]);
    }

    await page.getByRole("button", { name: /^(Next|Siguiente)$/i }).click();
    await page.getByText(/^(Work|Trabajo)$/i).click();
    await page.getByRole("button", { name: /^(Next|Siguiente)$/i }).click();
    await page.getByText(/People covering shifts or tasks|Personas cubriendo turnos o tareas/i).click();
    await page.getByRole("button", { name: /^(Next|Siguiente)$/i }).click();

    const createResponsePromise = page.waitForResponse(
      (response) =>
        (response.status() < 300 || response.status() >= 400) &&
        response.request().method() === "POST" &&
        /\/api\/grids\/?$/.test(new URL(response.url()).pathname),
      { timeout: 20_000 },
    );
    await page
      .getByRole("button", { name: /Create Grid|Crear grilla/i })
      .click();
    const createResponse = await createResponsePromise;
    if (!createResponse.ok()) {
      const body = await createResponse.text().catch(() => "");
      throw new Error(`Grid creation failed (${createResponse.status()}): ${body.slice(0, 1000)}`);
    }
    const rawGrid = await createResponse.json();
    const gridPayload = rawGrid?.grid ?? rawGrid?.data ?? rawGrid?.result ?? rawGrid;
    const createdGrid = {
      id: Number(gridPayload.id),
      code: String(gridPayload.grid_code ?? gridPayload.code ?? gridPayload.id),
      name: String(gridPayload.name ?? gridName),
    };
    expect(Number.isFinite(createdGrid.id)).toBe(true);
    resources.grid = createdGrid;

    expect(createdGrid.name).toBe(gridName);
    await page.waitForURL(
      (url) =>
        url.pathname === `/grid/${encodeURIComponent(createdGrid.code)}` ||
        url.pathname === `/grid/${createdGrid.code}`,
      { timeout: 20_000 },
    );

    await cleanupResources(page, resources);
    const deletedLookup = await page.request.get(`/api/grids/code/${encodeURIComponent(createdGrid.code)}/`);
    expect([404, 410]).toContain(deletedLookup.status());
    resources.grid = undefined;
  } finally {
    await cleanupResources(page, resources);
  }
});
