import { ApiError } from "@/lib/api-errors";
import type { ScheduleViewMode } from "@/lib/schedule-view";
import { authFetch } from "@/lib/client-auth";
import type { DraftPlacementCacheChange } from "@/lib/draft-mutation";

type ScreenContextData = Record<string, unknown>;

export type GridResourceName =
  | "grid"
  | "units"
  | "cells"
  | "participants"
  | "categories"
  | "category_values"
  | "time_ranges"
  | "bundles";

type CacheEntry = {
  data: ScreenContextData;
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
};

export const SCREEN_CONTEXT_CACHE_TTL_MS = 8000;

const contextCache = new Map<string, CacheEntry>();
const inflightContextFetches = new Map<string, Promise<ScreenContextData>>();
const contextVersions = new Map<string, number>();
const gridResourceCache = new Map<string, unknown>();
const inflightGridResourceFetches = new Map<string, Promise<unknown>>();
const gridResourceVersions = new Map<string, number>();

const cacheKeyFor = (gridId: number | string, view: ScheduleViewMode) => `${String(gridId)}::${view}`;
const resourceCacheKeyFor = (gridId: number | string, resource: GridResourceName) =>
  `${String(gridId)}::${resource}`;

const SCREEN_CONTEXT_RESOURCE_KEYS: Record<GridResourceName, string[]> = {
  grid: ["grid"],
  units: ["units"],
  cells: ["cells"],
  participants: ["participants"],
  categories: ["categories"],
  category_values: ["category_values", "categoryValues"],
  time_ranges: ["time_ranges", "timeRanges"],
  bundles: ["bundles"],
};

export type FetchGridScreenContextOptions = {
  force?: boolean;
  signal?: AbortSignal;
};

export const getContextList = <T = unknown>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === "object" &&
    "results" in value &&
    Array.isArray((value as { results?: unknown }).results)
  ) {
    return (value as { results: T[] }).results;
  }
  return [];
};

function readContextResource(data: ScreenContextData, resource: GridResourceName): unknown {
  for (const key of SCREEN_CONTEXT_RESOURCE_KEYS[resource]) {
    const value = data[key];
    if (resource === "grid") {
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
      continue;
    }
    const list = getContextList(value);
    const isCollection =
      Array.isArray(value) ||
      Boolean(
        value &&
          typeof value === "object" &&
          "results" in value &&
          Array.isArray((value as { results?: unknown }).results),
      );
    if (list.length > 0 || isCollection) return list;
  }
  return undefined;
}

function primeGridResourcesFromContext(gridId: number | string, data: ScreenContextData) {
  for (const resource of Object.keys(SCREEN_CONTEXT_RESOURCE_KEYS) as GridResourceName[]) {
    const value = readContextResource(data, resource);
    const key = resourceCacheKeyFor(gridId, resource);
    if (value !== undefined && !gridResourceCache.has(key)) gridResourceCache.set(key, value);
  }
}

export function getCachedGridResource<T = unknown>(
  gridId: number | string,
  resource: GridResourceName,
): T | undefined {
  return gridResourceCache.get(resourceCacheKeyFor(gridId, resource)) as T | undefined;
}

export type FetchGridResourceOptions = {
  force?: boolean;
  fallback?: () => Promise<unknown>;
  acceptCached?: (value: unknown) => boolean;
};

export async function fetchGridResource<T = unknown>(
  gridId: number | string,
  resource: GridResourceName,
  options: FetchGridResourceOptions = {},
): Promise<T> {
  const key = resourceCacheKeyFor(gridId, resource);
  if (!options.force && gridResourceCache.has(key)) {
    const cached = gridResourceCache.get(key);
    if (!options.acceptCached || options.acceptCached(cached)) return cached as T;
  }

  const inFlight = inflightGridResourceFetches.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const requestVersion = gridResourceVersions.get(key) ?? 0;
  const cacheIfCurrent = (value: unknown) => {
    if ((gridResourceVersions.get(key) ?? 0) === requestVersion) gridResourceCache.set(key, value);
  };

  const request: Promise<unknown> = (async () => {
    if (!options.force) {
      try {
        const context = await fetchGridScreenContext(gridId, "draft");
        const fromContext = readContextResource(context, resource);
        if (fromContext !== undefined && (!options.acceptCached || options.acceptCached(fromContext))) {
          cacheIfCurrent(fromContext);
          return fromContext;
        }
      } catch {
        // A focused fallback may still be available to the consumer.
      }
    }

    if (!options.fallback) {
      const emptyValue = resource === "grid" ? {} : [];
      cacheIfCurrent(emptyValue);
      return emptyValue;
    }

    const value = await options.fallback();
    cacheIfCurrent(value);
    return value;
  })().finally(() => {
    if (inflightGridResourceFetches.get(key) === request) inflightGridResourceFetches.delete(key);
  });

  inflightGridResourceFetches.set(key, request);
  return request as Promise<T>;
}

export function primeGridResource(
  gridId: number | string,
  resource: GridResourceName,
  value: unknown,
) {
  const key = resourceCacheKeyFor(gridId, resource);
  gridResourceVersions.set(key, (gridResourceVersions.get(key) ?? 0) + 1);
  gridResourceCache.set(key, value);
}

export function invalidateGridResource(gridId: number | string, resource: GridResourceName) {
  const key = resourceCacheKeyFor(gridId, resource);
  gridResourceVersions.set(key, (gridResourceVersions.get(key) ?? 0) + 1);
  gridResourceCache.delete(key);
  inflightGridResourceFetches.delete(key);
}

