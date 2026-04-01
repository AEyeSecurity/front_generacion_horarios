export type ScheduleViewMode = "draft" | "published";

export const SCHEDULE_VIEW_MODE_EVENT = "shift:schedule-view-mode-changed";

export function normalizeScheduleViewMode(value: unknown): ScheduleViewMode {
  return value === "published" ? "published" : "draft";
}

export function getGridScheduleViewModeKey(gridId: number | string): string {
  return `grid:${gridId}:schedule-view-mode`;
}

export function readGridScheduleViewMode(gridId: number | string): ScheduleViewMode {
  if (typeof window === "undefined") return "draft";
  try {
    const key = getGridScheduleViewModeKey(gridId);
    return normalizeScheduleViewMode(window.localStorage.getItem(key));
  } catch {
    return "draft";
  }
}

export function writeGridScheduleViewMode(
  gridId: number | string,
  mode: ScheduleViewMode,
): ScheduleViewMode {
  const normalized = normalizeScheduleViewMode(mode);
  if (typeof window === "undefined") return normalized;
  try {
    const key = getGridScheduleViewModeKey(gridId);
    window.localStorage.setItem(key, normalized);
    window.dispatchEvent(
      new CustomEvent(SCHEDULE_VIEW_MODE_EVENT, {
        detail: { gridId: String(gridId), mode: normalized },
      }),
    );
  } catch {}
  return normalized;
}
