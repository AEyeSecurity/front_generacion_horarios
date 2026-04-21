"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  CellStaffingEditor,
  EMPTY_TIER_COUNTS,
  EMPTY_TIER_POOLS,
  TIERS,
  type Participant,
  type StaffOption,
  type TierCounts,
  type TierPools,
} from "@/components/dialogs/cell-staffing";
import { CELL_COLOR_OPTIONS_NO_RED as COLOR_OPTIONS } from "@/lib/cell-colors";
import { useI18n } from "@/lib/use-i18n";

type TimeRange = { id: number; name: string; start_time: string; end_time: string };
type Unit = { id: number; name: string };
type GridConfig = {
  cell_size_min?: number | null;
  days_enabled?: number[] | null;
  allow_overstaffing?: boolean | null;
  day_start?: string | null;
  day_end?: string | null;
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
  tierCounts: TierCounts,
  tierPools: TierPools,
  staffGroups: StaffOption[],
  participantMap: Record<string, Participant>,
  participants: Participant[]
) {
  const availableByTier: TierCounts = { ...EMPTY_TIER_COUNTS };
  for (const participant of participants) {
    if (participant.tier) {
      availableByTier[participant.tier] += 1;
    }
  }
  for (const tier of TIERS) {
    if (tierCounts[tier] > availableByTier[tier]) {
      return `${tier} tier count cannot exceed available participants (${availableByTier[tier]}).`;
    }
  }

  const headcount = TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0);
  if (headcount < 1) return "Headcount must be at least 1.";

  const poolIds = new Set<string>();
  for (const tier of TIERS) {
    for (const id of tierPools[tier]) poolIds.add(id);
  }

  const groupIds = new Set<string>();
  for (const group of staffGroups) {
    if (group.members.length !== headcount) {
      return "Each staff group must contain exactly headcount participants.";
    }
    const composition: TierCounts = { ...EMPTY_TIER_COUNTS };
    for (const id of group.members) {
      if (poolIds.has(id)) return "A participant cannot be in both a tier pool and a staff group.";
      if (groupIds.has(id)) return "A participant cannot appear in more than one staff group.";
      groupIds.add(id);
      const tier = participantMap[id]?.tier;
      if (!tier) return "All participants in staff groups must have a tier.";
      composition[tier] += 1;
    }
    if (TIERS.some((tier) => composition[tier] !== tierCounts[tier])) {
      return "Each staff group must match the required tier composition.";
    }
  }

  const hasPools = TIERS.some((tier) => tierPools[tier].length > 0);
  const hasGroups = staffGroups.length > 0;
  if (!hasPools && !hasGroups) {
    return "At least one staffing source is required: tier pools or explicit staff groups.";
  }
  return null;
}

