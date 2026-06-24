type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readList = (sources: UnknownRecord[], keys: string[]): unknown[] => {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value)) return value;
      if (isRecord(value) && Array.isArray(value.results)) return value.results;
    }
  }
  return [];
};

const TIER_KEYS = ["PRIMARY", "SECONDARY", "TERTIARY"] as const;

const readParticipantsByTier = (sources: UnknownRecord[]): UnknownRecord[] => {
  for (const source of sources) {
    const candidate = source.participants_by_tier ?? source.participantsByTier;
    if (!isRecord(candidate)) continue;
    const participants: UnknownRecord[] = [];
    for (const tier of TIER_KEYS) {
      const tierEntries = candidate[tier] ?? candidate[tier.toLowerCase()];
      const list = Array.isArray(tierEntries)
        ? tierEntries
        : isRecord(tierEntries) && Array.isArray(tierEntries.results)
        ? tierEntries.results
        : [];
      for (const entry of list) {
        if (isRecord(entry)) participants.push({ ...entry, tier: entry.tier ?? tier });
      }
    }
    if (participants.length > 0) return participants;
  }
  return [];
};

export const readBootstrapEntityId = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id && id !== "[object Object]" ? id : null;
  }
  if (!isRecord(value)) return null;
  const candidate = value.id ?? value.participant_id ?? value.participantId;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : null;
};

export const readBootstrapEntityIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.map(readBootstrapEntityId).filter((id): id is string => Boolean(id)))).sort()
    : [];

export type CellFormBootstrap = {
  raw: UnknownRecord;
  options: UnknownRecord;
  grid: UnknownRecord;
  cell: UnknownRecord | null;
  seriesCells: UnknownRecord[];
  participants: UnknownRecord[];
  units: UnknownRecord[];
  bundles: UnknownRecord[];
  timeRanges: UnknownRecord[];
  staffs: UnknownRecord[];
  staffGroups: UnknownRecord[];
  staffMembers: UnknownRecord[];
  featureFlags: UnknownRecord;
  divisionConfig: UnknownRecord;
  participantTiersEnabled: boolean;
};

export function normalizeCellFormBootstrap(payload: unknown): CellFormBootstrap {
  const raw = isRecord(payload) ? payload : {};
  const data = isRecord(raw.data) ? raw.data : {};
  const options = isRecord(raw.form_options)
    ? raw.form_options
    : isRecord(raw.options)
    ? raw.options
    : isRecord(data.form_options)
    ? data.form_options
    : isRecord(data.options)
    ? data.options
    : raw;
  const sources = [options, data, raw];
  const grid = sources.find((source) => isRecord(source.grid))?.grid as UnknownRecord | undefined;
  const cellCandidate = raw.cell ?? data.cell ?? options.cell;
  const flatParticipants = readList(sources, ["participants", "participant_options"]).filter(isRecord);
  const tieredParticipants = readParticipantsByTier(sources);
  const featureFlagsSource = (sources.find((source) => isRecord(source.feature_flags ?? source.features))
    ?.feature_flags ?? sources.find((source) => isRecord(source.features))?.features ?? {}) as UnknownRecord;
  const participantTiersEnabled = [
    featureFlagsSource.participant_tiers_enabled,
    ...sources.map((source) => source.participant_tiers_enabled),
    isRecord(grid) ? grid.participant_tiers_enabled : undefined,
  ].some((value) => value === true);

  return {
    raw,
    options,
    grid: isRecord(grid) ? grid : options,
    cell: isRecord(cellCandidate) ? cellCandidate : null,
    seriesCells: readList(sources, ["series_cells", "seriesCells"])
      .filter(isRecord),
    participants: tieredParticipants.length > 0 ? tieredParticipants : flatParticipants,
    units: readList(sources, ["units", "unit_options"])
      .filter(isRecord),
    bundles: readList(sources, ["bundles", "bundle_options"])
      .filter(isRecord),
    timeRanges: readList(sources, ["time_ranges", "timeRanges", "time_range_options"])
      .filter(isRecord),
    staffs: readList(sources, ["staffs", "staff_options_resolved", "staff_options"])
      .filter(isRecord),
    staffGroups: readList(sources, ["staff_groups", "selected_staff_groups"])
      .filter(isRecord),
    staffMembers: readList(sources, ["staff_members", "staffMembers"])
      .filter(isRecord),
    featureFlags: {
      ...featureFlagsSource,
      participant_tiers_enabled: participantTiersEnabled,
    },
    divisionConfig: (sources.find((source) => isRecord(source.division_config ?? source.division_days_config))
      ?.division_config ??
      sources.find((source) => isRecord(source.division_days_config))?.division_days_config ?? {}) as UnknownRecord,
    participantTiersEnabled,
  };
}
