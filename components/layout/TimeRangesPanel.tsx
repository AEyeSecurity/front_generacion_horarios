"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";
import PanelShell from "@/components/panels/PanelShell";

const EditTimeRangeDialog = dynamic(() => import("@/components/dialogs/EditTimeRangeDialog"), { ssr: false });

const TIME_RANGE_STATS_EVENT = "shift:time-range-stats";

type TimeRange = {
  id: number;
  grid?: number;
  name: string;
  start_time: string;
  end_time: string;
  rowError?: string | null;
};

type TimeRangeStatsMap = Record<string, { placementCount: number }>;

const PIE_COLORS = [
  "#2563eb",
  "#9333ea",
  "#ea580c",
  "#0d9488",
  "#db2777",
  "#65a30d",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
  "#334155",
];

function norm(t: string) {
  const [h, m] = String(t || "").split(":");
  return `${String(h ?? "00").padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
}

function parseClockToMin(value: string): number {
  const [hRaw, mRaw] = String(value ?? "").split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatPercent(v: number) {
  return `${(v * 100).toFixed(1)}%`;
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

export default function TimeRangesPanel({
  gridId,
  dayStartMin,
  dayEndMin,
}: {
  gridId: number;
  dayStartMin?: number;
  dayEndMin?: number;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<TimeRange[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statsByTimeRangeId, setStatsByTimeRangeId] = useState<TimeRangeStatsMap>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TimeRange | null>(null);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("08:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [creating, setCreating] = useState(false);
  const [busyById, setBusyById] = useState<Record<number, boolean>>({});

  const setBusy = (id: number, value: boolean) => {
    setBusyById((prev) => ({ ...prev, [id]: value }));
  };

  const emitCurrentStats = useCallback(
    (nextStats?: TimeRangeStatsMap) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(TIME_RANGE_STATS_EVENT, {
          detail: { gridId: String(gridId), statsByTimeRangeId: nextStats ?? statsByTimeRangeId },
        }),
      );
    },
    [gridId, statsByTimeRangeId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const response = await fetch(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`, { cache: "no-store" });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("time_ranges.error_loading")));
      }
      const payload = await response.json().catch(() => ({}));
      const list = (Array.isArray(payload) ? payload : payload.results ?? []) as TimeRange[];
      const sorted = list
        .map((item) => ({
          id: Number(item.id),
          grid: item.grid != null ? Number(item.grid) : undefined,
          name: String(item.name ?? ""),
          start_time: norm(String(item.start_time ?? "00:00")),
          end_time: norm(String(item.end_time ?? "00:00")),
          rowError: null,
        }))
        .sort((a, b) => parseClockToMin(a.start_time) - parseClockToMin(b.start_time) || a.id - b.id);
      setItems(sorted);
      emitCurrentStats();
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : t("time_ranges.error_loading"));
    } finally {
      setLoading(false);
    }
  }, [emitCurrentStats, gridId, t]);

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

  const derivedHorizon = useMemo(() => {
    const starts = items.map((entry) => parseClockToMin(entry.start_time));
    const ends = items.map((entry) => parseClockToMin(entry.end_time));
    const minStart = starts.length > 0 ? Math.min(...starts) : 8 * 60;
    const maxEnd = ends.length > 0 ? Math.max(...ends) : 20 * 60;
    const start = typeof dayStartMin === "number" ? dayStartMin : minStart;
    const end = typeof dayEndMin === "number" ? dayEndMin : maxEnd;
    return {
      start,
      end: end > start ? end : start + 60,
    };
  }, [dayEndMin, dayStartMin, items]);

  const pieSegments = useMemo(() => {
    const horizonSpan = Math.max(1, derivedHorizon.end - derivedHorizon.start);
    const colored = items
      .map((entry, index) => {
        const start = parseClockToMin(entry.start_time);
        const end = parseClockToMin(entry.end_time);
        const duration = Math.max(
          0,
          Math.min(end, derivedHorizon.end) - Math.max(start, derivedHorizon.start),
        );
        return {
          id: String(entry.id),
          name: entry.name || `${t("entity.time_range")} ${entry.id}`,
          start: entry.start_time,
          end: entry.end_time,
          duration,
          ratio: duration / horizonSpan,
          color: PIE_COLORS[index % PIE_COLORS.length],
        };
      })
      .filter((entry) => entry.duration > 0);
    const covered = colored.reduce((sum, entry) => sum + entry.duration, 0);
    const unassignedDuration = Math.max(0, horizonSpan - covered);
    const unassignedRatio = unassignedDuration / horizonSpan;
    return {
      horizonSpan,
      colored,
      unassigned: {
        id: "unassigned",
        name: "Unassigned",
        start: "",
        end: "",
        duration: unassignedDuration,
        ratio: unassignedRatio,
        color: "#d1d5db",
      },
    };
  }, [derivedHorizon.end, derivedHorizon.start, items, t]);

  const addRange = async () => {
    setErr(null);
    if (!newName.trim()) {
      setErr(t("grid_solver_settings.time_ranges_name_required"));
      return;
    }
    if (parseClockToMin(newEnd) <= parseClockToMin(newStart)) {
      setErr(t("grid_solver_settings.time_ranges_invalid"));
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/time_ranges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: newName.trim(),
          start_time: norm(newStart),
          end_time: norm(newEnd),
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_create_failed")));
      }
      setNewName("");
      setNewStart("08:00");
      setNewEnd("17:00");
      await load();
      emitCurrentStats();
    } catch (error: unknown) {
      setErr(
        error instanceof Error ? error.message : t("grid_solver_settings.time_ranges_create_failed"),
      );
    } finally {
      setCreating(false);
    }
  };

  const updateRowField = (id: number, key: "name" | "start_time" | "end_time", value: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              [key]: key === "name" ? value : norm(value),
              rowError: null,
            }
          : entry,
      ),
    );
  };

  const saveRow = async (id: number) => {
    const current = items.find((entry) => entry.id === id);
    if (!current) return;
    if (!current.name.trim()) {
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, rowError: t("grid_solver_settings.time_ranges_name_required") } : entry,
        ),
      );
      return;
    }
    if (parseClockToMin(current.end_time) <= parseClockToMin(current.start_time)) {
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, rowError: t("grid_solver_settings.time_ranges_invalid") } : entry,
        ),
      );
      return;
    }
    setBusy(id, true);
    try {
      const response = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: current.name.trim(),
          start_time: norm(current.start_time),
          end_time: norm(current.end_time),
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_save_failed")));
      }
      await load();
      emitCurrentStats();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : t("grid_solver_settings.time_ranges_save_failed");
      setItems((prev) => prev.map((entry) => (entry.id === id ? { ...entry, rowError: msg } : entry)));
    } finally {
      setBusy(id, false);
    }
  };

  const deleteRow = async (id: number) => {
    if (!window.confirm(t("time_ranges.delete_confirm"))) return;
    setBusy(id, true);
    try {
      const response = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_delete_failed")));
      }
      await load();
      emitCurrentStats();
    } catch (error: unknown) {
      setErr(
        error instanceof Error ? error.message : t("grid_solver_settings.time_ranges_delete_failed"),
      );
    } finally {
      setBusy(id, false);
    }
  };

  const chartRadius = 58;
  const chartCircumference = 2 * Math.PI * chartRadius;
  let runningOffset = 0;
  const coloredSlices = pieSegments.colored.map((segment) => {
    const dash = segment.ratio * chartCircumference;
    const slice = {
      ...segment,
      dash,
      dashOffset: -runningOffset,
    };
    runningOffset += dash;
    return slice;
  });
  const unassignedDash = pieSegments.unassigned.ratio * chartCircumference;
  const unassignedOffset = -runningOffset;

  return (
    <PanelShell title={t("grid_solver_settings.time_ranges_title")} error={err}>
      <div className="flex-1 overflow-y-auto rounded border bg-white p-3 space-y-4">
        <section className="rounded-md border p-3">
          <div className="text-sm font-medium text-gray-900">{t("grid_time_ranges.configure")}</div>
          <div className="mt-3 flex items-center gap-4">
            <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
              <g transform="translate(80, 80) rotate(-90)">
                <circle r={chartRadius} fill="none" stroke="#f3f4f6" strokeWidth="18" />
                {coloredSlices.map((segment) => (
                  <circle
                    key={`slice-${segment.id}`}
                    r={chartRadius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="18"
                    strokeDasharray={`${segment.dash} ${Math.max(0, chartCircumference - segment.dash)}`}
                    strokeDashoffset={segment.dashOffset}
                    strokeLinecap="butt"
                  />
                ))}
                {unassignedDash > 0 ? (
                  <circle
                    r={chartRadius}
                    fill="none"
                    stroke={pieSegments.unassigned.color}
                    strokeWidth="18"
                    strokeDasharray={`${unassignedDash} ${Math.max(0, chartCircumference - unassignedDash)}`}
                    strokeDashoffset={unassignedOffset}
                    strokeLinecap="butt"
                  />
                ) : null}
              </g>
              <text x="80" y="76" textAnchor="middle" className="fill-gray-900 text-[12px] font-medium">
                {t("entity.time_ranges")}
              </text>
              <text x="80" y="94" textAnchor="middle" className="fill-gray-500 text-[11px]">
                {`${Math.round(pieSegments.horizonSpan / 60)}h`}
              </text>
            </svg>

            <div className="min-w-0 flex-1 space-y-2">
              {pieSegments.colored.map((segment) => {
                const placementCount = statsByTimeRangeId[String(segment.id)]?.placementCount;
                return (
                  <div key={`legend-${segment.id}`} className="flex items-center gap-2 text-xs">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                    <span className="truncate font-medium text-gray-800">
                      {segment.name}
                    </span>
                    <span className="text-gray-500">{`${segment.start}-${segment.end}`}</span>
                    <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                      {placementCount != null ? `${placementCount} cells` : "—"}
                    </span>
                    <span className="text-gray-500">{formatPercent(segment.ratio)}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
                <span className="font-medium text-gray-700">Unassigned</span>
                <span className="ml-auto text-gray-500">{formatPercent(pieSegments.unassigned.ratio)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border p-3 space-y-3">
          <div className="text-sm font-medium text-gray-900">{t("time_ranges.add_new")}</div>
          <div className="grid grid-cols-12 gap-2">
            <input
              className="col-span-6 border rounded px-2 py-1.5 text-sm"
              placeholder={t("common.name")}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <input
              className="col-span-3 border rounded px-2 py-1.5 text-sm"
              type="time"
              value={newStart}
              onChange={(event) => setNewStart(event.target.value)}
            />
            <input
              className="col-span-3 border rounded px-2 py-1.5 text-sm"
              type="time"
              value={newEnd}
              onChange={(event) => setNewEnd(event.target.value)}
            />
          </div>
          <div className="text-right">
            <button
              type="button"
              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
              disabled={creating}
              onClick={() => void addRange()}
            >
              {creating ? t("common.saving") : t("common.add")}
            </button>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="text-sm text-gray-500">{t("common.loading")}</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-gray-500">{t("time_ranges.no_items")}</div>
            ) : (
              items.map((entry) => {
                const busy = Boolean(busyById[entry.id]);
                const entryStartMin = parseClockToMin(entry.start_time);
                const entryEndMin = parseClockToMin(entry.end_time);
                const startRatio = clamp(
                  (entryStartMin - derivedHorizon.start) / Math.max(1, derivedHorizon.end - derivedHorizon.start),
                  0,
                  1,
                );
                const endRatio = clamp(
                  (entryEndMin - derivedHorizon.start) / Math.max(1, derivedHorizon.end - derivedHorizon.start),
                  0,
                  1,
                );
                const barLeft = `${startRatio * 100}%`;
                const barWidth = `${Math.max(1, (endRatio - startRatio) * 100)}%`;
                return (
                  <div key={`time-range-row-${entry.id}`} className="rounded border p-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        className="col-span-5 border rounded px-2 py-1 text-sm"
                        value={entry.name}
                        onChange={(event) => updateRowField(entry.id, "name", event.target.value)}
                        disabled={busy}
                      />
                      <input
                        className="col-span-2 border rounded px-2 py-1 text-sm"
                        type="time"
                        value={entry.start_time}
                        onChange={(event) => updateRowField(entry.id, "start_time", event.target.value)}
                        disabled={busy}
                      />
                      <input
                        className="col-span-2 border rounded px-2 py-1 text-sm"
                        type="time"
                        value={entry.end_time}
                        onChange={(event) => updateRowField(entry.id, "end_time", event.target.value)}
                        disabled={busy}
                      />
                      <div className="col-span-3 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                          onClick={() => void saveRow(entry.id)}
                          disabled={busy}
                        >
                          {busy ? t("common.saving") : t("common.save")}
                        </button>
                        <button
                          type="button"
                          className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-gray-100"
                          title={t("common.edit")}
                          onClick={() => {
                            setEditTarget(entry);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-red-50"
                          title={t("common.delete")}
                          onClick={() => void deleteRow(entry.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded bg-gray-200 relative">
                      <div className="absolute top-0 h-2 rounded bg-black/75" style={{ left: barLeft, width: barWidth }} />
                    </div>
                    {entry.rowError ? <div className="mt-1 text-xs text-red-600">{entry.rowError}</div> : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <EditTimeRangeDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        value={editTarget}
        onSaved={async () => {
          await load();
          emitCurrentStats();
        }}
      />
    </PanelShell>
  );
}