export async function fetchGridScreenContext(
  gridId: number | string,
  view: ScheduleViewMode,
  options: FetchGridScreenContextOptions = {},
): Promise<ScreenContextData> {
  const key = cacheKeyFor(gridId, view);
  const now = Date.now();
  const cached = contextCache.get(key);

  if (!options.force && cached && now - cached.fetchedAt < SCREEN_CONTEXT_CACHE_TTL_MS) {
    return cached.data;
  }

  const inFlight = inflightContextFetches.get(key);
  if (inFlight) return inFlight;
  const requestVersion = contextVersions.get(key) ?? 0;

  const request: Promise<ScreenContextData> = (async () => {
    const entry = contextCache.get(key);
    const headers: HeadersInit = {};
    if (!options.force) {
      if (entry?.etag) headers["if-none-match"] = entry.etag;
      if (entry?.lastModified) headers["if-modified-since"] = entry.lastModified;
    }

    const res = await authFetch(`/api/grids/${encodeURIComponent(String(gridId))}/screen-context/?view=${view}`, {
      cache: "no-store",
      headers,
      signal: options.signal,
    });

    if (res.status === 304 && entry) {
      if ((contextVersions.get(key) ?? 0) === requestVersion) {
        contextCache.set(key, { ...entry, fetchedAt: now });
      }
      return entry.data;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new ApiError(res.status, txt);
    }

    const data = (await res.json().catch(() => ({}))) as ScreenContextData;
    primeGridResourcesFromContext(gridId, data);
    if ((contextVersions.get(key) ?? 0) === requestVersion) {
      contextCache.set(key, {
        data,
        etag: res.headers.get("etag") ?? entry?.etag,
        lastModified: res.headers.get("last-modified") ?? entry?.lastModified,
        fetchedAt: Date.now(),
      });
    }
    return data;
  })().finally(() => {
    if (inflightContextFetches.get(key) === request) inflightContextFetches.delete(key);
  });

  inflightContextFetches.set(key, request);
  return request;
}

export function primeGridScreenContext(
  gridId: number | string,
  view: ScheduleViewMode,
  data: ScreenContextData,
) {
  primeGridResourcesFromContext(gridId, data);
  const key = cacheKeyFor(gridId, view);
  const existing = contextCache.get(key);
  contextVersions.set(key, (contextVersions.get(key) ?? 0) + 1);
  inflightContextFetches.delete(key);
  contextCache.set(key, {
    data,
    etag: existing?.etag,
    lastModified: existing?.lastModified,
    fetchedAt: Date.now(),
  });
}

const readPlacementId = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const placement = value as Record<string, unknown>;
  const candidate = placement.placement_id ?? placement.schedule_placement_id ?? placement.id;
  return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : null;
};

const applyPlacementChange = (placements: unknown[], change: DraftPlacementCacheChange): unknown[] => {
  if (change.kind === "delete") {
    const deletedId = String(change.placementId);
    return placements.filter((placement) => readPlacementId(placement) !== deletedId);
  }

  const confirmedId = readPlacementId(change.placement);
  const replacementId =
    change.replacementPlacementId == null ? null : String(change.replacementPlacementId);
  let replaced = false;
  const next = placements.map((placement) => {
    const placementId = readPlacementId(placement);
    if ((confirmedId != null && placementId === confirmedId) || (replacementId != null && placementId === replacementId)) {
      replaced = true;
      return change.placement;
    }
    return placement;
  });
  return replaced ? next : [...next, change.placement];
};

export function updateCachedGridSchedulePlacements(
  gridId: number | string,
  view: ScheduleViewMode,
  change: DraftPlacementCacheChange,
): boolean {
  const key = cacheKeyFor(gridId, view);
  const entry = contextCache.get(key);
  if (!entry) return false;

  let updated = false;
  const nextData: ScreenContextData = { ...entry.data };
  for (const scheduleKey of ["schedule", "latest"] as const) {
    const schedule = entry.data[scheduleKey];
    if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) continue;
    const scheduleRecord = schedule as Record<string, unknown>;
    if (!Array.isArray(scheduleRecord.placements)) continue;
    nextData[scheduleKey] = {
      ...scheduleRecord,
      placements: applyPlacementChange(scheduleRecord.placements, change),
    };
    updated = true;
  }

  if (!updated) return false;
  contextVersions.set(key, (contextVersions.get(key) ?? 0) + 1);
  inflightContextFetches.delete(key);
  contextCache.set(key, { ...entry, data: nextData });
  return true;
}

export function invalidateGridScreenContext(gridId?: number | string, view?: ScheduleViewMode) {
  if (gridId == null) {
    for (const key of contextCache.keys()) contextVersions.set(key, (contextVersions.get(key) ?? 0) + 1);
    for (const key of inflightContextFetches.keys()) contextVersions.set(key, (contextVersions.get(key) ?? 0) + 1);
    contextCache.clear();
    inflightContextFetches.clear();
    return;
  }
  if (view) {
    const key = cacheKeyFor(gridId, view);
    contextVersions.set(key, (contextVersions.get(key) ?? 0) + 1);
    contextCache.delete(key);
    inflightContextFetches.delete(key);
    return;
  }
  for (const candidateView of ["draft", "published"] as const) {
    const key = cacheKeyFor(gridId, candidateView);
    contextVersions.set(key, (contextVersions.get(key) ?? 0) + 1);
    contextCache.delete(key);
    inflightContextFetches.delete(key);
  }
}
