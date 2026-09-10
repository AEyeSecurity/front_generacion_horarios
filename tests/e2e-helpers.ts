import { expect, type APIResponse, type Page } from "@playwright/test";

export type CreatedGrid = {
  id: number;
  code: string;
  name: string;
};

export type TestResources = {
  grid?: CreatedGrid;
  participants: Array<number | string>;
  cells: Array<number | string>;
  timeRanges: Array<number | string>;
  categories: Array<number | string>;
  categoryValues: Array<number | string>;
};

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export const TEST_EMAIL =
  process.env.E2E_EMAIL ??
  process.env.PLAYWRIGHT_EMAIL ??
  "pedrodiazromagnoli@gmail.com";
export const TEST_PASSWORD =
  process.env.E2E_PASSWORD ??
  process.env.PLAYWRIGHT_PASSWORD ??
  "littledrops";

export function newResourceTracker(): TestResources {
  return {
    participants: [],
    cells: [],
    timeRanges: [],
    categories: [],
    categoryValues: [],
  };
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureAuthenticated(page: Page) {
  await page.goto("/dashboard");

  const emailInput = page.locator('input[type="email"]');
  const needsLogin =
    /\/login(?:\?|$)/.test(page.url()) ||
    (await emailInput.isVisible({ timeout: 1500 }).catch(() => false));

  if (!needsLogin) {
    await expect(page).toHaveURL(/\/dashboard/);
    return;
  }

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      "Authentication state is missing or expired. Run tests/auth.spec.ts first or set E2E_EMAIL and E2E_PASSWORD.",
    );
  }

  await emailInput.fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page
    .getByRole("button", {
      name: /^(Login|Log in|Iniciar sesi[oó]n|Ingresar)$/i,
    })
    .click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

export async function requestJson<T = unknown>(
  page: Page,
  method: HttpMethod,
  url: string,
  data?: unknown,
  options: { timeout?: number; okStatuses?: number[] } = {},
): Promise<T> {
  const response = await page.request.fetch(url, {
    method,
    data,
    timeout: options.timeout,
  });
  const text = await response.text().catch(() => "");
  const okStatuses = options.okStatuses ?? [];

  if (!response.ok() && !okStatuses.includes(response.status())) {
    throw new Error(
      `${method} ${url} failed (${response.status()}): ${text.slice(0, 1000)}`,
    );
  }

  if (!text.trim()) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `${method} ${url} returned non-JSON (${response.status()}): ${text.slice(0, 500)}`,
    );
  }
}

export async function requestOk(
  page: Page,
  method: HttpMethod,
  url: string,
  data?: unknown,
  options: { timeout?: number; okStatuses?: number[] } = {},
): Promise<APIResponse> {
  const response = await page.request.fetch(url, {
    method,
    data,
    timeout: options.timeout,
  });
  const okStatuses = options.okStatuses ?? [];
  if (!response.ok() && !okStatuses.includes(response.status())) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `${method} ${url} failed (${response.status()}): ${text.slice(0, 1000)}`,
    );
  }
  return response;
}

function unwrapEntity<T extends Record<string, unknown>>(
  raw: unknown,
  label: string,
): T {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (record.id != null) return record as T;
    for (const key of ["grid", "cell", "category", "participant", "time_range", "data", "result"]) {
      const nested = record[key];
      if (nested && typeof nested === "object" && (nested as Record<string, unknown>).id != null) {
        return nested as T;
      }
    }
  }
  throw new Error(`Could not read created ${label} from API response.`);
}

function readId(entity: Record<string, unknown>, label: string): number | string {
  const id = entity.id;
  if (typeof id === "number" || typeof id === "string") return id;
  throw new Error(`Missing ${label} id in API response.`);
}

export async function resolveGridByCode(page: Page, code: string): Promise<CreatedGrid> {
  const raw = await requestJson<Record<string, unknown>>(
    page,
    "GET",
    `/api/grids/code/${encodeURIComponent(code)}/`,
  );
  const grid = unwrapEntity(raw, "grid");
  return {
    id: Number(readId(grid, "grid")),
    code: String(grid.grid_code ?? grid.code ?? readId(grid, "grid")),
    name: String(grid.name ?? code),
  };
}

export async function createTestGrid(
  page: Page,
  resources: TestResources,
  name = uniqueName("E2E Grid"),
): Promise<CreatedGrid> {
  const raw = await requestJson<Record<string, unknown>>(page, "POST", "/api/grids/", {
    name,
    day_start: "08:00",
    day_end: "12:00",
    days_enabled: [0],
    cell_size_min: 60,
    organization_type: "work",
    unit_nature: "none",
    other_context_description: null,
    time_window_mode: "SOFT",
  });
  const grid = unwrapEntity(raw, "grid");
  const created = {
    id: Number(readId(grid, "grid")),
    code: String(grid.grid_code ?? grid.code ?? readId(grid, "grid")),
    name: String(grid.name ?? name),
  };
  resources.grid = created;
  return created;
}

