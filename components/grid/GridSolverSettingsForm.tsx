"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ElasticSlider from "@/components/ElasticSlider";
import { useI18n } from "@/lib/use-i18n";

type OrganizationType = "school" | "work" | "gym" | "private_tutor" | "other";
type UnitNature = "audience" | "internal" | "none";
type TierKey = "PRIMARY" | "SECONDARY" | "TERTIARY";
type PriorityCode = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P9" | "P10";

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

type WizardAnswers = {
  Q1?: OrganizationType;
  Q2?: UnitNature;
  Q4?: boolean;
  Q5?: number;
  Q_tiers?: boolean;
  Q_min_cells?: Partial<Record<TierKey, number | null>>;
  priorities?: Partial<Record<PriorityCode, number>>;
};

type GridDetailResponse = {
  id?: number;
  description?: string;
  solver_params?: Record<string, unknown> | null;
  solve_preference?: {
    solver_params?: Record<string, unknown> | null;
    wizard_config?: {
      answers?: WizardAnswers;
    } | null;
  } | null;
};

const PRIORITY_DEFAULT: Record<PriorityCode, number> = {
  P1: 5,
  P2: 5,
  P3: 5,
  P4: 5,
  P5: 5,
  P6: 5,
  P9: 5,
  P10: 3,
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

function extractWizardAnswers(raw: unknown): WizardAnswers | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.answers && typeof obj.answers === "object") return obj.answers as WizardAnswers;
  if (obj.wizard_config && typeof obj.wizard_config === "object") {
    const cfg = obj.wizard_config as Record<string, unknown>;
    if (cfg.answers && typeof cfg.answers === "object") return cfg.answers as WizardAnswers;
  }
  if (obj.Q1 || obj.priorities || obj.Q2 || obj.Q4 || obj.Q5) {
    return obj as unknown as WizardAnswers;
  }
  return null;
}

