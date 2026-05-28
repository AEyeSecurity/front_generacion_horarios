"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  LayoutGrid,
  Menu,
  ShieldAlert,
  SlidersHorizontal,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { OBJECTIVE_WEIGHT_DEFAULTS, TIER_KEYS } from "@/lib/grid-solver-settings";
import { useI18n } from "@/lib/use-i18n";
import { readGridTierEnabled } from "@/lib/grid-tier";
import GridSolverSettingsForm from "@/components/grid/GridSolverSettingsForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type SectionId = "main" | "schedule" | "solver" | "units" | "danger";
type TierKey = (typeof TIER_KEYS)[number];
type OrganizationType = "school" | "work" | "gym" | "private_tutor" | "event" | "other" | "";
type UnitNature = "audience" | "internal" | "none" | "space" | "";
type DayHeatmapKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type DayHeatmapValues = Record<DayHeatmapKey, 1 | 2 | 3>;

type GridSettingsResponse = {
  id?: number;
  name?: string;
  description?: string | null;
  organization_type?: string | null;
  unit_nature?: string | null;
  other_context_description?: string | null;
  days_enabled?: number[] | null;
  day_start?: string | null;
  day_end?: string | null;
  cell_size_min?: number | null;
  allow_overstaffing?: boolean | null;
  timezone?: string | null;
  tiers_enabled?: boolean | null;
  tier_enabled?: boolean | null;
  solver_options?: Record<string, unknown> | null;
  objective_weights?: Record<string, number> | null;
  solver_params?: Record<string, unknown> | null;
  solve_preference?: {
    solver_params?: Record<string, unknown> | null;
    base_weights?: Record<string, unknown> | null;
  } | null;
  base_weights?: Record<string, unknown> | null;
  day_heatmap?: Partial<Record<string, number>> | null;
};

type PriorityState = {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
  p6: number;
  p9: number;
  p10: number;
  p11: number;
  nonPreferred: number;
  impossible: number;
};