export async function createParticipant(
  page: Page,
  resources: TestResources,
  gridId: number | string,
  name = uniqueName("E2E Participant"),
  surname = "Playwright",
) {
  const raw = await requestJson<Record<string, unknown>>(page, "POST", "/api/participants/", {
    grid: gridId,
    name,
    surname,
  });
  const participant = unwrapEntity(raw, "participant");
  resources.participants.push(readId(participant, "participant"));
  return participant;
}

export async function createTimeRange(
  page: Page,
  resources: TestResources,
  gridId: number | string,
  name = uniqueName("E2E Time Range"),
) {
  const raw = await requestJson<Record<string, unknown>>(page, "POST", "/api/time_ranges", {
    grid: gridId,
    name,
    start_time: "08:00",
    end_time: "12:00",
  });
  const timeRange = unwrapEntity(raw, "time range");
  resources.timeRanges.push(readId(timeRange, "time range"));
  return timeRange;
}

export async function createCategory(
  page: Page,
  resources: TestResources,
  gridId: number | string,
  name = uniqueName("E2E Category"),
) {
  const raw = await requestJson<Record<string, unknown>>(page, "POST", "/api/categories/", {
    grid: gridId,
    name,
    parent: null,
  });
  const category = unwrapEntity(raw, "category");
  resources.categories.push(readId(category, "category"));
  return category;
}

export async function createCategoryValue(
  page: Page,
  resources: TestResources,
  categoryId: number | string,
  name = uniqueName("E2E Value"),
) {
  const raw = await requestJson<Record<string, unknown>>(page, "POST", "/api/category_values", {
    category: categoryId,
    name,
  });
  const value = unwrapEntity(raw, "category value");
  resources.categoryValues.push(readId(value, "category value"));
  return value;
}

export async function createMinimalCell(
  page: Page,
  resources: TestResources,
  input: {
    gridId: number | string;
    participantId: number | string;
    timeRangeId?: number | string | null;
    name?: string;
  },
) {
  const durationMinutes = 60;
  const raw = await requestJson<Record<string, unknown>>(page, "POST", "/api/cells", {
    grid: input.gridId,
    name: input.name ?? uniqueName("E2E Cell"),
    description: "Created by Playwright",
    duration_minutes: durationMinutes,
    duration_min: durationMinutes,
    quantity: 1,
    split_parts_min: [durationMinutes],
    split_order_flexible: false,
    division_days: 1,
    div_days: 1,
    division_days_config: {
      count: 1,
      parts_min: [durationMinutes],
      order_flexible: false,
    },
    time_range: input.timeRangeId ? Number(input.timeRangeId) : null,
    time_range_config: input.timeRangeId ? { id: Number(input.timeRangeId) } : null,
    colorHex: "#f97316",
    color_hex: "#f97316",
    headcount: 1,
    eligible_participants: [Number(input.participantId)],
    allow_overstaffing: null,
    unit_mode_override: false,
    bundle_mode: "AND",
  });
  const cell = unwrapEntity(raw, "cell");
  resources.cells.push(readId(cell, "cell"));
  return cell;
}

export async function cleanupResources(page: Page, resources: TestResources) {
  for (const id of [...resources.cells].reverse()) {
    await softDelete(page, `/api/cells/${encodeURIComponent(String(id))}`);
  }
  for (const id of [...resources.categoryValues].reverse()) {
    await softDelete(page, `/api/category_values/${encodeURIComponent(String(id))}`);
  }
  for (const id of [...resources.categories].reverse()) {
    await softDelete(page, `/api/categories/${encodeURIComponent(String(id))}`);
  }
  for (const id of [...resources.timeRanges].reverse()) {
    await softDelete(page, `/api/time_ranges/${encodeURIComponent(String(id))}`);
  }
  for (const id of [...resources.participants].reverse()) {
    await softDelete(page, `/api/participants/${encodeURIComponent(String(id))}`);
  }
  if (resources.grid) {
    await softDelete(page, `/api/grids/${encodeURIComponent(String(resources.grid.id))}/`);
  }
}

async function softDelete(page: Page, url: string) {
  const response = await page.request.fetch(url, { method: "DELETE" }).catch(() => null);
  if (!response) return;
  if (response.ok() || [204, 404, 410].includes(response.status())) return;
  const text = await response.text().catch(() => "");
  console.warn(`Cleanup DELETE ${url} failed (${response.status()}): ${text.slice(0, 500)}`);
}
