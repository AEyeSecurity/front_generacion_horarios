export type GridConfigResponse = {
  allowed_cell_sizes_min?: unknown;
  allowed_cell_size_minutes?: unknown;
  allowed_cell_sizes?: unknown;
  allowed_cell_size_min?: unknown;
};

export function normalizeAllowedCellSizesFromConfig(source: unknown): number[] {
  if (!source || typeof source !== "object") return [];
  const raw = source as GridConfigResponse;
  const candidates = [
    raw.allowed_cell_sizes_min,
    raw.allowed_cell_size_minutes,
    raw.allowed_cell_sizes,
    raw.allowed_cell_size_min,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const normalized = candidate
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (normalized.length > 0) {
      return Array.from(new Set(normalized));
    }
  }

  return [];
}

export async function fetchGridConfig(): Promise<GridConfigResponse> {
  const response = await fetch("/api/grids/config/", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load grid configuration (${response.status}).`);
  }
  return (await response.json().catch(() => ({}))) as GridConfigResponse;
}
