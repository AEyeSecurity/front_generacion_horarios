"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  CellStaffingEditor,
  EMPTY_TIER_COUNTS,
  EMPTY_TIER_POOLS,
  buildStaffOptionsPayload,
  getCoveredParticipantIds,
  normalizeStaffGroups,
  resolveStaffGroupMembers,
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
import { normalizeCellFormBootstrap } from "@/lib/cell-form-bootstrap";
import { gridCellFormOptionsPath } from "@/lib/cell-api";
import { authFetch } from "@/lib/client-auth";

type DialogTranslate = ReturnType<typeof useI18n>["t"];

type TimeRange = { id: number; name: string; start_time: string; end_time: string };
type Unit = { id: number; name: string };
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

const LOCK_VALIDATION_KEYS = [
  "locked_duration_min",
  "locked_day_index",
  "locked_start_slot",
  "non_field_errors",
] as const;

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

function buildStaffingError(
  t: DialogTranslate,
  tierEnabled: boolean,
  tierCounts: TierCounts,
  tierPools: TierPools,
  staffGroups: StaffOption[],
  availableStaffGroups: StaffOption[],
  participantMap: Record<string, Participant>,
  participants: Participant[]
) {
  const resolvedStaffGroups = resolveStaffGroupMembers(staffGroups, availableStaffGroups);
  if (!tierEnabled) {
    const headcount = Math.max(0, Number(tierCounts.PRIMARY || 0));
    if (headcount < 1) return t("cell_staffing.headcount_min_error");
    const poolIds = new Set((tierPools.PRIMARY || []).map(String));
    const groupIds = new Set<string>();
    for (const group of resolvedStaffGroups) {
      if (group.staff && group.members.length === 0) continue;
      if (group.members.length !== headcount) {
        return t("cell_staffing.staff_group_exact_headcount_error");
      }
      for (const id of group.members) {
        if (poolIds.has(id)) return t("cell_staffing.participant_in_pool_and_staff_error");
        if (groupIds.has(id)) return t("cell_staffing.participant_multiple_staff_groups_error");
        groupIds.add(id);
        if (!participantMap[id]) return t("cell_staffing.staff_members_invalid_error");
      }
    }
    const hasPools = poolIds.size > 0;
    const hasGroups = staffGroups.length > 0;
    if (!hasPools && !hasGroups) {
      return t("cell_staffing.staff_source_required_error");
    }
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
  for (const group of resolvedStaffGroups) {
    if (group.staff && group.members.length === 0) continue;
    if (group.members.length !== headcount) {
      return t("cell_staffing.staff_group_exact_headcount_error");
    }
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
  if (!hasPools && !hasGroups) {
    return t("cell_staffing.tier_staff_source_required_error");
  }
  return null;
}

function normalizeUnitSet(ids: Array<string | number>) {
  return Array.from(new Set(ids.map(String))).sort((a, b) => Number(a) - Number(b));
}

function bundleKeyFromUnitIds(ids: Array<string | number>) {
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

export default function CreateCellDialog({
  gridId,
  open,
  onOpenChange,
  onCreated,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
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
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [timeRanges, setTimeRanges] = React.useState<TimeRange[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [cellMin, setCellMin] = React.useState<number>(60);
  const [enabledDaysCount, setEnabledDaysCount] = React.useState<number>(7);
  const [horizonDayMinutes, setHorizonDayMinutes] = React.useState<number | null>(null);
  const [tierCounts, setTierCounts] = React.useState<TierCounts>({ PRIMARY: 1, SECONDARY: 0, TERTIARY: 0 });
  const [tierPools, setTierPools] = React.useState<TierPools>({ ...EMPTY_TIER_POOLS });
  const [staffGroups, setStaffGroups] = React.useState<StaffOption[]>([]);
  const [availableStaffGroups, setAvailableStaffGroups] = React.useState<StaffOption[]>([]);
  const [allowOverstaffing, setAllowOverstaffing] = React.useState(false);
  const [gridAllowsOverstaffing, setGridAllowsOverstaffing] = React.useState(true);
  const [gridTierEnabled, setGridTierEnabled] = React.useState(true);
  const [globalUnitMode, setGlobalUnitMode] = React.useState<"AND" | "OR">("AND");
  const [unitModeOverride, setUnitModeOverride] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [loadedOptionsGridId, setLoadedOptionsGridId] = React.useState<number | null>(null);
  const [optionsLoadError, setOptionsLoadError] = React.useState<string | null>(null);
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
  const usedUnitIds = React.useMemo(() => new Set(bundleUnitSets.flat()), [bundleUnitSets]);
  const effectiveUnitMode: "AND" | "OR" = unitModeOverride
    ? globalUnitMode === "AND"
      ? "OR"
      : "AND"
    : globalUnitMode;
  const activeBundleSets = React.useMemo(() => {
    if (bundleUnitSets.length > 0) return bundleUnitSets;
    if (unitIds.length === 0) return [];
    return [normalizeUnitSet(unitIds)];
  }, [bundleUnitSets, unitIds]);
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
    if (!open) {
      setLoadedOptionsGridId(null);
      setOptionsLoadError(null);
      return;
    }
    setErr(null);
    setStep(1);
    setName("");
    setDescription("");
    setQuantity(1);
    setDurationCells(1);
    setMultiDayEnabled(false);
    setSplitDays(2);
    setEqualSplit(false);
    setSplitOrderFlexible(false);
    setSplitBoundaries([1]);
    setDragBoundaryIndex(null);
    setMaxSplitDays(7);
    setEnabledDaysCount(7);
    setHorizonDayMinutes(null);
    setTimeRangeId("");
    setColorHex(null);
    setColorMenuOpen(false);
    setUnitIds([]);
    setBundleUnitSets([]);
    setTierCounts({ PRIMARY: 1, SECONDARY: 0, TERTIARY: 0 });
    setTierPools({ ...EMPTY_TIER_POOLS });
    setStaffGroups([]);
    setAvailableStaffGroups([]);
    setGridAllowsOverstaffing(true);
    setGridTierEnabled(true);
    setGlobalUnitMode("AND");
    setUnitModeOverride(false);
    setAllowOverstaffing(false);
    setLoadedOptionsGridId(null);
    setOptionsLoadError(null);
    setOptionsLoading(true);
    (async () => {
      try {
        const response = await authFetch(gridCellFormOptionsPath(gridId), { cache: "no-store" });
        if (!response.ok) throw new Error(`${t("create_cell.failed_load_data")} (${response.status})`);
        const bootstrap = normalizeCellFormBootstrap(await response.json());
        const g = { ...bootstrap.options, ...bootstrap.grid } as GridConfig;
          const configuredCellMinutes = Number(g?.cell_size_min ?? g?.cell_size_minutes ?? g?.slot_min);
          if (configuredCellMinutes > 0) setCellMin(configuredCellMinutes);
          if (Array.isArray(g?.days_enabled)) {
            const dayCount = Math.max(1, Math.min(7, g.days_enabled.length));
            const configuredMaxDays = Number(
              bootstrap.divisionConfig.max_days ?? bootstrap.divisionConfig.max_split_days,
            );
            setMaxSplitDays(
              Number.isFinite(configuredMaxDays) && configuredMaxDays > 0
                ? Math.min(dayCount, Math.floor(configuredMaxDays))
                : dayCount,
            );
            setEnabledDaysCount(dayCount);
          }
          const startMin = parseClockToMin(g?.day_start);
          const endMin = parseClockToMin(g?.day_end);
          if (endMin > startMin) {
            setHorizonDayMinutes(endMin - startMin);
          } else {
            setHorizonDayMinutes(null);
          }
          const overstaffingEnabled =
            (bootstrap.featureFlags.allow_overstaffing ?? g?.allow_overstaffing) !== false;
          setGridAllowsOverstaffing(overstaffingEnabled);
          setGridTierEnabled(bootstrap.participantTiersEnabled);
          setGlobalUnitMode(readDefaultUnitMode(g));
          if (!overstaffingEnabled) {
            setAllowOverstaffing(false);
          }
        setParticipants(bootstrap.participants as Participant[]);
        setTimeRanges(bootstrap.timeRanges as TimeRange[]);
        setUnits(bootstrap.units as Unit[]);
        setAvailableStaffGroups(normalizeStaffGroups(
          [...bootstrap.staffGroups, ...bootstrap.staffs] as Parameters<typeof normalizeStaffGroups>[0],
        ));
        setLoadedOptionsGridId(gridId);

      } catch (e: any) {
        setOptionsLoadError(e?.message || t("create_cell.failed_load_data"));
      } finally {
        setOptionsLoading(false);
      }
    })();
  }, [open, gridId]);

  const stepOneReady = Boolean(
    name.trim() &&
      durationCellsSafe >= 1 &&
      (maxDurationCellsAllowed == null || durationCellsSafe <= maxDurationCellsAllowed)
  );
  const unitsStepReady = !bundleSetsError;
  const staffingError = buildStaffingError(
    t,
    gridTierEnabled,
    tierCounts,
    tierPools,
    staffGroups,
    availableStaffGroups,
    participantMap,
    participants,
  );
  const individualEligibleParticipantIds = React.useMemo(
    () => Array.from(new Set(
      Object.values(tierPools).flatMap((ids) => ids || []).map(String),
    )).sort(),
    [tierPools],
  );
  const coveredParticipantIds = React.useMemo(
    () => getCoveredParticipantIds(staffGroups, availableStaffGroups),
    [availableStaffGroups, staffGroups],
  );
  React.useEffect(() => {
    if (coveredParticipantIds.size === 0) return;
    setTierPools((current) => {
      const next: TierPools = {
        PRIMARY: current.PRIMARY.filter((id) => !coveredParticipantIds.has(String(id))),
        SECONDARY: current.SECONDARY.filter((id) => !coveredParticipantIds.has(String(id))),
        TERTIARY: current.TERTIARY.filter((id) => !coveredParticipantIds.has(String(id))),
      };
      return TIERS.some((tier) => next[tier].length !== current[tier].length) ? next : current;
    });
  }, [coveredParticipantIds]);
  const participantsReady = staffGroups.length > 0 ||
    (participants.length > 0 && individualEligibleParticipantIds.length > 0);
  const optionsReady = !optionsLoading && loadedOptionsGridId === gridId;
  const canSubmit = optionsReady && stepOneReady && splitStepReady && unitsStepReady && participantsReady && !staffingError && !bundleSetsError;
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
    const key = normalized.join(",");
    if (bundleUnitSets.some((set) => normalizeUnitSet(set).join(",") === key)) {
      setErr(t("create_cell.duplicate_bundle_set"));
      return false;
    }
    const overlap = overlappingUnitIds([...bundleUnitSets, normalized]);
    if (overlap.length > 0) {
      setErr(
        t("create_cell.bundle_sets_overlap", {
          units: overlap.map((id) => unitNameById[id] || t("format.unit_with_id", { id })).join(", "),
        })
      );
      return false;
    }
    setBundleUnitSets((prev) => {
      if (prev.some((set) => set.join(",") === key)) return prev;
      return [...prev, normalized];
    });
    setUnitIds([]);
    setErr(null);
    return true;
  };

  const goToNextStep = () => {
    if (currentStepKey === "units" && unitIds.length > 0 && !saveCurrentUnitSet()) return;
    setStep((prev) => (prev < finalStep ? prev + 1 : prev));
  };

  async function fetchBundlesSnapshot() {
    const endpoints = [
      `/api/bundles?grid=${gridId}`,
      `/api/bundles/?grid=${gridId}`,
    ];
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ([]));
      const list = Array.isArray(payload) ? payload : payload?.results ?? [];
      if (Array.isArray(list)) return list as Array<{ id: number | string; units?: Array<number | string> }>;
    }
    return [] as Array<{ id: number | string; units?: Array<number | string> }>;
  }

  async function ensureBundleId(unitSet: number[]) {
    const targetKey = bundleKeyFromUnitIds(unitSet);
    const snapshot = await fetchBundlesSnapshot();
    const existing = snapshot.find((bundle) => bundleKeyFromUnitIds(bundle.units ?? []) === targetKey);
    if (existing?.id != null) return Number(existing.id);

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
      if (bundleId != null) return bundleId;
    }

    if (attemptErrors.length > 0) {
      throw new Error(`Failed to resolve bundle for the selected units.\n${attemptErrors[attemptErrors.length - 1]}`);
    }
    throw new Error("Failed to resolve bundle for the selected units.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (maxDurationCellsAllowed != null && durationCellsSafe > maxDurationCellsAllowed) {
      setErr(`Duration cannot exceed ${maxDurationCellsAllowed} cells for the selected horizon.`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
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
      const template: any = {
        grid: gridId,
        name: name.trim(),
        description: description.trim() || undefined,
        duration_minutes: splitPartsMin.reduce((sum, part) => sum + part, 0),
        quantity: Math.max(1, Math.round(quantity)),
        split_parts_min: splitPartsMin,
        split_order_flexible: multiDayEnabled ? splitOrderFlexible : false,
        duration_min: splitPartsMin.reduce((sum, part) => sum + part, 0),
        division_days: splitPartsMin.length,
        div_days: splitPartsMin.length,
        division_days_config: {
          days: splitPartsMin.length,
          parts_min: splitPartsMin,
          flexible_order: multiDayEnabled ? splitOrderFlexible : false,
        },
        locked_day_index: null,
        locked_start_slot: null,
        locked_duration_min: null,
        time_range: timeRangeId ? Number(timeRangeId) : null,
        time_range_config: timeRangeId ? { id: Number(timeRangeId) } : null,
        colorHex: colorHex ?? undefined,
        headcount: inferredHeadcount,
        allow_overstaffing: gridAllowsOverstaffing ? allowOverstaffing : null,
        unit_mode_override: unitModeOverride,
        bundle_mode: effectiveUnitMode,
      };
      if (gridTierEnabled) {
        template.tier_counts = normalizedTierCounts;
        template.tier_pools = normalizedTierPools;
        template.participant_tier_config = { counts: normalizedTierCounts, pools: normalizedTierPools };
      } else {
        template.eligible_participant_ids = individualEligibleParticipantIds.map((id) => (/^\d+$/.test(id) ? Number(id) : id));
      }

      const staffOptionsPayload = buildStaffOptionsPayload(staffGroups, availableStaffGroups);
      if (staffOptionsPayload.length > 0) {
        template.staff_options = staffOptionsPayload;
      }

      const selectedSets = activeBundleSets.map((set) => set.map(Number));
      const isBulk = selectedSets.length > 1;
      const payload = isBulk
        ? {
            template,
            bundle_unit_sets: selectedSets,
            bundles: selectedSets.map((units) => ({ units })),
          }
        : {
            ...template,
            ...(selectedSets.length === 1
              ? { bundles: [await ensureBundleId(selectedSets[0])] }
              : {}),
          };

      const res = await fetch(isBulk ? `/api/cells/bulk_create` : `/api/cells`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(buildApiErrorMessage(raw, res.status, t("create_cell.failed_create")));
      }
      onOpenChange(false);
      await onCreated?.();
    } catch (e: any) {
      setErr(e?.message || t("create_cell.failed_create"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[900px] p-0 z-[1801]" data-onboarding-target="cell-dialog">
          <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
          <DialogHeader className="relative min-h-[72px] shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>{t("create_cell.title")}</DialogTitle>
            {optionsReady ? (
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
            {!optionsReady ? (
              optionsLoading || !optionsLoadError ? (
                <PanelAsyncState isLoading isEmpty={false} loadingLabel={t("common.loading")} mode="plain">
                  {null}
                </PanelAsyncState>
              ) : (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {optionsLoadError}
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
                  <div className="flex flex-wrap items-start justify-between gap-3">
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
                      {t("create_cell.save_bundle_set")}
                    </button>
                    <div className="text-xs text-gray-500">{t("create_cell.save_bundle_help")}</div>
                  </div>
                  {bundleSetsError && <div className="text-xs text-red-600 mt-2">{bundleSetsError}</div>}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="block text-sm">{t("create_cell.saved_bundles")}</label>
                    {bundleUnitSets.length > 1 && (
                      <button type="button" onClick={() => setUnitModeOverride((prev) => !prev)} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold" aria-label={t("create_cell.unit_mode_toggle_label")}>
                        <span>{effectiveUnitMode}</span>
                      </button>
                    )}
                  </div>
                  {bundleUnitSets.length > 0 && (
                    <div className="space-y-2">
                      {bundleUnitSets.map((set, index) => (
                        <div key={set.join(",")} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{t("create_cell.bundle_label", { index: index + 1 })}</span>{" "}
                            <span className="break-words">
                              {set.map((id) => unitNameById[id] || t("format.unit_with_id", { id })).join(" + ")}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBundleUnitSets((prev) => prev.filter((_, i) => i !== index))}
                            className="text-gray-500 hover:text-black"
                            aria-label={t("create_cell.remove_bundle", { index: index + 1 })}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {bundleUnitSets.length === 0 && (
                    <div className="rounded border border-dashed px-3 py-4 text-xs text-gray-500">
                      {t("create_cell.no_bundle_sets_saved")}
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
                <DialogClose asChild>
                  <button type="button" className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
                    {t("common.cancel")}
                  </button>
                </DialogClose>
                {step === finalStep && (
                  <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || !canSubmit}>
                    {saving ? t("create_cell.creating") : t("common.finish")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {step > 1 && (
                  <button type="button" onClick={() => setStep((prev) => Math.max(1, prev - 1))} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm">
                    <ChevronLeft className="h-4 w-4" /> {t("common.previous_step")}
                  </button>
                )}
                {step < finalStep && (
                  <button type="button" onClick={goToNextStep} disabled={!canAdvanceFromCurrentStep || !optionsReady} className="inline-flex items-center gap-2 rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-35">
                    {t("common.next_step")} <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </DialogFooter>
          </form>
          </div>
        </DialogContent>
    </Dialog>
  );
}
