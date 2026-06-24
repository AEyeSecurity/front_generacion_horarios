"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CellStaffingEditor,
  EMPTY_TIER_COUNTS,
  EMPTY_TIER_POOLS,
  normalizeStaffGroups,
  serializeStaffGroups,
  TIERS,
  type Participant,
  type StaffOption,
  type TierCounts,
  type TierPools,
} from "@/components/dialogs/cell-staffing";
import { CELL_COLOR_OPTIONS_NO_RED as COLOR_OPTIONS } from "@/lib/cell-colors";
import { useI18n } from "@/lib/use-i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PanelAsyncState from "@/components/ui/PanelAsyncState";
import {
  normalizeCellFormBootstrap,
  readBootstrapEntityId,
  readBootstrapEntityIds,
} from "@/lib/cell-form-bootstrap";
import { cellFormBootstrapPath } from "@/lib/cell-api";
import { authFetch } from "@/lib/client-auth";

type DialogTranslate = ReturnType<typeof useI18n>["t"];

type TimeRange = { id: number; name: string; start_time: string; end_time: string };
type Unit = { id: number | string; name: string };
type Bundle = {
  id: number | string;
  name?: string;
  label?: string;
  display_name?: string;
  units?: unknown[];
};
type GridConfig = {
  cell_size_min?: number | null;
  cell_size_minutes?: number | null;
  slot_min?: number | null;
  days_enabled?: number[] | null;
  allow_overstaffing?: boolean | null;
  default_unit_mode?: string | null;
  day_start?: string | null;
  day_end?: string | null;
  tier_enable?: boolean | null;
  tier_enabled?: boolean | null;
  tiers_enabled?: boolean | null;
  participant_tiers_enabled?: boolean | null;
  solve_preference?: {
    default_unit_mode?: string | null;
  } | null;
};

type Cell = {
  id: number | string;
  name?: string;
  description?: string;
  duration_min?: number;
  duration_minutes?: number;
  quantity?: number;
  division_days?: number;
  split_parts_min?: Array<number | string>;
  allow_overstaffing?: boolean | null;
  split_order_flexible?: boolean | null;
  time_range?: number | string;
  unit_mode_override?: boolean | null;
  bundle_mode?: "AND" | "OR" | string | null;
  bundles?: unknown[];
  staffs?: unknown[];
  staff_groups?: unknown[] | null;
  colorHex?: string | null;
  color_hex?: string | null;
  locked_day_index?: number | string | null;
  locked_start_slot?: number | string | null;
  locked_duration_min?: number | string | null;
  headcount?: number | null;
  tier_counts?: Partial<TierCounts> | null;
  tier_pools?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", Array<string | number>>> | null;
  eligible_participants?: unknown[] | null;
  eligible_participant_ids?: Array<string | number> | null;
  participants?: unknown[] | null;
  selected_participants?: unknown[] | null;
  participant_tier_config?: {
    counts?: Partial<TierCounts> | null;
    tier_counts?: Partial<TierCounts> | null;
    pools?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", Array<string | number>>> | null;
    tier_pools?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", Array<string | number>>> | null;
  } | null;
  participant_tiers_enabled?: boolean | null;
  staff_options?: Array<{ staff?: string | number; members?: Array<string | number> }> | null;
  staff_options_resolved?: Array<{ staff?: string | number; members?: Array<string | number> }> | null;
  series_id?: string | null;
  seriesCells?: Cell[];
};

const LOCK_VALIDATION_KEYS = [
  "locked_duration_min",
  "locked_day_index",
  "locked_start_slot",
  "non_field_errors",
] as const;

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseClockToMin(value: string | null | undefined) {
  if (!value) return 0;
  const parts = String(value).split(":");
  if (parts.length < 2) return 0;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function readDefaultUnitMode(source: unknown): "AND" | "OR" {
  if (!source || typeof source !== "object") return "AND";
  const typed = source as {
    default_unit_mode?: unknown;
    solve_preference?: { default_unit_mode?: unknown } | null;
  };
  const raw = typed.default_unit_mode ?? typed.solve_preference?.default_unit_mode;
  return String(raw || "").toUpperCase() === "OR" ? "OR" : "AND";
}

function arraysEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildBalancedParts(total: number, parts: number) {
  const safeTotal = Math.max(1, Math.floor(total));
  const safeParts = Math.max(1, Math.min(Math.floor(parts), safeTotal));
  const base = Math.floor(safeTotal / safeParts);
  let remainder = safeTotal - base * safeParts;
  const out = Array.from({ length: safeParts }, () => base);
  for (let i = 0; i < out.length && remainder > 0; i += 1) {
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

function boundariesFromParts(parts: number[]) {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < parts.length - 1; i += 1) {
    acc += parts[i];
    out.push(acc);
  }
  return out;
}

function partsFromBoundaries(total: number, boundaries: number[]) {
  const out: number[] = [];
  let prev = 0;
  for (const boundary of boundaries) {
    out.push(Math.max(1, boundary - prev));
    prev = boundary;
  }
  out.push(Math.max(1, total - prev));
  return out;
}

function normalizeBoundaries(boundaries: number[], total: number, partsCount: number) {
  const safeTotal = Math.max(1, Math.floor(total));
  const safeParts = Math.max(1, Math.min(Math.floor(partsCount), safeTotal));
  const requiredLength = safeParts - 1;
  if (requiredLength <= 0) return [];

  const fallback = boundariesFromParts(buildBalancedParts(safeTotal, safeParts));
  const source = boundaries.length === requiredLength ? boundaries : fallback;
  const next: number[] = [];

  for (let i = 0; i < requiredLength; i += 1) {
    const min = i === 0 ? 1 : next[i - 1] + 1;
    const max = safeTotal - (safeParts - i - 1);
    const raw = Number.isFinite(source[i]) ? Math.round(source[i]) : min;
    next.push(clampInt(raw, min, max));
  }

  return next;
}

function parseNullableInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function flattenErrorMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenErrorMessages(entry));
  if (value && typeof value === "object") {
    const detail = (value as { detail?: unknown }).detail;
    if (typeof detail === "string") return [detail];
  }
  return [];
}

function parseStructuredApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const preferred = LOCK_VALIDATION_KEYS.flatMap((key) =>
    flattenErrorMessages(source[key]).map((message) => `${key}: ${message}`)
  );
  if (preferred.length > 0) return preferred.join("\n");

  const detail = flattenErrorMessages(source.detail);
  if (detail.length > 0) return detail.join("\n");

  const generic = Object.entries(source).flatMap(([key, value]) =>
    flattenErrorMessages(value).map((message) => `${key}: ${message}`)
  );
  return generic.length > 0 ? generic.join("\n") : null;
}

function buildApiErrorMessage(raw: string, status: number, fallback: string): string {
  const trimmed = raw.trim();
  if (trimmed) {
    if (/^<!doctype/i.test(trimmed) || /^<html/i.test(trimmed)) return `${fallback} (${status})`;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const structured = parseStructuredApiError(parsed);
      if (structured) return structured;
    } catch {}
    return trimmed;
  }
  return `${fallback} (${status})`;
}

function hasOwnField<T extends object>(source: T, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeLockPayload(cell: Cell, splitOrderFlexible: boolean) {
  const payload: {
    locked_day_index?: number | null;
    locked_start_slot?: number | null;
    locked_duration_min?: number | null;
  } = {};

  if (hasOwnField(cell, "locked_day_index")) {
    payload.locked_day_index = parseNullableInt(cell.locked_day_index);
  }
  if (hasOwnField(cell, "locked_start_slot")) {
    payload.locked_start_slot = parseNullableInt(cell.locked_start_slot);
  }
  if (hasOwnField(cell, "locked_duration_min")) {
    payload.locked_duration_min = splitOrderFlexible ? parseNullableInt(cell.locked_duration_min) : null;
  }

  return payload;
}

function parseSplitPartsCells(cell: Cell, cellMin: number): number[] {
  const normalizedCellMin = Math.max(1, Number(cellMin) || 1);
  const splitPartsRaw = Array.isArray(cell.split_parts_min)
    ? cell.split_parts_min
    : [];
  const partsFromSplit = splitPartsRaw
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part) && part > 0)
    .map((part) => Math.max(1, Math.round(part / normalizedCellMin)));

  if (partsFromSplit.length > 0) return partsFromSplit;

  const durationMinutes = Number(cell.duration_minutes ?? cell.duration_min) || normalizedCellMin;
  const totalCells = Math.max(1, Math.round(durationMinutes / normalizedCellMin));
  const legacyDays = Math.max(1, Math.round(Number(cell.division_days) || 1));
  if (legacyDays <= 1) return [totalCells];
  return buildBalancedParts(totalCells, legacyDays);
}

