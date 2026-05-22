"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

const TIME_RANGE_STATS_EVENT = "shift:time-range-stats";
const TIME_RANGE_SAVED_EVENT = "shift:onboarding-time-range-saved";
const PIE_COLORS = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#EC4899"];

type TimeRangeApi = {
  id: number;
  grid?: number;
  name?: string;
  start_time?: string;
  end_time?: string;
};

type TimeRangeDraft = {
  id: number;
  name: string;
  startOffsetMin: number;
  endOffsetMin: number;
  originalName: string;
  originalStartOffsetMin: number;
  originalEndOffsetMin: number;
  rowError: string | null;
  needsInitialSave: boolean;
};

type TimeRangeStatsMap = Record<string, { placementCount: number }>;

type PieRangeInfo = {
  id: string;
  index: number;
  startOffsetMin: number;
  endOffsetMin: number;
  name: string;
  color: string;
  labelStart: string;
  labelEnd: string;
};

type PieSegment = {
  id: string;
  startOffsetMin: number;
  endOffsetMin: number;
  type: "range" | "unassigned";
  name: string;
  color: string;
  colors: string[];
  names: string[];
  ranges: PieRangeInfo[];
  labelStart: string;
  labelEnd: string;
  isNarrow: boolean;
  isOverlap: boolean;
  patternId?: string;
};

type SliderDragState = {
  rangeId: number;
  knob: "start" | "end";
} | null;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseClockToMin(value: string): number {
  const [hRaw, mRaw] = String(value ?? "").split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function minutesToClock(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function flattenApiError(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => flattenApiError(item));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => flattenApiError(entry));
  }
  return [];
}