type SectionOption = {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

const DAY_KEYS: DayHeatmapKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEY_TO_INDEX: Record<DayHeatmapKey, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim() !== "") {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeTime(value: string | null | undefined, fallback = "08:00"): string {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (raw.length >= 5) return raw.slice(0, 5);
  return fallback;
}

function parseClockToMin(value: string): number {
  const [hRaw, mRaw] = String(value ?? "").split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function flattenApiError(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => flattenApiError(entry));
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

function mapWeightToPriority(weight: number, min: number, max: number): number {
  if (max <= min) return 5;
  const ratio = (weight - min) / (max - min);
  return clamp(Math.round(ratio * 9 + 1), 1, 10);
}

function mapPriorityToWeight(priority: number, min: number, max: number): number {
  if (max <= min) return min;
  const ratio = (clamp(priority, 1, 10) - 1) / 9;
  return round2(min + ratio * (max - min));
}

function mapCostToPriority(cost: number, min: number, max: number): number {
  return mapWeightToPriority(cost, min, max);
}

function mapPriorityToCost(priority: number, min: number, max: number): number {
  return Math.round(mapPriorityToWeight(priority, min, max));
}

function parseTierRecord(input: unknown): Record<TierKey, string> | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const out = {} as Record<TierKey, string>;
  for (const tier of TIER_KEYS) {
    const parsed = parseFiniteNumber(record[tier]);
    if (parsed === undefined || parsed < 0) return null;
    out[tier] = String(parsed);
  }
  return out;
}

function emptyTierRecord(): Record<TierKey, string> {
  return { PRIMARY: "", SECONDARY: "", TERTIARY: "" };
}

function parseTierForSave(
  enabled: boolean,
  values: Record<TierKey, string>,
  label: string,
): { value?: Record<TierKey, number>; error?: string } {
  if (!enabled) return {};
  const trimmed = TIER_KEYS.map((tier) => values[tier].trim());
  const hasAny = trimmed.some((value) => value !== "");
  if (!hasAny) return {};
  if (trimmed.some((value) => value === "")) {
    return { error: `${label}: all tier values are required once you start filling this field.` };
  }
  const output = {} as Record<TierKey, number>;
  for (const tier of TIER_KEYS) {
    const parsed = parseFiniteNumber(values[tier]);
    if (parsed === undefined || parsed < 0) {
      return { error: `${label}: values must be non-negative numbers.` };
    }
    output[tier] = parsed;
  }
  return { value: output };
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
            key={`heatmap-y-${v}`}
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

      {pathD ? <path d={pathD} fill="none" stroke="#111827" strokeWidth={4} strokeLinecap="round" /> : null}

      {points.map((point) => (
        <g key={point.dayKey}>
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

function BooleanOption({
  title,
  help,
  value,
  onChange,
}: {
  title: string;
  help: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-xs text-gray-600">{help}</p>
      <label className="mt-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        <span>{value ? "Enabled" : "Disabled"}</span>
      </label>
    </div>
  );
}

function NumberOption({
  title,
  help,
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  min,
  max,
  step = 0.1,
  placeholder,
}: {
  title: string;
  help: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-xs text-gray-600">{help}</p>
      <label className="mt-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        <span>{enabled ? "Enabled" : "Disabled"}</span>
      </label>
      <input
        type="number"
        className="mt-3 w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50"
        disabled={!enabled}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
      />
    </div>
  );
}

function TierInputs({
  title,
  help,
  enabled,
  onEnabledChange,
  values,
  onValuesChange,
}: {
  title: string;
  help: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  values: Record<TierKey, string>;
  onValuesChange: (next: Record<TierKey, string>) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-xs text-gray-600">{help}</p>
      <label className="mt-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
        <span>{enabled ? "Enabled" : "Disabled"}</span>
      </label>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TIER_KEYS.map((tier) => (
          <div key={tier}>
            <label className="mb-1 block text-xs text-gray-500">{tier}</label>
            <input
              type="number"
              min={0}
              step={0.1}
              disabled={!enabled}
              value={values[tier]}
              onChange={(event) => onValuesChange({ ...values, [tier]: event.target.value })}
              className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PrioritySlider({
  title,
  help,
  value,
  min = 1,
  max = 10,
  onChange,
  hint,
}: {
  title: string;
  help: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs font-semibold text-gray-700">
          {value}/{max}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-600">{help}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="mt-3 w-full"
      />
      {hint ? <p className="mt-2 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function SettingsSectionCard({
  title,
  description,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30"
      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  return (
    <section className={`rounded-lg border p-5 shadow-sm ${toneClass}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SettingsSidebar({
  backHref,
  backLabel,
  contextPrefix,
  gridName,
  gridId,
  notAvailableLabel,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  sections,
  activeSection,
  noSectionsMatchLabel,
  onSectionSelect,
}: {
  backHref: string;
  backLabel: string;
  contextPrefix: string;
  gridName: string;
  gridId: number;
  notAvailableLabel: string;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  sections: SectionOption[];
  activeSection: SectionId;
  noSectionsMatchLabel: string;
  onSectionSelect: (id: SectionId) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-slate-700 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{backLabel}</span>
        </Link>
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {contextPrefix}
          </p>
          <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
            {gridName || notAvailableLabel}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">#{gridId}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-xs outline-none ring-0 transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <nav className="mt-4 space-y-1">
          {sections.length > 0 ? (
            sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <button
                  key={`settings-section-${section.id}`}
                  type="button"
                  onClick={() => onSectionSelect(section.id)}
                  className={[
                    "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/60",
                  ].join(" ")}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{section.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{section.description}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {noSectionsMatchLabel}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

export default function GridSettingsTabs({ gridId, backHref }: { gridId: number; backHref: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string | number>) => {
      const translated = t(key as never, params);
      return translated === key ? fallback : translated;
    },
    [t],
  );

  const [activeSection, setActiveSection] = useState<SectionId>("main");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [principalSaving, setPrincipalSaving] = useState(false);
  const [solverSaving, setSolverSaving] = useState(false);
  const [participantsSaving, setParticipantsSaving] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [tabSaved, setTabSaved] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizationType, setOrganizationType] = useState<OrganizationType>("");
  const [unitNature, setUnitNature] = useState<UnitNature>("");
  const [otherContextDescription, setOtherContextDescription] = useState("");
  const [daysEnabled, setDaysEnabled] = useState<number[]>([0, 1, 2, 3, 4]);
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("20:00");
  const [cellSizeMin, setCellSizeMin] = useState(60);
  const [allowOverstaffing, setAllowOverstaffing] = useState(false);
  const [timezone, setTimezone] = useState<string | null>(null);

  const initialOrganizationRef = useRef<OrganizationType>("");
  const initialUnitNatureRef = useRef<UnitNature>("");
  const persistedGridNameRef = useRef("");

  const [priorities, setPriorities] = useState<PriorityState>({
    p1: 5,
    p2: 5,
    p3: 5,
    p4: 5,
    p5: 5,
    p6: 5,
    p9: 5,
    p10: 3,
    p11: 5,
    nonPreferred: 5,
    impossible: 5,
  });

  const [unitNoOverlapEnabled, setUnitNoOverlapEnabled] = useState(true);
  const [unitMaxHoursDayEnabled, setUnitMaxHoursDayEnabled] = useState(false);
  const [unitMaxHoursDay, setUnitMaxHoursDay] = useState("");
  const [softWindowEnabled, setSoftWindowEnabled] = useState(false);
  const [softWindowBaseCostEnabled, setSoftWindowBaseCostEnabled] = useState(false);
  const [softWindowBaseCost, setSoftWindowBaseCost] = useState("500");
  const [lexicographicAvailability, setLexicographicAvailability] = useState(false);
  const [stabilityWeightEnabled, setStabilityWeightEnabled] = useState(false);
  const [stabilityWeight, setStabilityWeight] = useState("0");

  const [tiersEnabled, setTiersEnabled] = useState(true);
  const [maxHoursDayByTierEnabled, setMaxHoursDayByTierEnabled] = useState(false);
  const [maxHoursWeekByTierEnabled, setMaxHoursWeekByTierEnabled] = useState(false);
  const [minHoursWeekByTierEnabled, setMinHoursWeekByTierEnabled] = useState(false);
  const [minCellsWeekByTierEnabled, setMinCellsWeekByTierEnabled] = useState(false);
  const [maxHoursDayByTier, setMaxHoursDayByTier] = useState<Record<TierKey, string>>(emptyTierRecord());
  const [maxHoursWeekByTier, setMaxHoursWeekByTier] = useState<Record<TierKey, string>>(emptyTierRecord());
  const [minHoursWeekByTier, setMinHoursWeekByTier] = useState<Record<TierKey, string>>(emptyTierRecord());
  const [minCellsWeekByTier, setMinCellsWeekByTier] = useState<Record<TierKey, string>>(emptyTierRecord());
  const [minRestHoursEnabled, setMinRestHoursEnabled] = useState(false);
  const [minRestHours, setMinRestHours] = useState("");
  const [minHoursWeekHard, setMinHoursWeekHard] = useState(false);
  const [minHoursWeekWeightEnabled, setMinHoursWeekWeightEnabled] = useState(false);
  const [minHoursWeekWeight, setMinHoursWeekWeight] = useState("");

  const [dayHeatmapValues, setDayHeatmapValues] = useState<DayHeatmapValues>({
    Mon: 1,
    Tue: 1,
    Wed: 1,
    Thu: 1,
    Fri: 1,
    Sat: 1,
    Sun: 1,
  });

  const solverOptionsRef = useRef<Record<string, unknown>>({});
  const objectiveWeightsRef = useRef<Record<string, number>>({ ...OBJECTIVE_WEIGHT_DEFAULTS });

  const orgOptions = useMemo(
    () => [
      { value: "school" as const, label: tt("solver_wizard.org_type_school", "School") },
      { value: "work" as const, label: tt("solver_wizard.org_type_work", "Work") },
      { value: "gym" as const, label: tt("solver_wizard.org_type_gym", "Gym") },
      { value: "private_tutor" as const, label: tt("solver_wizard.org_type_private_tutor", "Private Tutor") },
      { value: "event" as const, label: tt("solver_wizard.org_type_event", "Event") },
      { value: "other" as const, label: tt("solver_wizard.org_type_other", "Other") },
    ],
    [tt],
  );

  const unitNatureOptions = useMemo(
    () => [
      { value: "audience" as const, label: tt("grid_settings.unit_nature_audience", "Audience") },
      { value: "internal" as const, label: tt("grid_settings.unit_nature_internal", "Internal") },
      { value: "none" as const, label: tt("grid_settings.unit_nature_none", "None") },
      { value: "space" as const, label: tt("grid_settings.unit_nature_space", "Space") },
    ],
    [tt],
  );

  const dayOptions = useMemo(
    () => [
      { value: 0, label: t("day.mon_short") },
      { value: 1, label: t("day.tue_short") },
      { value: 2, label: t("day.wed_short") },
      { value: 3, label: t("day.thu_short") },
      { value: 4, label: t("day.fri_short") },
      { value: 5, label: t("day.sat_short") },
      { value: 6, label: t("day.sun_short") },
    ],
    [t],
  );

  const sectionOptions = useMemo<SectionOption[]>(
    () => [
      {
        id: "main",
        label: tt("grid_settings.main_tab", "Main"),
        description: tt("grid_settings.main_tab_desc", "Basic grid identity and context."),
        icon: LayoutGrid,
      },
      {
        id: "schedule",
        label: tt("grid_settings.schedule_tab", "Schedule"),
        description: tt("grid_settings.schedule_tab_desc", "Schedule boundaries, days, and time resolution."),
        icon: CalendarClock,
      },
      {
        id: "solver",
        label: tt("grid_settings.solver_tab", "Solver"),
        description: tt("grid_settings.solver_tab_desc", "Optimization priorities and solver constraints."),
        icon: SlidersHorizontal,
      },
      {
        id: "units",
        label: tt("grid_settings.units_tab", "Units"),
        description: tt("grid_settings.units_tab_desc", "Unit and participant constraint configuration."),
        icon: Users2,
      },
      {
        id: "danger",
        label: tt("grid_settings.danger_tab", "Danger Zone"),
        description: tt("grid_settings.danger_tab_desc", "Destructive actions that permanently affect this grid."),
        icon: ShieldAlert,
      },
    ],
    [tt],
  );

  const filteredSectionOptions = useMemo(() => {
    const query = sidebarSearch.trim().toLowerCase();
    if (!query) return sectionOptions;
    return sectionOptions.filter((section) =>
      `${section.label} ${section.description}`.toLowerCase().includes(query),
    );
  }, [sectionOptions, sidebarSearch]);

  const activeSectionMeta = useMemo(
    () => sectionOptions.find((section) => section.id === activeSection) ?? sectionOptions[0],
    [activeSection, sectionOptions],
  );

  const selectSection = useCallback((section: SectionId) => {
    setActiveSection(section);
    setTabError(null);
    setTabSaved(null);
    setMobileSidebarOpen(false);
  }, []);

  const enabledDayKeys = useMemo<DayHeatmapKey[]>(
    () =>
      DAY_KEYS.filter((dayKey) => {
        const dayIndex = DAY_KEY_TO_INDEX[dayKey];
        return daysEnabled.includes(dayIndex);
      }),
    [daysEnabled],
  );

  const heatmapUpgradeSum = useMemo(
    () => enabledDayKeys.reduce((sum, dayKey) => sum + (dayHeatmapValues[dayKey] - 1), 0),
    [dayHeatmapValues, enabledDayKeys],
  );
  const heatmapBudget = 2 + Math.floor((Math.max(0, enabledDayKeys.length - 1)) / 2);
  const heatmapBudgetExceeded = heatmapUpgradeSum > heatmapBudget;
  const heatmapBudgetRatio = heatmapBudget > 0 ? Math.min(1, heatmapUpgradeSum / heatmapBudget) : 0;

  const showRegenerationWarning = useMemo(
    () => organizationType !== initialOrganizationRef.current || unitNature !== initialUnitNatureRef.current,
    [organizationType, unitNature],
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadingError(null);
    setTabError(null);
    setTabSaved(null);
    try {
      const response = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, { cache: "no-store" });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, tt("grid_settings.load_failed", "Could not load grid settings.")));
      }
      const data = (await response.json().catch(() => ({}))) as GridSettingsResponse;
      const loadedName = String(data.name ?? "");
      setName(loadedName);
      persistedGridNameRef.current = loadedName.trim();
      setDescription(String(data.description ?? ""));
      const org = (String(data.organization_type ?? "").trim() || "") as OrganizationType;
      const unit = (String(data.unit_nature ?? "").trim() || "") as UnitNature;
      setOrganizationType(org);
      setUnitNature(unit);
      setOtherContextDescription(String(data.other_context_description ?? ""));
      setDaysEnabled(
        Array.isArray(data.days_enabled)
          ? data.days_enabled.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
          : [0, 1, 2, 3, 4],
      );
      setDayStart(normalizeTime(data.day_start, "08:00"));
      setDayEnd(normalizeTime(data.day_end, "20:00"));
      setCellSizeMin(Number.isFinite(Number(data.cell_size_min)) ? Number(data.cell_size_min) : 60);
      setAllowOverstaffing(Boolean(data.allow_overstaffing));
      setTimezone(data.timezone ?? null);
      setTiersEnabled(readGridTierEnabled(data as Record<string, unknown>, true));

      initialOrganizationRef.current = org;
      initialUnitNatureRef.current = unit;

      const solverSource =
        (data.solve_preference?.solver_params && typeof data.solve_preference.solver_params === "object"
          ? data.solve_preference.solver_params
          : null) ??
        (data.solver_options && typeof data.solver_options === "object" ? data.solver_options : null) ??
        (data.solver_params && typeof data.solver_params === "object" ? data.solver_params : null) ??
        {};

      const objectiveSourceRaw =
        (data.solve_preference?.base_weights && typeof data.solve_preference.base_weights === "object"
          ? data.solve_preference.base_weights
          : null) ??
        (data.objective_weights && typeof data.objective_weights === "object" ? data.objective_weights : null) ??
        (data.base_weights && typeof data.base_weights === "object" ? data.base_weights : null) ??
        {};

      const objectiveSource: Record<string, number> = { ...OBJECTIVE_WEIGHT_DEFAULTS };
      for (const [key, defaultValue] of Object.entries(OBJECTIVE_WEIGHT_DEFAULTS)) {
        const parsed = parseFiniteNumber((objectiveSourceRaw as Record<string, unknown>)[key]);
        objectiveSource[key] = parsed !== undefined ? parsed : defaultValue;
      }

      solverOptionsRef.current = { ...(solverSource as Record<string, unknown>) };
      objectiveWeightsRef.current = objectiveSource;

      setUnitNoOverlapEnabled(
        typeof (solverSource as Record<string, unknown>).unit_nooverlap_enabled === "boolean"
          ? Boolean((solverSource as Record<string, unknown>).unit_nooverlap_enabled)
          : true,
      );

      const unitMaxHoursDayRaw = parseFiniteNumber((solverSource as Record<string, unknown>).unit_max_hours_day);
      setUnitMaxHoursDayEnabled(unitMaxHoursDayRaw !== undefined);
      setUnitMaxHoursDay(unitMaxHoursDayRaw !== undefined ? String(unitMaxHoursDayRaw) : "");

      const softWindowEnabledRaw = (solverSource as Record<string, unknown>).soft_window_enabled;
      setSoftWindowEnabled(typeof softWindowEnabledRaw === "boolean" ? softWindowEnabledRaw : false);
      const softWindowBaseRaw = parseFiniteNumber((solverSource as Record<string, unknown>).soft_window_base_cost);
      setSoftWindowBaseCostEnabled(softWindowBaseRaw !== undefined);
      setSoftWindowBaseCost(String(softWindowBaseRaw ?? 500));

      const lexicographicRaw = (solverSource as Record<string, unknown>).lexicographic_availability;
      setLexicographicAvailability(typeof lexicographicRaw === "boolean" ? lexicographicRaw : false);

      const stabilityRaw =
        parseFiniteNumber((objectiveSourceRaw as Record<string, unknown>).stability_weight) ??
        parseFiniteNumber((solverSource as Record<string, unknown>).stability_weight);
      setStabilityWeightEnabled(stabilityRaw !== undefined);
      setStabilityWeight(String(stabilityRaw ?? 0));

      const maxDayByTier = parseTierRecord((solverSource as Record<string, unknown>).max_hours_day_by_tier);
      const maxWeekByTier = parseTierRecord((solverSource as Record<string, unknown>).max_hours_week_by_tier);
      const minWeekByTier = parseTierRecord((solverSource as Record<string, unknown>).min_hours_week_by_tier);
      const minCellsByTier = parseTierRecord((solverSource as Record<string, unknown>).min_cells_week_by_tier);
      setMaxHoursDayByTierEnabled(Boolean(maxDayByTier));
      setMaxHoursWeekByTierEnabled(Boolean(maxWeekByTier));
      setMinHoursWeekByTierEnabled(Boolean(minWeekByTier));
      setMinCellsWeekByTierEnabled(Boolean(minCellsByTier));
      setMaxHoursDayByTier(maxDayByTier ?? emptyTierRecord());
      setMaxHoursWeekByTier(maxWeekByTier ?? emptyTierRecord());
      setMinHoursWeekByTier(minWeekByTier ?? emptyTierRecord());
      setMinCellsWeekByTier(minCellsByTier ?? emptyTierRecord());

      const minRestRaw = parseFiniteNumber((solverSource as Record<string, unknown>).min_rest_hours);
      setMinRestHoursEnabled(minRestRaw !== undefined);
      setMinRestHours(minRestRaw !== undefined ? String(minRestRaw) : "");

      const minHoursHardRaw = (solverSource as Record<string, unknown>).min_hours_week_hard;
      setMinHoursWeekHard(typeof minHoursHardRaw === "boolean" ? minHoursHardRaw : false);

      const minHoursWeightRaw = parseFiniteNumber((solverSource as Record<string, unknown>).min_hours_week_weight);
      setMinHoursWeekWeightEnabled(minHoursWeightRaw !== undefined);
      setMinHoursWeekWeight(minHoursWeightRaw !== undefined ? String(minHoursWeightRaw) : "");

      const p1 = mapWeightToPriority(objectiveSource.weight_availability, 30, 150);
      const p2 = mapWeightToPriority(objectiveSource.weight_participant_gap, 1, 20);
      const p3 = mapWeightToPriority(objectiveSource.weight_participant_days, 0.5, 10);
      const p4 = mapWeightToPriority(objectiveSource.weight_unit_gap, 1, 15);
      const p5 = mapWeightToPriority(objectiveSource.weight_unit_days, 0.5, 8);
      const p6 = mapWeightToPriority(objectiveSource.weight_soft_window, 0.2, 5);
      const p9 = mapWeightToPriority(objectiveSource.weight_participant_daily_load_balance, 0.5, 8);
      const p11 = mapWeightToPriority(objectiveSource.weight_participant_workload_equity, 0, 10);
      const spread = Math.max(0, parseFiniteNumber(objectiveSource.weight_participant_day_spread) ?? 0);
      const p10 = spread > 0 ? clamp(Math.round((spread / 6) * 2 + 3), 3, 5) : 3;

      const nonPreferredCost = parseFiniteNumber((solverSource as Record<string, unknown>).non_preferred_cost) ?? 100;
      const impossibleCost = parseFiniteNumber((solverSource as Record<string, unknown>).impossible_cost) ?? 10000;
      setPriorities({
        p1,
        p2,
        p3,
        p4,
        p5,
        p6,
        p9,
        p10,
        p11,
        nonPreferred: mapCostToPriority(nonPreferredCost, 20, 200),
        impossible: mapCostToPriority(impossibleCost, 2000, 20000),
      });

      const normalizedHeatmap: DayHeatmapValues = {
        Mon: 1,
        Tue: 1,
        Wed: 1,
        Thu: 1,
        Fri: 1,
        Sat: 1,
        Sun: 1,
      };
      const heatmapSource = data.day_heatmap ?? {};
      for (const [key, rawValue] of Object.entries(heatmapSource)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx > 6) continue;
        const dayKey = DAY_INDEX_TO_KEY[idx];
        const numeric = Number(rawValue);
        normalizedHeatmap[dayKey] = numeric === 2 ? 2 : numeric === 3 ? 3 : 1;
      }
      setDayHeatmapValues(normalizedHeatmap);
    } catch (error: unknown) {
      setLoadingError(error instanceof Error ? error.message : tt("grid_settings.load_failed", "Could not load grid settings."));
    } finally {
      setLoading(false);
    }
  }, [gridId, tt]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchGrid = useCallback(
    async (payload: Record<string, unknown>, fallbackErrorKey = "grid_settings.save_failed") => {
      const response = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, tt(fallbackErrorKey, "Could not save settings.")));
      }
      return response.json().catch(() => ({}));
    },
    [gridId, tt],
  );

  const buildObjectiveWeightPayload = useCallback(() => {
    const next = { ...objectiveWeightsRef.current };
    next.weight_availability = mapPriorityToWeight(priorities.p1, 30, 150);
    next.weight_participant_gap = mapPriorityToWeight(priorities.p2, 1, 20);
    const baseP3 = mapPriorityToWeight(priorities.p3, 0.5, 10);
    next.weight_unit_gap = mapPriorityToWeight(priorities.p4, 1, 15);
    next.weight_unit_days = mapPriorityToWeight(priorities.p5, 0.5, 8);
    next.weight_soft_window = mapPriorityToWeight(priorities.p6, 0.2, 5);
    next.weight_participant_daily_load_balance = mapPriorityToWeight(priorities.p9, 0.5, 8);
    next.weight_participant_workload_equity = mapPriorityToWeight(priorities.p11, 0, 10);
    const spreadBias = priorities.p10 > 3 ? (priorities.p10 - 3) / 2 : 0;
    const clusterBias = priorities.p10 < 3 ? (3 - priorities.p10) / 2 : 0;
    next.weight_participant_day_spread = round2(spreadBias * 6);
    next.weight_participant_days = round2(clamp(baseP3 * (1 + clusterBias * 1.5 - spreadBias * 0.5), 0.5, 10));
    return next;
  }, [priorities]);

  const buildSolverOptionsPayload = useCallback(() => {
    const next = { ...solverOptionsRef.current };
    next.unit_nooverlap_enabled = unitNoOverlapEnabled;
    next.soft_window_enabled = softWindowEnabled;
    next.lexicographic_availability = lexicographicAvailability;
    next.non_preferred_cost = mapPriorityToCost(priorities.nonPreferred, 20, 200);
    next.impossible_cost = mapPriorityToCost(priorities.impossible, 2000, 20000);

    if (unitMaxHoursDayEnabled) {
      const parsed = parseFiniteNumber(unitMaxHoursDay);
      if (parsed !== undefined && parsed >= 0) {
        next.unit_max_hours_day = parsed;
      } else {
        delete next.unit_max_hours_day;
      }
    } else {
      delete next.unit_max_hours_day;
    }

    if (softWindowBaseCostEnabled) {
      const parsed = parseFiniteNumber(softWindowBaseCost);
      if (parsed !== undefined && parsed >= 0) {
        next.soft_window_base_cost = parsed;
      } else {
        delete next.soft_window_base_cost;
      }
    } else {
      delete next.soft_window_base_cost;
    }

    if (stabilityWeightEnabled) {
      const parsed = parseFiniteNumber(stabilityWeight);
      if (parsed !== undefined) {
        next.stability_weight = clamp(parsed, 0, 100);
      } else {
        delete next.stability_weight;
      }
    } else {
      delete next.stability_weight;
    }

    if (minRestHoursEnabled) {
      const parsed = parseFiniteNumber(minRestHours);
      if (parsed !== undefined && parsed >= 0) next.min_rest_hours = parsed;
      else delete next.min_rest_hours;
    } else {
      delete next.min_rest_hours;
    }

    next.min_hours_week_hard = minHoursWeekHard;
    if (minHoursWeekWeightEnabled) {
      const parsed = parseFiniteNumber(minHoursWeekWeight);
      if (parsed !== undefined && parsed >= 0) next.min_hours_week_weight = parsed;
      else delete next.min_hours_week_weight;
    } else {
      delete next.min_hours_week_weight;
    }
    return next;
  }, [
    lexicographicAvailability,
    minHoursWeekHard,
    minHoursWeekWeight,
    minHoursWeekWeightEnabled,
    minRestHours,
    minRestHoursEnabled,
    priorities.impossible,
    priorities.nonPreferred,
    softWindowBaseCost,
    softWindowBaseCostEnabled,
    softWindowEnabled,
    stabilityWeight,
    stabilityWeightEnabled,
    unitMaxHoursDay,
    unitMaxHoursDayEnabled,
    unitNoOverlapEnabled,
  ]);

  const mergeTierPayload = useCallback(
    (solverPayload: Record<string, unknown>) => {
      const maxDayParsed = parseTierForSave(
        maxHoursDayByTierEnabled,
        maxHoursDayByTier,
        tt("grid_settings.max_hours_day_by_tier", "Max hours per day by tier"),
      );
      if (maxDayParsed.error) return { error: maxDayParsed.error };
      const maxWeekParsed = parseTierForSave(
        maxHoursWeekByTierEnabled,
        maxHoursWeekByTier,
        tt("grid_settings.max_hours_week_by_tier", "Max hours per week by tier"),
      );
      if (maxWeekParsed.error) return { error: maxWeekParsed.error };
      const minWeekParsed = parseTierForSave(
        minHoursWeekByTierEnabled,
        minHoursWeekByTier,
        tt("grid_settings.min_hours_week_by_tier", "Min hours per week by tier"),
      );
      if (minWeekParsed.error) return { error: minWeekParsed.error };
      const minCellsParsed = parseTierForSave(
        minCellsWeekByTierEnabled,
        minCellsWeekByTier,
        tt("grid_settings.min_cells_week_by_tier", "Min cells per week by tier"),
      );
      if (minCellsParsed.error) return { error: minCellsParsed.error };

      if (maxDayParsed.value) solverPayload.max_hours_day_by_tier = maxDayParsed.value;
      else delete solverPayload.max_hours_day_by_tier;
      if (maxWeekParsed.value) solverPayload.max_hours_week_by_tier = maxWeekParsed.value;
      else delete solverPayload.max_hours_week_by_tier;
      if (minWeekParsed.value) solverPayload.min_hours_week_by_tier = minWeekParsed.value;
      else delete solverPayload.min_hours_week_by_tier;
      if (minCellsParsed.value) solverPayload.min_cells_week_by_tier = minCellsParsed.value;
      else delete solverPayload.min_cells_week_by_tier;
      return { payload: solverPayload };
    },
    [
      maxHoursDayByTier,
      maxHoursDayByTierEnabled,
      maxHoursWeekByTier,
      maxHoursWeekByTierEnabled,
      minCellsWeekByTier,
      minCellsWeekByTierEnabled,
      minHoursWeekByTier,
      minHoursWeekByTierEnabled,
      tt,
    ],
  );

  const savePrincipal = async () => {
    setTabSaved(null);
    setTabError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      const msg = tt("grid_settings.name_required", "Name is required.");
      setTabError(msg);
      toast.error(msg);
      return;
    }
    if (parseClockToMin(dayEnd) <= parseClockToMin(dayStart)) {
      const msg = tt("grid_settings.end_time_after_start", "Day end must be after day start.");
      setTabError(msg);
      toast.error(msg);
      return;
    }
    if (daysEnabled.length === 0) {
      const msg = tt("grid_settings.days_required", "Select at least one day.");
      setTabError(msg);
      toast.error(msg);
      return;
    }
    if (organizationType === "other" && otherContextDescription.trim().length === 0) {
      const msg = tt("grid_settings.other_context_required", "Please describe the context for organization type 'other'.");
      setTabError(msg);
      toast.error(msg);
      return;
    }

    setPrincipalSaving(true);
    try {
      await patchGrid(
        {
          name: trimmedName,
          description: description.trim() ? description.trim() : "",
          organization_type: organizationType || null,
          unit_nature: unitNature || null,
          other_context_description: organizationType === "other" ? otherContextDescription.trim() : null,
          days_enabled: Array.from(new Set(daysEnabled)).sort((a, b) => a - b),
          day_start: dayStart,
          day_end: dayEnd,
          cell_size_min: cellSizeMin,
          allow_overstaffing: allowOverstaffing,
        },
        "grid_settings.save_principal_failed",
      );

      initialOrganizationRef.current = organizationType;
      initialUnitNatureRef.current = unitNature;
      await loadSettings();
      const msg = tt("grid_settings.saved", "Saved.");
      setTabSaved(msg);
      toast.success(msg);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : tt("grid_settings.save_principal_failed", "Could not save principal settings.");
      setTabError(msg);
      toast.error(msg);
    } finally {
      setPrincipalSaving(false);
    }
  };

  const saveSolver = async () => {
    setTabSaved(null);
    setTabError(null);
    if (heatmapBudgetExceeded) {
      const msg = tt(
        "grid_settings.heatmap_budget_exceeded",
        "Heatmap budget exceeded: {used}/{max}.",
        { used: heatmapUpgradeSum, max: heatmapBudget },
      );
      setTabError(msg);
      toast.error(msg);
      return;
    }

    const solverPayload = buildSolverOptionsPayload();
    const tierMerged = mergeTierPayload(solverPayload);
    if (tierMerged.error) {
      setTabError(tierMerged.error);
      toast.error(tierMerged.error);
      return;
    }
    const objectivePayload = buildObjectiveWeightPayload();
    const dayHeatmapPayload: Record<string, number> = {};
    for (const dayKey of enabledDayKeys) {
      dayHeatmapPayload[String(DAY_KEY_TO_INDEX[dayKey])] = dayHeatmapValues[dayKey];
    }

    setSolverSaving(true);
    try {
      await patchGrid(
        {
          solver_options: tierMerged.payload,
          objective_weights: objectivePayload,
          solver_params: { ...(tierMerged.payload as Record<string, unknown>), ...objectivePayload },
          day_heatmap: dayHeatmapPayload,
        },
        "grid_settings.save_solver_failed",
      );
      solverOptionsRef.current = { ...(tierMerged.payload as Record<string, unknown>) };
      objectiveWeightsRef.current = { ...objectivePayload };
      const msg = tt("grid_settings.saved", "Saved.");
      setTabSaved(msg);
      toast.success(msg);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : tt("grid_settings.save_solver_failed", "Could not save solver settings.");
      setTabError(msg);
      toast.error(msg);
    } finally {
      setSolverSaving(false);
    }
  };

  const saveParticipants = async () => {
    setTabSaved(null);
    setTabError(null);
    const solverPayload = buildSolverOptionsPayload();
    const tierMerged = mergeTierPayload(solverPayload);
    if (tierMerged.error) {
      setTabError(tierMerged.error);
      toast.error(tierMerged.error);
      return;
    }

    setParticipantsSaving(true);
    try {
      await patchGrid(
        {
          tiers_enabled: tiersEnabled,
          solver_options: tierMerged.payload,
          solver_params: {
            ...(tierMerged.payload as Record<string, unknown>),
            ...objectiveWeightsRef.current,
          },
        },
        "grid_settings.save_participants_failed",
      );
      solverOptionsRef.current = { ...(tierMerged.payload as Record<string, unknown>) };
      const msg = tt("grid_settings.saved", "Saved.");
      setTabSaved(msg);
      toast.success(msg);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : tt("grid_settings.save_participants_failed", "Could not save participant settings.");
      setTabError(msg);
      toast.error(msg);
    } finally {
      setParticipantsSaving(false);
    }
  };

  const canConfirmDelete =
    persistedGridNameRef.current.length > 0 && deleteConfirmText.trim() === persistedGridNameRef.current;

  const deleteGrid = async () => {
    if (!canConfirmDelete || deleteBusy) return;
    setDeleteBusy(true);
    setTabError(null);
    setTabSaved(null);
    try {
      const id = encodeURIComponent(String(gridId));
      const response = await fetch(`/api/grids/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, tt("grid_settings.delete_grid_failed", "Could not delete grid.")));
      }
      toast.success(tt("grid_settings.delete_grid_deleted", "Grid deleted."));
      setDeleteDialogOpen(false);
      setDeleteConfirmText("");
      router.replace("/dashboard");
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : tt("grid_settings.delete_grid_failed", "Could not delete grid.");
      setTabError(message);
      toast.error(message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const sidebarProps = {
    backHref,
    backLabel: tt("grid_settings.back_to_app", "Back to app"),
    contextPrefix: tt("grid_settings.context_prefix", "Grid"),
    gridName: name.trim() || persistedGridNameRef.current,
    gridId,
    notAvailableLabel: tt("grid_settings.not_available", "Not available"),
    searchValue: sidebarSearch,
    searchPlaceholder: tt("grid_settings.search_settings", "Search settings..."),
    onSearchChange: setSidebarSearch,
    sections: filteredSectionOptions,
    activeSection,
    noSectionsMatchLabel: tt("grid_settings.no_sections_match", "No sections match your search."),
    onSectionSelect: selectSection,
  };

  const headerTitle = tt("grid_settings.page_heading", "Grid Configuration");
  const sectionCardInputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  const solverDayHeatmap = useMemo<Partial<Record<string, number>>>(() => {
    const mapped: Partial<Record<string, number>> = {};
    for (const dayKey of DAY_KEYS) {
      mapped[String(DAY_KEY_TO_INDEX[dayKey])] = dayHeatmapValues[dayKey];
    }
    return mapped;
  }, [dayHeatmapValues]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto grid min-h-dvh max-w-[1600px] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden md:block border-r bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 h-dvh overflow-y-auto p-4">
              <SettingsSidebar {...sidebarProps} />
            </div>
          </aside>
          <main className="min-w-0">
            <div className="px-4 py-6 md:px-8 md:py-8">
              <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{headerTitle}</h1>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                  {tt("grid_settings.loading", "Loading settings...")}
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto grid min-h-dvh max-w-[1600px] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden md:block border-r bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 h-dvh overflow-y-auto p-4">
              <SettingsSidebar {...sidebarProps} />
            </div>
          </aside>
          <main className="min-w-0">
            <div className="px-4 py-6 md:px-8 md:py-8">
              <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{headerTitle}</h1>
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {loadingError}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto grid min-h-dvh max-w-[1600px] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden md:block border-r bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 h-dvh overflow-y-auto p-4">
              <SettingsSidebar {...sidebarProps} />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="md:hidden border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
              <div className="mx-auto flex w-full max-w-[1040px] items-center gap-3 px-4 py-3 sm:px-6">
                <button
                  type="button"
                  title={tt("grid_settings.open_sections", "Sections")}
                  aria-label={tt("grid_settings.open_sections", "Sections")}
                  onClick={() => setMobileSidebarOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{tt("grid_settings.sections_label", "Navigation")}</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{activeSectionMeta?.label || ""}</p>
                </div>
              </div>
            </div>

            <main className="px-4 py-6 md:px-8 md:py-8">
              <div className="mx-auto max-w-5xl space-y-6">
                <header>
                  <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{headerTitle}</h1>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    {tt("grid_settings.subtitle", "Configure schedule, solver behavior, units, and participants.")}
                  </p>
                </header>

                {tabError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    {tabError}
                  </div>
                ) : null}
                {tabSaved ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {tabSaved}
                  </div>
                ) : null}

                <div className="space-y-4">
                {activeSection === "main" ? (
                  <SettingsSectionCard
                    title={tt("grid_settings.main_tab", "Main")}
                    description={tt("grid_settings.main_tab_desc", "Basic grid identity and context.")}
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.name", "Name")}
                        </label>
                        <input
                          type="text"
                          maxLength={200}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          className={sectionCardInputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.description", "Description")}
                        </label>
                        <textarea
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          className={`${sectionCardInputClass} h-24`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.organization_type", "Organization Type")}
                        </label>
                        <select
                          value={organizationType}
                          onChange={(event) => setOrganizationType(event.target.value as OrganizationType)}
                          className={sectionCardInputClass}
                        >
                          <option value="">{tt("grid_settings.select_option", "Select...")}</option>
                          {orgOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.unit_nature", "Unit Nature")}
                        </label>
                        <select
                          value={unitNature}
                          onChange={(event) => setUnitNature(event.target.value as UnitNature)}
                          className={sectionCardInputClass}
                        >
                          <option value="">{tt("grid_settings.select_option", "Select...")}</option>
                          {unitNatureOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {organizationType === "other" ? (
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            {tt("grid_settings.other_context_description", "Other Context Description")}
                          </label>
                          <input
                            type="text"
                            maxLength={500}
                            value={otherContextDescription}
                            onChange={(event) => setOtherContextDescription(event.target.value)}
                            className={sectionCardInputClass}
                          />
                        </div>
                      ) : null}
                    </div>

                    {showRegenerationWarning ? (
                      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
                        {tt(
                          "grid_settings.regeneration_warning",
                          "Changing organization type or unit nature will regenerate solver_profile and objective_weights on backend.",
                        )}
                      </div>
                    ) : null}

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void savePrincipal()}
                        disabled={principalSaving}
                        className="rounded-md bg-black px-4 py-2 text-sm text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                      >
                        {principalSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
                      </button>
                    </div>
                  </SettingsSectionCard>
                ) : null}

                {activeSection === "schedule" ? (
                  <SettingsSectionCard
                    title={tt("grid_settings.schedule_tab", "Schedule")}
                    description={tt("grid_settings.schedule_tab_desc", "Schedule boundaries, days, and time resolution.")}
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.days_enabled", "Days Enabled")}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {dayOptions.map((day) => (
                            <label key={day.value} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={daysEnabled.includes(day.value)}
                                onChange={(event) => {
                                  setDaysEnabled((prev) => {
                                    if (event.target.checked) {
                                      return Array.from(new Set([...prev, day.value])).sort((a, b) => a - b);
                                    }
                                    return prev.filter((v) => v !== day.value);
                                  });
                                }}
                              />
                              <span>{day.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.day_start", "Day Start")}
                        </label>
                        <input
                          type="time"
                          value={dayStart}
                          onChange={(event) => setDayStart(event.target.value)}
                          className={sectionCardInputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.day_end", "Day End")}
                        </label>
                        <input
                          type="time"
                          value={dayEnd}
                          onChange={(event) => setDayEnd(event.target.value)}
                          className={sectionCardInputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.cell_size", "Cell Size")}
                        </label>
                        <select
                          value={String(cellSizeMin)}
                          onChange={(event) => setCellSizeMin(Number(event.target.value) || 60)}
                          className={sectionCardInputClass}
                        >
                          {[5, 10, 15, 20, 30, 40, 45, 60].map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {minutes} min
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {tt("grid_settings.timezone", "Timezone")}
                        </label>
                        <div className={`${sectionCardInputClass} bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200`}>
                          {timezone || tt("grid_settings.not_available", "Not available")}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={allowOverstaffing}
                            onChange={(event) => setAllowOverstaffing(event.target.checked)}
                          />
                          <span>{tt("grid_settings.allow_overstaffing", "Allow Overstaffing")}</span>
                        </label>
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void savePrincipal()}
                        disabled={principalSaving}
                        className="rounded-md bg-black px-4 py-2 text-sm text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                      >
                        {principalSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
                      </button>
                    </div>
                  </SettingsSectionCard>
                ) : null}

                {activeSection === "solver" ? (
                  <SettingsSectionCard
                    title={tt("grid_settings.solver_tab", "Solver")}
                    description={tt("grid_settings.solver_tab_desc", "Optimization priorities and solver constraints.")}
                  >
                    <GridSolverSettingsForm
                      gridId={gridId}
                      daysEnabled={daysEnabled}
                      horizonStart={dayStart}
                      horizonEnd={dayEnd}
                      initialDayHeatmap={solverDayHeatmap}
                      cellSizeMin={cellSizeMin}
                    />
                  </SettingsSectionCard>
                ) : null}

                {activeSection === "units" ? (
                  <>
                    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tt("grid_settings.tiers_configuration", "Tiers Configuration")}
                      </div>
                      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" checked={tiersEnabled} onChange={(event) => setTiersEnabled(event.target.checked)} />
                        <span>{tt("grid_settings.tiers_enabled", "Tiers enabled")}</span>
                      </label>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tt("grid_settings.hour_limits_by_tier", "Hour Limits by Tier")}
                      </div>
                      <div className="space-y-3">
                        <TierInputs
                          title={tt("grid_settings.max_hours_day_by_tier", "Max hours per day by tier")}
                          help={tt("grid_solver_settings.max_hours_day_help", "Hard cap per day by participant tier.")}
                          enabled={maxHoursDayByTierEnabled}
                          onEnabledChange={setMaxHoursDayByTierEnabled}
                          values={maxHoursDayByTier}
                          onValuesChange={setMaxHoursDayByTier}
                        />
                        <TierInputs
                          title={tt("grid_settings.max_hours_week_by_tier", "Max hours per week by tier")}
                          help={tt("grid_solver_settings.max_hours_week_help", "Hard weekly cap by participant tier.")}
                          enabled={maxHoursWeekByTierEnabled}
                          onEnabledChange={setMaxHoursWeekByTierEnabled}
                          values={maxHoursWeekByTier}
                          onValuesChange={setMaxHoursWeekByTier}
                        />
                        <TierInputs
                          title={tt("grid_settings.min_hours_week_by_tier", "Min hours per week by tier")}
                          help={tt("grid_solver_settings.min_hours_week_help", "Weekly minimum target by participant tier.")}
                          enabled={minHoursWeekByTierEnabled}
                          onEnabledChange={setMinHoursWeekByTierEnabled}
                          values={minHoursWeekByTier}
                          onValuesChange={setMinHoursWeekByTier}
                        />
                        <TierInputs
                          title={tt("grid_settings.min_cells_week_by_tier", "Min cells per week by tier")}
                          help={tt("grid_settings.min_cells_week_by_tier_help", "Weekly minimum cell assignments by tier.")}
                          enabled={minCellsWeekByTierEnabled}
                          onEnabledChange={setMinCellsWeekByTierEnabled}
                          values={minCellsWeekByTier}
                          onValuesChange={setMinCellsWeekByTier}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tt("grid_settings.additional_participant_constraints", "Additional Participant Constraints")}
                      </div>
                      <div className="space-y-3">
                        <NumberOption
                          title={tt("grid_settings.min_rest_hours", "Minimum rest hours")}
                          help={tt("grid_solver_settings.min_rest_hours_help", "Hard minimum rest between two assigned shifts.")}
                          enabled={minRestHoursEnabled}
                          onEnabledChange={setMinRestHoursEnabled}
                          value={minRestHours}
                          onValueChange={setMinRestHours}
                          min={0}
                          step={0.5}
                        />
                        <BooleanOption
                          title={tt("grid_settings.min_hours_week_hard", "Minimum weekly hours are hard")}
                          help={tt("grid_solver_settings.min_hours_week_hard_help", "If disabled, weekly minimum is soft and uses penalty weight.")}
                          value={minHoursWeekHard}
                          onChange={setMinHoursWeekHard}
                        />
                        <NumberOption
                          title={tt("grid_settings.min_hours_week_weight", "Min weekly shortfall penalty weight")}
                          help={tt("grid_solver_settings.min_hours_shortfall_weight_help", "Penalty multiplier used when minimum weekly hours are soft.")}
                          enabled={minHoursWeekWeightEnabled}
                          onEnabledChange={setMinHoursWeekWeightEnabled}
                          value={minHoursWeekWeight}
                          onValueChange={setMinHoursWeekWeight}
                          min={0}
                          step={0.1}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveParticipants()}
                        disabled={participantsSaving}
                        className="rounded-md bg-black px-4 py-2 text-sm text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                      >
                        {participantsSaving ? tt("common.saving", "Saving...") : tt("common.save", "Save")}
                      </button>
                    </div>
                  </>
                ) : null}

                {activeSection === "danger" ? (
                  <SettingsSectionCard
                    tone="danger"
                    title={tt("grid_settings.delete_grid_section_title", "Delete grid")}
                    description={tt(
                      "grid_settings.delete_grid_section_help",
                      "Delete this grid permanently. You will be asked to type the grid name to confirm.",
                    )}
                  >
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDeleteDialogOpen(true)}
                        className="rounded-md bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
                      >
                        {tt("grid_settings.delete_grid_button", "Delete grid")}
                      </button>
                    </div>
                  </SettingsSectionCard>
                ) : null}
              </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[320px] p-0 sm:w-[360px]">
            <SheetHeader className="sr-only">
              <SheetTitle>{tt("grid_settings.sections_label", "Navigation")}</SheetTitle>
            </SheetHeader>
            <div className="h-full overflow-y-auto p-4">
              <SettingsSidebar {...sidebarProps} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteConfirmText("");
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{tt("grid_settings.delete_grid_dialog_title", "Delete Grid")}</DialogTitle>
            <DialogDescription>
              {tt(
                "grid_settings.delete_grid_dialog_description",
                "This action is permanent. Type the grid name to confirm deletion.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">{tt("grid_settings.delete_grid_name_label", "Grid name confirmation")}</label>
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {persistedGridNameRef.current || tt("grid_settings.not_available", "Not available")}
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={tt("grid_settings.delete_grid_name_placeholder", "Type grid name to confirm")}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              className="rounded border px-4 py-2 text-sm"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmText("");
              }}
            >
              {tt("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              disabled={!canConfirmDelete || deleteBusy}
              onClick={() => void deleteGrid()}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteBusy
                ? tt("grid_settings.delete_grid_deleting", "Deleting...")
                : tt("grid_settings.delete_grid_confirm_button", "Delete grid")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
