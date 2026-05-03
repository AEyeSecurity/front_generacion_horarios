"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

const TIME_RANGE_STATS_EVENT = "shift:time-range-stats";
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
};

type TimeRangeStatsMap = Record<string, { placementCount: number }>;

type PieSegment = {
  id: string;
  startOffsetMin: number;
  endOffsetMin: number;
  type: "range" | "unassigned";
  name: string;
  color: string;
  labelStart: string;
  labelEnd: string;
  isNarrow: boolean;
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

function describeDonutArc(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngleDeg: number,
  endAngleDeg: number,
) {
  const sweep = ((endAngleDeg - startAngleDeg) + 360) % 360;
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polar(cx, cy, outerRadius, startAngleDeg);
  const outerEnd = polar(cx, cy, outerRadius, endAngleDeg);
  const innerEnd = polar(cx, cy, innerRadius, endAngleDeg);
  const innerStart = polar(cx, cy, innerRadius, startAngleDeg);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
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
              }
            : entry,
        ),
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
      setNewName("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("grid_solver_settings.time_ranges_create_failed"));
    } finally {
      setCreating(false);
    }
  };

  const pieSegments = useMemo<PieSegment[]>(() => {
    const normalized = ranges
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
          labelStart: minutesToClock(horizonStartMin + start),
          labelEnd: minutesToClock(horizonStartMin + end),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.startOffsetMin - b.startOffsetMin || a.endOffsetMin - b.endOffsetMin || a.index - b.index);

    const segments: PieSegment[] = [];
    let cursor = 0;
    for (const row of normalized) {
      const rowStart = Math.max(cursor, row.startOffsetMin);
      if (rowStart > cursor) {
        segments.push({
          id: `u-${cursor}-${rowStart}`,
          startOffsetMin: cursor,
          endOffsetMin: rowStart,
          type: "unassigned",
          name: "Unassigned",
          color: "#E5E7EB",
          labelStart: minutesToClock(horizonStartMin + cursor),
          labelEnd: minutesToClock(horizonStartMin + rowStart),
          isNarrow: false,
        });
      }
      const rowEnd = Math.max(rowStart, row.endOffsetMin);
      if (rowEnd > rowStart) {
        const arcDeg = ((rowEnd - rowStart) / horizonSpanMin) * 360;
        segments.push({
          id: row.id,
          startOffsetMin: rowStart,
          endOffsetMin: rowEnd,
          type: "range",
          name: row.name,
          color: PIE_COLORS[row.index % PIE_COLORS.length],
          labelStart: row.labelStart,
          labelEnd: row.labelEnd,
          isNarrow: arcDeg < 30,
        });
      }
      cursor = Math.max(cursor, row.endOffsetMin);
    }
    if (cursor < horizonSpanMin) {
      segments.push({
        id: `u-${cursor}-${horizonSpanMin}`,
        startOffsetMin: cursor,
        endOffsetMin: horizonSpanMin,
        type: "unassigned",
        name: "Unassigned",
        color: "#E5E7EB",
        labelStart: minutesToClock(horizonStartMin + cursor),
        labelEnd: minutesToClock(horizonStartMin + horizonSpanMin),
        isNarrow: false,
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

  const chartSize = 260;
  const cx = chartSize / 2;
  const cy = chartSize / 2;
  const outerRadius = 92;
  const innerRadius = 42;

  const toAngle = (offsetMin: number) => (offsetMin / horizonSpanMin) * 360 - 90;

  const horizonDurationLabel = `${Math.round(horizonSpanMin / 60)}h`;

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-2 overflow-hidden overflow-x-hidden pr-1 pb-1">
      <div className="shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">{t("entity.time_ranges")}</h2>
      </div>

      <div className="rounded-lg border bg-white p-4 pb-3 basis-[56%] shrink-0 min-h-0 overflow-hidden overflow-x-hidden">
        <div className="flex h-full min-h-0 flex-col">
          {error ? <div className="mb-2 text-sm text-red-600">{error}</div> : null}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-2">
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
                  <div key={`time-range-card-${row.id}`} className="rounded border p-3 w-full min-w-0 overflow-x-hidden">
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 min-w-0 w-full rounded border px-2 py-1.5 text-sm"
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
                          className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-red-50"
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
                        className="relative h-2 w-full rounded bg-gray-200 cursor-default"
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

          <div className="mt-3 border-t pt-3 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 w-full rounded border px-2 py-1.5 text-sm"
                placeholder={t("common.name")}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                disabled={!canEdit || creating}
              />
              <button
                type="button"
                className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                onClick={() => void addRange()}
                disabled={!canEdit || creating}
              >
                {creating ? t("common.saving") : t("common.add")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-3 flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex items-center justify-center">
          <svg viewBox={`0 0 ${chartSize} ${chartSize}`} className="w-full h-full max-w-full max-h-full">
            {pieSegments.map((segment) => {
              const startAngle = toAngle(segment.startOffsetMin);
              const endAngle = toAngle(segment.endOffsetMin);
              const path = describeDonutArc(cx, cy, innerRadius, outerRadius, startAngle, endAngle);
              return <path key={`arc-${segment.id}-${segment.startOffsetMin}`} d={path} fill={segment.color} />;
            })}

            {pieSegments
              .filter((segment) => segment.type === "range")
              .flatMap((segment) => {
                const startAngle = toAngle(segment.startOffsetMin);
                const endAngle = toAngle(segment.endOffsetMin);
                const startInner = polar(cx, cy, innerRadius, startAngle);
                const startOuter = polar(cx, cy, outerRadius, startAngle);
                const endInner = polar(cx, cy, innerRadius, endAngle);
                const endOuter = polar(cx, cy, outerRadius, endAngle);
                return [
                  <line
                    key={`line-start-${segment.id}`}
                    x1={startInner.x}
                    y1={startInner.y}
                    x2={startOuter.x}
                    y2={startOuter.y}
                    stroke="#374151"
                    strokeWidth={1.5}
                  />,
                  <line
                    key={`line-end-${segment.id}`}
                    x1={endInner.x}
                    y1={endInner.y}
                    x2={endOuter.x}
                    y2={endOuter.y}
                    stroke="#374151"
                    strokeWidth={1.5}
                  />,
                ];
              })}

            {pieSegments
              .filter((segment) => segment.type === "range")
              .map((segment) => {
                const startAngle = toAngle(segment.startOffsetMin);
                const endAngle = toAngle(segment.endOffsetMin);
                const midAngle = startAngle + (((endAngle - startAngle) + 360) % 360) / 2;
                const innerLabelRadius = innerRadius + (outerRadius - innerRadius) * 0.62;

                if (!segment.isNarrow) {
                  const p = polar(cx, cy, innerLabelRadius, midAngle);
                  return (
                    <text
                      key={`label-inside-${segment.id}`}
                      x={p.x}
                      y={p.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill="#ffffff"
                    >
                      <tspan x={p.x} dy="-4">{segment.labelStart}-</tspan>
                      <tspan x={p.x} dy="10">{segment.labelEnd}</tspan>
                    </text>
                  );
                }

                const pOuter = polar(cx, cy, outerRadius, midAngle);
                const pLeader = polar(cx, cy, outerRadius + 12, midAngle);
                const pText = polar(cx, cy, outerRadius + 26, midAngle);
                const anchor = pText.x >= cx ? "start" : "end";
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
                    <text x={pText.x} y={pText.y - 4} textAnchor={anchor} fontSize={10} fill="#374151">
                      {segment.labelStart}-
                    </text>
                    <text x={pText.x} y={pText.y + 8} textAnchor={anchor} fontSize={10} fill="#374151">
                      {segment.labelEnd}
                    </text>
                  </g>
                );
              })}

            {largestUnassigned ? (() => {
              const startAngle = toAngle(largestUnassigned.startOffsetMin);
              const endAngle = toAngle(largestUnassigned.endOffsetMin);
              const midAngle = startAngle + (((endAngle - startAngle) + 360) % 360) / 2;
              const p = polar(cx, cy, innerRadius + (outerRadius - innerRadius) * 0.58, midAngle);
              return (
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#6b7280">
                  Unassigned
                </text>
              );
            })() : null}

            <circle cx={cx} cy={cy} r={innerRadius - 1} fill="#ffffff" />
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={12} fill="#374151" fontWeight={600}>
              {t("entity.time_ranges")}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill="#6b7280">
              {horizonDurationLabel}
            </text>
          </svg>
        </div>
      </div>
      <div className="sr-only" aria-hidden>
        {Object.values(statsByTimeRangeId).reduce((sum, entry) => sum + (entry?.placementCount || 0), 0)}
      </div>
    </div>
  );
}
