"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSolverParamsPayload,
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
  TIER_KEYS,
  type GridSolverSettings,
  type TierKey,
} from "@/lib/grid-solver-settings";
import { useI18n } from "@/lib/use-i18n";

type TierValues = Record<TierKey, string>;

type ToggleNumber = { enabled: boolean; value: string };
type ToggleBoolean = { enabled: boolean; value: boolean };
type ToggleTierValues = { enabled: boolean; values: TierValues };

type FormState = {
  unit_nooverlap_enabled: boolean;
  max_hours_day_by_tier: ToggleTierValues;
  max_hours_week_by_tier: ToggleTierValues;
  min_hours_week_by_tier: ToggleTierValues;
  min_hours_week_hard: ToggleBoolean;
  min_hours_week_weight: ToggleNumber;
  unit_max_hours_day: ToggleNumber;
  min_rest_hours: ToggleNumber;
  stability_weight: ToggleNumber;
};

type DayHeatmapKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type DayHeatmapValues = Record<DayHeatmapKey, 1 | 2 | 3>;
type DayHeatmapApiInput = Partial<Record<string, number>> | null;

type TimeRangeResource = {
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
  rowError: string | null;
};

type TimeRangeListResponse = {
  results?: TimeRangeResource[];
};

const DAY_INDEX_TO_KEY: Record<number, DayHeatmapKey> = {
  0: "Mon",
  1: "Tue",
  2: "Wed",
  3: "Thu",
  4: "Fri",
  5: "Sat",
  6: "Sun",
};

const DAY_KEY_TO_I18N: Record<DayHeatmapKey, "day.mon_short" | "day.tue_short" | "day.wed_short" | "day.thu_short" | "day.fri_short" | "day.sat_short" | "day.sun_short"> = {
  Mon: "day.mon_short",
  Tue: "day.tue_short",
  Wed: "day.wed_short",
  Thu: "day.thu_short",
  Fri: "day.fri_short",
  Sat: "day.sat_short",
  Sun: "day.sun_short",
};

const DAY_KEY_TO_INDEX: Record<DayHeatmapKey, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function emptyTierValues(): TierValues {
  return { PRIMARY: "", SECONDARY: "", TERTIARY: "" };
}

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

function normalizeHeatmapValue(value: unknown): 1 | 2 | 3 {
  const n = Number(value);
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 1;
}

