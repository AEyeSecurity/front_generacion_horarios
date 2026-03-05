export const DEFAULT_UNIT_NOOVERLAP_ENABLED = true;
export const TIER_KEYS = ["PRIMARY", "SECONDARY", "TERTIARY"] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export type TierHours = Record<TierKey, number>;

export type GridSolverSettings = {
  unit_nooverlap_enabled: boolean;
  max_hours_day_by_tier?: TierHours;
  max_hours_week_by_tier?: TierHours;
  min_hours_week_by_tier?: TierHours;
  min_hours_week_hard?: boolean;
  min_hours_week_weight?: number;
  allow_overstaffing?: boolean;
  unit_max_hours_day?: number;
  min_rest_hours?: number;
  stability_weight?: number;
};

export function getGridSolverSettingsKey(gridId: number | string) {
  return `grid:${String(gridId)}:solver-settings`;
}

function parseFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim() !== "") {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseTierHours(input: unknown): TierHours | undefined {
  if (!input || typeof input !== "object") return undefined;
  const rec = input as Record<string, unknown>;
  const out = {} as TierHours;
  for (const tier of TIER_KEYS) {
    const parsed = parseFiniteNumber(rec[tier]);
    if (parsed === undefined) return undefined;
    out[tier] = parsed;
  }
  return out;
}

function parseBoolean(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

export function parseGridSolverSettings(raw: string | null | undefined): GridSolverSettings {
  if (!raw) return { unit_nooverlap_enabled: DEFAULT_UNIT_NOOVERLAP_ENABLED };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: GridSolverSettings = {
      unit_nooverlap_enabled:
        parseBoolean(parsed.unit_nooverlap_enabled) ?? DEFAULT_UNIT_NOOVERLAP_ENABLED,
    };

    const maxDayByTier = parseTierHours(parsed.max_hours_day_by_tier);
    if (maxDayByTier) out.max_hours_day_by_tier = maxDayByTier;

    const maxWeekByTier = parseTierHours(parsed.max_hours_week_by_tier);
    if (maxWeekByTier) out.max_hours_week_by_tier = maxWeekByTier;

    const minWeekByTier = parseTierHours(parsed.min_hours_week_by_tier);
    if (minWeekByTier) out.min_hours_week_by_tier = minWeekByTier;

    const minWeekHard = parseBoolean(parsed.min_hours_week_hard);
    if (minWeekHard !== undefined) out.min_hours_week_hard = minWeekHard;

    const minWeekWeight = parseFiniteNumber(parsed.min_hours_week_weight);
    if (minWeekWeight !== undefined) out.min_hours_week_weight = minWeekWeight;

    const allowOverstaffing = parseBoolean(parsed.allow_overstaffing);
    if (allowOverstaffing !== undefined) out.allow_overstaffing = allowOverstaffing;

    const unitMaxHoursDay = parseFiniteNumber(parsed.unit_max_hours_day);
    if (unitMaxHoursDay !== undefined) out.unit_max_hours_day = unitMaxHoursDay;

    const minRestHours = parseFiniteNumber(parsed.min_rest_hours);
    if (minRestHours !== undefined) out.min_rest_hours = minRestHours;

    const stabilityWeight = parseFiniteNumber(parsed.stability_weight);
    if (stabilityWeight !== undefined) {
      out.stability_weight = Math.max(0, Math.min(100, stabilityWeight));
    }

    return out;
  } catch {
    return { unit_nooverlap_enabled: DEFAULT_UNIT_NOOVERLAP_ENABLED };
  }
}

export function buildSolverParamsPayload(settings: GridSolverSettings) {
  const payload: GridSolverSettings = {
    unit_nooverlap_enabled:
      typeof settings.unit_nooverlap_enabled === "boolean"
        ? settings.unit_nooverlap_enabled
        : DEFAULT_UNIT_NOOVERLAP_ENABLED,
  };

  if (settings.max_hours_day_by_tier) payload.max_hours_day_by_tier = settings.max_hours_day_by_tier;
  if (settings.max_hours_week_by_tier) payload.max_hours_week_by_tier = settings.max_hours_week_by_tier;
  if (settings.min_hours_week_by_tier) payload.min_hours_week_by_tier = settings.min_hours_week_by_tier;
  if (typeof settings.min_hours_week_hard === "boolean") payload.min_hours_week_hard = settings.min_hours_week_hard;
  if (typeof settings.min_hours_week_weight === "number") payload.min_hours_week_weight = settings.min_hours_week_weight;
  if (typeof settings.allow_overstaffing === "boolean") payload.allow_overstaffing = settings.allow_overstaffing;
  if (typeof settings.unit_max_hours_day === "number") payload.unit_max_hours_day = settings.unit_max_hours_day;
  if (typeof settings.min_rest_hours === "number") payload.min_rest_hours = settings.min_rest_hours;
  if (typeof settings.stability_weight === "number") {
    payload.stability_weight = Math.max(0, Math.min(100, settings.stability_weight));
  }

  return payload;
}
