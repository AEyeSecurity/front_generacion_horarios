"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  OBJECTIVE_WEIGHT_DEFAULTS,
  OBJECTIVE_WEIGHT_KEYS,
  TIER_KEYS,
  buildSolverParamsPayload,
  getGridSolverSettingsKey,
  type GridSolverSettings,
  type ObjectiveWeightKey,
  type TierHours,
} from "@/lib/grid-solver-settings";
import { useI18n } from "@/lib/use-i18n";

type TierKey = (typeof TIER_KEYS)[number];
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

type GridDetailResponse = {
  id?: number;
  solver_params?: Record<string, unknown> | null;
  solve_preference?: {
    solver_params?: Record<string, unknown> | null;
    base_weights?: Record<string, unknown> | null;
  } | null;
  base_weights?: Record<string, unknown> | null;
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

const DAY_KEY_TO_I18N: Record<
  DayHeatmapKey,
  "day.mon_short" | "day.tue_short" | "day.wed_short" | "day.thu_short" | "day.fri_short" | "day.sat_short" | "day.sun_short"
> = {
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

type ObjectiveWeightRow = {
  key: ObjectiveWeightKey;
  label: string;
  help: string;
  min: number;
  max?: number;
  step: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim() !== "") {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
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

function createEmptyTierInput(): Record<TierKey, string> {
  return {
    PRIMARY: "",
    SECONDARY: "",
    TERTIARY: "",
  };
}

function parseTierHoursFromUnknown(input: unknown): TierHours | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  const out = {} as TierHours;
  for (const tier of TIER_KEYS) {
    const parsed = parseFiniteNumber(rec[tier]);
    if (parsed === undefined || parsed < 0) return null;
    out[tier] = parsed;
  }
  return out;
}

function formatTierHoursInput(hours: TierHours | null): Record<TierKey, string> {
  if (!hours) return createEmptyTierInput();
  return {
    PRIMARY: String(hours.PRIMARY),
    SECONDARY: String(hours.SECONDARY),
    TERTIARY: String(hours.TERTIARY),
  };
}

function parseTierHoursForSave(
  source: Record<TierKey, string>,
  label: string,
): { value?: TierHours; error?: string } {
  const trimmed = TIER_KEYS.map((tier) => source[tier].trim());
  const hasAny = trimmed.some((value) => value !== "");
  if (!hasAny) return {};
  const hasMissing = trimmed.some((value) => value === "");
  if (hasMissing) {
    return { error: `${label}: all tier values are required once you start filling this field.` };
  }
  const out = {} as TierHours;
  for (const tier of TIER_KEYS) {
    const parsed = parseFiniteNumber(source[tier]);
    if (parsed === undefined || parsed < 0) {
      return { error: `${label}: values must be valid non-negative numbers.` };
    }
    out[tier] = parsed;
  }
  return { value: out };
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
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string | number>) => {
      const translated = t(key as never, params);
      return translated === key ? fallback : translated;
    },
    [t],
  );

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);

  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [weightsSaving, setWeightsSaving] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightsSaved, setWeightsSaved] = useState<string | null>(null);

  const [unitNoOverlapEnabled, setUnitNoOverlapEnabled] = useState(DEFAULT_UNIT_NOOVERLAP_ENABLED);
  const [minRestHours, setMinRestHours] = useState("");
  const [maxHoursDayByTier, setMaxHoursDayByTier] = useState<Record<TierKey, string>>(createEmptyTierInput());
  const [maxHoursWeekByTier, setMaxHoursWeekByTier] = useState<Record<TierKey, string>>(createEmptyTierInput());
  const [minHoursWeekByTier, setMinHoursWeekByTier] = useState<Record<TierKey, string>>(createEmptyTierInput());
  const [objectiveWeights, setObjectiveWeights] = useState<Record<ObjectiveWeightKey, string>>(() => {
    const initial = {} as Record<ObjectiveWeightKey, string>;
    for (const key of OBJECTIVE_WEIGHT_KEYS) initial[key] = String(OBJECTIVE_WEIGHT_DEFAULTS[key]);
    return initial;
  });
  const solverParamsRef = useRef<Record<string, unknown>>({});

  const [heatmapSaving, setHeatmapSaving] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapSaved, setHeatmapSaved] = useState<string | null>(null);

  const [timeRanges, setTimeRanges] = useState<TimeRangeDraft[]>([]);
  const [timeRangesLoading, setTimeRangesLoading] = useState(false);
  const [timeRangesError, setTimeRangesError] = useState<string | null>(null);
  const [newTimeRangeName, setNewTimeRangeName] = useState("");
  const [creatingTimeRange, setCreatingTimeRange] = useState(false);
  const [busyByTimeRangeId, setBusyByTimeRangeId] = useState<Record<number, boolean>>({});

  const objectiveWeightRows = useMemo<ObjectiveWeightRow[]>(
    () => [
      {
        key: "weight_availability",
        label: "Availability respect",
        help: "Higher values make the solver prioritize respecting participant availability.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_participant_gap",
        label: "Participant gap minimization",
        help: "Higher values push the solver to avoid idle gaps within participant days.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_participant_days",
        label: "Participant day concentration",
        help: "Higher values encourage concentrating each participant's activities into fewer days.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_unit_gap",
        label: "Unit gap minimization",
        help: "Higher values reduce gaps inside each unit's daily schedule.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_unit_days",
        label: "Unit day concentration",
        help: "Higher values encourage concentrating each unit's activities into fewer days.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_soft_window",
        label: "Soft time-window preference",
        help: "Higher values make preferred time windows more influential in placement choices.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_min_week_shortfall",
        label: "Min weekly hours shortfall penalty",
        help: "Higher values strongly penalize missing minimum weekly-hour targets.",
        min: 0,
        step: 0.1,
      },
      {
        key: "stability_weight",
        label: "Schedule stability (0-100)",
        help: "Higher values favor continuity with previous solver results.",
        min: 0,
        max: 100,
        step: 0.1,
      },
      {
        key: "weight_day_load_balance",
        label: "Daily load balance",
        help: "Higher values balance total activity load across enabled days.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_overstaff_day_balance",
        label: "Overstaffing day balance",
        help: "Higher values distribute overstaffing more evenly across days.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_overstaff_cell_balance",
        label: "Overstaffing cell balance",
        help: "Higher values distribute overstaffing across cells instead of concentrating it.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_random_tiebreak",
        label: "Random tiebreak",
        help: "Adds controlled randomness when candidate solutions are otherwise equivalent.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_participant_daily_load_balance",
        label: "Participant daily load balance",
        help: "Higher values balance each participant's workload inside a day.",
        min: 0,
        step: 0.1,
      },
      {
        key: "weight_participant_day_spread",
        label: "Participant day spread",
        help: "Higher values spread participant workdays farther apart.",
        min: 0,
        step: 0.1,
      },
    ],
    [],
  );

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

  const horizonStartMin = useMemo(() => parseClockToMin(horizonStart), [horizonStart]);
  const horizonEndMin = useMemo(() => {
    const raw = parseClockToMin(horizonEnd);
    if (raw > horizonStartMin) return raw;
    return horizonStartMin + Math.max(30, cellSizeMin || 30);
  }, [cellSizeMin, horizonEnd, horizonStartMin]);
  const horizonSpanMin = useMemo(() => Math.max(1, horizonEndMin - horizonStartMin), [horizonEndMin, horizonStartMin]);
  const timeRangeStep = useMemo(() => Math.max(1, Number(cellSizeMin) || 5), [cellSizeMin]);

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
        name: String(item.name ?? `${tt("entity.time_range", "Time range")} ${item.id}`),
        startOffsetMin,
        endOffsetMin,
        rowError: null,
      };
    },
    [horizonSpanMin, horizonStartMin, timeRangeStep, tt],
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
        throw new Error(parseApiErrorMessage(raw, tt("time_ranges.error_loading", "Could not load time ranges.")));
      }

      const payload = (await response.json().catch(() => ({}))) as TimeRangeResource[] | TimeRangeListResponse;
      const list = Array.isArray(payload) ? payload : Array.isArray(payload.results) ? payload.results : [];
      const nextRanges = list
        .map((item) => toTimeRangeDraft(item))
        .filter((item) => Number.isFinite(item.id))
        .sort((a, b) => a.startOffsetMin - b.startOffsetMin || a.endOffsetMin - b.endOffsetMin || a.id - b.id);
      setTimeRanges(nextRanges);
    } catch (error: unknown) {
      setTimeRangesError(error instanceof Error ? error.message : tt("time_ranges.error_loading", "Could not load time ranges."));
    } finally {
      setTimeRangesLoading(false);
    }
  }, [gridId, toTimeRangeDraft, tt]);

  useEffect(() => {
    void loadTimeRanges();
  }, [loadTimeRanges]);

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      try {
        const gridRes = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, { cache: "no-store" });
        if (!gridRes.ok) {
          const raw = await gridRes.text().catch(() => "");
          throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.load_failed", "Could not load settings.")));
        }
        const gridData = (await gridRes.json().catch(() => ({}))) as GridDetailResponse;
        const solverParamsSource =
          (gridData?.solve_preference?.solver_params && typeof gridData.solve_preference.solver_params === "object"
            ? gridData.solve_preference.solver_params
            : null) ??
          (gridData?.solver_params && typeof gridData.solver_params === "object" ? gridData.solver_params : null) ??
          {};
        const baseWeightsSource =
          (gridData?.solve_preference?.base_weights && typeof gridData.solve_preference.base_weights === "object"
            ? gridData.solve_preference.base_weights
            : null) ??
          (gridData?.base_weights && typeof gridData.base_weights === "object" ? gridData.base_weights : null) ??
          {};

        if (!mounted) return;

        solverParamsRef.current = { ...(solverParamsSource as Record<string, unknown>) };

        const unitNoOverlapRaw = (solverParamsSource as Record<string, unknown>).unit_nooverlap_enabled;
        setUnitNoOverlapEnabled(
          typeof unitNoOverlapRaw === "boolean" ? unitNoOverlapRaw : DEFAULT_UNIT_NOOVERLAP_ENABLED,
        );

        const minRestRaw = parseFiniteNumber((solverParamsSource as Record<string, unknown>).min_rest_hours);
        setMinRestHours(minRestRaw !== undefined && minRestRaw >= 0 ? String(minRestRaw) : "");

        const maxDayParsed = parseTierHoursFromUnknown((solverParamsSource as Record<string, unknown>).max_hours_day_by_tier);
        const maxWeekParsed = parseTierHoursFromUnknown((solverParamsSource as Record<string, unknown>).max_hours_week_by_tier);
        const minWeekParsed = parseTierHoursFromUnknown((solverParamsSource as Record<string, unknown>).min_hours_week_by_tier);

        setMaxHoursDayByTier(formatTierHoursInput(maxDayParsed));
        setMaxHoursWeekByTier(formatTierHoursInput(maxWeekParsed));
        setMinHoursWeekByTier(formatTierHoursInput(minWeekParsed));

        const nextWeights = {} as Record<ObjectiveWeightKey, string>;
        for (const key of OBJECTIVE_WEIGHT_KEYS) {
          const sourceValue =
            parseFiniteNumber((baseWeightsSource as Record<string, unknown>)[key]) ??
            parseFiniteNumber((solverParamsSource as Record<string, unknown>)[key]) ??
            OBJECTIVE_WEIGHT_DEFAULTS[key];
          if (key === "stability_weight") {
            nextWeights[key] = String(clamp(sourceValue, 0, 100));
          } else {
            nextWeights[key] = String(Math.max(0, sourceValue));
          }
        }
        setObjectiveWeights(nextWeights);
      } catch (error: unknown) {
        if (!mounted) return;
        setSettingsError(error instanceof Error ? error.message : tt("grid_solver_settings.load_failed", "Could not load settings."));
      } finally {
        if (mounted) setSettingsLoading(false);
      }
    };
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, [gridId, tt]);

  const patchSolverParams = async (solverParams: Record<string, unknown>) => {
    const response = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ solver_params: solverParams }),
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.save_failed", "Could not save settings.")));
    }
  };

  const saveConstraintSettings = async () => {
    setSettingsSaved(null);
    setSettingsError(null);

    const maxDayParsed = parseTierHoursForSave(maxHoursDayByTier, "Max hours/day by tier");
    if (maxDayParsed.error) {
      setSettingsError(maxDayParsed.error);
      toast.error(maxDayParsed.error);
      return;
    }
    const maxWeekParsed = parseTierHoursForSave(maxHoursWeekByTier, "Max hours/week by tier");
    if (maxWeekParsed.error) {
      setSettingsError(maxWeekParsed.error);
      toast.error(maxWeekParsed.error);
      return;
    }
    const minWeekParsed = parseTierHoursForSave(minHoursWeekByTier, "Min hours/week by tier");
    if (minWeekParsed.error) {
      setSettingsError(minWeekParsed.error);
      toast.error(minWeekParsed.error);
      return;
    }

    const minRestTrimmed = minRestHours.trim();
    let minRestParsed: number | undefined;
    if (minRestTrimmed !== "") {
      const parsed = parseFiniteNumber(minRestTrimmed);
      if (parsed === undefined || parsed < 0) {
        const msg = "Minimum rest hours must be a non-negative number.";
        setSettingsError(msg);
        toast.error(msg);
        return;
      }
      minRestParsed = parsed;
    }

    const settings: GridSolverSettings = {
      unit_nooverlap_enabled: unitNoOverlapEnabled,
    };
    if (maxDayParsed.value) settings.max_hours_day_by_tier = maxDayParsed.value;
    if (maxWeekParsed.value) settings.max_hours_week_by_tier = maxWeekParsed.value;
    if (minWeekParsed.value) settings.min_hours_week_by_tier = minWeekParsed.value;
    if (minRestParsed !== undefined) settings.min_rest_hours = minRestParsed;

    const payload = buildSolverParamsPayload(settings);
    const mergedSolverParams = { ...solverParamsRef.current, ...payload };

    setSettingsSaving(true);
    try {
      await patchSolverParams(mergedSolverParams);
      solverParamsRef.current = mergedSolverParams;
      window.localStorage.setItem(getGridSolverSettingsKey(gridId), JSON.stringify(mergedSolverParams));
      const msg = tt("grid_solver_settings.saved", "Saved.");
      setSettingsSaved(msg);
      toast.success(msg);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : tt("grid_solver_settings.save_failed", "Could not save settings.");
      setSettingsError(msg);
      toast.error(msg);
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveObjectiveWeights = async () => {
    setWeightsSaved(null);
    setWeightsError(null);

    const parsedWeights = {} as Partial<Record<ObjectiveWeightKey, number>>;
    for (const row of objectiveWeightRows) {
      const raw = objectiveWeights[row.key]?.trim() ?? "";
      const parsed = parseFiniteNumber(raw);
      if (parsed === undefined) {
        const msg = `${row.label}: invalid number.`;
        setWeightsError(msg);
        toast.error(msg);
        return;
      }
      if (parsed < row.min || (typeof row.max === "number" && parsed > row.max)) {
        const msg = `${row.label}: value must be between ${row.min}${typeof row.max === "number" ? ` and ${row.max}` : ""}.`;
        setWeightsError(msg);
        toast.error(msg);
        return;
      }
      parsedWeights[row.key] = parsed;
    }

    const settings: GridSolverSettings = { unit_nooverlap_enabled: unitNoOverlapEnabled };
    for (const key of OBJECTIVE_WEIGHT_KEYS) {
      const next = parsedWeights[key];
      if (typeof next === "number") settings[key] = next;
    }

    const payload = buildSolverParamsPayload(settings);
    const mergedSolverParams = { ...solverParamsRef.current, ...payload };

    setWeightsSaving(true);
    try {
      await patchSolverParams(mergedSolverParams);
      solverParamsRef.current = mergedSolverParams;
      window.localStorage.setItem(getGridSolverSettingsKey(gridId), JSON.stringify(mergedSolverParams));
      const msg = tt("grid_solver_settings.saved", "Saved.");
      setWeightsSaved(msg);
      toast.success(msg);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : tt("grid_solver_settings.save_failed", "Could not save settings.");
      setWeightsError(msg);
      toast.error(msg);
    } finally {
      setWeightsSaving(false);
    }
  };

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
        throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.heatmap_save_failed", "Could not save day heatmap.")));
      }
      setHeatmapSaved(tt("grid_solver_settings.heatmap_saved", "Saved."));
      toast.success(tt("grid_solver_settings.heatmap_saved", "Saved."));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : tt("grid_solver_settings.heatmap_save_failed", "Could not save day heatmap.");
      setHeatmapError(msg);
      toast.error(msg);
    } finally {
      setHeatmapSaving(false);
    }
  };

  const addTimeRange = async () => {
    if (!newTimeRangeName.trim()) {
      setTimeRangesError(tt("grid_solver_settings.time_ranges_name_required", "Name is required."));
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
        throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.time_ranges_create_failed", "Could not create time range.")));
      }
      setNewTimeRangeName("");
      await loadTimeRanges();
    } catch (error: unknown) {
      setTimeRangesError(
        error instanceof Error ? error.message : tt("grid_solver_settings.time_ranges_create_failed", "Could not create time range."),
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
          entry.id === id ? { ...entry, rowError: tt("grid_solver_settings.time_ranges_name_required", "Name is required.") } : entry,
        ),
      );
      return;
    }

    if (current.endOffsetMin <= current.startOffsetMin) {
      setTimeRanges((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, rowError: tt("grid_solver_settings.time_ranges_invalid", "Invalid time range.") } : entry,
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
        throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.time_ranges_save_failed", "Could not save time range.")));
      }
      await loadTimeRanges();
      toast.success(tt("common.saved", "Saved."));
    } catch (error: unknown) {
      const rowMessage =
        error instanceof Error ? error.message : tt("grid_solver_settings.time_ranges_save_failed", "Could not save time range.");
      setTimeRanges((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, rowError: rowMessage } : entry)),
      );
    } finally {
      setRowBusy(id, false);
    }
  };

  const deleteTimeRange = async (id: number) => {
    if (!window.confirm(tt("time_ranges.delete_confirm", "Delete this time range?"))) return;

    setRowBusy(id, true);
    setTimeRangesError(null);
    try {
      const response = await fetch(`/api/time_ranges/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
      if (response.status !== 204) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.time_ranges_delete_failed", "Could not delete time range.")));
      }
      setTimeRanges((prev) => prev.filter((entry) => entry.id !== id));
      toast.success(tt("common.deleted", "Deleted."));
    } catch (error: unknown) {
      setTimeRangesError(
        error instanceof Error ? error.message : tt("grid_solver_settings.time_ranges_delete_failed", "Could not delete time range."),
      );
    } finally {
      setRowBusy(id, false);
    }
  };

  if (settingsLoading) {
    return (
      <div className="max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{tt("grid_solver_settings.title", "Solver Settings")}</h1>
        <p className="mt-4 text-sm text-gray-600">{tt("grid_solver_settings.loading", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">{tt("grid_solver_settings.title", "Solver Settings")}</h1>

      <div className="mt-6 space-y-6">
        <section className="rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900">{tt("grid_solver_settings.constraints", "Constraints")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {tt("grid_solver_settings.constraints_help", "Configure hard and soft constraints sent in solver_params.")}
          </p>

          {settingsError ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{settingsError}</div> : null}
          {settingsSaved ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{settingsSaved}</div> : null}

          <div className="mt-4 space-y-4">
            <div className="rounded-md border p-4">
              <div className="text-sm font-medium">{tt("grid_solver_settings.unit_nooverlap_title", "Prevent overlap for same unit")}</div>
              <p className="mt-1 text-xs text-gray-500">
                {tt("grid_solver_settings.unit_nooverlap_help", "When enabled, cells from the same unit cannot overlap in time.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[true, false].map((value) => (
                  <button
                    key={`unit-nooverlap-${value ? "on" : "off"}`}
                    type="button"
                    onClick={() => setUnitNoOverlapEnabled(value)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      unitNoOverlapEnabled === value
                        ? "border-black bg-black text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {value ? tt("common.enabled", "Enabled") : tt("common.disabled", "Disabled")}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-4">
              <div className="text-sm font-medium">{tt("grid_solver_settings.min_rest_hours", "Minimum rest between shifts (hours)")}</div>
              <p className="mt-1 text-xs text-gray-500">
                {tt("grid_solver_settings.min_rest_hours_help", "Leave blank to keep backend/default behavior.")}
              </p>
              <input
                type="number"
                min={0}
                step={0.5}
                className="mt-3 w-56 rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={minRestHours}
                onChange={(event) => {
                  setMinRestHours(event.target.value);
                  setSettingsSaved(null);
                }}
                placeholder={tt("grid_solver_settings.min_rest_placeholder", "e.g. 8")}
              />
            </div>

            <div className="rounded-md border p-4 space-y-4">
              <div>
                <div className="text-sm font-medium">{tt("grid_solver_settings.tier_hours_title", "Max/Min hours by tier")}</div>
                <p className="mt-1 text-xs text-gray-500">
                  {tt("grid_solver_settings.tier_hours_help", "Provide all 3 tier values in each row, or leave the whole row empty.")}
                </p>
              </div>

              {[
                {
                  key: "max_day" as const,
                  label: tt("grid_solver_settings.max_hours_day_by_tier", "Max hours/day by tier"),
                  value: maxHoursDayByTier,
                  setter: setMaxHoursDayByTier,
                },
                {
                  key: "max_week" as const,
                  label: tt("grid_solver_settings.max_hours_week_by_tier", "Max hours/week by tier"),
                  value: maxHoursWeekByTier,
                  setter: setMaxHoursWeekByTier,
                },
                {
                  key: "min_week" as const,
                  label: tt("grid_solver_settings.min_hours_week_by_tier", "Min hours/week by tier"),
                  value: minHoursWeekByTier,
                  setter: setMinHoursWeekByTier,
                },
              ].map((row) => (
                <div key={`tier-row-${row.key}`}>
                  <div className="mb-2 text-sm text-gray-700">{row.label}</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {TIER_KEYS.map((tier) => (
                      <div key={`${row.key}-${tier}`}>
                        <label className="mb-1 block text-xs text-gray-500">{tier}</label>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          value={row.value[tier]}
                          onChange={(event) => {
                            row.setter((prev) => ({ ...prev, [tier]: event.target.value }));
                            setSettingsSaved(null);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-right">
              <button
                type="button"
                className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={settingsSaving}
                onClick={() => void saveConstraintSettings()}
              >
                {settingsSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 p-5">
          <div className="text-sm font-medium">{tt("grid_solver_settings.day_heatmap_title", "Day Heatmap")}</div>
          <div className="text-xs text-gray-600">{tt("grid_solver_settings.day_heatmap_help", "Set your day intensity preferences.")}</div>

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
                {tt("grid_solver_settings.no_enabled_days", "No enabled days.")}
              </div>
            )}
          </div>

          <div className="mt-4 rounded border bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
              <span>{tt("grid_solver_settings.budget_meter", "Budget meter")}</span>
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
                {heatmapSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setObjectiveOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-base font-semibold text-gray-900">
              {tt("grid_solver_settings.objective_weights", "Advanced: Objective Weights")}
            </span>
            <span className="text-sm text-gray-500">{objectiveOpen ? tt("common.hide", "Hide") : tt("common.show", "Show")}</span>
          </button>

          {objectiveOpen ? (
            <div className="space-y-4 border-t border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500">
                {tt(
                  "grid_solver_settings.objective_weights_note",
                  "These values are automatically calibrated by the solver. Edit only if you understand the impact.",
                )}
              </p>

              {weightsError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{weightsError}</div> : null}
              {weightsSaved ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{weightsSaved}</div> : null}

              <div className="space-y-3">
                {objectiveWeightRows.map((row) => (
                  <div key={`objective-weight-${row.key}`} className="rounded-md border p-4">
                    <div className="text-sm font-medium text-gray-900">{row.label}</div>
                    <p className="mt-1 text-xs text-gray-500">{row.help}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        type="number"
                        min={row.min}
                        max={row.max}
                        step={row.step}
                        className="w-52 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={objectiveWeights[row.key] ?? ""}
                        onChange={(event) => {
                          setObjectiveWeights((prev) => ({ ...prev, [row.key]: event.target.value }));
                          setWeightsSaved(null);
                        }}
                      />
                      <span className="text-xs text-gray-500">default: {OBJECTIVE_WEIGHT_DEFAULTS[row.key].toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-right">
                <button
                  type="button"
                  className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                  disabled={weightsSaving}
                  onClick={() => void saveObjectiveWeights()}
                >
                  {weightsSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
                </button>
              </div>
            </div>
          ) : null}
        </section>

      </div>
    </div>
  );
}