function parseHeatmapDayIndex(rawKey: string): number | null {
  const n = Number(rawKey);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n;
  const fromLegacy = DAY_KEY_TO_INDEX[rawKey as DayHeatmapKey];
  return Number.isInteger(fromLegacy) ? fromLegacy : null;
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

function toTierValues(map: Record<TierKey, number> | undefined): ToggleTierValues {
  if (!map) return { enabled: false, values: emptyTierValues() };
  return {
    enabled: true,
    values: {
      PRIMARY: String(map.PRIMARY),
      SECONDARY: String(map.SECONDARY),
      TERTIARY: String(map.TERTIARY),
    },
  };
}

function toToggleNumber(value: number | undefined): ToggleNumber {
  if (typeof value !== "number" || !Number.isFinite(value)) return { enabled: false, value: "" };
  return { enabled: true, value: String(value) };
}

function toToggleBoolean(value: boolean | undefined): ToggleBoolean {
  if (typeof value !== "boolean") return { enabled: false, value: false };
  return { enabled: true, value };
}

function fromParsedSettings(settings: GridSolverSettings): FormState {
  return {
    unit_nooverlap_enabled: settings.unit_nooverlap_enabled ?? DEFAULT_UNIT_NOOVERLAP_ENABLED,
    max_hours_day_by_tier: toTierValues(settings.max_hours_day_by_tier),
    max_hours_week_by_tier: toTierValues(settings.max_hours_week_by_tier),
    min_hours_week_by_tier: toTierValues(settings.min_hours_week_by_tier),
    min_hours_week_hard: toToggleBoolean(settings.min_hours_week_hard),
    min_hours_week_weight: toToggleNumber(settings.min_hours_week_weight),
    unit_max_hours_day: toToggleNumber(settings.unit_max_hours_day),
    min_rest_hours: toToggleNumber(settings.min_rest_hours),
    stability_weight: toToggleNumber(settings.stability_weight),
  };
}

function parseNumeric(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function tierValuesToPayload(input: ToggleTierValues): Record<TierKey, number> | undefined {
  if (!input.enabled) return undefined;
  const out = {} as Record<TierKey, number>;
  for (const tier of TIER_KEYS) {
    const parsed = parseNumeric(input.values[tier]);
    if (parsed === undefined) return undefined;
    out[tier] = parsed;
  }
  return out;
}

function toSettingsPayload(state: FormState): GridSolverSettings {
  const payload: GridSolverSettings = {
    unit_nooverlap_enabled: state.unit_nooverlap_enabled,
  };

  const maxDayByTier = tierValuesToPayload(state.max_hours_day_by_tier);
  if (maxDayByTier) payload.max_hours_day_by_tier = maxDayByTier;

  const maxWeekByTier = tierValuesToPayload(state.max_hours_week_by_tier);
  if (maxWeekByTier) payload.max_hours_week_by_tier = maxWeekByTier;

  const minWeekByTier = tierValuesToPayload(state.min_hours_week_by_tier);
  if (minWeekByTier) payload.min_hours_week_by_tier = minWeekByTier;

  if (state.min_hours_week_hard.enabled) payload.min_hours_week_hard = state.min_hours_week_hard.value;

  if (state.min_hours_week_weight.enabled) {
    const parsed = parseNumeric(state.min_hours_week_weight.value);
    if (parsed !== undefined) payload.min_hours_week_weight = parsed;
  }

  if (state.unit_max_hours_day.enabled) {
    const parsed = parseNumeric(state.unit_max_hours_day.value);
    if (parsed !== undefined) payload.unit_max_hours_day = parsed;
  }

  if (state.min_rest_hours.enabled) {
    const parsed = parseNumeric(state.min_rest_hours.value);
    if (parsed !== undefined) payload.min_rest_hours = parsed;
  }

  if (state.stability_weight.enabled) {
    const parsed = parseNumeric(state.stability_weight.value);
    if (parsed !== undefined) payload.stability_weight = Math.max(0, Math.min(100, parsed));
  }

  return buildSolverParamsPayload(payload);
}

function TierInputs({
  title,
  helper,
  value,
  tierLabels,
  placeholder,
  onEnabledChange,
  onValueChange,
}: {
  title: string;
  helper: string;
  value: ToggleTierValues;
  tierLabels: Record<TierKey, string>;
  placeholder: string;
  onEnabledChange: (next: boolean) => void;
  onValueChange: (tier: TierKey, next: string) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div className="w-full">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-600">{helper}</div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TIER_KEYS.map((tier) => (
              <div key={tier}>
                <div className="mb-1 text-xs text-gray-600">{tierLabels[tier]}</div>
                <input
                  type="number"
                  step="1"
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={value.values[tier]}
                  disabled={!value.enabled}
                  onChange={(e) => onValueChange(tier, e.target.value)}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </div>
      </label>
    </div>
  );
}

function NumberOption({
  title,
  helper,
  value,
  min,
  max,
  step = 1,
  onEnabledChange,
  onValueChange,
}: {
  title: string;
  helper: string;
  value: ToggleNumber;
  min?: number;
  max?: number;
  step?: number;
  onEnabledChange: (next: boolean) => void;
  onValueChange: (next: string) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div className="w-full">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-600">{helper}</div>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            className="mt-3 w-full rounded border px-2 py-1 text-sm sm:w-56"
            value={value.value}
            disabled={!value.enabled}
            onChange={(e) => onValueChange(e.target.value)}
          />
        </div>
      </label>
    </div>
  );
}

function BooleanOption({
  title,
  helper,
  value,
  enabledLabel,
  onEnabledChange,
  onValueChange,
}: {
  title: string;
  helper: string;
  value: ToggleBoolean;
  enabledLabel: string;
  onEnabledChange: (next: boolean) => void;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div className="w-full">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-600">{helper}</div>
          <div className="mt-3">
            <label className={`inline-flex items-center gap-2 text-sm ${value.enabled ? "" : "text-gray-500"}`}>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={value.value}
                disabled={!value.enabled}
                onChange={(e) => onValueChange(e.target.checked)}
              />
              {enabledLabel}
            </label>
          </div>
        </div>
      </label>
    </div>
  );
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function DayHeatmapChart({
  dayKeys,
  values,
  getDayLabel,
  onChange,
}: {
  dayKeys: DayHeatmapKey[];
  values: DayHeatmapValues;
  getDayLabel: (dayKey: DayHeatmapKey) => string;
  onChange: (dayKey: DayHeatmapKey, nextValue: 1 | 2 | 3) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeDay, setActiveDay] = useState<DayHeatmapKey | null>(null);

  const width = 760;
  const height = 320;
  const plotLeft = 104;
  const plotRight = 22;
  const plotTop = 22;
  const plotBottom = 62;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = height - plotTop - plotBottom;

  const yForValue = useCallback(
    (value: 1 | 2 | 3) => plotTop + ((3 - value) / 2) * plotHeight,
    [plotHeight, plotTop],
  );

  const points = useMemo(
    () =>
      dayKeys.map((dayKey, index) => {
        const x =
          dayKeys.length <= 1
            ? plotLeft + plotWidth / 2
            : plotLeft + (index * plotWidth) / Math.max(1, dayKeys.length - 1);
        const y = yForValue(values[dayKey]);
        return { dayKey, x, y };
      }),
    [dayKeys, plotLeft, plotWidth, values, yForValue],
  );

  const pathD = useMemo(() => buildSmoothPath(points), [points]);

  const valueFromClientY = useCallback(
    (clientY: number): 1 | 2 | 3 => {
      const svg = svgRef.current;
      if (!svg) return 1;
      const rect = svg.getBoundingClientRect();
      if (rect.height <= 0) return 1;
      const localY = ((clientY - rect.top) / rect.height) * height;
      const clampedY = clamp(localY, plotTop, plotTop + plotHeight);
      const ratio = 1 - (clampedY - plotTop) / plotHeight;
      const raw = 1 + ratio * 2;
      if (raw < 1.5) return 1;
      if (raw < 2.5) return 2;
      return 3;
    },
    [height, plotHeight, plotTop],
  );

  useEffect(() => {
    if (!activeDay) return;
    const onMove = (event: PointerEvent) => {
      onChange(activeDay, valueFromClientY(event.clientY));
    };
    const onEnd = () => setActiveDay(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [activeDay, onChange, valueFromClientY]);

  if (dayKeys.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="h-[320px] w-full rounded border bg-white select-none"
    >
      <g>
        <rect x={22} y={plotTop} width={22} height={plotHeight / 3} fill="#ef4444" />
        <rect x={22} y={plotTop + plotHeight / 3} width={22} height={plotHeight / 3} fill="#facc15" />
        <rect x={22} y={plotTop + (2 * plotHeight) / 3} width={22} height={plotHeight / 3} fill="#22c55e" />
        <rect x={22} y={plotTop} width={22} height={plotHeight} fill="none" stroke="#111827" strokeWidth={2} />

        {[3, 2, 1].map((v) => (
          <text
            key={`heatmap-y-label-${v}`}
            x={10}
            y={yForValue(v as 1 | 2 | 3) + 4}
            fontSize={14}
            fill="#374151"
            textAnchor="end"
          >
            {v}
          </text>
        ))}
      </g>

      {[2, 3].map((v) => (
        <line
          key={`heatmap-guide-${v}`}
          x1={plotLeft}
          x2={width - plotRight}
          y1={yForValue(v as 1 | 2 | 3)}
          y2={yForValue(v as 1 | 2 | 3)}
          stroke="#9ca3af"
          strokeWidth={1}
        />
      ))}

      {pathD && <path d={pathD} fill="none" stroke="#111827" strokeWidth={4} strokeLinecap="round" />}

      {points.map((point) => (
        <g key={`heatmap-node-${point.dayKey}`}>
          <circle cx={point.x} cy={point.y} r={6} fill="#111827" />
          <circle cx={point.x} cy={point.y} r={4} fill="#ffffff" />
          <circle
            cx={point.x}
            cy={point.y}
            r={16}
            fill="transparent"
            style={{ cursor: "ns-resize" }}
            onPointerDown={(event) => {
              event.preventDefault();
              setActiveDay(point.dayKey);
              onChange(point.dayKey, valueFromClientY(event.clientY));
            }}
            onClick={(event) => {
              event.preventDefault();
              onChange(point.dayKey, valueFromClientY(event.clientY));
            }}
          />
          <text x={point.x} y={height - 14} fontSize={14} fill="#111827" textAnchor="middle">
            {getDayLabel(point.dayKey)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function GridSolverSettingsForm({
  gridId,
  daysEnabled,
  horizonStart,
  horizonEnd,
  initialDayHeatmap,
  cellSizeMin,
}: {
  gridId: number;
  daysEnabled: number[];
  horizonStart: string;
  horizonEnd: string;
  initialDayHeatmap?: DayHeatmapApiInput;
  cellSizeMin: number;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<FormState | null>(null);
  const [heatmapSaving, setHeatmapSaving] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapSaved, setHeatmapSaved] = useState<string | null>(null);
  const [timeRanges, setTimeRanges] = useState<TimeRangeDraft[]>([]);
  const [timeRangesLoading, setTimeRangesLoading] = useState(false);
  const [timeRangesError, setTimeRangesError] = useState<string | null>(null);
  const [newTimeRangeName, setNewTimeRangeName] = useState("");
  const [creatingTimeRange, setCreatingTimeRange] = useState(false);
  const [busyByTimeRangeId, setBusyByTimeRangeId] = useState<Record<number, boolean>>({});

  const tierLabels: Record<TierKey, string> = {
    PRIMARY: t("tier.primary"),
    SECONDARY: t("tier.secondary"),
    TERTIARY: t("tier.tertiary"),
  };

  const enabledDayKeys = useMemo<DayHeatmapKey[]>(
    () =>
      Array.from(
        new Set(
          (Array.isArray(daysEnabled) ? daysEnabled : [])
            .map((dayIndex) => DAY_INDEX_TO_KEY[dayIndex])
            .filter((value): value is DayHeatmapKey => Boolean(value)),
        ),
      ),
    [daysEnabled],
  );

  const normalizedInitialHeatmap = useMemo<DayHeatmapValues>(() => {
    const base: DayHeatmapValues = {
      Mon: 1,
      Tue: 1,
      Wed: 1,
      Thu: 1,
      Fri: 1,
      Sat: 1,
      Sun: 1,
    };
    const source = initialDayHeatmap ?? {};
    for (const rawKey of Object.keys(source)) {
      const dayIndex = parseHeatmapDayIndex(rawKey);
      if (dayIndex === null) continue;
      const dayKey = DAY_INDEX_TO_KEY[dayIndex];
      if (!dayKey) continue;
      base[dayKey] = normalizeHeatmapValue(source[rawKey]);
    }
    return base;
  }, [initialDayHeatmap]);

  const [dayHeatmapValues, setDayHeatmapValues] = useState<DayHeatmapValues>(normalizedInitialHeatmap);

  useEffect(() => {
    setDayHeatmapValues(normalizedInitialHeatmap);
  }, [normalizedInitialHeatmap]);

  const enabledDaysCount = enabledDayKeys.length;
  const heatmapUpgradeSum = useMemo(
    () => enabledDayKeys.reduce((sum, dayKey) => sum + (dayHeatmapValues[dayKey] - 1), 0),
    [dayHeatmapValues, enabledDayKeys],
  );
  const heatmapBudget = 2 + Math.floor((Math.max(0, enabledDaysCount - 1)) / 2);
  const heatmapBudgetExceeded = heatmapUpgradeSum > heatmapBudget;
  const heatmapBudgetRatio = heatmapBudget > 0 ? Math.min(1, heatmapUpgradeSum / heatmapBudget) : 0;
  const heatmapBudgetExceededMessage = useMemo(
    () =>
      `Heatmap budget exceeded: you used ${heatmapUpgradeSum} upgrade points, max allowed is ${heatmapBudget} for ${enabledDaysCount} days.`,
    [enabledDaysCount, heatmapBudget, heatmapUpgradeSum],
  );

  const horizonStartMin = useMemo(() => parseClockToMin(horizonStart), [horizonStart]);
  const horizonEndMin = useMemo(() => {
    const raw = parseClockToMin(horizonEnd);
    if (raw > horizonStartMin) return raw;
    return horizonStartMin + Math.max(30, cellSizeMin || 30);
  }, [cellSizeMin, horizonEnd, horizonStartMin]);
  const horizonSpanMin = useMemo(() => Math.max(1, horizonEndMin - horizonStartMin), [horizonEndMin, horizonStartMin]);
  const timeRangeStep = useMemo(() => Math.max(1, Number(cellSizeMin) || 5), [cellSizeMin]);

  const toTimeRangeDraft = useCallback(
    (item: TimeRangeResource): TimeRangeDraft => {
      const startRaw = parseClockToMin(String(item.start_time ?? ""));
      const endRaw = parseClockToMin(String(item.end_time ?? ""));
      let startOffsetMin = clamp(startRaw - horizonStartMin, 0, horizonSpanMin);
      let endOffsetMin = clamp(endRaw - horizonStartMin, 0, horizonSpanMin);

      if (endOffsetMin <= startOffsetMin) {
        endOffsetMin = clamp(startOffsetMin + timeRangeStep, timeRangeStep, horizonSpanMin);
      }
      if (startOffsetMin >= endOffsetMin) {
        startOffsetMin = clamp(endOffsetMin - timeRangeStep, 0, Math.max(0, horizonSpanMin - timeRangeStep));
      }

      return {
        id: Number(item.id),
        name: String(item.name ?? `${t("entity.time_range")} ${item.id}`),
        startOffsetMin,
        endOffsetMin,
        rowError: null,
      };
    },
    [horizonSpanMin, horizonStartMin, t, timeRangeStep],
  );

  const loadTimeRanges = useCallback(async () => {
    setTimeRangesLoading(true);
    setTimeRangesError(null);
    try {
      const response = await fetch(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("time_ranges.error_loading")));
      }

      const payload = (await response.json().catch(() => ({}))) as TimeRangeResource[] | TimeRangeListResponse;
      const list = Array.isArray(payload) ? payload : Array.isArray(payload.results) ? payload.results : [];
      const nextRanges = list
        .map((item) => toTimeRangeDraft(item))
        .filter((item) => Number.isFinite(item.id))
        .sort((a, b) => a.startOffsetMin - b.startOffsetMin || a.endOffsetMin - b.endOffsetMin || a.id - b.id);
      setTimeRanges(nextRanges);
    } catch (error: unknown) {
      setTimeRangesError(error instanceof Error ? error.message : t("time_ranges.error_loading"));
    } finally {
      setTimeRangesLoading(false);
    }
  }, [gridId, t, toTimeRangeDraft]);

  useEffect(() => {
    void loadTimeRanges();
  }, [loadTimeRanges]);

  useEffect(() => {
    const key = getGridSolverSettingsKey(gridId);
    const parsed = parseGridSolverSettings(window.localStorage.getItem(key));
    setState(fromParsedSettings(parsed));
  }, [gridId]);

  useEffect(() => {
    if (!state) return;
    const key = getGridSolverSettingsKey(gridId);
    const payload = toSettingsPayload(state);
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, [gridId, state]);

  const previewPayload = useMemo(() => (state ? toSettingsPayload(state) : null), [state]);

  const setRowBusy = (id: number, next: boolean) => {
    setBusyByTimeRangeId((prev) => ({ ...prev, [id]: next }));
  };

  const saveDayHeatmap = async () => {
    setHeatmapSaved(null);
    if (heatmapBudgetExceeded) {
      setHeatmapError(heatmapBudgetExceededMessage);
      return;
    }

    setHeatmapSaving(true);
    setHeatmapError(null);
    try {
      const payload: Record<string, number> = {};
      for (const dayKey of enabledDayKeys) {
        payload[String(DAY_KEY_TO_INDEX[dayKey])] = dayHeatmapValues[dayKey];
      }

      const response = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day_heatmap: payload }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.heatmap_save_failed")));
      }
      setHeatmapSaved(t("grid_solver_settings.heatmap_saved"));
    } catch (error: unknown) {
      setHeatmapError(error instanceof Error ? error.message : t("grid_solver_settings.heatmap_save_failed"));
    } finally {
      setHeatmapSaving(false);
    }
  };

  const addTimeRange = async () => {
    if (!newTimeRangeName.trim()) {
      setTimeRangesError(t("grid_solver_settings.time_ranges_name_required"));
      return;
    }

    setCreatingTimeRange(true);
    setTimeRangesError(null);
    try {
      const response = await fetch("/api/time_ranges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: newTimeRangeName.trim(),
          start_time: minutesToClock(horizonStartMin),
          end_time: minutesToClock(horizonEndMin),
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_create_failed")));
      }
      setNewTimeRangeName("");
      await loadTimeRanges();
    } catch (error: unknown) {
      setTimeRangesError(
        error instanceof Error ? error.message : t("grid_solver_settings.time_ranges_create_failed"),
      );
    } finally {
      setCreatingTimeRange(false);
    }
  };

  const saveTimeRange = async (id: number) => {
    const current = timeRanges.find((entry) => entry.id === id);
    if (!current) return;

    if (!current.name.trim()) {
      setTimeRanges((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, rowError: t("grid_solver_settings.time_ranges_name_required") } : entry,
        ),
      );
      return;
    }

    if (current.endOffsetMin <= current.startOffsetMin) {
      setTimeRanges((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, rowError: t("grid_solver_settings.time_ranges_invalid") } : entry,
        ),
      );
      return;
    }

    setRowBusy(id, true);
    setTimeRanges((prev) => prev.map((entry) => (entry.id === id ? { ...entry, rowError: null } : entry)));
    try {
      const response = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: current.name.trim(),
          start_time: minutesToClock(horizonStartMin + current.startOffsetMin),
          end_time: minutesToClock(horizonStartMin + current.endOffsetMin),
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_save_failed")));
      }
      await loadTimeRanges();
    } catch (error: unknown) {
      const rowMessage =
        error instanceof Error ? error.message : t("grid_solver_settings.time_ranges_save_failed");
      setTimeRanges((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, rowError: rowMessage } : entry)),
      );
    } finally {
      setRowBusy(id, false);
    }
  };

  const deleteTimeRange = async (id: number) => {
    if (!window.confirm(t("time_ranges.delete_confirm"))) return;

    setRowBusy(id, true);
    setTimeRangesError(null);
    try {
      const response = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("grid_solver_settings.time_ranges_delete_failed")));
      }
      setTimeRanges((prev) => prev.filter((entry) => entry.id !== id));
    } catch (error: unknown) {
      setTimeRangesError(
        error instanceof Error ? error.message : t("grid_solver_settings.time_ranges_delete_failed"),
      );
    } finally {
      setRowBusy(id, false);
    }
  };

  if (!state) {
    return (
      <div className="max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t("grid_solver_settings.title")}</h1>
        <p className="mt-4 text-sm text-gray-600">{t("grid_solver_settings.loading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">{t("grid_solver_settings.title")}</h1>
      <p className="mt-2 text-sm text-gray-600">{t("grid_solver_settings.runtime_options")}</p>

      <div className="mt-6 space-y-4">
        <div className="rounded-md border p-4">
          <div className="text-sm font-medium">{t("grid_solver_settings.day_heatmap_title")}</div>
          <div className="text-xs text-gray-600">{t("grid_solver_settings.day_heatmap_help")}</div>

          <div className="mt-4">
            {enabledDayKeys.length > 0 ? (
              <DayHeatmapChart
                dayKeys={enabledDayKeys}
                values={dayHeatmapValues}
                getDayLabel={(dayKey) => t(DAY_KEY_TO_I18N[dayKey])}
                onChange={(dayKey, nextValue) => {
                  setHeatmapSaved(null);
                  setDayHeatmapValues((prev) => ({ ...prev, [dayKey]: nextValue }));
                }}
              />
            ) : (
              <div className="rounded border border-dashed px-3 py-2 text-sm text-gray-500">
                {t("grid_solver_settings.no_enabled_days")}
              </div>
            )}
          </div>

          <div className="mt-4 rounded border bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
              <span>{t("grid_solver_settings.budget_meter")}</span>
              <span>
                {heatmapUpgradeSum}/{heatmapBudget}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-gray-200">
              <div
                className={`${heatmapBudgetExceeded ? "bg-red-500" : "bg-black"} h-2 transition-all`}
                style={{ width: `${Math.round(heatmapBudgetRatio * 100)}%` }}
              />
            </div>
            {heatmapError && <div className="mt-2 text-sm text-red-600">{heatmapError}</div>}
            {heatmapSaved && !heatmapError && <div className="mt-2 text-sm text-emerald-700">{heatmapSaved}</div>}
            <div className="mt-3 text-right">
              <button
                type="button"
                className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                onClick={() => void saveDayHeatmap()}
                disabled={heatmapSaving || enabledDayKeys.length === 0}
              >
                {heatmapSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <div className="text-sm font-medium">{t("grid_solver_settings.time_ranges_title")}</div>
          <div className="text-xs text-gray-600">{t("grid_solver_settings.time_ranges_help")}</div>
          <div className="mt-2 text-xs text-gray-500">
            {t("grid_solver_settings.time_ranges_horizon", {
              start: minutesToClock(horizonStartMin),
              end: minutesToClock(horizonEndMin),
            })}
          </div>

          {timeRangesError && <div className="mt-3 text-sm text-red-600">{timeRangesError}</div>}

          <div className="mt-3 flex gap-2">
            <input
              className="w-full rounded border px-2 py-1 text-sm"
              value={newTimeRangeName}
              onChange={(e) => setNewTimeRangeName(e.target.value)}
              placeholder={t("time_ranges.add_new")}
            />
            <button
              type="button"
              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
              disabled={creatingTimeRange}
              onClick={() => void addTimeRange()}
            >
              {creatingTimeRange ? t("common.saving") : t("common.add")}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {timeRangesLoading ? (
              <div className="text-sm text-gray-500">{t("common.loading")}</div>
            ) : timeRanges.length === 0 ? (
              <div className="text-sm text-gray-500">{t("time_ranges.no_items")}</div>
            ) : (
              timeRanges.map((entry) => {
                const busy = Boolean(busyByTimeRangeId[entry.id]);
                const startPercent = (entry.startOffsetMin / horizonSpanMin) * 100;
                const endPercent = (entry.endOffsetMin / horizonSpanMin) * 100;
                const startMax = Math.max(0, entry.endOffsetMin - timeRangeStep);
                const endMin = Math.min(horizonSpanMin, entry.startOffsetMin + timeRangeStep);
                return (
                  <div key={`time-range-setting-${entry.id}`} className="rounded border p-3">
                    <input
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={entry.name}
                      onChange={(e) =>
                        setTimeRanges((prev) =>
                          prev.map((range) =>
                            range.id === entry.id ? { ...range, name: e.target.value, rowError: null } : range,
                          ),
                        )
                      }
                      disabled={busy}
                    />

                    <div className="mt-3">
                      <div className="relative h-2 rounded bg-gray-200">
                        <div
                          className="absolute top-0 h-2 rounded bg-black"
                          style={{
                            left: `${startPercent}%`,
                            width: `${Math.max(0, endPercent - startPercent)}%`,
                          }}
                        />
                        <div
                          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-black bg-white"
                          style={{ left: `calc(${startPercent}% - 8px)` }}
                        />
                        <div
                          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-black bg-white"
                          style={{ left: `calc(${endPercent}% - 8px)` }}
                        />

                        <input
                          type="range"
                          min={0}
                          max={startMax}
                          step={timeRangeStep}
                          value={entry.startOffsetMin}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setTimeRanges((prev) =>
                              prev.map((range) =>
                                range.id === entry.id
                                  ? {
                                      ...range,
                                      startOffsetMin: clamp(next, 0, Math.max(0, range.endOffsetMin - timeRangeStep)),
                                      rowError: null,
                                    }
                                  : range,
                              ),
                            );
                          }}
                          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 cursor-ew-resize opacity-0"
                          style={{ width: `${Math.max(endPercent, 8)}%` }}
                          disabled={busy}
                        />
                        <input
                          type="range"
                          min={endMin}
                          max={horizonSpanMin}
                          step={timeRangeStep}
                          value={entry.endOffsetMin}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setTimeRanges((prev) =>
                              prev.map((range) =>
                                range.id === entry.id
                                  ? {
                                      ...range,
                                      endOffsetMin: clamp(
                                        next,
                                        Math.min(horizonSpanMin, range.startOffsetMin + timeRangeStep),
                                        horizonSpanMin,
                                      ),
                                      rowError: null,
                                    }
                                  : range,
                              ),
                            );
                          }}
                          className="absolute top-1/2 h-2 -translate-y-1/2 cursor-ew-resize opacity-0"
                          style={{
                            left: `${Math.min(startPercent, 92)}%`,
                            width: `${Math.max(100 - startPercent, 8)}%`,
                          }}
                          disabled={busy}
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                      <span>{minutesToClock(horizonStartMin + entry.startOffsetMin)}</span>
                      <span>{minutesToClock(horizonStartMin + entry.endOffsetMin)}</span>
                    </div>

                    {entry.rowError && <div className="mt-2 text-sm text-red-600">{entry.rowError}</div>}

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded border px-3 py-1.5 text-sm text-red-600 disabled:opacity-60"
                        onClick={() => void deleteTimeRange(entry.id)}
                        disabled={busy}
                      >
                        {t("common.delete")}
                      </button>
                      <button
                        type="button"
                        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                        onClick={() => void saveTimeRange(entry.id)}
                        disabled={busy}
                      >
                        {busy ? t("common.saving") : t("common.save")}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-md border p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={state.unit_nooverlap_enabled}
              onChange={(e) =>
                setState((prev) => (prev ? { ...prev, unit_nooverlap_enabled: e.target.checked } : prev))
              }
            />
            <div>
              <div className="text-sm font-medium">{t("grid_solver_settings.prevent_overlap_title")}</div>
              <div className="text-sm text-gray-600">{t("grid_solver_settings.prevent_overlap_help")}</div>
            </div>
          </label>
        </div>

        <TierInputs
          title={t("grid_solver_settings.max_hours_day_title")}
          helper={t("grid_solver_settings.max_hours_day_help")}
          value={state.max_hours_day_by_tier}
          tierLabels={tierLabels}
          placeholder={t("grid_solver_settings.placeholder_example_8")}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, max_hours_day_by_tier: { ...prev.max_hours_day_by_tier, enabled } } : prev,
            )
          }
          onValueChange={(tier, next) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    max_hours_day_by_tier: {
                      ...prev.max_hours_day_by_tier,
                      values: { ...prev.max_hours_day_by_tier.values, [tier]: next },
                    },
                  }
                : prev,
            )
          }
        />

        <TierInputs
          title={t("grid_solver_settings.max_hours_week_title")}
          helper={t("grid_solver_settings.max_hours_week_help")}
          value={state.max_hours_week_by_tier}
          tierLabels={tierLabels}
          placeholder={t("grid_solver_settings.placeholder_example_8")}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, max_hours_week_by_tier: { ...prev.max_hours_week_by_tier, enabled } } : prev,
            )
          }
          onValueChange={(tier, next) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    max_hours_week_by_tier: {
                      ...prev.max_hours_week_by_tier,
                      values: { ...prev.max_hours_week_by_tier.values, [tier]: next },
                    },
                  }
                : prev,
            )
          }
        />

        <TierInputs
          title={t("grid_solver_settings.min_hours_week_title")}
          helper={t("grid_solver_settings.min_hours_week_help")}
          value={state.min_hours_week_by_tier}
          tierLabels={tierLabels}
          placeholder={t("grid_solver_settings.placeholder_example_8")}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, min_hours_week_by_tier: { ...prev.min_hours_week_by_tier, enabled } } : prev,
            )
          }
          onValueChange={(tier, next) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    min_hours_week_by_tier: {
                      ...prev.min_hours_week_by_tier,
                      values: { ...prev.min_hours_week_by_tier.values, [tier]: next },
                    },
                  }
                : prev,
            )
          }
        />

        <BooleanOption
          title={t("grid_solver_settings.min_hours_week_hard_title")}
          helper={t("grid_solver_settings.min_hours_week_hard_help")}
          value={state.min_hours_week_hard}
          enabledLabel={t("grid_solver_settings.enabled")}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, min_hours_week_hard: { ...prev.min_hours_week_hard, enabled } } : prev,
            )
          }
          onValueChange={(next) =>
            setState((prev) =>
              prev ? { ...prev, min_hours_week_hard: { ...prev.min_hours_week_hard, value: next } } : prev,
            )
          }
        />

        <NumberOption
          title={t("grid_solver_settings.min_hours_shortfall_weight_title")}
          helper={t("grid_solver_settings.min_hours_shortfall_weight_help")}
          value={state.min_hours_week_weight}
          min={0}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, min_hours_week_weight: { ...prev.min_hours_week_weight, enabled } } : prev,
            )
          }
          onValueChange={(next) =>
            setState((prev) =>
              prev ? { ...prev, min_hours_week_weight: { ...prev.min_hours_week_weight, value: next } } : prev,
            )
          }
        />

        <NumberOption
          title={t("grid_solver_settings.unit_max_hours_day_title")}
          helper={t("grid_solver_settings.unit_max_hours_day_help")}
          value={state.unit_max_hours_day}
          min={0}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, unit_max_hours_day: { ...prev.unit_max_hours_day, enabled } } : prev,
            )
          }
          onValueChange={(next) =>
            setState((prev) =>
              prev ? { ...prev, unit_max_hours_day: { ...prev.unit_max_hours_day, value: next } } : prev,
            )
          }
        />

        <NumberOption
          title={t("grid_solver_settings.min_rest_hours_title")}
          helper={t("grid_solver_settings.min_rest_hours_help")}
          value={state.min_rest_hours}
          min={0}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, min_rest_hours: { ...prev.min_rest_hours, enabled } } : prev,
            )
          }
          onValueChange={(next) =>
            setState((prev) =>
              prev ? { ...prev, min_rest_hours: { ...prev.min_rest_hours, value: next } } : prev,
            )
          }
        />

        <NumberOption
          title={t("grid_solver_settings.stability_weight_title")}
          helper={t("grid_solver_settings.stability_weight_help")}
          value={state.stability_weight}
          min={0}
          max={100}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, stability_weight: { ...prev.stability_weight, enabled } } : prev,
            )
          }
          onValueChange={(next) =>
            setState((prev) =>
              prev ? { ...prev, stability_weight: { ...prev.stability_weight, value: next } } : prev,
            )
          }
        />
      </div>

      {previewPayload && (
        <div className="mt-6 rounded-md border bg-gray-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            {t("grid_solver_settings.payload_preview")}
          </div>
          <pre className="overflow-auto text-xs text-gray-700">{JSON.stringify(previewPayload, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