function normalizeUnitSet(ids: Array<string | number>) {
  return Array.from(new Set(ids.map(String))).sort((a, b) => Number(a) - Number(b));
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
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = React.useState<number>(1);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
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
  const [cellMin, setCellMin] = React.useState<number>(1);
  const [enabledDaysCount, setEnabledDaysCount] = React.useState<number>(7);
  const [horizonDayMinutes, setHorizonDayMinutes] = React.useState<number | null>(null);
  const [tierCounts, setTierCounts] = React.useState<TierCounts>({ PRIMARY: 1, SECONDARY: 0, TERTIARY: 0 });
  const [tierPools, setTierPools] = React.useState<TierPools>({ ...EMPTY_TIER_POOLS });
  const [staffGroups, setStaffGroups] = React.useState<StaffOption[]>([]);
  const [allowOverstaffing, setAllowOverstaffing] = React.useState(false);
  const [gridAllowsOverstaffing, setGridAllowsOverstaffing] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const splitSliderRef = React.useRef<HTMLDivElement | null>(null);

  const inferredHeadcount = React.useMemo(
    () => TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0),
    [tierCounts]
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
    setTierCounts({
      PRIMARY: clampInt(next.PRIMARY || 0, 0, participantTierCaps.PRIMARY),
      SECONDARY: clampInt(next.SECONDARY || 0, 0, participantTierCaps.SECONDARY),
      TERTIARY: clampInt(next.TERTIARY || 0, 0, participantTierCaps.TERTIARY),
    });
  }, [participantTierCaps]);
  const unitNameById = React.useMemo(
    () => Object.fromEntries(units.map((u) => [String(u.id), u.name || `Unit ${u.id}`])) as Record<string, string>,
    [units]
  );
  const usedUnitIds = React.useMemo(() => new Set(bundleUnitSets.flat()), [bundleUnitSets]);
  const activeBundleSets = React.useMemo(() => {
    if (bundleUnitSets.length > 0) return bundleUnitSets;
    if (unitIds.length === 0) return [];
    return [normalizeUnitSet(unitIds)];
  }, [bundleUnitSets, unitIds]);
  const bundleSetsError = React.useMemo(() => {
    const duplicates = overlappingUnitIds(activeBundleSets);
    if (duplicates.length === 0) return null;
    return `Bundle sets cannot share units: ${duplicates.map((id) => unitNameById[id] || `Unit ${id}`).join(", ")}.`;
  }, [activeBundleSets, unitNameById]);

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
    const minutesFromGrid = horizonDayMinutes && horizonDayMinutes > 0 ? horizonDayMinutes : 0;
    if (minutesFromGrid > 0) {
      return Math.max(1, Math.floor(minutesFromGrid / Math.max(1, cellMin)));
    }
    const spans = timeRanges
      .map((range) => parseClockToMin(range.end_time) - parseClockToMin(range.start_time))
      .filter((span) => span > 0);
    if (spans.length === 0) return null;
    return Math.max(1, Math.floor(Math.max(...spans) / Math.max(1, cellMin)));
  }, [horizonDayMinutes, cellMin, timeRanges]);
  const maxDurationCellsAllowed = React.useMemo(() => {
    if (maxDurationDayCells == null) return null;
    const dayFactor = multiDayEnabled ? Math.max(1, enabledDaysCount) : 1;
    return Math.max(1, maxDurationDayCells * dayFactor);
  }, [maxDurationDayCells, multiDayEnabled, enabledDaysCount]);
  const hasTimeRangeOptions = timeRanges.length > 0;
  const canShowMultiDayToggle = enabledDaysCount > 1;
  const hasUnitsStep = units.length > 0;

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
    setTierCounts((prev) => ({
      PRIMARY: clampInt(prev.PRIMARY || 0, 0, participantTierCaps.PRIMARY),
      SECONDARY: clampInt(prev.SECONDARY || 0, 0, participantTierCaps.SECONDARY),
      TERTIARY: clampInt(prev.TERTIARY || 0, 0, participantTierCaps.TERTIARY),
    }));
  }, [participantTierCaps]);

  React.useEffect(() => {
    if (maxDurationCellsAllowed == null) return;
    if (durationCellsSafe <= maxDurationCellsAllowed) return;
    setDurationCells(maxDurationCellsAllowed);
  }, [maxDurationCellsAllowed, durationCellsSafe]);

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
  }, [multiDayEnabled, hasUnitsStep]);
  const totalSteps = steps.length;
  const finalStep = totalSteps;
  const currentStepKey = steps[Math.min(Math.max(step, 1), totalSteps) - 1] ?? "info";
  const accentColor = colorHex ?? "#111827";

  React.useEffect(() => {
    if (step <= totalSteps) return;
    setStep(totalSteps);
  }, [step, totalSteps]);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    setStep(1);
    setName("");
    setDescription("");
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
    setGridAllowsOverstaffing(true);
    setAllowOverstaffing(false);
    (async () => {
      try {
        try {
          let g: GridConfig | null = null;
          try {
            g = await fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).then((r) => r.json());
          } catch {
            g = await fetch(`/api/grids/${gridId}`, { cache: "no-store" }).then((r) => r.json());
          }
          if (g?.cell_size_min) setCellMin(Number(g.cell_size_min));
          if (Array.isArray(g?.days_enabled)) {
            const dayCount = Math.max(1, Math.min(7, g.days_enabled.length));
            setMaxSplitDays(dayCount);
            setEnabledDaysCount(dayCount);
          }
          const startMin = parseClockToMin(g?.day_start);
          const endMin = parseClockToMin(g?.day_end);
          if (endMin > startMin) {
            setHorizonDayMinutes(endMin - startMin);
          } else {
            setHorizonDayMinutes(null);
          }
          const overstaffingEnabled = g?.allow_overstaffing !== false;
          setGridAllowsOverstaffing(overstaffingEnabled);
          if (!overstaffingEnabled) {
            setAllowOverstaffing(false);
          }
        } catch {}

        try {
          const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
          const pdata = await rp.json().catch(() => ([]));
          setParticipants(Array.isArray(pdata) ? pdata : pdata.results ?? []);
        } catch {}

        try {
          const rt = await fetch(`/api/time_ranges?grid=${gridId}`, { cache: "no-store" });
          const tdata = await rt.json().catch(() => ([]));
          setTimeRanges(Array.isArray(tdata) ? tdata : tdata.results ?? []);
        } catch {}

        try {
          const ru = await fetch(`/api/units?grid=${gridId}`, { cache: "no-store" });
          const udata = await ru.json().catch(() => ([]));
          setUnits(Array.isArray(udata) ? udata : udata.results ?? []);
        } catch {}

      } catch (e: any) {
        setErr(e?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, gridId]);

  const stepOneReady = Boolean(
    name.trim() &&
      durationCellsSafe >= 1 &&
      (maxDurationCellsAllowed == null || durationCellsSafe <= maxDurationCellsAllowed)
  );
  const unitsStepReady = !bundleSetsError;
  const staffingError = buildStaffingError(tierCounts, tierPools, staffGroups, participantMap, participants);
  const canSubmit = stepOneReady && splitStepReady && unitsStepReady && !staffingError && !bundleSetsError;
  const canAdvanceFromCurrentStep =
    currentStepKey === "info"
      ? stepOneReady
      : currentStepKey === "split"
      ? splitStepReady
      : currentStepKey === "units"
      ? unitsStepReady
      : false;
  const showStaffingStep = currentStepKey === "staffing";
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
    const targetDays = clampInt(splitDays, 2, Math.max(2, maxSplitByDuration));
    setSplitDays(targetDays);
    setSplitBoundaries((prev) => normalizeBoundaries(prev, Math.max(2, durationCellsSafe), targetDays));
  };

  const saveCurrentUnitSet = () => {
    const normalized = normalizeUnitSet(unitIds);
    if (normalized.length === 0) return;
    const key = normalized.join(",");
    const overlap = overlappingUnitIds([...bundleUnitSets, normalized]);
    if (overlap.length > 0) {
      setErr(`Bundle sets cannot share units: ${overlap.map((id) => unitNameById[id] || `Unit ${id}`).join(", ")}.`);
      return;
    }
    setBundleUnitSets((prev) => {
      if (prev.some((set) => set.join(",") === key)) return prev;
      return [...prev, normalized];
    });
    setUnitIds([]);
    setErr(null);
  };

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
      const template: any = {
        grid: gridId,
        name: name.trim(),
        description: description.trim() || undefined,
        split_parts_min: splitPartsMin,
        split_order_flexible: multiDayEnabled ? splitOrderFlexible : false,
        duration_min: splitPartsMin.reduce((sum, part) => sum + part, 0),
        division_days: splitPartsMin.length,
        locked_day_index: null,
        locked_start_slot: null,
        locked_duration_min: null,
        time_range: timeRangeId ? Number(timeRangeId) : null,
        colorHex: colorHex ?? undefined,
        headcount: inferredHeadcount,
        tier_counts: tierCounts,
        tier_pools: tierPools,
        allow_overstaffing: gridAllowsOverstaffing ? allowOverstaffing : null,
      };

      if (staffGroups.length > 0) template.staff_options = staffGroups;

      const selectedSets = activeBundleSets.map((set) => set.map(Number));
      const isBulk = selectedSets.length > 1;
      const payload = isBulk
        ? {
            template,
            bundle_unit_sets: selectedSets,
          }
        : {
            ...template,
            ...(selectedSets.length === 1 ? { units: selectedSets[0] } : {}),
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
    } catch (e: any) {
      setErr(e?.message || t("create_cell.failed_create"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[880px] z-[96]">
          <DialogHeader className="relative min-h-9 pr-8">
            <DialogTitle>{t("create_cell.title")}</DialogTitle>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 flex items-center gap-2 select-none">
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
          </DialogHeader>

          {err && <div className="text-sm text-red-600 mb-2 whitespace-pre-wrap">{err}</div>}

          <form onSubmit={submit} className="space-y-4">
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
                  <div className="text-sm font-medium">{t("create_cell.units_required")}</div>
                  <div className="flex flex-wrap gap-2">
                    {units.map((u) => {
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
                  <label className="block text-sm mb-1">{t("create_cell.saved_bundles")}</label>
                  {bundleUnitSets.length > 0 && (
                    <div className="space-y-2">
                      {bundleUnitSets.map((set, index) => (
                        <div key={set.join(",")} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{`Bundle ${index + 1}:`}</span>{" "}
                            <span className="break-words">{set.map((id) => unitNameById[id] || `Unit ${id}`).join(" + ")}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBundleUnitSets((prev) => prev.filter((_, i) => i !== index))}
                            className="text-gray-500 hover:text-black"
                            aria-label={`Remove bundle ${index + 1}`}
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
                        min={2}
                        max={Math.max(2, maxSplitByDuration)}
                        value={splitDaysSafe}
                        onChange={(e) => {
                          const next = clampInt(Number(e.target.value) || 2, 2, Math.max(2, maxSplitByDuration));
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
                  tierCounts={tierCounts}
                  onTierCountsChange={setTierCountsClamped}
                  tierPools={tierPools}
                  onTierPoolsChange={setTierPools}
                  staffGroups={staffGroups}
                  onStaffGroupsChange={setStaffGroups}
                />
                {staffingError && (
                  <div className="text-sm text-red-600">{staffingError}</div>
                )}
              </>
            )}

            <div className="flex justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep((prev) => (prev > 1 ? prev - 1 : prev))}
                  disabled={step === 1}
                  className="h-9 w-9 rounded-full border text-sm flex items-center justify-center hover:bg-gray-50 disabled:opacity-40"
                  aria-label={t("create_cell.previous_step")}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {step < finalStep && (
                  <button
                    type="button"
                    onClick={() => setStep((prev) => (prev < finalStep ? prev + 1 : prev))}
                    disabled={!canAdvanceFromCurrentStep}
                    className="h-9 w-9 rounded-full border text-sm flex items-center justify-center hover:bg-gray-50 disabled:opacity-40"
                    aria-label={t("create_cell.next_step")}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <button type="button" className="px-3 py-2 rounded border text-sm">{t("common.cancel")}</button>
                </DialogClose>
                {showStaffingStep && (
                  <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || !canSubmit || loading}>
                    {saving ? t("create_cell.creating") : t("common.create")}
                  </button>
                )}
              </div>
            </div>
          </form>
        </DialogContent>
    </Dialog>
  );
}