function buildStaffingError(
  t: DialogTranslate,
  tierEnabled: boolean,
  tierCounts: TierCounts,
  tierPools: TierPools,
  staffGroups: StaffOption[],
  participantMap: Record<string, Participant>,
  participants: Participant[]
) {
  if (!tierEnabled) {
    const headcount = Math.max(0, Number(tierCounts.PRIMARY || 0));
    if (headcount < 1) return t("cell_staffing.headcount_min_error");
    const poolIds = new Set((tierPools.PRIMARY || []).map(String));
    const groupIds = new Set<string>();
    for (const group of staffGroups) {
      if (group.staff && group.members.length === 0) continue;
      if (group.members.length !== headcount) return t("cell_staffing.staff_group_exact_headcount_error");
      for (const id of group.members) {
        if (poolIds.has(id)) return t("cell_staffing.participant_in_pool_and_staff_error");
        if (groupIds.has(id)) return t("cell_staffing.participant_multiple_staff_groups_error");
        groupIds.add(id);
        if (!participantMap[id]) return t("cell_staffing.staff_members_invalid_error");
      }
    }
    const hasPools = poolIds.size > 0;
    const hasGroups = staffGroups.length > 0;
    if (!hasPools && !hasGroups) return t("cell_staffing.staff_source_required_error");
    if (participants.length > 0 && headcount > participants.length) {
      return t("cell_staffing.headcount_exceeds_available_error", { count: participants.length });
    }
    return null;
  }

  const availableByTier: TierCounts = { ...EMPTY_TIER_COUNTS };
  for (const participant of participants) {
    if (participant.tier) {
      availableByTier[participant.tier] += 1;
    }
  }
  for (const tier of TIERS) {
    if (tierCounts[tier] > availableByTier[tier]) {
      return t("cell_staffing.tier_count_exceeds_available_error", {
        tier,
        count: availableByTier[tier],
      });
    }
  }

  const headcount = TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0);
  if (headcount < 1) return t("cell_staffing.headcount_min_error");

  const poolIds = new Set<string>();
  for (const tier of TIERS) {
    for (const id of tierPools[tier]) poolIds.add(id);
  }

  const groupIds = new Set<string>();
  for (const group of staffGroups) {
    if (group.staff && group.members.length === 0) continue;
    if (group.members.length !== headcount) return t("cell_staffing.staff_group_exact_headcount_error");
    const composition: TierCounts = { ...EMPTY_TIER_COUNTS };
    for (const id of group.members) {
      if (poolIds.has(id)) return t("cell_staffing.participant_in_tier_pool_and_staff_error");
      if (groupIds.has(id)) return t("cell_staffing.participant_multiple_staff_groups_error");
      groupIds.add(id);
      const tier = participantMap[id]?.tier;
      if (!tier) return t("cell_staffing.staff_members_tier_required_error");
      composition[tier] += 1;
    }
    if (TIERS.some((tier) => composition[tier] !== tierCounts[tier])) {
      return t("cell_staffing.staff_group_tier_composition_error");
    }
  }

  const hasPools = TIERS.some((tier) => tierPools[tier].length > 0);
  const hasGroups = staffGroups.length > 0;
  if (!hasPools && !hasGroups) return t("cell_staffing.tier_staff_source_required_error");
  return null;
}

function normalizeUnitSet(ids: unknown[]) {
  return Array.from(new Set(ids.map(readBootstrapEntityId).filter((id): id is string => Boolean(id))))
    .sort((a, b) => Number(a) - Number(b));
}

function serializeUnitSets(sets: string[][]) {
  return JSON.stringify(sets.map((set) => normalizeUnitSet(set)).sort((a, b) => a.join(",").localeCompare(b.join(","))));
}

function overlappingUnitIds(sets: string[][]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const set of sets) {
    for (const id of normalizeUnitSet(set)) {
      if (seen.has(id)) duplicates.add(id);
      else seen.add(id);
    }
  }
  return Array.from(duplicates).sort((a, b) => Number(a) - Number(b));
}

function stripBundleSuffix(name?: string) {
  return (name || "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function bundleKeyFromUnitIds(ids: unknown[]) {
  return normalizeUnitSet(ids).join(",");
}

function readBundleIdFromApiPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const direct = Number(source.id);
  if (Number.isFinite(direct)) return direct;
  const nestedBundle = source.bundle;
  if (nestedBundle && typeof nestedBundle === "object") {
    const nestedId = Number((nestedBundle as Record<string, unknown>).id);
    if (Number.isFinite(nestedId)) return nestedId;
  }
  const nestedData = source.data;
  if (nestedData && typeof nestedData === "object") {
    const nestedId = Number((nestedData as Record<string, unknown>).id);
    if (Number.isFinite(nestedId)) return nestedId;
  }
  return null;
}

function extractStaffMemberIds(staff: any): string[] {
  const raw = Array.isArray(staff?.members)
    ? staff.members
    : Array.isArray(staff?.participant_ids)
    ? staff.participant_ids
    : Array.isArray(staff?.participants)
    ? staff.participants
    : [];
  const ids = raw
    .map((item: any) => {
      if (item == null) return "";
      if (typeof item === "string" || typeof item === "number") return String(item);
      if (typeof item === "object") {
        if (item.id != null) return String(item.id);
        if (item.participant_id != null) return String(item.participant_id);
        if (item.participant != null) {
          if (typeof item.participant === "string" || typeof item.participant === "number") return String(item.participant);
          if (typeof item.participant === "object" && item.participant.id != null) return String(item.participant.id);
        }
      }
      return "";
    })
    .filter((value: string): value is string => Boolean(value));
  return Array.from(new Set<string>(ids)).sort();
}

