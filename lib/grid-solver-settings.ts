export const DEFAULT_UNIT_NOOVERLAP_ENABLED = true;
export const TIER_KEYS = ["PRIMARY", "SECONDARY", "TERTIARY"] as const;
export type TierKey = (typeof TIER_KEYS)[number];
export const OBJECTIVE_WEIGHT_DEFAULTS = {
  weight_availability: 100.0,
  weight_participant_gap: 10.0,
  weight_participant_days: 4.0,
  weight_unit_gap: 6.0,
  weight_unit_days: 2.0,
  weight_soft_window: 1.0,
  weight_min_week_shortfall: 1000.0,
  stability_weight: 0.0,
  weight_day_load_balance: 12.0,
  weight_overstaff_day_balance: 20.0,
  weight_overstaff_cell_balance: 10.0,
  weight_random_tiebreak: 0.0,
  weight_participant_daily_load_balance: 3.0,
  weight_participant_day_spread: 0.0,
} as const;
export type ObjectiveWeightKey = keyof typeof OBJECTIVE_WEIGHT_DEFAULTS;
export const OBJECTIVE_WEIGHT_KEYS = Object.keys(OBJECTIVE_WEIGHT_DEFAULTS) as ObjectiveWeightKey[];

export type TierHours = Record<TierKey, number>;

export type GridSolverSettings = {
  unit_nooverlap_enabled: boolean;
  max_hours_day_by_tier?: TierHours;
  max_hours_week_by_tier?: TierHours;
  min_hours_week_by_tier?: TierHours;
  min_hours_week_hard?: boolean;
  min_hours_week_weight?: number;
  unit_max_hours_day?: number;
  min_rest_hours?: number;
} & Partial<Record<ObjectiveWeightKey, number>>;

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

    const unitMaxHoursDay = parseFiniteNumber(parsed.unit_max_hours_day);
    if (unitMaxHoursDay !== undefined) out.unit_max_hours_day = unitMaxHoursDay;

    const minRestHours = parseFiniteNumber(parsed.min_rest_hours);
    if (minRestHours !== undefined) out.min_rest_hours = minRestHours;

    for (const weightKey of OBJECTIVE_WEIGHT_KEYS) {
      const weight = parseFiniteNumber(parsed[weightKey]);
      if (weight === undefined) continue;
      out[weightKey] =
        weightKey === "stability_weight"
          ? Math.max(0, Math.min(100, weight))
          : Math.max(0, weight);
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
  if (typeof settings.unit_max_hours_day === "number") payload.unit_max_hours_day = settings.unit_max_hours_day;
  if (typeof settings.min_rest_hours === "number") payload.min_rest_hours = settings.min_rest_hours;
  for (const weightKey of OBJECTIVE_WEIGHT_KEYS) {
    const value = settings[weightKey];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    payload[weightKey] =
      weightKey === "stability_weight"
        ? Math.max(0, Math.min(100, value))
        : Math.max(0, value);
  }

  return payload;
}
