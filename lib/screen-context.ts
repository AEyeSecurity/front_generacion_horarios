import type { ScheduleViewMode } from "@/lib/schedule-view";
import { authFetch } from "@/lib/client-auth";

type ScreenContextData = Record<string, unknown>;

type CacheEntry = {
  data: ScreenContextData;
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
};

export const SCREEN_CONTEXT_CACHE_TTL_MS = 8000;

const contextCache = new Map<string, CacheEntry>();
const inflightContextFetches = new Map<string, Promise<ScreenContextData>>();

const cacheKeyFor = (gridId: number | string, view: ScheduleViewMode) => `${String(gridId)}::${view}`;

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

  if (!options.force) {
    const inFlight = inflightContextFetches.get(key);
    if (inFlight) return inFlight;
  }

  const request = (async () => {
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
      contextCache.set(key, { ...entry, fetchedAt: now });
      return entry.data;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed to load screen context (${res.status})`);
    }

    const data = (await res.json().catch(() => ({}))) as ScreenContextData;
    contextCache.set(key, {
      data,
      etag: res.headers.get("etag") ?? entry?.etag,
      lastModified: res.headers.get("last-modified") ?? entry?.lastModified,
      fetchedAt: Date.now(),
    });
    return data;
  })().finally(() => {
    inflightContextFetches.delete(key);
  });

  inflightContextFetches.set(key, request);
  return request;
}

export function primeGridScreenContext(
  gridId: number | string,
  view: ScheduleViewMode,
  data: ScreenContextData,
) {
  const key = cacheKeyFor(gridId, view);
  const existing = contextCache.get(key);
  contextCache.set(key, {
    data,
    etag: existing?.etag,
    lastModified: existing?.lastModified,
    fetchedAt: Date.now(),
  });
}

export function invalidateGridScreenContext(gridId?: number | string, view?: ScheduleViewMode) {
  if (gridId == null) {
    contextCache.clear();
    inflightContextFetches.clear();
    return;
  }
  if (view) {
    contextCache.delete(cacheKeyFor(gridId, view));
    inflightContextFetches.delete(cacheKeyFor(gridId, view));
    return;
  }
  contextCache.delete(cacheKeyFor(gridId, "draft"));
  contextCache.delete(cacheKeyFor(gridId, "published"));
  inflightContextFetches.delete(cacheKeyFor(gridId, "draft"));
  inflightContextFetches.delete(cacheKeyFor(gridId, "published"));
}