export default function EditCellDialog({
  gridId,
  cell,
  open,
  onOpenChange,
  onSaved,
}: {
  gridId: number;
  cell: Cell | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const requestClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const ignoreOutsideClose = (e: Event) => {
    e.preventDefault();
  };

  const [step, setStep] = React.useState<number>(1);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [durationCells, setDurationCells] = React.useState<number>(1);
  const [multiDayEnabled, setMultiDayEnabled] = React.useState(false);
  const [splitDays, setSplitDays] = React.useState<number>(2);
  const [equalSplit, setEqualSplit] = React.useState(false);
  const [splitOrderFlexible, setSplitOrderFlexible] = React.useState(false);
  const [splitBoundaries, setSplitBoundaries] = React.useState<number[]>([1]);
  const [dragBoundaryIndex, setDragBoundaryIndex] = React.useState<number | null>(null);
  const [maxSplitDays, setMaxSplitDays] = React.useState<number>(7);
  const [timeRangeId, setTimeRangeId] = React.useState<string>("");
  const [colorHex, setColorHex] = React.useState<string | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);
  const [unitIds, setUnitIds] = React.useState<string[]>([]);
  const [bundleUnitSets, setBundleUnitSets] = React.useState<string[][]>([]);
  const [editingBundleIndex, setEditingBundleIndex] = React.useState<number | null>(null);
  const [seriesCellsSnapshot, setSeriesCellsSnapshot] = React.useState<Cell[]>([]);
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [timeRanges, setTimeRanges] = React.useState<TimeRange[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [bundles, setBundles] = React.useState<Bundle[]>([]);
  const [cellMin, setCellMin] = React.useState<number>(60);
  const [enabledDaysCount, setEnabledDaysCount] = React.useState<number>(7);
  const [horizonDayMinutes, setHorizonDayMinutes] = React.useState<number | null>(null);
  const [tierCounts, setTierCounts] = React.useState<TierCounts>({ ...EMPTY_TIER_COUNTS });
  const [tierPools, setTierPools] = React.useState<TierPools>({ ...EMPTY_TIER_POOLS });
  const [staffGroups, setStaffGroups] = React.useState<StaffOption[]>([]);
  const [availableStaffGroups, setAvailableStaffGroups] = React.useState<StaffOption[]>([]);
  const [allowOverstaffing, setAllowOverstaffing] = React.useState(false);
  const [gridAllowsOverstaffing, setGridAllowsOverstaffing] = React.useState(true);
  const [gridTierEnabled, setGridTierEnabled] = React.useState(true);
  const [globalUnitMode, setGlobalUnitMode] = React.useState<"AND" | "OR">("AND");
  const [unitModeOverride, setUnitModeOverride] = React.useState(false);
  const [initialStaffGroupsSerialized, setInitialStaffGroupsSerialized] = React.useState("[]");
  const [saving, setSaving] = React.useState(false);
  const [formLoading, setFormLoading] = React.useState(false);
  const [loadedBootstrapCellId, setLoadedBootstrapCellId] = React.useState<string | null>(null);
  const [formLoadError, setFormLoadError] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const splitSliderRef = React.useRef<HTMLDivElement | null>(null);
  const inferredHeadcount = React.useMemo(
    () =>
      gridTierEnabled
        ? TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0)
        : Math.max(0, Number(tierCounts.PRIMARY || 0)),
    [gridTierEnabled, tierCounts]
  );
  const participantMap = React.useMemo(
    () => Object.fromEntries(participants.map((p) => [String(p.id), p])) as Record<string, Participant>,
    [participants]
  );
  const participantTierCaps = React.useMemo(() => {
    const caps: TierCounts = { ...EMPTY_TIER_COUNTS };
    for (const participant of participants) {
      if (participant.tier) caps[participant.tier] += 1;
    }
    return caps;
  }, [participants]);
  const setTierCountsClamped = React.useCallback((next: TierCounts) => {
    if (!gridTierEnabled) {
      const cap = Math.max(1, participants.length);
      setTierCounts({
        PRIMARY: clampInt(next.PRIMARY || 0, 0, cap),
        SECONDARY: 0,
        TERTIARY: 0,
      });
      return;
    }
    setTierCounts({
      PRIMARY: clampInt(next.PRIMARY || 0, 0, participantTierCaps.PRIMARY),
      SECONDARY: clampInt(next.SECONDARY || 0, 0, participantTierCaps.SECONDARY),
      TERTIARY: clampInt(next.TERTIARY || 0, 0, participantTierCaps.TERTIARY),
    });
  }, [gridTierEnabled, participantTierCaps, participants.length]);
  const unitNameById = React.useMemo(
    () =>
      Object.fromEntries(
        units.map((u) => [String(u.id), u.name || t("format.unit_with_id", { id: u.id })])
      ) as Record<string, string>,
    [t, units]
  );
  const previewBundleSets = React.useMemo(() => {
    if (bundleUnitSets.length === 0) {
      if (unitIds.length === 0) return [];
      return [normalizeUnitSet(unitIds)];
    }
    if (editingBundleIndex == null) return bundleUnitSets;
    return bundleUnitSets.map((set, index) =>
      index === editingBundleIndex ? normalizeUnitSet(unitIds) : set
    );
  }, [bundleUnitSets, editingBundleIndex, unitIds]);
  const activeBundleSets = React.useMemo(() => {
    return previewBundleSets.filter((set) => set.length > 0);
  }, [previewBundleSets]);
  const usedUnitIds = React.useMemo(() => {
    const sets = bundleUnitSets.filter((_, index) => index !== editingBundleIndex);
    return new Set(sets.flat());
  }, [bundleUnitSets, editingBundleIndex]);
  const effectiveUnitMode: "AND" | "OR" = unitModeOverride
    ? globalUnitMode === "AND"
      ? "OR"
      : "AND"
    : globalUnitMode;
  const bundleSetsError = React.useMemo(() => {
    const duplicates = overlappingUnitIds(activeBundleSets);
    if (duplicates.length === 0) return null;
    return t("create_cell.bundle_sets_overlap", {
      units: duplicates.map((id) => unitNameById[id] || t("format.unit_with_id", { id })).join(", "),
    });
  }, [activeBundleSets, t, unitNameById]);

  const durationCellsSafe = React.useMemo(
    () => Math.max(1, Math.floor(Number(durationCells) || 1)),
    [durationCells]
  );
  const maxSplitDaysSafe = React.useMemo(
    () => Math.max(1, Math.min(7, Math.floor(Number(maxSplitDays) || 7))),
    [maxSplitDays]
  );
  const maxSplitByDuration = React.useMemo(
    () => Math.min(maxSplitDaysSafe, durationCellsSafe),
    [maxSplitDaysSafe, durationCellsSafe]
  );
  const selectedTimeRangeSpanMin = React.useMemo(() => {
    const selectedId = String(timeRangeId || "");
    if (!selectedId) return null;
    const selectedRange = timeRanges.find((range) => String(range.id) === selectedId);
    if (!selectedRange) return null;
    const span = parseClockToMin(selectedRange.end_time) - parseClockToMin(selectedRange.start_time);
    return span > 0 ? span : null;
  }, [timeRangeId, timeRanges]);
  const selectedTimeRangeDayCells = React.useMemo(() => {
    if (selectedTimeRangeSpanMin == null) return null;
    return Math.max(1, Math.floor(selectedTimeRangeSpanMin / Math.max(1, cellMin)));
  }, [selectedTimeRangeSpanMin, cellMin]);
  const canEnableMultiDay = maxSplitByDuration >= 2;
  const splitDaysSafe = React.useMemo(() => {
    if (!multiDayEnabled || !canEnableMultiDay) return 1;
    return clampInt(splitDays, 2, maxSplitByDuration);
  }, [multiDayEnabled, canEnableMultiDay, splitDays, maxSplitByDuration]);
  const canEqualSplit = React.useMemo(
    () => multiDayEnabled && splitDaysSafe > 1 && durationCellsSafe % splitDaysSafe === 0,
    [multiDayEnabled, splitDaysSafe, durationCellsSafe]
  );
  const maxDurationDayCells = React.useMemo(() => {
    if (selectedTimeRangeDayCells != null) return selectedTimeRangeDayCells;
    const minutesFromGrid = horizonDayMinutes && horizonDayMinutes > 0 ? horizonDayMinutes : 0;
    if (minutesFromGrid > 0) {
      return Math.max(1, Math.floor(minutesFromGrid / Math.max(1, cellMin)));
    }
    const spans = timeRanges
      .map((range) => parseClockToMin(range.end_time) - parseClockToMin(range.start_time))
      .filter((span) => span > 0);
    if (spans.length === 0) return null;
    return Math.max(1, Math.floor(Math.max(...spans) / Math.max(1, cellMin)));
  }, [selectedTimeRangeDayCells, horizonDayMinutes, cellMin, timeRanges]);
  const requiredSplitDays = React.useMemo(() => {
    if (maxDurationDayCells == null || maxDurationDayCells <= 0) return 1;
    const required = Math.ceil(durationCellsSafe / maxDurationDayCells);
    return clampInt(required, 1, Math.max(1, Math.min(maxSplitDaysSafe, durationCellsSafe)));
  }, [maxDurationDayCells, durationCellsSafe, maxSplitDaysSafe]);
  const minSplitDaysRequired = React.useMemo(() => Math.max(2, requiredSplitDays), [requiredSplitDays]);
  const maxDurationCellsAllowed = React.useMemo(() => {
    if (maxDurationDayCells == null) return null;
    const dayFactor = enabledDaysCount > 1 ? Math.max(1, enabledDaysCount) : 1;
    return Math.max(1, maxDurationDayCells * dayFactor);
  }, [maxDurationDayCells, enabledDaysCount]);
  const hasTimeRangeOptions = timeRanges.length > 0;
  const canShowMultiDayToggle = enabledDaysCount > 1;
  const hasUnitsStep = true;

  React.useEffect(() => {
    if (!multiDayEnabled) {
      if (equalSplit) setEqualSplit(false);
      if (splitOrderFlexible) setSplitOrderFlexible(false);
      return;
    }
    if (!canEnableMultiDay) {
      setMultiDayEnabled(false);
      setEqualSplit(false);
      return;
    }
    if (splitDays !== splitDaysSafe) {
      setSplitDays(splitDaysSafe);
    }
  }, [multiDayEnabled, equalSplit, splitOrderFlexible, step, canEnableMultiDay, splitDays, splitDaysSafe]);

  React.useEffect(() => {
    if (canShowMultiDayToggle) return;
    if (!multiDayEnabled) return;
    setMultiDayEnabled(false);
    setEqualSplit(false);
    setSplitOrderFlexible(false);
  }, [canShowMultiDayToggle, multiDayEnabled]);

  React.useEffect(() => {
    if (!gridTierEnabled) {
      const cap = Math.max(1, participants.length);
      setTierCounts((prev) => ({
        PRIMARY: clampInt(prev.PRIMARY || 0, 0, cap),
        SECONDARY: 0,
        TERTIARY: 0,
      }));
      return;
    }
    setTierCounts((prev) => ({
      PRIMARY: clampInt(prev.PRIMARY || 0, 0, participantTierCaps.PRIMARY),
      SECONDARY: clampInt(prev.SECONDARY || 0, 0, participantTierCaps.SECONDARY),
      TERTIARY: clampInt(prev.TERTIARY || 0, 0, participantTierCaps.TERTIARY),
    }));
  }, [gridTierEnabled, participantTierCaps, participants.length]);

  React.useEffect(() => {
    if (maxDurationCellsAllowed == null) return;
    if (durationCellsSafe <= maxDurationCellsAllowed) return;
    setDurationCells(maxDurationCellsAllowed);
  }, [maxDurationCellsAllowed, durationCellsSafe]);

  React.useEffect(() => {
    if (!canShowMultiDayToggle) return;
    if (requiredSplitDays <= 1) return;
    if (!multiDayEnabled) {
      setMultiDayEnabled(true);
      setEqualSplit(false);
      setSplitOrderFlexible(false);
    }
    const targetDays = clampInt(requiredSplitDays, 2, Math.max(2, maxSplitByDuration));
    if (splitDays !== targetDays) {
      setSplitDays(targetDays);
    }
    setSplitBoundaries((prev) =>
      normalizeBoundaries(prev, Math.max(2, durationCellsSafe), targetDays),
    );
  }, [
    canShowMultiDayToggle,
    requiredSplitDays,
    multiDayEnabled,
    splitDays,
    maxSplitByDuration,
    durationCellsSafe,
  ]);

  React.useEffect(() => {
    if (!multiDayEnabled) return;

    if (equalSplit) {
      if (!canEqualSplit) {
        setEqualSplit(false);
        return;
      }
      const perPart = durationCellsSafe / splitDaysSafe;
      const equalParts = Array.from({ length: splitDaysSafe }, () => perPart);
      const next = boundariesFromParts(equalParts);
      setSplitBoundaries((prev) => (arraysEqual(prev, next) ? prev : next));
      return;
    }

    setSplitBoundaries((prev) => {
      const next = normalizeBoundaries(prev, durationCellsSafe, splitDaysSafe);
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [multiDayEnabled, equalSplit, canEqualSplit, durationCellsSafe, splitDaysSafe]);

  const sliderBoundaries = React.useMemo(
    () => normalizeBoundaries(splitBoundaries, durationCellsSafe, splitDaysSafe),
    [splitBoundaries, durationCellsSafe, splitDaysSafe]
  );
  const splitPartsCells = React.useMemo(() => {
    if (!multiDayEnabled || !canEnableMultiDay) return [durationCellsSafe];
    return partsFromBoundaries(durationCellsSafe, sliderBoundaries);
  }, [multiDayEnabled, canEnableMultiDay, durationCellsSafe, sliderBoundaries]);
  const splitPartsMin = React.useMemo(
    () => splitPartsCells.map((cells) => cells * Math.max(1, cellMin)),
    [splitPartsCells, cellMin]
  );
  const splitSegments = React.useMemo(() => {
    if (durationCellsSafe <= 0) return [];
    const points = [0, ...sliderBoundaries, durationCellsSafe];
    return splitPartsCells.map((partCells, index) => {
      const start = points[index] ?? 0;
      const end = points[index + 1] ?? durationCellsSafe;
      const centerPct = ((start + end) / 2 / durationCellsSafe) * 100;
      return {
        centerPct,
        cells: partCells,
        minutes: partCells * Math.max(1, cellMin),
      };
    });
  }, [durationCellsSafe, sliderBoundaries, splitPartsCells, cellMin]);
  const splitStepReady = React.useMemo(() => {
    if (!multiDayEnabled) return true;
    if (!canEnableMultiDay) return false;
    if (splitPartsCells.length !== splitDaysSafe) return false;
    if (splitPartsCells.some((part) => part < 1)) return false;
    return splitPartsCells.reduce((sum, part) => sum + part, 0) === durationCellsSafe;
  }, [multiDayEnabled, canEnableMultiDay, splitPartsCells, splitDaysSafe, durationCellsSafe]);
  const steps = React.useMemo(() => {
    const flow: Array<"info" | "split" | "units" | "staffing"> = ["info"];
    if (multiDayEnabled) flow.push("split");
    if (hasUnitsStep) flow.push("units");
    flow.push("staffing");
    return flow;
  }, [hasUnitsStep, multiDayEnabled]);
  const totalSteps = steps.length || 1;
  const finalStep = totalSteps;
  const currentStepKey = steps.length > 0 ? steps[Math.min(Math.max(step, 1), totalSteps) - 1] ?? "info" : "info";
  const accentColor = colorHex ?? "#111827";

  React.useEffect(() => {
    if (step <= totalSteps) return;
    setStep(totalSteps);
  }, [step, totalSteps]);

  React.useEffect(() => {
    if (!open || !cell) {
      setLoadedBootstrapCellId(null);
      setFormLoadError(null);
      return;
    }
    let active = true;
    setLoadedBootstrapCellId(null);
    setFormLoadError(null);
    setFormLoading(true);
    setErr(null);
    setStep(1);
    setName(stripBundleSuffix(cell.name) || "");
    setDescription(cell.description || "");
    setQuantity(Math.max(1, Number(cell.quantity) || 1));
    setUnitIds([]);
    setEditingBundleIndex(null);
    setAvailableStaffGroups([]);

    (async () => {
      try {
        const response = await authFetch(cellFormBootstrapPath(cell.id), { cache: "no-store" });
        if (!response.ok) throw new Error(`${t("create_cell.failed_load_data")} (${response.status})`);
        const bootstrap = normalizeCellFormBootstrap(await response.json());
        if (!active) return;

        const baseCell = (bootstrap.cell ?? cell) as Cell;
        const seriesCells = bootstrap.seriesCells.length > 0
          ? (bootstrap.seriesCells as Cell[])
          : baseCell.seriesCells?.length
          ? baseCell.seriesCells
          : cell.seriesCells?.length
          ? cell.seriesCells
          : [baseCell];
        const gridConfig = { ...bootstrap.options, ...bootstrap.grid } as GridConfig;
        const gridCellMin = Math.max(
          1,
          Number(gridConfig.cell_size_min ?? gridConfig.cell_size_minutes ?? gridConfig.slot_min ?? 1),
        );
        const enabledDays = Array.isArray(gridConfig.days_enabled) ? gridConfig.days_enabled : [];
        const enabledDayCount = Math.max(1, Math.min(7, enabledDays.length || 7));
        const configuredMaxDays = Number(
          bootstrap.divisionConfig.max_days ?? bootstrap.divisionConfig.max_split_days,
        );
        const gridMaxDays = Number.isFinite(configuredMaxDays) && configuredMaxDays > 0
          ? Math.min(enabledDayCount, Math.floor(configuredMaxDays))
          : enabledDayCount;

        setSeriesCellsSnapshot(seriesCells);
        setName(stripBundleSuffix(baseCell.name) || "");
        setDescription(baseCell.description || "");
        setQuantity(Math.max(1, Number(baseCell.quantity) || 1));
        setTimeRangeId(baseCell.time_range != null ? String(baseCell.time_range) : "");
        setColorHex((baseCell.colorHex || baseCell.color_hex || null) as string | null);
        setAllowOverstaffing(Boolean(baseCell.allow_overstaffing));
        setCellMin(gridCellMin);
        setMaxSplitDays(gridMaxDays);
        setEnabledDaysCount(enabledDayCount);

        const startMin = parseClockToMin(gridConfig.day_start);
        const endMin = parseClockToMin(gridConfig.day_end);
        setHorizonDayMinutes(endMin > startMin ? endMin - startMin : null);

        const overstaffingEnabled =
          (bootstrap.featureFlags.allow_overstaffing ?? gridConfig.allow_overstaffing) !== false;
        const tierEnabled = bootstrap.participantTiersEnabled || baseCell.participant_tiers_enabled === true;
        setGridAllowsOverstaffing(overstaffingEnabled);
        setGridTierEnabled(tierEnabled);
        const defaultUnitMode = readDefaultUnitMode(gridConfig);
        const savedBundleMode = String(
          baseCell.bundle_mode ?? bootstrap.raw.bundle_mode ?? bootstrap.options.bundle_mode ?? "",
        ).toUpperCase();
        setGlobalUnitMode(defaultUnitMode);
        setUnitModeOverride(
          savedBundleMode === "AND" || savedBundleMode === "OR"
            ? savedBundleMode !== defaultUnitMode
            : Boolean(baseCell.unit_mode_override),
        );
        if (!overstaffingEnabled) setAllowOverstaffing(false);

        const initialSplitParts = parseSplitPartsCells(baseCell, gridCellMin);
        const initialDurationCells = Math.max(1, initialSplitParts.reduce((sum, part) => sum + part, 0));
        const cappedDays = Math.max(1, Math.min(initialSplitParts.length, initialDurationCells, gridMaxDays));
        const initialParts = initialSplitParts.length === cappedDays
          ? initialSplitParts
          : buildBalancedParts(initialDurationCells, cappedDays);
        setDurationCells(initialDurationCells);
        setMultiDayEnabled(cappedDays > 1);
        setSplitDays(cappedDays > 1 ? cappedDays : 2);
        setSplitBoundaries(boundariesFromParts(initialParts));
        setSplitOrderFlexible(Boolean(baseCell.split_order_flexible));
        setEqualSplit(initialParts.length > 1 && initialParts.every((part) => part === initialParts[0]));

        setParticipants(bootstrap.participants as Participant[]);
        setTimeRanges(bootstrap.timeRanges as TimeRange[]);
        const selectedBundleObjects = seriesCells
          .flatMap((seriesCell) => Array.isArray(seriesCell.bundles) ? seriesCell.bundles : [])
          .filter((bundle): bundle is Record<string, unknown> => Boolean(bundle && typeof bundle === "object" && !Array.isArray(bundle)));
        const bundleOptions = [...(bootstrap.bundles as Bundle[]), ...(selectedBundleObjects as Bundle[])]
          .filter((bundle, index, all) => bundle?.id != null && all.findIndex((entry) => String(entry.id) === String(bundle.id)) === index);
        const bundleUnits = bundleOptions.flatMap((bundle) => Array.isArray(bundle.units) ? bundle.units : []);
        const resolvedBundleUnits = bundleUnits
          .filter((unit): unit is Record<string, unknown> => Boolean(unit && typeof unit === "object" && !Array.isArray(unit)))
          .map((unit) => {
            const id = readBootstrapEntityId(unit);
            const label = unit.display_name ?? unit.label ?? unit.name;
            return id && typeof label === "string" ? { id, name: label } : null;
          })
          .filter((unit): unit is { id: string; name: string } => Boolean(unit));
        const unitOptions = [...(bootstrap.units as Unit[]), ...resolvedBundleUnits]
          .filter((unit, index, all) => unit?.id != null && all.findIndex((entry) => String(entry.id) === String(unit.id)) === index);
        setUnits(unitOptions);
        setBundles(bundleOptions);

        const bundlesById = new Map(bundleOptions.map((bundle) => [String(bundle.id), bundle]));
        const unitsForBundleEntry = (entry: unknown): unknown[] => {
          if (Array.isArray(entry)) return entry;
          if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            const bundle = entry as Record<string, unknown>;
            if (Array.isArray(bundle.units)) return bundle.units;
            const bundleId = readBootstrapEntityId(bundle);
            return bundleId ? bundlesById.get(bundleId)?.units ?? [] : [];
          }
          const bundleId = readBootstrapEntityId(entry);
          return bundleId ? bundlesById.get(bundleId)?.units ?? [] : [];
        };
        const rawBundleSets = bootstrap.raw.bundle_unit_sets ??
          bootstrap.options.bundle_unit_sets ??
          bootstrap.raw.bundles_config ??
          (baseCell as Cell & { bundle_unit_sets?: unknown[] }).bundle_unit_sets;
        let initialSets: string[][] = Array.isArray(rawBundleSets)
          ? rawBundleSets.map((entry) => normalizeUnitSet(unitsForBundleEntry(entry))).filter((set) => set.length > 0)
          : [];
        if (initialSets.length === 0) {
          initialSets = seriesCells.map((seriesCell) => {
            const unitSet = new Set<string>();
            for (const bundleEntry of seriesCell.bundles ?? []) {
              for (const unitId of normalizeUnitSet(unitsForBundleEntry(bundleEntry))) unitSet.add(unitId);
            }
            return normalizeUnitSet(Array.from(unitSet));
          }).filter((set) => set.length > 0);
        }
        setBundleUnitSets(initialSets);

        const participantTierConfig = (
          baseCell.participant_tier_config ??
          bootstrap.raw.participant_tier_config ??
          bootstrap.options.participant_tier_config
        ) as Cell["participant_tier_config"];
        const configuredTierCounts = participantTierConfig?.counts ??
          participantTierConfig?.tier_counts ??
          baseCell.tier_counts ??
          (bootstrap.raw.tier_counts as Partial<TierCounts> | undefined) ??
          (bootstrap.options.tier_counts as Partial<TierCounts> | undefined);
        const configuredTierPools = participantTierConfig?.pools ??
          participantTierConfig?.tier_pools ??
          baseCell.tier_pools ??
          (bootstrap.raw.tier_pools as Cell["tier_pools"]) ??
          (bootstrap.options.tier_pools as Cell["tier_pools"]);
        const nextTierCounts: TierCounts = {
          PRIMARY: Number(configuredTierCounts?.PRIMARY || 0),
          SECONDARY: Number(configuredTierCounts?.SECONDARY || 0),
          TERTIARY: Number(configuredTierCounts?.TERTIARY || 0),
        };
        const resolvedHeadcount = Math.max(1, Number(
          baseCell.headcount ?? bootstrap.raw.headcount ?? bootstrap.options.headcount ?? 1,
        ) || 1);
        const nextTierTotal = TIERS.reduce((sum, tier) => sum + nextTierCounts[tier], 0);
        if (tierEnabled) {
          if (nextTierTotal < 1) nextTierCounts.PRIMARY = resolvedHeadcount;
          setTierCounts(nextTierCounts);
          setTierPools({
            PRIMARY: readBootstrapEntityIds(configuredTierPools?.PRIMARY ?? []),
            SECONDARY: readBootstrapEntityIds(configuredTierPools?.SECONDARY ?? []),
            TERTIARY: readBootstrapEntityIds(configuredTierPools?.TERTIARY ?? []),
          });
        } else {
          const eligible = readBootstrapEntityIds(
            baseCell.eligible_participant_ids ??
              baseCell.eligible_participants ??
              baseCell.selected_participants ??
              baseCell.participants ??
              bootstrap.raw.eligible_participant_ids ??
              bootstrap.raw.selected_participants ??
              bootstrap.raw.eligible_participants ??
              bootstrap.options.selected_participants ??
              bootstrap.options.eligible_participant_ids ??
              bootstrap.options.eligible_participants ??
              [],
          );
          setTierCounts({ PRIMARY: Math.max(1, resolvedHeadcount || nextTierTotal), SECONDARY: 0, TERTIARY: 0 });
          setTierPools({ PRIMARY: eligible, SECONDARY: [], TERTIARY: [] });
        }

        const staffMembersById: Record<string, string[]> = {};
        for (const row of bootstrap.staffMembers) {
          const staffId = row.staff != null ? String(row.staff) : "";
          const participantId = row.participant != null ? String(row.participant) : "";
          if (!staffId || !participantId) continue;
          if (!staffMembersById[staffId]) staffMembersById[staffId] = [];
          staffMembersById[staffId].push(participantId);
        }
        for (const staff of bootstrap.staffs) {
          if (staff.id == null) continue;
          const staffId = String(staff.id);
          if (!staffMembersById[staffId]?.length) staffMembersById[staffId] = extractStaffMemberIds(staff);
        }
        const availableGroups = normalizeStaffGroups(
          bootstrap.staffs as Parameters<typeof normalizeStaffGroups>[0],
        ).map((group) => group.members.length > 0 || !group.staff
          ? group
          : { ...group, members: staffMembersById[group.staff] ?? [] });
        setAvailableStaffGroups(availableGroups);

        const resolvedStaffGroups = (
          baseCell.staff_groups ??
          bootstrap.raw.selected_staff_groups ??
          bootstrap.raw.staff_groups ??
          bootstrap.options.selected_staff_groups
        ) as Parameters<typeof normalizeStaffGroups>[0];
        let groups = normalizeStaffGroups(
          resolvedStaffGroups || baseCell.staff_options_resolved || baseCell.staff_options,
        ).map((group) => group.members.length > 0 || !group.staff
          ? group
          : { ...group, members: staffMembersById[group.staff] ?? [] });
        if (groups.length === 0) {
          const staffIds = Array.from(new Set(seriesCells.flatMap((seriesCell) => readBootstrapEntityIds(seriesCell.staffs ?? []))));
          groups = normalizeStaffGroups(staffIds.map((staffId) => ({ staff: staffId, members: staffMembersById[staffId] ?? [] })));
        }
        setStaffGroups(groups);
        setInitialStaffGroupsSerialized(serializeStaffGroups(groups));
        setLoadedBootstrapCellId(String(cell.id));
      } catch (error: unknown) {
        if (active) setFormLoadError(error instanceof Error ? error.message : t("create_cell.failed_load_data"));
      } finally {
        if (active) {
          setFormLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [open, gridId, cell, t]);

  const stepOneReady = Boolean(
    name.trim() &&
      durationCellsSafe >= 1 &&
      (maxDurationCellsAllowed == null || durationCellsSafe <= maxDurationCellsAllowed)
  );
  const unitsStepReady = !bundleSetsError;
  const staffingError = buildStaffingError(t, gridTierEnabled, tierCounts, tierPools, staffGroups, participantMap, participants);
  const individualEligibleParticipantIds = React.useMemo(
    () => Array.from(new Set(
      Object.values(tierPools).flatMap((ids) => ids || []).map(String),
    )).sort(),
    [tierPools],
  );
  const participantsReady = staffGroups.length > 0 ||
    (participants.length > 0 && individualEligibleParticipantIds.length > 0);
  const formReady = !formLoading && loadedBootstrapCellId === String(cell?.id ?? "");
  const canSubmit = formReady && stepOneReady && splitStepReady && unitsStepReady && participantsReady && !staffingError && !bundleSetsError;
  const canAdvanceFromCurrentStep =
    currentStepKey === "info"
      ? stepOneReady
      : currentStepKey === "split"
      ? splitStepReady
      : currentStepKey === "units"
      ? unitsStepReady
      : false;
  const canOpenStep = (targetStep: number) => {
    if (targetStep <= 1) return true;
    for (let index = 1; index < targetStep; index += 1) {
      const key = steps[index - 1];
      if (key === "info" && !stepOneReady) return false;
      if (key === "split" && !splitStepReady) return false;
      if (key === "units" && !unitsStepReady) return false;
    }
    return true;
  };
  const toggleUnitSelection = (unitId: string) => {
    const isSelected = unitIds.includes(unitId);
    const isDisabled = usedUnitIds.has(unitId) && !isSelected;
    if (isDisabled) return;
    setUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((value) => value !== unitId) : [...prev, unitId]
    );
  };

  const onBoundaryChange = React.useCallback((index: number, value: number) => {
    setEqualSplit(false);
    setSplitBoundaries((prev) => {
      const current = normalizeBoundaries(prev, durationCellsSafe, splitDaysSafe);
      if (index < 0 || index >= current.length) return current;
      const before = index === 0 ? 0 : current[index - 1];
      const after = index === current.length - 1 ? durationCellsSafe : current[index + 1];
      const min = before + 1;
      const max = after - 1;
      const next = [...current];
      next[index] = clampInt(value, min, max);
      return normalizeBoundaries(next, durationCellsSafe, splitDaysSafe);
    });
  }, [durationCellsSafe, splitDaysSafe]);

  const updateBoundaryFromClientX = React.useCallback((index: number, clientX: number) => {
    const slider = splitSliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const raw = Math.round(ratio * durationCellsSafe);
    onBoundaryChange(index, raw);
  }, [durationCellsSafe, onBoundaryChange]);

  React.useEffect(() => {
    if (dragBoundaryIndex == null || equalSplit) return;
    const onMove = (event: PointerEvent) => {
      updateBoundaryFromClientX(dragBoundaryIndex, event.clientX);
    };
    const onEnd = () => {
      setDragBoundaryIndex(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragBoundaryIndex, equalSplit, updateBoundaryFromClientX]);

  React.useEffect(() => {
    if (equalSplit || !multiDayEnabled) {
      setDragBoundaryIndex(null);
    }
  }, [equalSplit, multiDayEnabled]);

  const onToggleMultiDay = (checked: boolean) => {
    if (!checked) {
      setMultiDayEnabled(false);
      setEqualSplit(false);
      setSplitOrderFlexible(false);
      return;
    }

    if (!canShowMultiDayToggle) return;
    if (durationCellsSafe < 2) {
      setDurationCells(2);
    }
    setMultiDayEnabled(true);
    const targetDays = clampInt(
      Math.max(splitDays, minSplitDaysRequired),
      2,
      Math.max(2, maxSplitByDuration),
    );
    setSplitDays(targetDays);
    setSplitBoundaries((prev) => normalizeBoundaries(prev, Math.max(2, durationCellsSafe), targetDays));
  };

  const saveCurrentUnitSet = (): boolean => {
    const normalized = normalizeUnitSet(unitIds);
    if (normalized.length === 0) return true;
    const normalizedKey = normalized.join(",");
    const duplicate = bundleUnitSets.some(
      (set, index) => index !== editingBundleIndex && normalizeUnitSet(set).join(",") === normalizedKey,
    );
    if (duplicate) {
      setErr(t("create_cell.duplicate_bundle_set"));
      return false;
    }
    const nextSets =
      editingBundleIndex == null
        ? [...bundleUnitSets, normalized]
        : bundleUnitSets.map((set, index) => (index === editingBundleIndex ? normalized : set));
    const overlap = overlappingUnitIds(nextSets);
    if (overlap.length > 0) {
      setErr(
        t("create_cell.bundle_sets_overlap", {
          units: overlap.map((id) => unitNameById[id] || t("format.unit_with_id", { id })).join(", "),
        })
      );
      return false;
    }
    setBundleUnitSets(nextSets);
    setUnitIds([]);
    setEditingBundleIndex(null);
    setErr(null);
    return true;
  };

  const goToNextStep = () => {
    if (currentStepKey === "units" && unitIds.length > 0 && !saveCurrentUnitSet()) return;
    setStep((prev) => Math.min(finalStep, prev + 1));
  };

  async function patchCell(targetCellId: number | string, payload: any) {
    const res = await fetch(`/api/cells/${targetCellId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(buildApiErrorMessage(raw, res.status, t("edit_cell.failed_update_cell")));
    }
  }

  async function deleteCell(targetCellId: number | string) {
    const res = await fetch(`/api/cells/${targetCellId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed (${res.status})`);
    }
  }

  async function fetchBundlesSnapshot(): Promise<Bundle[]> {
    const endpoints = [
      `/api/bundles?grid=${gridId}`,
      `/api/bundles/?grid=${gridId}`,
    ];
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ([]));
      const list = Array.isArray(payload) ? payload : payload?.results ?? [];
      if (Array.isArray(list)) return list as Bundle[];
    }
    return [];
  }

  async function ensureBundleId(unitSet: number[]) {
    const targetKey = bundleKeyFromUnitIds(unitSet);
    const fromState = bundles.find((bundle) => bundleKeyFromUnitIds(bundle.units ?? []) === targetKey);
    if (fromState?.id != null) return Number(fromState.id);

    const snapshot = await fetchBundlesSnapshot();
    const existing = snapshot.find((bundle) => bundleKeyFromUnitIds(bundle.units ?? []) === targetKey);
    if (existing?.id != null) {
      setBundles(snapshot);
      return Number(existing.id);
    }

    const inferredName = normalizeUnitSet(unitSet)
      .map((unitId) => unitNameById[String(unitId)] || t("format.unit_with_id", { id: unitId }))
      .sort((a, b) => a.localeCompare(b))
      .join(" + ");
    const payloads = [
      { grid: gridId, name: inferredName, unit_ids: unitSet },
      { grid: gridId, name: inferredName, units: unitSet },
      { grid: gridId, name: inferredName, unit_ids: unitSet, units: unitSet },
      { grid_id: gridId, name: inferredName, unit_ids: unitSet, units: unitSet },
    ];
    const attemptErrors: string[] = [];

    for (const payload of payloads) {
      const res = await fetch(`/api/bundles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.text().catch(() => "");
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = raw;
      }

      if (!res.ok) {
        const detail =
          typeof data === "string" && data.trim()
            ? data.trim()
            : parseStructuredApiError(data) || `status ${res.status}`;
        attemptErrors.push(detail);
        continue;
      }

      const bundleId = readBundleIdFromApiPayload(data);
      if (bundleId != null) {
        const refreshed = await fetchBundlesSnapshot();
        if (refreshed.length > 0) {
          setBundles(refreshed);
        } else if (data && typeof data === "object") {
          setBundles((prev) => {
            const next = [...prev];
            const existingIndex = next.findIndex((bundle) => String(bundle.id) === String(bundleId));
            if (existingIndex >= 0) next[existingIndex] = data as Bundle;
            else next.push(data as Bundle);
            return next;
          });
        }
        return bundleId;
      }
    }

    if (attemptErrors.length > 0) {
      throw new Error(`Failed to resolve bundle for the selected units.\n${attemptErrors[attemptErrors.length - 1]}`);
    }
    throw new Error("Failed to resolve bundle for the selected units.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !cell) return;
    if (maxDurationCellsAllowed != null && durationCellsSafe > maxDurationCellsAllowed) {
      setErr(`Duration cannot exceed ${maxDurationCellsAllowed} cells for the selected horizon.`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const fallbackSeriesCells = cell.seriesCells?.length ? cell.seriesCells : [cell];
      const seriesCells = seriesCellsSnapshot.length > 0 ? seriesCellsSnapshot : fallbackSeriesCells;
      const splitOrderFlexibleValue = multiDayEnabled ? splitOrderFlexible : false;
      const normalizedTierCounts: TierCounts = gridTierEnabled
        ? tierCounts
        : { PRIMARY: inferredHeadcount, SECONDARY: 0, TERTIARY: 0 };
      const normalizedTierPools: TierPools = gridTierEnabled
        ? tierPools
        : {
            PRIMARY: Array.from(new Set((tierPools.PRIMARY || []).map(String))).sort(),
            SECONDARY: [],
            TERTIARY: [],
          };
      const basePayload: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        duration_minutes: splitPartsMin.reduce((sum, part) => sum + part, 0),
        quantity: Math.max(1, Math.round(quantity)),
        split_parts_min: splitPartsMin,
        split_order_flexible: splitOrderFlexibleValue,
        duration_min: splitPartsMin.reduce((sum, part) => sum + part, 0),
        division_days: splitPartsMin.length,
        div_days: splitPartsMin.length,
        division_days_config: { days: splitPartsMin.length, parts_min: splitPartsMin, flexible_order: splitOrderFlexibleValue },
        time_range: timeRangeId ? Number(timeRangeId) : null,
        time_range_config: timeRangeId ? { id: Number(timeRangeId) } : null,
        colorHex: colorHex ?? null,
        headcount: inferredHeadcount,
        allow_overstaffing: gridAllowsOverstaffing ? allowOverstaffing : null,
        unit_mode_override: unitModeOverride,
        bundle_mode: effectiveUnitMode,
      };
      if (gridTierEnabled) {
        basePayload.tier_counts = normalizedTierCounts;
        basePayload.tier_pools = normalizedTierPools;
        basePayload.participant_tier_config = { counts: normalizedTierCounts, pools: normalizedTierPools };
      } else {
        basePayload.eligible_participant_ids = individualEligibleParticipantIds.map((id) => (/^\d+$/.test(id) ? Number(id) : id));
      }

      const serializedCurrentStaff = serializeStaffGroups(staffGroups);
      const staffOptionsPayload = staffGroups.map((group) => ({
        ...(group.staff ? { staff: group.staff } : {}),
        members: group.members,
      }));
      const sharedPayload: any = { ...basePayload };
      if (!gridTierEnabled && staffGroups.length > 0) {
        sharedPayload.staff_options = staffOptionsPayload;
      } else if (serializedCurrentStaff !== initialStaffGroupsSerialized) {
        sharedPayload.staff_options = staffOptionsPayload;
      }

      const desiredSets = activeBundleSets.map((set) => set.map(Number));
      if (!hasUnitsStep || desiredSets.length === 0) {
        for (const seriesCell of seriesCells) {
          const lockPayload = normalizeLockPayload(seriesCell, splitOrderFlexibleValue);
          await patchCell(seriesCell.id, {
            ...sharedPayload,
            ...lockPayload,
          });
        }
      } else if (seriesCells.length === 1 && desiredSets.length > 1) {
        const res = await fetch(`/api/cells/${cell.id}/extend_series`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            template: {
              grid: gridId,
              ...sharedPayload,
              locked_day_index: null,
              locked_start_slot: null,
              locked_duration_min: null,
            },
            bundle_unit_sets: desiredSets,
          }),
        });
        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          throw new Error(buildApiErrorMessage(raw, res.status, t("edit_cell.failed_update_cell")));
        }
      } else {
        if (seriesCells.length > 1 && desiredSets.length > seriesCells.length) {
          throw new Error(t("edit_cell.bulk_series_add_unsupported"));
        }

        const desiredBundleIds = await Promise.all(desiredSets.map((set) => ensureBundleId(set)));
        for (let index = 0; index < desiredSets.length; index += 1) {
          const lockPayload = normalizeLockPayload(seriesCells[index], splitOrderFlexibleValue);
          await patchCell(seriesCells[index].id, {
            ...sharedPayload,
            ...lockPayload,
            bundles: [desiredBundleIds[index]],
          });
        }

        if (seriesCells.length > desiredSets.length) {
          for (const extraCell of seriesCells.slice(desiredSets.length)) {
            await deleteCell(extraCell.id);
          }
        }
      }

      requestClose();
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message || t("edit_cell.failed_update_cell"));
    } finally {
      setSaving(false);
    }
  }

  const isSeriesEdit = Boolean((cell?.seriesCells?.length ?? 0) > 1 || cell?.series_id);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
      }}
    >
      <DialogContent
        className="max-w-[900px] p-0 z-[1801]"
        showCloseButton={false}
        onPointerDownOutside={ignoreOutsideClose}
        onInteractOutside={ignoreOutsideClose}
        onEscapeKeyDown={ignoreOutsideClose}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
        <button
          type="button"
          onClick={requestClose}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute top-4 right-4 z-20 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={t("common.close")}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <DialogHeader className="relative min-h-[72px] shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>{isSeriesEdit ? t("edit_cell.edit_cell_series") : t("edit_cell.edit_cell")}</DialogTitle>
          {formReady ? (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-2 select-none">
            {Array.from({ length: totalSteps }, (_, index) => {
              const idx = index + 1;
              const isActive = step === idx;
              const canGo = canOpenStep(idx);
              return (
                <React.Fragment key={idx}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canGo) return;
                      setStep(idx);
                    }}
                    disabled={!canGo}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-black text-white border-black shadow-[0_0_0_3px_rgba(0,0,0,0.18)]"
                        : canGo
                        ? "bg-white text-gray-700 border-gray-300"
                        : "bg-white text-gray-400 border-gray-200 opacity-40"
                    }`}
                    aria-label={t("create_cell.go_to_step", { step: idx })}
                  >
                    {idx}
                  </button>
                  {idx < totalSteps ? (
                    <div className={`h-0.5 w-10 ${step > idx ? "bg-black" : "bg-gray-300"}`} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
          ) : null}
        </DialogHeader>

        <form onSubmit={submit} className="contents">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!formReady ? (
            formLoading || !formLoadError ? (
              <PanelAsyncState isLoading isEmpty={false} loadingLabel={t("common.loading")}>
                {null}
              </PanelAsyncState>
            ) : (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {formLoadError}
              </div>
            )
          ) : (
          <>
          {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}
          {currentStepKey === "info" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label className="block text-sm mb-1">{t("create_cell.name_required")}</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm mb-1">{t("create_cell.duration_cells_required")}</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    max={maxDurationCellsAllowed ?? undefined}
                    step={1}
                    value={durationCells}
                    onChange={(e) => {
                      const raw = Math.max(1, Number(e.target.value) || 1);
                      const capped = maxDurationCellsAllowed == null ? raw : Math.min(raw, maxDurationCellsAllowed);
                      setDurationCells(capped);
                    }}
                    required
                  />
                  <div className="text-xs text-gray-500 mt-1">{t("create_cell.total_minutes", { minutes: durationCells * cellMin })}</div>
                </div>
                {canShowMultiDayToggle && (
                  <div className="sm:col-span-2 flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm select-none">
                      <input
                        type="checkbox"
                        checked={multiDayEnabled}
                        onChange={(e) => onToggleMultiDay(e.target.checked)}
                        disabled={!canEnableMultiDay && !multiDayEnabled}
                        className="h-4 w-4"
                      />
                      {t("create_cell.more_than_day")}
                    </label>
                  </div>
                )}
                {hasTimeRangeOptions && (
                  <div className="sm:col-span-4">
                    <label className="block text-sm mb-1">{t("create_cell.time_range_required")}</label>
                    <select className="w-full border rounded px-3 py-2 text-sm" value={timeRangeId} onChange={(e) => setTimeRangeId(e.target.value)}>
                      <option value="">{t("create_cell.select_option")}</option>
                      {timeRanges.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.start_time}-{t.end_time})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="sm:col-span-1 ml-auto">
                  <label className="block text-sm mb-1">{t("create_cell.color")}</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setColorMenuOpen((v) => !v)}
                      className="h-10 w-10 rounded-full border border-gray-300 shadow-sm flex items-center justify-center text-gray-500"
                      style={{ backgroundColor: colorHex || "#ffffff" }}
                      aria-label={t("create_cell.select_color")}
                    >
                      {!colorHex ? <span className="text-base leading-none">/</span> : null}
                    </button>
                    {colorMenuOpen && (
                      <div className="absolute left-1/2 -translate-x-1/2 z-10 mt-2 rounded-md border bg-white p-2 shadow-lg">
                        <div className="flex items-center gap-2 overflow-x-auto max-w-[360px]">
                          <button
                            type="button"
                            onClick={() => { setColorHex(null); setColorMenuOpen(false); }}
                            className={`h-8 w-8 rounded-full border flex items-center justify-center text-gray-500 ${colorHex === null ? "ring-2 ring-black border-black" : "border-gray-300"}`}
                            aria-label={t("create_cell.no_color")}
                          >
                            <span className="text-sm leading-none">/</span>
                          </button>
                          {COLOR_OPTIONS.map((hex) => (
                            <button key={hex} type="button" onClick={() => { setColorHex(hex); setColorMenuOpen(false); }} className={`h-8 w-8 rounded-full border ${colorHex === hex ? "ring-2 ring-black border-black" : "border-gray-300"}`} style={{ backgroundColor: hex }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {canShowMultiDayToggle && !canEnableMultiDay && (
                <div className="text-xs text-gray-500">
                  {t("create_cell.more_than_day_unavailable")}
                </div>
              )}

              <div>
                <label className="block text-sm mb-1">{t("create_cell.description")}</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

            </>
          ) : currentStepKey === "units" ? (
            <>
              <div className="rounded border p-3 space-y-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div>
                    <div className="text-sm font-medium">{t("create_cell.units_required")}</div>
                    <div className="text-xs text-gray-500 mt-1">{t("create_cell.unit_mode_toggle_help")}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {units.length === 0 ? (
                    <div className="rounded border border-dashed px-3 py-4 text-xs text-gray-500">
                      {t("create_cell.no_units_available")}
                    </div>
                  ) : units.map((u) => {
                    const id = String(u.id);
                    const isSelected = unitIds.includes(id);
                    const isDisabled = usedUnitIds.has(id) && !isSelected;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          isSelected
                            ? "border-gray-900 bg-gray-900 text-white"
                            : isDisabled
                            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60"
                            : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                        }`}
                        onClick={() => toggleUnitSelection(id)}
                        disabled={isDisabled}
                      >
                        {u.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveCurrentUnitSet}
                    disabled={unitIds.length === 0}
                    className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                  >
                    {editingBundleIndex == null ? t("create_cell.save_bundle_set") : t("edit_cell.update_bundle_set")}
                  </button>
                  {editingBundleIndex != null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBundleIndex(null);
                        setUnitIds([]);
                      }}
                      className="px-3 py-2 rounded border text-sm"
                    >
                      {t("edit_cell.cancel_edit")}
                    </button>
                  )}
                  <div className="text-xs text-gray-500">{t("create_cell.save_bundle_help")}</div>
                </div>
                {bundleSetsError && <div className="text-xs text-red-600 mt-2">{bundleSetsError}</div>}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label className="block text-sm">{t("create_cell.saved_bundles")}</label>
                  {bundleUnitSets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setUnitModeOverride((prev) => !prev)}
                      className="inline-flex items-center rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:border-gray-900 hover:bg-gray-50"
                      aria-label={t("create_cell.unit_mode_toggle_label")}
                    >
                      {effectiveUnitMode}
                    </button>
                  ) : null}
                </div>
                {bundleUnitSets.length > 0 && (
                  <div className="space-y-2">
                    {bundleUnitSets.map((set, index) => (
                      <div key={set.join(",")} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBundleIndex(index);
                            setUnitIds(set);
                          }}
                          className={`min-w-0 flex-1 text-left ${editingBundleIndex === index ? "font-medium" : ""}`}
                        >
                          <span className="font-medium">{t("create_cell.bundle_label", { index: index + 1 })}</span>{" "}
                          <span className="break-words">
                            {(previewBundleSets[index] ?? set)
                              .map((id) => unitNameById[id] || t("format.unit_with_id", { id }))
                              .join(" + ")}
                          </span>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBundleIndex(index);
                              setUnitIds(set);
                            }}
                            className="text-gray-500 hover:text-black"
                            aria-label={t("create_cell.edit_bundle", { index: index + 1 })}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                              <path d="M4 20h4l10-10-4-4L4 16v4zm11-13 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBundleUnitSets((prev) => prev.filter((_, i) => i !== index));
                              if (editingBundleIndex === index) {
                                setEditingBundleIndex(null);
                                setUnitIds([]);
                              } else if (editingBundleIndex != null && editingBundleIndex > index) {
                                setEditingBundleIndex(editingBundleIndex - 1);
                              }
                            }}
                            className="text-gray-500 hover:text-black"
                            aria-label={t("create_cell.remove_bundle", { index: index + 1 })}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {bundleUnitSets.length === 0 && (
                  <div className="rounded border border-dashed px-3 py-4 text-xs text-gray-500">
                    {t("edit_cell.no_bundle_sets_saved")}
                  </div>
                )}
              </div>
            </>
          ) : currentStepKey === "split" ? (
            <>
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-center gap-3">
                  <div className="w-full sm:w-56">
                    <label className="block text-sm mb-1">{t("create_cell.duration_cells_required")}</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      type="number"
                      min={2}
                      max={maxDurationCellsAllowed ?? undefined}
                      step={1}
                      value={durationCells}
                      onChange={(e) => {
                        const raw = Math.max(1, Number(e.target.value) || 1);
                        const capped = maxDurationCellsAllowed == null ? raw : Math.min(raw, maxDurationCellsAllowed);
                        setDurationCells(capped);
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      {t("create_cell.total_minutes", { minutes: durationCellsSafe * cellMin })}
                    </div>
                  </div>

                  <div className="w-full sm:w-56">
                    <label className="block text-sm mb-1">{t("create_cell.days_count")}</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      type="number"
                      min={Math.max(2, minSplitDaysRequired)}
                      max={Math.max(2, maxSplitByDuration)}
                      value={splitDaysSafe}
                      onChange={(e) => {
                        const next = clampInt(
                          Number(e.target.value) || Math.max(2, minSplitDaysRequired),
                          Math.max(2, minSplitDaysRequired),
                          Math.max(2, maxSplitByDuration),
                        );
                        setSplitDays(next);
                        if (equalSplit && durationCellsSafe % next !== 0) setEqualSplit(false);
                      }}
                    />
                  </div>
                </div>

                <div className="rounded border px-3 py-3">
                  <label className="block text-sm mb-2">{t("create_cell.split_distribution")}</label>
                  <div className="space-y-3">
                    <div
                      ref={splitSliderRef}
                      className="relative h-16 select-none touch-none"
                      onPointerDown={(e) => {
                        if (equalSplit || sliderBoundaries.length === 0) return;
                        if ((e.target as HTMLElement).closest("[data-split-knob='true']")) return;
                        const slider = splitSliderRef.current;
                        if (!slider) return;
                        const rect = slider.getBoundingClientRect();
                        if (rect.width <= 0) return;
                        const ratio = (e.clientX - rect.left) / rect.width;
                        const raw = Math.round(ratio * durationCellsSafe);
                        let nearestIndex = 0;
                        let nearestDist = Number.POSITIVE_INFINITY;
                        sliderBoundaries.forEach((value, index) => {
                          const dist = Math.abs(value - raw);
                          if (dist < nearestDist) {
                            nearestDist = dist;
                            nearestIndex = index;
                          }
                        });
                        onBoundaryChange(nearestIndex, raw);
                      }}
                    >
                      <div className="absolute left-0 right-0 top-5 h-1 -translate-y-1/2 rounded-full bg-gray-200" />
                      <div
                        className="absolute left-0 top-5 h-1 -translate-y-1/2 rounded-full opacity-35"
                        style={{ width: "100%", backgroundColor: accentColor }}
                      />
                      {sliderBoundaries.map((boundary, index) => (
                        <button
                          key={`split-boundary-${index}`}
                          type="button"
                          data-split-knob="true"
                          onPointerDown={(e) => {
                            if (equalSplit) return;
                            e.preventDefault();
                            setDragBoundaryIndex(index);
                            updateBoundaryFromClientX(index, e.clientX);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              onBoundaryChange(index, boundary - 1);
                            } else if (e.key === "ArrowRight") {
                              e.preventDefault();
                              onBoundaryChange(index, boundary + 1);
                            }
                          }}
                          aria-label={t("create_cell.split_handle", { index: index + 1 })}
                          className={`absolute top-5 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow-sm ${
                            equalSplit ? "cursor-not-allowed opacity-70" : "cursor-ew-resize"
                          }`}
                          style={{
                            left: `${(boundary / durationCellsSafe) * 100}%`,
                            borderColor: accentColor,
                            zIndex: 10 + index,
                          }}
                        />
                      ))}
                      <div className="pointer-events-none absolute left-0 right-0 top-8 h-6">
                        {splitSegments.map((segment, index) => (
                          <span
                            key={`split-segment-${index}`}
                            className="absolute -translate-x-1/2 text-[11px] text-gray-600 whitespace-nowrap"
                            style={{ left: `${segment.centerPct}%` }}
                          >
                            {t("create_cell.split_preview_compact", {
                              cells: segment.cells,
                              minutes: segment.minutes,
                            })}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={splitOrderFlexible}
                        onChange={(e) => setSplitOrderFlexible(e.target.checked)}
                      />
                      {t("create_cell.flexible_order")}
                    </label>
                    {canEqualSplit && (
                      <label className="inline-flex items-center gap-2 text-sm select-none">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={equalSplit}
                          onChange={(e) => setEqualSplit(e.target.checked)}
                        />
                        {t("create_cell.equally")}
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {gridAllowsOverstaffing && (
                <div className="rounded border px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-sm select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={allowOverstaffing}
                      onChange={(e) => setAllowOverstaffing(e.target.checked)}
                    />
                    {t("create_cell.allow_overstaffing")}
                  </label>
                </div>
              )}
                <CellStaffingEditor
                  participants={participants}
                  tierEnabled={gridTierEnabled}
                  tierCounts={tierCounts}
                  onTierCountsChange={setTierCountsClamped}
                  tierPools={tierPools}
                  onTierPoolsChange={setTierPools}
                  staffGroups={staffGroups}
                onStaffGroupsChange={setStaffGroups}
                availableStaffGroups={availableStaffGroups}
              />
              {staffingError && (
                <div className="text-sm text-red-600">{staffingError}</div>
              )}
            </>
          )}
          </>
          )}
          </div>
          <DialogFooter className="shrink-0 items-center justify-between gap-3 border-t px-6 py-4 sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                onClick={requestClose}
              >
                {t("common.cancel")}
              </button>
              <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || !canSubmit || !formReady}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((prev) => (prev > 1 ? prev - 1 : prev))}
                  aria-label={t("common.previous_step")}
                  className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {t("common.previous_step")}
                </button>
              ) : null}
              {step < finalStep ? (
                <button
                  type="button"
                  onClick={goToNextStep}
                  disabled={!canAdvanceFromCurrentStep || !formReady}
                  aria-label={t("common.next_step")}
                  className="inline-flex items-center gap-1 rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-900 disabled:opacity-35"
                >
                  {t("common.next_step")}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
