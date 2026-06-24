export type ApiEntityId = string | number;

function requireApiId(value: ApiEntityId, label: string): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Missing ${label}.`);
  }
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    throw new Error(`Missing ${label}.`);
  }
  return encodeURIComponent(normalized);
}

// These paths are relative to either the Django origin (server fetches) or the
// matching Next.js proxy route (browser fetches). No API base is prepended here.
export function gridCellCardsPath(gridId: ApiEntityId): string {
  return `/api/grids/${requireApiId(gridId, "grid id")}/cells/cards/`;
}

export function gridCellFormOptionsPath(gridId: ApiEntityId): string {
  return `/api/grids/${requireApiId(gridId, "grid id")}/cells/form-options/`;
}

export function cellFormBootstrapPath(cellId: ApiEntityId): string {
  return `/api/cells/${requireApiId(cellId, "cell id")}/form-bootstrap/`;
}
