type FetchHeaders = Record<string, string>;

const readList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results;
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
};

async function fetchJsonOrNull(base: string, path: string, headers: FetchHeaders): Promise<unknown | null> {
  const response = await fetch(`${base}${path}`, {
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

async function fetchFirstJson(base: string, paths: string[], headers: FetchHeaders): Promise<unknown | null> {
  for (const path of paths) {
    const payload = await fetchJsonOrNull(base, path, headers);
    if (payload != null) return payload;
  }
  return null;
}

async function fetchFirstList(base: string, paths: string[], headers: FetchHeaders): Promise<unknown[]> {
  for (const path of paths) {
    const payload = await fetchJsonOrNull(base, path, headers);
    const list = readList(payload);
    if (list.length > 0) return list;
  }
  return [];
}

export async function buildLegacyCellFormOptions(base: string, gridId: string, headers: FetchHeaders) {
  const encodedGridId = encodeURIComponent(gridId);
  const grid = await fetchFirstJson(base, [`/api/grids/${encodedGridId}/`], headers);
  const participants = await fetchFirstList(
    base,
    [`/api/participants/?grid=${encodedGridId}`, `/api/participants/?grid_id=${encodedGridId}`],
    headers,
  );
  const units = await fetchFirstList(
    base,
    [`/api/units/?grid=${encodedGridId}`, `/api/units/?grid_id=${encodedGridId}`],
    headers,
  );
  const bundles = await fetchFirstList(
    base,
    [`/api/bundles/?grid=${encodedGridId}`, `/api/bundles/?grid_id=${encodedGridId}`],
    headers,
  );
  const timeRanges = await fetchFirstList(
    base,
    [
      `/api/time-ranges/?grid=${encodedGridId}`,
      `/api/time-ranges/?grid_id=${encodedGridId}`,
      `/api/time_ranges/?grid=${encodedGridId}`,
      `/api/time_ranges/?grid_id=${encodedGridId}`,
    ],
    headers,
  );
  const staffs = await fetchFirstList(
    base,
    [`/api/staffs/?grid=${encodedGridId}`, `/api/staffs/?grid_id=${encodedGridId}`],
    headers,
  );

  const gridRecord = grid && typeof grid === "object" ? (grid as Record<string, unknown>) : {};
  const participantTiersEnabled =
    gridRecord.participant_tiers_enabled === true ||
    gridRecord.tier_enabled === true ||
    gridRecord.tiers_enabled === true ||
    gridRecord.tier_enable === true;

  return {
    grid,
    participants,
    units,
    bundles,
    time_ranges: timeRanges,
    staffs,
    staff_groups: staffs,
    feature_flags: {
      participant_tiers_enabled: participantTiersEnabled,
      allow_overstaffing: gridRecord.allow_overstaffing,
    },
    participant_tiers_enabled: participantTiersEnabled,
  };
}

export async function buildLegacyCellFormBootstrap(
  base: string,
  cellId: string,
  headers: FetchHeaders,
) {
  const encodedCellId = encodeURIComponent(cellId);
  const cell = await fetchFirstJson(base, [`/api/cells/${encodedCellId}/`], headers);
  const cellRecord = cell && typeof cell === "object" ? (cell as Record<string, unknown>) : {};
  const gridValue = cellRecord.grid;
  const gridId =
    typeof gridValue === "string" || typeof gridValue === "number"
      ? String(gridValue)
      : gridValue && typeof gridValue === "object" && (gridValue as Record<string, unknown>).id != null
      ? String((gridValue as Record<string, unknown>).id)
      : "";

  const options = gridId ? await buildLegacyCellFormOptions(base, gridId, headers) : {};
  return {
    ...options,
    cell,
  };
}
