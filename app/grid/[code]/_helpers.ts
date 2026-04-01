import { backendFetchJSON } from "@/lib/backend";
import { ApiError } from "@/lib/errors";
import type { Grid } from "@/lib/types";
import type { GridSchedule } from "@/lib/types";

export async function resolveGridByCode(code: string): Promise<Grid> {
  const encoded = encodeURIComponent(code);
  try {
    return await backendFetchJSON<Grid>(`/api/grids/code/${encoded}/`);
  } catch {
    return await backendFetchJSON<Grid>(`/api/grids/code/${encoded}`);
  }
}

async function getSchedule(path: string): Promise<GridSchedule | null> {
  try {
    return await backendFetchJSON<GridSchedule>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function resolveScheduleByGridCode(code: string): Promise<GridSchedule | null> {
  const encoded = encodeURIComponent(code);
  const withSlash = await getSchedule(`/api/grids/code/${encoded}/schedule/`);
  if (withSlash) return withSlash;
  return getSchedule(`/api/grids/code/${encoded}/schedule`);
}

export async function resolveScheduleByGridId(gridId: number | string): Promise<GridSchedule | null> {
  const encoded = encodeURIComponent(String(gridId));
  const withSlash = await getSchedule(`/api/grids/${encoded}/schedule/`);
  if (withSlash) return withSlash;
  return getSchedule(`/api/grids/${encoded}/schedule`);
}