function parsePriority(raw: unknown, code: PriorityCode) {
  const max = code === "P10" ? 5 : 10;
  const n = Number(raw);
  if (!Number.isFinite(n)) return PRIORITY_DEFAULT[code];
  return clamp(Math.round(n), 1, max);
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
  const tt = useCallback((key: string, fallback: string, params?: Record<string, string | number>) => {
    const translated = t(key as never, params);
    return translated === key ? fallback : translated;
  }, [t]);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState<string | null>(null);

  const [q1OrganizationType, setQ1OrganizationType] = useState<OrganizationType | null>(null);
  const [q1OtherDescription, setQ1OtherDescription] = useState("");
  const [q2UnitNature, setQ2UnitNature] = useState<UnitNature | null>(null);
  const [q4UnitNoOverlap, setQ4UnitNoOverlap] = useState<boolean | null>(null);
  const [q5MinRestHours, setQ5MinRestHours] = useState("");
  const [qTiers, setQTiers] = useState<boolean | null>(null);
  const [qMinCells, setQMinCells] = useState<Record<TierKey, string>>({
    PRIMARY: "",
    SECONDARY: "",
    TERTIARY: "",
  });
  const [priorities, setPriorities] = useState<Record<PriorityCode, number>>(PRIORITY_DEFAULT);
  const [stabilityWeight, setStabilityWeight] = useState(50);
  const [stabilitySaving, setStabilitySaving] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [heatmapSaving, setHeatmapSaving] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapSaved, setHeatmapSaved] = useState<string | null>(null);

  const [timeRanges, setTimeRanges] = useState<TimeRangeDraft[]>([]);
  const [timeRangesLoading, setTimeRangesLoading] = useState(false);
  const [timeRangesError, setTimeRangesError] = useState<string | null>(null);
  const [newTimeRangeName, setNewTimeRangeName] = useState("");
  const [creatingTimeRange, setCreatingTimeRange] = useState(false);
  const [busyByTimeRangeId, setBusyByTimeRangeId] = useState<Record<number, boolean>>({});

  const dayOptions = [
    { key: "school" as const, label: tt("solver_wizard.org_type_school", "School") },
    { key: "work" as const, label: tt("solver_wizard.org_type_work", "Work") },
    { key: "gym" as const, label: tt("solver_wizard.org_type_gym", "Gym") },
    { key: "private_tutor" as const, label: tt("solver_wizard.org_type_private_tutor", "Private tutor") },
    { key: "other" as const, label: tt("solver_wizard.org_type_other", "Other") },
  ];

  const unitNatureOptions: Array<{ key: UnitNature; label: string; help: string }> = [
    {
      key: "audience",
      label: tt("solver_wizard.unit_nature_audience", "Audience"),
      help: tt("solver_wizard.unit_nature_audience_help_short", "Groups that attend together."),
    },
    {
      key: "internal",
      label: tt("solver_wizard.unit_nature_internal", "Internal"),
      help: tt("solver_wizard.unit_nature_internal_help_short", "Internal organizational groups."),
    },
    {
      key: "none",
      label: tt("solver_wizard.unit_nature_none", "None"),
      help: tt("solver_wizard.unit_nature_none_help_short", "No unit grouping preferences."),
    },
  ];

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

  const priorityRows = useMemo(
    () => [
      {
        code: "P1" as const,
        label: tt("solver_wizard.priority_availability", "Respect participant availability"),
        description: tt(
          "solver_wizard.priority_availability_desc",
          "How strictly should the solver respect when participants say they can't work?",
        ),
      },
      {
        code: "P2" as const,
        label: tt("solver_wizard.priority_participant_gap", "Minimize gaps between participant activities"),
        description: tt(
          "solver_wizard.priority_participant_gap_desc",
          "Should the solver try to avoid gaps/free periods between a participant's activities in the same day?",
        ),
      },
      {
        code: "P3" as const,
        label: tt("solver_wizard.priority_participant_days", "Concentrate activities in fewer days"),
        description: tt(
          "solver_wizard.priority_participant_days_desc",
          "Should the solver try to pack all of a participant's activities into fewer days?",
        ),
      },
      {
        code: "P9" as const,
        label: tt("solver_wizard.priority_daily_load_balance", "Daily load balance"),
        description: tt(
          "solver_wizard.priority_daily_load_balance_desc",
          "Within each day, should the workload be spread evenly?",
        ),
        indent: true,
        dependsOnP3: true,
      },
      {
        code: "P10" as const,
        label: tt("solver_wizard.priority_day_spread", "Separate vs. cluster days"),
        description: tt(
          "solver_wizard.priority_day_spread_desc",
          "Should working days be spread apart or clustered together?",
        ),
        indent: true,
        dependsOnP3: true,
        bipolar: true,
      },
      {
        code: "P4" as const,
        label: tt("solver_wizard.priority_unit_gap", "Minimize gaps in units"),
        description: tt(
          "solver_wizard.priority_unit_gap_desc",
          "Should the solver avoid gaps in a unit/group's daily schedule?",
        ),
        audienceOnly: true,
      },
      {
        code: "P5" as const,
        label: tt("solver_wizard.priority_unit_days", "Concentrate unit activities"),
        description: tt(
          "solver_wizard.priority_unit_days_desc",
          "Should the solver concentrate a unit/group's activities into fewer days?",
        ),
        audienceOnly: true,
      },
      {
        code: "P6" as const,
        label: tt("solver_wizard.priority_soft_window", "Respect preferred time windows"),
        description: tt(
          "solver_wizard.priority_soft_window_desc",
          "How much should the solver respect preferred time windows?",
        ),
      },
    ],
    [t],
  );

  const visiblePriorityRows = useMemo(
    () =>
      priorityRows.filter((row) => {
        if (row.audienceOnly && q2UnitNature !== "audience") return false;
        if (row.dependsOnP3 && priorities.P3 <= 1) return false;
        return true;
      }),
    [priorities.P3, priorityRows, q2UnitNature],
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
    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const gridRes = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, { cache: "no-store" });
        let gridData: GridDetailResponse = {};
        if (gridRes.ok) {
          gridData = (await gridRes.json().catch(() => ({}))) as GridDetailResponse;
        }

        let answers: WizardAnswers | null = null;
        try {
          const wizardRes = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}/solver-wizard/`, {
            cache: "no-store",
          });
          if (wizardRes.ok) {
            answers = extractWizardAnswers(await wizardRes.json().catch(() => null));
          } else if (wizardRes.status !== 405) {
            const raw = await wizardRes.text().catch(() => "");
            throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.load_failed", "Could not load settings.")));
          }
        } catch {
          // ignore and fallback to grid detail
        }

        if (!answers) {
          answers = gridData?.solve_preference?.wizard_config?.answers ?? null;
          // TODO: backend should expose wizard_config in grid detail or a dedicated GET endpoint.
        }

        const nextPriorities: Record<PriorityCode, number> = { ...PRIORITY_DEFAULT };
        const rawPriorities = answers?.priorities ?? {};
        for (const code of Object.keys(PRIORITY_DEFAULT) as PriorityCode[]) {
          nextPriorities[code] = parsePriority(rawPriorities?.[code], code);
        }

        const q1 = answers?.Q1 ?? null;
        const q2 = answers?.Q2 ?? null;
        const q4 = typeof answers?.Q4 === "boolean" ? answers.Q4 : null;
        const q5 = typeof answers?.Q5 === "number" && Number.isFinite(answers.Q5) ? String(answers.Q5) : "";
        const qTiersValue = typeof answers?.Q_tiers === "boolean" ? answers.Q_tiers : null;
        const minCells = answers?.Q_min_cells ?? {};

        const rawStability =
          gridData?.solve_preference?.solver_params?.stability_weight ??
          gridData?.solver_params?.stability_weight;
        const parsedStability = Number(rawStability);

        if (!mounted) return;
        setPriorities(nextPriorities);
        setQ1OrganizationType(q1);
        setQ2UnitNature(q2);
        setQ4UnitNoOverlap(q2 === "audience" ? q4 : null);
        setQ5MinRestHours(q5);
        setQTiers(qTiersValue);
        setQMinCells({
          PRIMARY: minCells.PRIMARY == null ? "" : String(minCells.PRIMARY),
          SECONDARY: minCells.SECONDARY == null ? "" : String(minCells.SECONDARY),
          TERTIARY: minCells.TERTIARY == null ? "" : String(minCells.TERTIARY),
        });
        if (q1 === "other") {
          setQ1OtherDescription(String(gridData?.description ?? ""));
        }
        if (Number.isFinite(parsedStability)) {
          setStabilityWeight(clamp(Math.round(parsedStability), 0, 100));
        }
      } catch (error: unknown) {
        if (!mounted) return;
        setProfileError(error instanceof Error ? error.message : tt("grid_solver_settings.load_failed", "Could not load settings."));
      } finally {
        if (mounted) setProfileLoading(false);
      }
    };
    void loadProfile();
    return () => {
      mounted = false;
    };
  }, [gridId, tt]);

  const setPriority = (code: PriorityCode, raw: number) => {
    const max = code === "P10" ? 5 : 10;
    const next = Math.max(1, Math.min(max, Math.round(raw)));
    setPriorities((prev) => ({ ...prev, [code]: next }));
    setProfileSaved(null);
  };

  const saveSolverProfile = async () => {
    setProfileSaved(null);
    setProfileError(null);
    if (!q1OrganizationType) {
      const msg = tt("solver_wizard.q1_required", "Please select an organization type.");
      setProfileError(msg);
      toast.error(msg);
      return;
    }

    const parseMinCell = (raw: string): number | null | "invalid" => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) return "invalid";
      return n;
    };

    const parsedMinCells = {
      PRIMARY: parseMinCell(qMinCells.PRIMARY),
      SECONDARY: parseMinCell(qMinCells.SECONDARY),
      TERTIARY: parseMinCell(qMinCells.TERTIARY),
    };

    if (parsedMinCells.PRIMARY === "invalid" || parsedMinCells.SECONDARY === "invalid" || parsedMinCells.TERTIARY === "invalid") {
      const msg = tt("solver_wizard.q_min_cells_invalid", "Min cells values must be non-negative integers.");
      setProfileError(msg);
      toast.error(msg);
      return;
    }

    const payload: Record<string, unknown> = {
      Q1: q1OrganizationType,
    };
    if (q2UnitNature) payload.Q2 = q2UnitNature;
    if (q2UnitNature === "audience" && q4UnitNoOverlap !== null) payload.Q4 = q4UnitNoOverlap;
    const q5Trimmed = q5MinRestHours.trim();
    if (q5Trimmed) {
      const q5Num = Number(q5Trimmed);
      if (Number.isFinite(q5Num) && q5Num > 0) payload.Q5 = q5Num;
    }

    payload.priorities = {
      P1: priorities.P1,
      P2: priorities.P2,
      P3: priorities.P3,
      P6: priorities.P6,
      P9: priorities.P9,
      P10: priorities.P10,
      ...(q2UnitNature === "audience" ? { P4: priorities.P4, P5: priorities.P5 } : {}),
    };

    if (qTiers !== null) payload.Q_tiers = qTiers;
    if (qTiers !== false) {
      const minCells: Record<TierKey, number | null> = {
        PRIMARY: parsedMinCells.PRIMARY,
        SECONDARY: parsedMinCells.SECONDARY,
        TERTIARY: parsedMinCells.TERTIARY,
      };
      if (Object.values(minCells).some((value) => value !== null)) {
        payload.Q_min_cells = minCells;
      }
    }

    setProfileSaving(true);
    try {
      const response = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}/solver-wizard/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.save_failed", "Could not save settings.")));
      }
      const msg = tt("grid_solver_settings.saved", "Saved.");
      setProfileSaved(msg);
      toast.success(msg);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : tt("grid_solver_settings.save_failed", "Could not save settings.");
      setProfileError(msg);
      toast.error(msg);
    } finally {
      setProfileSaving(false);
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

  const saveStabilityWeight = async () => {
    setStabilitySaving(true);
    try {
      const response = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          solver_params: {
            stability_weight: clamp(Math.round(stabilityWeight), 0, 100),
          },
        }),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, tt("grid_solver_settings.save_failed", "Could not save settings.")));
      }
      toast.success(tt("grid_solver_settings.saved", "Saved."));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : tt("grid_solver_settings.save_failed", "Could not save settings."));
    } finally {
      setStabilitySaving(false);
    }
  };

  if (profileLoading) {
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
          <h2 className="text-base font-semibold text-gray-900">{tt("grid_solver_settings.solver_profile", "Solver Profile")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {tt("grid_solver_settings.solver_profile_help", "Configure profile questions and priorities in plain language.")}
          </p>

          {profileError ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{profileError}</div> : null}
          {profileSaved ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{profileSaved}</div> : null}

          <div className="mt-4 space-y-5">
            <div>
              <label className="block text-sm mb-2 text-gray-700">{tt("solver_wizard.org_type", "Organization type")}</label>
              <div className="flex flex-wrap gap-2">
                {dayOptions.map((option) => {
                  const selected = q1OrganizationType === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setQ1OrganizationType(option.key)}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                        selected
                          ? "border-black bg-black text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {q1OrganizationType === "other" ? (
              <div>
                <label className="block text-sm mb-1 text-gray-700">{tt("solver_wizard.custom_description", "Custom description")}</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={q1OtherDescription}
                  onChange={(event) => setQ1OtherDescription(event.target.value)}
                  placeholder={tt("solver_wizard.custom_description_placeholder", "Describe your organization")}
                  maxLength={240}
                />
              </div>
            ) : null}

            <div>
              <label className="block text-sm mb-2 text-gray-700">
                {tt("solver_wizard.unit_nature", "Unit nature")} ({tt("solver_wizard.optional", "optional")})
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {unitNatureOptions.map((option) => {
                  const selected = q2UnitNature === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setQ2UnitNature(option.key);
                        if (option.key !== "audience") setQ4UnitNoOverlap(null);
                      }}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        selected
                          ? "border-black bg-black text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className={`mt-1 text-xs ${selected ? "text-gray-200" : "text-gray-500"}`}>{option.help}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {q2UnitNature === "audience" ? (
              <div>
                <label className="block text-sm mb-2 text-gray-700">
                  {tt("solver_wizard.q4_unit_nooverlap", "Prevent overlap inside the same unit")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: tt("solver_wizard.no_preference", "No preference"), value: null as boolean | null },
                    { label: tt("solver_wizard.q4_yes", "Yes"), value: true as boolean | null },
                    { label: tt("solver_wizard.q4_no", "No"), value: false as boolean | null },
                  ].map((option) => {
                    const selected = q4UnitNoOverlap === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setQ4UnitNoOverlap(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                          selected
                            ? "border-black bg-black text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-sm mb-1 text-gray-700">
                {tt("solver_wizard.q5_min_rest_label", "Minimum rest between shifts (hours)")}
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={q5MinRestHours}
                onChange={(event) => setQ5MinRestHours(event.target.value)}
                placeholder={tt("solver_wizard.q5_placeholder", "e.g. 8")}
              />
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900">{tt("solver_wizard.section_priorities", "Priorities")}</h3>
              {visiblePriorityRows.map((row) => {
                const value = priorities[row.code];
                const sliderMax = row.code === "P10" ? 5 : 10;
                return (
                  <div key={row.code} className={`space-y-1 ${row.indent ? "ml-6" : ""}`}>
                    <label className="text-sm font-medium text-gray-800">{row.label}</label>
                    <p className="text-xs text-gray-500">{row.description}</p>
                    <ElasticSlider
                      className="w-3/4 mx-auto"
                      startingValue={1}
                      maxValue={sliderMax}
                      isStepped
                      stepSize={1}
                      value={value}
                      defaultValue={value}
                      leftIcon={
                        row.bipolar ? (
                          <span className="text-[11px] font-medium text-gray-500">
                            {tt("solver_wizard.day_spread_strong_separate", "Strong Separate")}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-gray-500">1</span>
                        )
                      }
                      rightIcon={
                        row.bipolar ? (
                          <span className="text-[11px] font-medium text-gray-500">
                            {tt("solver_wizard.day_spread_strong_cluster", "Strong Cluster")}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-gray-500">10</span>
                        )
                      }
                      onValueChange={(next) => setPriority(row.code, next)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="text-right">
              <button
                type="button"
                className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={profileSaving}
                onClick={() => void saveSolverProfile()}
              >
                {profileSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-base font-semibold text-gray-900">{tt("grid_solver_settings.advanced", "Advanced Settings")}</span>
            <span className="text-sm text-gray-500">{advancedOpen ? tt("common.hide", "Hide") : tt("common.show", "Show")}</span>
          </button>

          {advancedOpen ? (
            <div className="space-y-4 border-t border-gray-200 px-5 py-4">
              <div className="rounded-md border p-4">
                <div className="text-sm font-medium">{tt("solver_wizard.q_tiers", "Tier usage")} ({tt("solver_wizard.optional", "optional")})</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { label: tt("solver_wizard.q_tiers_keep", "No change"), value: null as boolean | null },
                    { label: tt("solver_wizard.q_tiers_enable", "Enable tiers"), value: true as boolean | null },
                    { label: tt("solver_wizard.q_tiers_disable", "Disable tiers"), value: false as boolean | null },
                  ].map((option) => {
                    const selected = qTiers === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setQTiers(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                          selected
                            ? "border-black bg-black text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {qTiers !== false ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(["PRIMARY", "SECONDARY", "TERTIARY"] as TierKey[]).map((tier) => (
                      <div key={tier}>
                        <label className="mb-1 block text-xs text-gray-500">{tier}</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          value={qMinCells[tier]}
                          onChange={(event) =>
                            setQMinCells((prev) => ({
                              ...prev,
                              [tier]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border p-4">
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
              </div>

              <div className="rounded-md border p-4">
                <div className="text-sm font-medium">{tt("grid_solver_settings.time_ranges_title", "Time ranges")}</div>
                <div className="text-xs text-gray-600">{tt("grid_solver_settings.time_ranges_help", "Manage preferred time ranges.")}</div>
                <div className="mt-2 text-xs text-gray-500">
                  {tt("grid_solver_settings.time_ranges_horizon", "Horizon: {start} - {end}", {
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
                    placeholder={tt("time_ranges.add_new", "Add new")}
                  />
                  <button
                    type="button"
                    className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                    disabled={creatingTimeRange}
                    onClick={() => void addTimeRange()}
                  >
                    {creatingTimeRange ? tt("common.saving", "Saving...") : tt("common.add", "Add")}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {timeRangesLoading ? (
                    <div className="text-sm text-gray-500">{tt("common.loading", "Loading...")}</div>
                  ) : timeRanges.length === 0 ? (
                    <div className="text-sm text-gray-500">{tt("time_ranges.no_items", "No time ranges yet.")}</div>
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
                              {tt("common.delete", "Delete")}
                            </button>
                            <button
                              type="button"
                              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                              onClick={() => void saveTimeRange(entry.id)}
                              disabled={busy}
                            >
                              {busy ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-md border p-4">
                <div className="text-sm font-medium">{tt("grid_solver_settings.stability_weight_title", "Stability weight")}</div>
                <p className="mt-1 text-xs text-gray-500">{tt("grid_solver_settings.stability_weight_help", "Prioritize continuity between solver runs.")}</p>
                <div className="mt-3">
                  <ElasticSlider
                    className="w-3/4 mx-auto"
                    startingValue={0}
                    maxValue={100}
                    isStepped
                    stepSize={1}
                    value={stabilityWeight}
                    defaultValue={stabilityWeight}
                    leftIcon={<span className="text-[11px] font-medium text-gray-500">0</span>}
                    rightIcon={<span className="text-[11px] font-medium text-gray-500">100</span>}
                    onValueChange={(next) => setStabilityWeight(clamp(Math.round(next), 0, 100))}
                  />
                </div>
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
                    onClick={() => void saveStabilityWeight()}
                    disabled={stabilitySaving}
                  >
                    {stabilitySaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
