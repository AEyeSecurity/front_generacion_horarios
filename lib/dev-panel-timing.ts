type PanelTimingName = "cells" | "categories" | "participants" | "time-ranges";

declare global {
  interface Window {
    __SHIFT_PANEL_TIMING_STARTS__?: Partial<Record<PanelTimingName, number>>;
  }
}

const isDev = process.env.NODE_ENV === "development";

export function startPanelTiming(panel: PanelTimingName) {
  if (!isDev || typeof window === "undefined") return;
  const starts = (window.__SHIFT_PANEL_TIMING_STARTS__ ??= {});
  starts[panel] = performance.now();
  console.debug(`[panel-timing] ${panel}: click`);
}

export function markPanelTiming(panel: PanelTimingName, phase: "visible" | "data-ready") {
  if (!isDev || typeof window === "undefined") return;
  const startedAt = window.__SHIFT_PANEL_TIMING_STARTS__?.[panel];
  const elapsed = startedAt == null ? null : performance.now() - startedAt;
  console.debug(
    `[panel-timing] ${panel}: ${phase}${elapsed == null ? "" : ` in ${elapsed.toFixed(1)}ms`}`,
  );
}

export async function measurePanelRequest<T>(panel: PanelTimingName, request: () => Promise<T>): Promise<T> {
  if (!isDev || typeof window === "undefined") return request();
  const startedAt = performance.now();
  try {
    return await request();
  } finally {
    console.debug(`[panel-timing] ${panel}: API request ${(performance.now() - startedAt).toFixed(1)}ms`);
  }
}