function parseApiErrorMessage(raw: string, fallback: string): string {
  const text = raw.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as unknown;
    const flattened = flattenApiError(parsed);
    if (flattened.length > 0) return flattened.join(" ");
  } catch {
    return text;
  }
  return fallback;
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function describePieSlice(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
) {
  const sweep = ((endAngleDeg - startAngleDeg) + 360) % 360;
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polar(cx, cy, radius, startAngleDeg);
  const outerEnd = polar(cx, cy, radius, endAngleDeg);
  return [
    `M ${cx} ${cy}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    "Z",
  ].join(" ");
}

export default function TimeRangesEditor({
  gridId,
  canEdit,
  horizonStart,
  horizonEnd,
  cellSizeMin,
}: {
  gridId: number;
  canEdit: boolean;
  horizonStart: string;
  horizonEnd: string;
  cellSizeMin: number;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranges, setRanges] = useState<TimeRangeDraft[]>([]);
  const [busyById, setBusyById] = useState<Record<number, boolean>>({});
  const [statsByTimeRangeId, setStatsByTimeRangeId] = useState<TimeRangeStatsMap>({});
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [sliderDrag, setSliderDrag] = useState<SliderDragState>(null);
  const trackRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const horizonStartMin = useMemo(() => parseClockToMin(horizonStart), [horizonStart]);
  const horizonEndMin = useMemo(() => {
    const raw = parseClockToMin(horizonEnd);
    return raw > horizonStartMin ? raw : horizonStartMin + 60;
  }, [horizonEnd, horizonStartMin]);
  const horizonSpanMin = useMemo(() => Math.max(1, horizonEndMin - horizonStartMin), [horizonEndMin, horizonStartMin]);
  const stepMin = useMemo(() => Math.max(1, Number(cellSizeMin) || 5), [cellSizeMin]);

  const setBusy = (id: number, value: boolean) => {
    setBusyById((prev) => ({ ...prev, [id]: value }));
  };

  const updateKnobByClientX = useCallback(
    (rangeId: number, knob: "start" | "end", clientX: number) => {
      const track = trackRefs.current[rangeId];
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const rawOffset = ratio * horizonSpanMin;
      const snappedOffset = clamp(Math.round(rawOffset / stepMin) * stepMin, 0, horizonSpanMin);

      setRanges((prev) =>
        prev.map((entry) => {
          if (entry.id !== rangeId) return entry;
          if (knob === "start") {
            return {
              ...entry,
              startOffsetMin: clamp(snappedOffset, 0, Math.max(0, entry.endOffsetMin - stepMin)),
              rowError: null,
            };
          }
          return {
            ...entry,
            endOffsetMin: clamp(snappedOffset, Math.min(horizonSpanMin, entry.startOffsetMin + stepMin), horizonSpanMin),
            rowError: null,
          };
        }),
      );
    },
    [horizonSpanMin, stepMin],
  );

  const mapApiToDraft = useCallback(
    (entry: TimeRangeApi): TimeRangeDraft => {
      const start = parseClockToMin(String(entry.start_time ?? "00:00"));
      const end = parseClockToMin(String(entry.end_time ?? "00:00"));
      let startOffsetMin = clamp(start - horizonStartMin, 0, horizonSpanMin);
      let endOffsetMin = clamp(end - horizonStartMin, 0, horizonSpanMin);
      if (endOffsetMin <= startOffsetMin) {
        endOffsetMin = clamp(startOffsetMin + stepMin, stepMin, horizonSpanMin);
      }
      if (startOffsetMin >= endOffsetMin) {
        startOffsetMin = clamp(endOffsetMin - stepMin, 0, Math.max(0, horizonSpanMin - stepMin));
      }
      const name = String(entry.name ?? `${t("entity.time_range")} ${entry.id}`);
      return {
        id: Number(entry.id),
        name,
        startOffsetMin,
        endOffsetMin,
        originalName: name,
        originalStartOffsetMin: startOffsetMin,
        originalEndOffsetMin: endOffsetMin,
        rowError: null,
        needsInitialSave: false,
      };
    },
    [horizonSpanMin, horizonStartMin, stepMin, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`, { cache: "no-store" });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("time_ranges.error_loading")));
      }
      const data = await res.json().catch(() => ({}));
      const list = (Array.isArray(data) ? data : data.results ?? []) as TimeRangeApi[];
      const sorted = list
        .map(mapApiToDraft)
        .sort((a, b) => a.startOffsetMin - b.startOffsetMin || a.endOffsetMin - b.endOffsetMin || a.id - b.id);
      setRanges(sorted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("time_ranges.error_loading"));
    } finally {
      setLoading(false);
    }
  }, [gridId, mapApiToDraft, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onStats = (event: Event) => {
      const custom = event as CustomEvent<{ gridId?: string; statsByTimeRangeId?: TimeRangeStatsMap }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      setStatsByTimeRangeId(custom.detail?.statsByTimeRangeId || {});
    };
    window.addEventListener(TIME_RANGE_STATS_EVENT, onStats as EventListener);
    return () => window.removeEventListener(TIME_RANGE_STATS_EVENT, onStats as EventListener);
  }, [gridId]);

  useEffect(() => {
    if (!sliderDrag) return;
    const onMove = (event: PointerEvent) => {
      updateKnobByClientX(sliderDrag.rangeId, sliderDrag.knob, event.clientX);
    };
    const onEnd = () => setSliderDrag(null);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [sliderDrag, updateKnobByClientX]);

  const isDirty = useCallback(
    (row: TimeRangeDraft) =>
      row.needsInitialSave ||
      row.name.trim() !== row.originalName.trim() ||
      row.startOffsetMin !== row.originalStartOffsetMin ||
      row.endOffsetMin !== row.originalEndOffsetMin,
    [],
  );

  const saveRow = async (id: number) => {
    const row = ranges.find((entry) => entry.id === id);
    if (!row) return;
    if (!row.name.trim()) {
      setRanges((prev) => prev.map((entry) => (entry.id === id ? { ...entry, rowError: t("grid_solver_settings.time_ranges_name_required") } : entry)));
      return;
    }
    if (row.endOffsetMin <= row.startOffsetMin) {
      setRanges((prev) => prev.map((entry) => (entry.id === id ? { ...entry, rowError: t("grid_solver_settings.time_ranges_invalid") } : entry)));
      return;
    }

    setBusy(id, true);
    setRanges((prev) => prev.map((entry) => (entry.id === id ? { ...entry, rowError: null } : entry)));
    try {
      const res = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: row.name.trim(),
          start_time: minutesToClock(horizonStartMin + row.startOffsetMin),
          end_time: minutesToClock(horizonStartMin + row.endOffsetMin),
        }),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_save_failed")));
      }
      setRanges((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                originalName: entry.name.trim(),
                originalStartOffsetMin: entry.startOffsetMin,
                originalEndOffsetMin: entry.endOffsetMin,
                needsInitialSave: false,
              }
            : entry,
        ),
      );
      window.dispatchEvent(
        new CustomEvent(TIME_RANGE_SAVED_EVENT, {
          detail: { gridId: String(gridId), rangeId: String(id) },
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("grid_solver_settings.time_ranges_save_failed");
      setRanges((prev) => prev.map((entry) => (entry.id === id ? { ...entry, rowError: msg } : entry)));
    } finally {
      setBusy(id, false);
    }
  };

  const deleteRow = async (id: number) => {
    if (!window.confirm(t("time_ranges.delete_confirm"))) return;
    setBusy(id, true);
    try {
      const res = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      if (res.status !== 204) {
        const raw = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_delete_failed")));
      }
      setRanges((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("grid_solver_settings.time_ranges_delete_failed"));
    } finally {
      setBusy(id, false);
    }
  };

  const addRange = async () => {
    setError(null);
    if (!newName.trim()) {
      setError(t("grid_solver_settings.time_ranges_name_required"));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/time_ranges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: newName.trim(),
          start_time: minutesToClock(horizonStartMin),
          end_time: minutesToClock(horizonEndMin),
        }),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_create_failed")));
      }
      const created = (await res.json().catch(() => null)) as TimeRangeApi | null;
      setNewName("");
      if (created?.id != null) {
        const createdDraft = {
          ...mapApiToDraft(created),
          needsInitialSave: true,
        };
        setRanges((prev) =>
          [...prev.filter((entry) => entry.id !== createdDraft.id), createdDraft].sort(
            (a, b) => a.startOffsetMin - b.startOffsetMin || a.endOffsetMin - b.endOffsetMin || a.id - b.id,
          ),
        );
      } else {
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("grid_solver_settings.time_ranges_create_failed"));
    } finally {
      setCreating(false);
    }
  };

  const pieSegments = useMemo<PieSegment[]>(() => {
    const normalized: PieRangeInfo[] = ranges
      .map((row, idx) => {
        const start = clamp(row.startOffsetMin, 0, horizonSpanMin);
        const end = clamp(row.endOffsetMin, 0, horizonSpanMin);
        if (end <= start) return null;
        return {
          id: String(row.id),
          index: idx,
          startOffsetMin: start,
          endOffsetMin: end,
          name: row.name.trim() || `${t("entity.time_range")} ${row.id}`,
          color: PIE_COLORS[idx % PIE_COLORS.length],
          labelStart: minutesToClock(horizonStartMin + start),
          labelEnd: minutesToClock(horizonStartMin + end),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.startOffsetMin - b.startOffsetMin || a.endOffsetMin - b.endOffsetMin || a.index - b.index);

    const boundaries = Array.from(
      new Set([0, horizonSpanMin, ...normalized.flatMap((row) => [row.startOffsetMin, row.endOffsetMin])]),
    ).sort((a, b) => a - b);

    const segments: PieSegment[] = [];
    for (let idx = 0; idx < boundaries.length - 1; idx += 1) {
      const start = boundaries[idx];
      const end = boundaries[idx + 1];
      if (end <= start) continue;

      const active = normalized.filter((row) => row.startOffsetMin < end && row.endOffsetMin > start);
      const arcDeg = ((end - start) / horizonSpanMin) * 360;

      if (active.length === 0) {
        segments.push({
          id: `u-${start}-${end}`,
          startOffsetMin: start,
          endOffsetMin: end,
          type: "unassigned",
          name: "Unassigned",
          color: "#E5E7EB",
          colors: ["#E5E7EB"],
          names: ["Unassigned"],
          ranges: [],
          labelStart: minutesToClock(horizonStartMin + start),
          labelEnd: minutesToClock(horizonStartMin + end),
          isNarrow: arcDeg < 30,
          isOverlap: false,
        });
        continue;
      }

      const colors = active.map((row) => row.color);
      const names = active.map((row) => row.name);
      const isOverlap = active.length > 1;
      segments.push({
        id: `r-${start}-${end}-${active.map((row) => row.id).join("-")}`,
        startOffsetMin: start,
        endOffsetMin: end,
        type: "range",
        name: names.join(" + "),
        color: colors[0],
        colors,
        names,
        ranges: active,
        labelStart: minutesToClock(horizonStartMin + start),
        labelEnd: minutesToClock(horizonStartMin + end),
        isNarrow: arcDeg < 30,
        isOverlap,
        patternId: isOverlap ? `time-range-overlap-${start}-${end}-${active.map((row) => row.id).join("-")}` : undefined,
      });
    }

    return segments;
  }, [horizonSpanMin, horizonStartMin, ranges, t]);

  const largestUnassigned = useMemo(() => {
    const unassigned = pieSegments.filter((s) => s.type === "unassigned");
    if (unassigned.length === 0) return null;
    return unassigned.reduce((best, current) => {
      const bestLen = best.endOffsetMin - best.startOffsetMin;
      const currentLen = current.endOffsetMin - current.startOffsetMin;
      return currentLen > bestLen ? current : best;
    }, unassigned[0]);
  }, [pieSegments]);

  const boundaryLabels = useMemo(() => {
    const boundaries = new Map<number, string>([
      [0, minutesToClock(horizonStartMin)],
      [horizonSpanMin, minutesToClock(horizonEndMin)],
    ]);
    for (const segment of pieSegments) {
      if (segment.type !== "range") continue;
      boundaries.set(segment.startOffsetMin, segment.labelStart);
      boundaries.set(segment.endOffsetMin, segment.labelEnd);
    }
    return Array.from(boundaries.entries())
      .map(([offsetMin, label]) => ({ offsetMin, label }))
      .sort((a, b) => a.offsetMin - b.offsetMin);
  }, [horizonEndMin, horizonSpanMin, horizonStartMin, pieSegments]);

  const chartSize = 340;
  const cx = chartSize / 2;
  const cy = chartSize / 2;
  const outerRadius = 126;
  const latestRangeId = useMemo(
    () => ranges.reduce<number | null>((latest, row) => (latest == null || row.id > latest ? row.id : latest), null),
    [ranges],
  );

  const toAngle = (offsetMin: number) => (offsetMin / horizonSpanMin) * 360 - 90;

  return (
    <div
      className="flex h-full min-h-0 w-full max-w-full flex-col gap-3 overflow-hidden overflow-x-hidden pr-1 pb-1"
      data-onboarding-target="time-ranges-panel"
    >
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">{t("entity.time_ranges")}</h2>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 overflow-hidden">
        <div className="min-h-0 overflow-hidden overflow-x-hidden rounded-lg border bg-white p-4 pb-3">
          <div className="flex h-full min-h-0 flex-col">
            {error ? <div className="mb-2 text-sm text-red-600">{error}</div> : null}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
              {loading ? (
                <div className="text-sm text-gray-500 py-2">{t("common.loading")}</div>
              ) : ranges.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">{t("time_ranges.no_items")}</div>
              ) : (
                ranges.map((row) => {
                  const busy = Boolean(busyById[row.id]);
                  const dirty = isDirty(row);
                  const startPercent = (row.startOffsetMin / horizonSpanMin) * 100;
                  const endPercent = (row.endOffsetMin / horizonSpanMin) * 100;
                  return (
                    <div
                      key={`time-range-card-${row.id}`}
                      className="w-full min-w-0 overflow-x-hidden rounded border p-3"
                      data-onboarding-target={row.id === latestRangeId ? "time-range-latest-card" : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          className="w-full min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
                          value={row.name}
                          onChange={(event) => {
                            const value = event.target.value;
                            setRanges((prev) =>
                              prev.map((entry) => (entry.id === row.id ? { ...entry, name: value, rowError: null } : entry)),
                            );
                          }}
                          disabled={!canEdit || busy}
                        />
                        {canEdit ? (
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-red-50"
                            title={t("common.delete")}
                            onClick={() => void deleteRow(row.id)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 px-2">
                        <div
                          ref={(node) => {
                            trackRefs.current[row.id] = node;
                          }}
                          className="relative h-2 w-full cursor-default rounded bg-gray-200"
                        >
                          <div
                            className="absolute top-0 h-2 rounded bg-black"
                            style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}
                          />
                          <div
                            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-black bg-white cursor-ew-resize"
                            style={{ left: `calc(${startPercent}% - 8px)` }}
                            onPointerDown={(event) => {
                              if (!canEdit || busy) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setSliderDrag({ rangeId: row.id, knob: "start" });
                            }}
                          />
                          <div
                            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-black bg-white cursor-ew-resize"
                            style={{ left: `calc(${endPercent}% - 8px)` }}
                            onPointerDown={(event) => {
                              if (!canEdit || busy) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setSliderDrag({ rangeId: row.id, knob: "end" });
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                          <span>{minutesToClock(horizonStartMin + row.startOffsetMin)}</span>
                          <span>{minutesToClock(horizonStartMin + row.endOffsetMin)}</span>
                        </div>
                      </div>

                      {row.rowError ? <div className="mt-2 text-xs text-red-600">{row.rowError}</div> : null}
                      {canEdit && dirty ? (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-60"
                            onClick={() => void saveRow(row.id)}
                            disabled={busy}
                          >
                            {busy ? t("common.saving") : t("common.save")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div
              className="mt-3 shrink-0 border-t bg-white pt-3"
              data-onboarding-target="time-ranges-add-row"
            >
              <div className="flex items-center gap-2">
                <input
                  className="w-full min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
                  data-onboarding-target="time-ranges-name-input"
                  placeholder={t("common.name")}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  disabled={!canEdit || creating}
                />
                <button
                  type="button"
                  className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  onClick={() => void addRange()}
                  disabled={!canEdit || creating || !newName.trim()}
                >
                  {creating ? t("common.saving") : t("common.add")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden bg-white">
          <div className="flex h-full min-h-0 items-center justify-center overflow-hidden">
            <svg viewBox={`0 0 ${chartSize} ${chartSize}`} className="h-full max-h-full w-full max-w-full">
            <defs>
              {pieSegments
                .filter((segment) => segment.isOverlap && segment.patternId)
                .map((segment) => {
                  const stripeWidth = 7;
                  const patternWidth = Math.max(stripeWidth * segment.colors.length, stripeWidth);
                  return (
                    <pattern
                      key={segment.patternId}
                      id={segment.patternId}
                      patternUnits="userSpaceOnUse"
                      width={patternWidth}
                      height={8}
                      patternTransform="rotate(45)"
                    >
                      {segment.colors.map((color, index) => (
                        <rect
                          key={`${segment.patternId}-${color}-${index}`}
                          x={index * stripeWidth}
                          y={0}
                          width={stripeWidth}
                          height={8}
                          fill={color}
                        />
                      ))}
                    </pattern>
                  );
                })}
            </defs>
            {pieSegments.map((segment) => {
              const startAngle = toAngle(segment.startOffsetMin);
              const endAngle = toAngle(segment.endOffsetMin);
              const isFullCircle = segment.endOffsetMin - segment.startOffsetMin >= horizonSpanMin;
              const fill = segment.patternId ? `url(#${segment.patternId})` : segment.color;
              if (isFullCircle) {
                return <circle key={`arc-${segment.id}-${segment.startOffsetMin}`} cx={cx} cy={cy} r={outerRadius} fill={fill} />;
              }
              const path = describePieSlice(cx, cy, outerRadius, startAngle, endAngle);
              return <path key={`arc-${segment.id}-${segment.startOffsetMin}`} d={path} fill={fill} />;
            })}

            {boundaryLabels.map(({ offsetMin, label }) => {
              if (horizonSpanMin >= 1440 && offsetMin === horizonSpanMin) return null;
              const angle = toAngle(offsetMin);
              const outer = polar(cx, cy, outerRadius, angle);
              let labelPoint = polar(cx, cy, outerRadius + 18, angle);
              let anchor: "start" | "middle" | "end" =
                Math.abs(labelPoint.x - cx) < 8 ? "middle" : labelPoint.x > cx ? "start" : "end";
              if (horizonSpanMin < 1440 && (offsetMin === 0 || offsetMin === horizonSpanMin)) {
                labelPoint = {
                  x: cx + (offsetMin === 0 ? 18 : -18),
                  y: cy - outerRadius - 18,
                };
                anchor = offsetMin === 0 ? "start" : "end";
              }
              return (
                <g key={`boundary-${offsetMin}`}>
                  <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#374151" strokeWidth={1.4} />
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="#374151"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {pieSegments
              .filter((segment) => segment.type === "range")
              .map((segment) => {
                const startAngle = toAngle(segment.startOffsetMin);
                const endAngle = toAngle(segment.endOffsetMin);
                const midAngle = startAngle + (((endAngle - startAngle) + 360) % 360) / 2;
                if (segment.isOverlap || segment.isNarrow) {
                  const pOuter = polar(cx, cy, outerRadius, midAngle);
                  const pLeader = polar(cx, cy, outerRadius + 12, midAngle);
                  const pText = polar(cx, cy, outerRadius + 26, midAngle);
                  const anchor = pText.x >= cx ? "start" : "end";
                  const labelNames = segment.names.slice(0, 3);
                  return (
                    <g key={`label-out-${segment.id}`}>
                      <line x1={pOuter.x} y1={pOuter.y} x2={pLeader.x} y2={pLeader.y} stroke="#374151" strokeWidth={1} />
                      <line
                        x1={pLeader.x}
                        y1={pLeader.y}
                        x2={pText.x + (anchor === "start" ? -4 : 4)}
                        y2={pText.y}
                        stroke="#374151"
                        strokeWidth={1}
                      />
                      <text
                        x={pText.x}
                        y={pText.y - (labelNames.length - 1) * 5}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="#374151"
                      >
                        {labelNames.map((name, index) => (
                          <tspan key={`${segment.id}-${name}`} x={pText.x} dy={index === 0 ? 0 : 11}>
                            {name}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                }

                const p = polar(cx, cy, outerRadius * 0.58, midAngle);
                return (
                  <text
                    key={`label-inside-${segment.id}`}
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {segment.name}
                  </text>
                );
              })}

            {largestUnassigned ? (() => {
              const startAngle = toAngle(largestUnassigned.startOffsetMin);
              const endAngle = toAngle(largestUnassigned.endOffsetMin);
              const midAngle = startAngle + (((endAngle - startAngle) + 360) % 360) / 2;
              const p = polar(cx, cy, outerRadius * 0.56, midAngle);
              return (
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#6b7280">
                  Unassigned
                </text>
              );
            })() : null}
          </svg>
        </div>
      </div>
      </div>
      <div className="sr-only" aria-hidden>
        {Object.values(statsByTimeRangeId).reduce((sum, entry) => sum + (entry?.placementCount || 0), 0)}
      </div>
    </div>
  );
}
