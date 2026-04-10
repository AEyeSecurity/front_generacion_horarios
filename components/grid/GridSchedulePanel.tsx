"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import UnitTabs from "@/components/grid/UnitTabs";
import SolveOverlay from "@/components/grid/SolveOverlay";
import GradualBlur from "@/components/animations/GradualBlur";
import { formatSlotRange } from "@/lib/schedule";
import {
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
} from "@/lib/schedule-view";
import { fetchGridScreenContext, getContextList, invalidateGridScreenContext } from "@/lib/screen-context";

type Unit = { id: number | string; name: string };

type Participant = {
  id: number | string;
  name?: string;
  surname?: string;
  tier?: "PRIMARY" | "SECONDARY" | "TERTIARY" | null;
};

type Cell = {
  id: number | string;
  name?: string;
  colorHex?: string;
  color_hex?: string;
  duration_min?: number | string;
  time_range?: number | string | { id?: number | string };
  tier_counts?: Partial<Record<TierKey, number>> | null;
  bundles?: Array<number | string>;
  locked_day_index?: number | null;
  locked_start_slot?: number | null;
  locked_bundle_index?: number | null;
  pin_day_index?: number | null;
  pin_start_slot?: number | null;
  pinned_bundle_index?: number | null;
};

type TierKey = "PRIMARY" | "SECONDARY" | "TERTIARY";

type Bundle = {
  id: number | string;
  name?: string;
  units?: Array<number | string>;
};

type TimeRange = {
  id: number | string;
  name?: string;
  start_time?: string;
  end_time?: string;
  start_slot?: number;
  end_slot?: number;
};

type AvailabilityRule = {
  id?: number | string;
  participant: number | string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preference?: "preferred" | "flexible" | "impossible" | string;
};

type SchedulePlacement = {
  id: number | string;
  source_cell?: string | number | null;
  source_cell_id?: string | number | null;
  bundle?: string | number | null;
  bundle_id?: string | number | null;
  day_index: number;
  start_slot: number;
  end_slot: number;
  assigned_participants?: Array<string | number>;
};

type ScreenContextSchedule = {
  id?: number | string | null;
  placements?: SchedulePlacement[];
  schedule?: SchedulePlacement[];
};

type DraftHistory = {
  cursor: number;
  latest: number;
  can_undo: boolean;
  can_redo: boolean;
};

type Props = {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  units: Unit[];
  days: string[];
  dayStartMin: number;
  dayEndMin: number;
  slotMin: number;
  rowPx: number;
  timeColPx: number;
};

type ParticipantCellEntry = {
  key: string;
  placementId: string;
  sourceCellId: string;
  bundleId: string | null;
  ownerParticipantId: string;
  assignedParticipantIds: string[];
  dayColumnIndex: number;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  durationSlots: number;
  cellName: string;
  bundleLabel: string;
  timeRangeName: string;
  timeLabel: string;
  color?: string;
};

type ParticipantDragPayload =
  | {
      kind: "placed";
      cardKey: string;
      placementId: string;
      sourceCellId: string;
      bundleId: string | null;
      ownerParticipantId: string;
      assignedParticipantIds: string[];
      startSlot: number;
      endSlot: number;
      durationSlots: number;
    }
  | {
      kind: "catalog";
      cardKey: string;
      sourceCellId: string;
      bundleId: string | null;
      startSlot: number;
      endSlot: number;
      durationSlots: number;
    };

const TIER_ORDER: Record<string, number> = {
  PRIMARY: 0,
  SECONDARY: 1,
  TERTIARY: 2,
};

const TIER_LABEL: Record<string, string> = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  TERTIARY: "Tertiary",
};

const DAY_LABEL_TO_INDEX: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

const readEntityId = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return null;
};

const parseClockToMin = (value: string) => {
  const [hourRaw, minuteRaw] = String(value ?? "").split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
};

const normalizeApiError = (raw: unknown, fallback: string): string => {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return normalizeApiError(parsed, fallback);
    } catch {
      const normalized = text.toLowerCase();
      if (
        normalized.includes("schedule, source_cell, bundle, day_index, start_slot must make a unique set") ||
        normalized.includes("must make a unique set")
      ) {
        return "This cell and bundle already exist in that day/time slot. Move the existing placement or choose another slot.";
      }
      if (text.toLowerCase().includes("overlap")) {
        return "Could not place this card in the selected slot.";
      }
      return text;
    }
  }
  if (Array.isArray(raw)) {
    const merged: string = raw.map((item) => normalizeApiError(item, "")).filter(Boolean).join(" ");
    return merged || fallback;
  }
  if (typeof raw === "object") {
    const values = Object.values(raw as Record<string, unknown>);
    const merged: string = values.map((item) => normalizeApiError(item, "")).filter(Boolean).join(" ");
    return merged || fallback;
  }
  return fallback;
};

const EMPTY_DRAFT_HISTORY: DraftHistory = {
  cursor: 0,
  latest: 0,
  can_undo: false,
  can_redo: false,
};

const normalizeDraftHistory = (value: unknown): DraftHistory => {
  const raw = (value ?? {}) as Record<string, unknown>;
  const cursor = Number(raw.cursor);
  const latest = Number(raw.latest);
  return {
    cursor: Number.isFinite(cursor) ? cursor : 0,
    latest: Number.isFinite(latest) ? latest : 0,
    can_undo: Boolean(raw.can_undo),
    can_redo: Boolean(raw.can_redo),
  };
};

export default function GridSchedulePanel({
  gridId,
  role,
  units,
  days,
  dayStartMin,
  dayEndMin,
  slotMin,
  rowPx,
  timeColPx,
}: Props) {
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let t = dayStartMin; t < dayEndMin; t += slotMin) out.push(t);
    return out;
  }, [dayStartMin, dayEndMin, slotMin]);
  const bodyHeight = rows.length * rowPx;

  const [unitNoOverlapEnabled, setUnitNoOverlapEnabled] = useState(DEFAULT_UNIT_NOOVERLAP_ENABLED);
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("draft");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [cellById, setCellById] = useState<Record<string, Cell>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [timeRangeMetaById, setTimeRangeMetaById] = useState<
    Record<string, { name: string; startSlot: number; endSlot: number }>
  >({});
  const [availabilityRulesByParticipant, setAvailabilityRulesByParticipant] = useState<
    Record<string, AvailabilityRule[]>
  >({});
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [schedulePlacements, setSchedulePlacements] = useState<SchedulePlacement[]>([]);
  const [participantEditMode, setParticipantEditMode] = useState(false);
  const [participantEditBusy, setParticipantEditBusy] = useState(false);
  const [participantEditError, setParticipantEditError] = useState<string | null>(null);
  const [draftHistory, setDraftHistory] = useState<DraftHistory>(EMPTY_DRAFT_HISTORY);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [contextRefreshTick, setContextRefreshTick] = useState(0);
  const [dragPayload, setDragPayload] = useState<ParticipantDragPayload | null>(null);
  const [dragHoverCellKey, setDragHoverCellKey] = useState<string | null>(null);
  const [isDeleteDropActive, setIsDeleteDropActive] = useState(false);
  const [catalogFocusIndex, setCatalogFocusIndex] = useState(0);
  const longPressTimerRef = useRef<number | null>(null);
  const participantBoardRef = useRef<HTMLDivElement | null>(null);
  const deleteDropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const readSettings = () => {
      try {
        const key = getGridSolverSettingsKey(gridId);
        const parsed = parseGridSolverSettings(window.localStorage.getItem(key));
        setUnitNoOverlapEnabled(
          typeof parsed.unit_nooverlap_enabled === "boolean"
            ? parsed.unit_nooverlap_enabled
            : DEFAULT_UNIT_NOOVERLAP_ENABLED,
        );
      } catch {
        setUnitNoOverlapEnabled(DEFAULT_UNIT_NOOVERLAP_ENABLED);
      }
    };

    const onStorage = (event: StorageEvent) => {
      const key = getGridSolverSettingsKey(gridId);
      if (event.key === key) readSettings();
    };

    readSettings();
    window.addEventListener("focus", readSettings);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", readSettings);
      window.removeEventListener("storage", onStorage);
    };
  }, [gridId]);

  useEffect(() => {
    const syncFromStorage = () => {
      setScheduleViewMode(readGridScheduleViewMode(gridId));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== getGridScheduleViewModeKey(gridId)) return;
      syncFromStorage();
    };

    const onModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ gridId?: string; mode?: ScheduleViewMode }>;
      if (customEvent.detail?.gridId !== String(gridId)) return;
      setScheduleViewMode(customEvent.detail?.mode === "published" ? "published" : "draft");
    };

    syncFromStorage();
    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("storage", onStorage);
    window.addEventListener(SCHEDULE_VIEW_MODE_EVENT, onModeChanged as EventListener);
    return () => {
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SCHEDULE_VIEW_MODE_EVENT, onModeChanged as EventListener);
    };
  }, [gridId]);

  useEffect(() => {
    if (unitNoOverlapEnabled) {
      setParticipantsLoading(false);
      return;
    }
    let active = true;
    setParticipantsLoading(true);
    (async () => {
      try {
        const contextJson = await fetchGridScreenContext(gridId, scheduleViewMode);
        const participantsList = getContextList<Participant>(contextJson?.participants);
        const cellsList = getContextList<Cell>(contextJson?.cells);
        const bundlesList = getContextList<Bundle>(contextJson?.bundles);
        const timeRangesList = getContextList<TimeRange>(contextJson?.time_ranges);
        const availabilityRules = getContextList<AvailabilityRule>(contextJson?.availability_rules);
        const cellMap: Record<string, Cell> = {};
        for (const cell of cellsList) {
          if (cell?.id == null) continue;
          cellMap[String(cell.id)] = cell;
        }
        const bundleNameMap: Record<string, string> = {};
        for (const bundle of bundlesList) {
          if (bundle?.id == null) continue;
          const key = String(bundle.id);
          bundleNameMap[key] = bundle.name || `Bundle ${key}`;
        }

        const timeRangeMap: Record<string, { name: string; startSlot: number; endSlot: number }> = {};
        for (const tr of timeRangesList) {
          const trId = readEntityId(tr?.id);
          if (!trId) continue;
          let startSlot: number | null =
            typeof tr.start_slot === "number" && Number.isFinite(tr.start_slot)
              ? tr.start_slot
              : null;
          let endSlot: number | null =
            typeof tr.end_slot === "number" && Number.isFinite(tr.end_slot)
              ? tr.end_slot
              : null;
          if (startSlot == null && typeof tr.start_time === "string") {
            startSlot = Math.round((parseClockToMin(tr.start_time) - dayStartMin) / slotMin);
          }
          if (endSlot == null && typeof tr.end_time === "string") {
            endSlot = Math.round((parseClockToMin(tr.end_time) - dayStartMin) / slotMin);
          }
          const normalizedStart = Math.max(0, Number.isFinite(startSlot ?? NaN) ? Number(startSlot) : 0);
          const normalizedEnd = Math.max(normalizedStart + 1, Number.isFinite(endSlot ?? NaN) ? Number(endSlot) : normalizedStart + 1);
          timeRangeMap[trId] = {
            name: tr.name || `Time range ${trId}`,
            startSlot: normalizedStart,
            endSlot: normalizedEnd,
          };
        }

        const availabilityMap: Record<string, AvailabilityRule[]> = {};
        for (const rule of availabilityRules) {
          const participantId = readEntityId(rule?.participant);
          if (!participantId) continue;
          if (!availabilityMap[participantId]) availabilityMap[participantId] = [];
          availabilityMap[participantId].push(rule);
        }

        const scheduleCandidate = (contextJson?.schedule ?? null) as ScreenContextSchedule | null;
        const scheduleList = Array.isArray(scheduleCandidate?.placements)
          ? scheduleCandidate.placements
          : Array.isArray(scheduleCandidate?.schedule)
          ? scheduleCandidate.schedule
          : [];
        const normalizedScheduleId =
          scheduleCandidate?.id != null && Number.isFinite(Number(scheduleCandidate.id))
            ? Number(scheduleCandidate.id)
            : null;

        if (active) {
          setParticipants(participantsList);
          setCellById(cellMap);
          setBundleNameById(bundleNameMap);
          setTimeRangeMetaById(timeRangeMap);
          setAvailabilityRulesByParticipant(availabilityMap);
          setScheduleId(normalizedScheduleId);
          setSchedulePlacements(scheduleList);
        }
      } catch {
        if (active) {
          setParticipants([]);
          setCellById({});
          setBundleNameById({});
          setTimeRangeMetaById({});
          setAvailabilityRulesByParticipant({});
          setScheduleId(null);
          setSchedulePlacements([]);
        }
      } finally {
        if (active) setParticipantsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [gridId, unitNoOverlapEnabled, scheduleViewMode, dayStartMin, slotMin, contextRefreshTick]);

  const orderedParticipants = useMemo(() => {
    return participants
      .slice()
      .sort((a, b) => {
        const ta = TIER_ORDER[String(a.tier || "")] ?? 99;
        const tb = TIER_ORDER[String(b.tier || "")] ?? 99;
        if (ta !== tb) return ta - tb;
        const an = `${a.name || ""} ${a.surname || ""}`.trim().toLowerCase();
        const bn = `${b.name || ""} ${b.surname || ""}`.trim().toLowerCase();
        return an.localeCompare(bn);
      })
      .map((p) => ({
        ...p,
        displayName: `${p.name || ""}${p.surname ? ` ${p.surname}` : ""}`.trim() || `Participant ${p.id}`,
      }));
  }, [participants]);

  const participantTierById = useMemo(() => {
    const map: Record<string, TierKey | null> = {};
    for (const participant of participants) {
      const pid = String(participant.id);
      const tier = participant.tier;
      map[pid] = tier === "PRIMARY" || tier === "SECONDARY" || tier === "TERTIARY" ? tier : null;
    }
    return map;
  }, [participants]);

  const dayIndexByColumn = useMemo(
    () =>
      Array.from({ length: days.length }).map((_, idx) => {
        const label = String(days[idx] ?? "").trim().slice(0, 3).toLowerCase();
        return typeof DAY_LABEL_TO_INDEX[label] === "number" ? DAY_LABEL_TO_INDEX[label] : idx;
      }),
    [days],
  );

  const dayColumnByIndex = useMemo(() => {
    const map: Record<number, number> = {};
    dayIndexByColumn.forEach((dayIndex, columnIndex) => {
      map[dayIndex] = columnIndex;
    });
    return map;
  }, [dayIndexByColumn]);

  const entriesByParticipantDay = useMemo(() => {
    const out: Record<string, Record<number, ParticipantCellEntry[]>> = {};

    for (const item of schedulePlacements) {
      const assigned = Array.isArray(item.assigned_participants) ? item.assigned_participants : [];
      const sourceCellId = String(item.source_cell_id ?? item.source_cell ?? item.id);
      const dayIndex = Number(item.day_index);
      const dayColumnIndex = Number.isFinite(dayColumnByIndex[dayIndex]) ? dayColumnByIndex[dayIndex] : dayIndex;
      if (!Number.isFinite(dayColumnIndex) || dayColumnIndex < 0 || dayColumnIndex >= days.length) continue;
      const placementId = String(item.id);
      const bundleId =
        readEntityId(item.bundle_id) ??
        readEntityId(item.bundle) ??
        null;
      const cell = cellById[sourceCellId];
      const cellName = cell?.name || `Cell ${sourceCellId}`;
      const color = cell?.colorHex || cell?.color_hex || undefined;
      const bundleLabel = bundleId ? bundleNameById[bundleId] || `Bundle ${bundleId}` : "No bundle";
      const trId = readEntityId(cell?.time_range);
      const trName = trId ? timeRangeMetaById[trId]?.name || "No time range" : "No time range";
      const timeLabel = formatSlotRange(dayStartMin, slotMin, item.start_slot, item.end_slot);

      for (const rawPid of assigned) {
        const pid = String(rawPid);
        if (!out[pid]) out[pid] = {};
        if (!out[pid][dayColumnIndex]) out[pid][dayColumnIndex] = [];
        out[pid][dayColumnIndex].push({
          key: `${placementId}-${pid}-${dayColumnIndex}`,
          placementId,
          sourceCellId,
          bundleId,
          ownerParticipantId: pid,
          assignedParticipantIds: assigned.map(String),
          dayColumnIndex,
          dayIndex,
          startSlot: Number(item.start_slot),
          endSlot: Number(item.end_slot),
          durationSlots: Math.max(1, Number(item.end_slot) - Number(item.start_slot)),
          cellName,
          bundleLabel,
          timeRangeName: trName,
          timeLabel,
          color,
        });
      }
    }

    for (const pid of Object.keys(out)) {
      for (const dayIndex of Object.keys(out[pid])) {
        out[pid][Number(dayIndex)].sort((a, b) => {
          if (a.startSlot !== b.startSlot) return a.startSlot - b.startSlot;
          return a.endSlot - b.endSlot;
        });
      }
    }

    return out;
  }, [schedulePlacements, dayColumnByIndex, days.length, cellById, bundleNameById, dayStartMin, slotMin, timeRangeMetaById]);

  const cellCatalog = useMemo(() => {
    return Object.values(cellById)
      .map((cell) => {
        const sourceCellId = String(cell.id);
        const bundleIds = Array.isArray(cell.bundles) ? cell.bundles.map(String) : [];
        const bundleId = bundleIds[0] ?? null;
        const trId = readEntityId(cell.time_range);
        const trMeta = trId ? timeRangeMetaById[trId] : undefined;
        const fallbackDurationSlots =
          cell.duration_min != null && Number.isFinite(Number(cell.duration_min))
            ? Math.max(1, Math.round(Number(cell.duration_min) / slotMin))
            : 1;
        const startSlot = trMeta?.startSlot ?? 0;
        const endSlot = trMeta?.endSlot ?? Math.max(startSlot + fallbackDurationSlots, 1);
        const timeLabel = formatSlotRange(dayStartMin, slotMin, startSlot, endSlot);
        const tierCounts = (cell.tier_counts ?? null) as Partial<Record<TierKey, number>> | null;
        return {
          sourceCellId,
          cardKey: `catalog-${sourceCellId}`,
          name: cell.name || `Cell ${sourceCellId}`,
          color: cell.colorHex || cell.color_hex || undefined,
          bundleId,
          bundleLabel: bundleId ? bundleNameById[bundleId] || `Bundle ${bundleId}` : "No bundle",
          timeLabel,
          startSlot,
          endSlot,
          durationSlots: Math.max(1, endSlot - startSlot),
          tierCounts,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cellById, bundleNameById, dayStartMin, slotMin, timeRangeMetaById]);

  useEffect(() => {
    setCatalogFocusIndex((prev) => {
      if (cellCatalog.length <= 1) return 0;
      return Math.max(0, Math.min(cellCatalog.length - 1, prev));
    });
  }, [cellCatalog.length]);

  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const canEditParticipantDraft = role === "supervisor" && scheduleViewMode === "draft" && !unitNoOverlapEnabled;
  const canUseDraftHistory = role === "supervisor" && scheduleViewMode === "draft";
  const canUndoDraft = canUseDraftHistory && !historyBusy && draftHistory.can_undo;
  const canRedoDraft = canUseDraftHistory && !historyBusy && draftHistory.can_redo;
  const canRestoreDraft = canUseDraftHistory && !historyBusy;

  const refreshAfterDraftMutation = useCallback(() => {
    invalidateGridScreenContext(gridId);
    setContextRefreshTick((prev) => prev + 1);
  }, [gridId]);

  const loadDraftHistory = useCallback(async () => {
    if (!canUseDraftHistory) {
      setDraftHistory(EMPTY_DRAFT_HISTORY);
      return;
    }
    try {
      const res = await fetch(`/api/grids/${gridId}/schedule/history/`, { cache: "no-store" });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(raw || `Failed to load history (${res.status})`);
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const historyRaw = data?.draft_history ?? data?.history ?? data;
      setDraftHistory(normalizeDraftHistory(historyRaw));
      setHistoryError(null);
    } catch (error: unknown) {
      setDraftHistory(EMPTY_DRAFT_HISTORY);
      setHistoryError(
        normalizeApiError(error instanceof Error ? error.message : "", "Could not load draft history."),
      );
    }
  }, [canUseDraftHistory, gridId]);

  const handleDraftMutated = useCallback(() => {
    refreshAfterDraftMutation();
    void loadDraftHistory();
  }, [loadDraftHistory, refreshAfterDraftMutation]);

  useEffect(() => {
    void loadDraftHistory();
  }, [loadDraftHistory, contextRefreshTick]);

  useEffect(() => {
    if (canUseDraftHistory) return;
    setHistoryBusy(false);
    setHistoryError(null);
  }, [canUseDraftHistory]);

  useEffect(() => {
    if (!canUseDraftHistory) return;
    const onFocus = () => {
      void loadDraftHistory();
    };
    const id = window.setInterval(() => {
      void loadDraftHistory();
    }, 5000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [canUseDraftHistory, loadDraftHistory]);

  const applyDraftHistoryAction = useCallback(
    async (endpoint: string, body: Record<string, unknown> = {}) => {
      if (!canUseDraftHistory || historyBusy) return;
      setHistoryBusy(true);
      setHistoryError(null);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          throw new Error(raw || `Request failed (${res.status})`);
        }
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const historyRaw = data?.draft_history ?? data?.history ?? (data?.schedule as Record<string, unknown>)?.history;
        setDraftHistory(normalizeDraftHistory(historyRaw));
        refreshAfterDraftMutation();
      } catch (error: unknown) {
        setHistoryError(
          normalizeApiError(error instanceof Error ? error.message : "", "Could not apply draft history action."),
        );
      } finally {
        setHistoryBusy(false);
      }
    },
    [canUseDraftHistory, historyBusy, refreshAfterDraftMutation],
  );

  const undoDraft = useCallback(async () => {
    if (!draftHistory.can_undo) return;
    await applyDraftHistoryAction(`/api/grids/${gridId}/schedule/history/undo/`, {});
  }, [applyDraftHistoryAction, draftHistory.can_undo, gridId]);

  const redoDraft = useCallback(async () => {
    if (!draftHistory.can_redo) return;
    await applyDraftHistoryAction(`/api/grids/${gridId}/schedule/history/redo/`, {});
  }, [applyDraftHistoryAction, draftHistory.can_redo, gridId]);

  const restorePublishedInDraft = useCallback(
    async (publishedVersion?: number) => {
      const payload: Record<string, unknown> = {};
      if (typeof publishedVersion === "number") payload.published_version = publishedVersion;
      await applyDraftHistoryAction(`/api/grids/${gridId}/schedule/restore-published/`, payload);
    },
    [applyDraftHistoryAction, gridId],
  );

  const promptRestorePublished = useCallback(() => {
    if (!canUseDraftHistory || historyBusy) return;
    setHistoryError(null);
    const response = window.prompt(
      "Restore draft from published version.\nLeave empty to restore from latest published.",
      "",
    );
    if (response == null) return;
    const value = response.trim();
    if (!value) {
      void restorePublishedInDraft();
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setHistoryError("Enter a valid published version number.");
      return;
    }
    void restorePublishedInDraft(parsed);
  }, [canUseDraftHistory, historyBusy, restorePublishedInDraft]);

  useEffect(() => {
    if (!canUseDraftHistory) return;
    const isTypingTarget = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (node.isContentEditable) return true;
      return Boolean(node.closest("input, textarea, select, [contenteditable='true']"));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        if (!draftHistory.can_undo || historyBusy) return;
        event.preventDefault();
        void undoDraft();
        return;
      }

      if (key === "y" || (key === "z" && event.shiftKey)) {
        if (!draftHistory.can_redo || historyBusy) return;
        event.preventDefault();
        void redoDraft();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    canUseDraftHistory,
    draftHistory.can_redo,
    draftHistory.can_undo,
    historyBusy,
    redoDraft,
    undoDraft,
  ]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  useEffect(() => {
    if (canEditParticipantDraft) return;
    setParticipantEditMode(false);
    setDragPayload(null);
    setDragHoverCellKey(null);
    clearLongPressTimer();
  }, [canEditParticipantDraft, clearLongPressTimer]);

  useEffect(() => {
    if (!participantEditMode) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-participant-edit-root]")) return;
      if (target.closest("[data-participant-stack]")) return;
      if (target.closest("[data-participant-delete-drop]")) return;
      setParticipantEditMode(false);
      setDragPayload(null);
      setDragHoverCellKey(null);
      setIsDeleteDropActive(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setParticipantEditMode(false);
      setDragPayload(null);
      setDragHoverCellKey(null);
      setIsDeleteDropActive(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [participantEditMode]);

  useEffect(() => {
    if (participantEditMode) return;
    setIsDeleteDropActive(false);
  }, [participantEditMode]);

  useEffect(() => {
    if (!participantEditMode) return;
    const dock = document.getElementById("sidedock");
    const prevOpacity = dock?.style.opacity ?? "";
    const prevPointerEvents = dock?.style.pointerEvents ?? "";
    const prevTransition = dock?.style.transition ?? "";
    if (dock) {
      dock.style.opacity = "0";
      dock.style.pointerEvents = "none";
      dock.style.transition = "opacity 140ms ease";
    }
    return () => {
      if (!dock) return;
      dock.style.opacity = prevOpacity;
      dock.style.pointerEvents = prevPointerEvents;
      dock.style.transition = prevTransition;
    };
  }, [participantEditMode]);

  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;

  const hasImpossibleRuleCollision = useCallback(
    (participantId: string, dayColumnIndex: number, startSlot: number, endSlot: number) => {
      const scheduleDayIndex = dayIndexByColumn[dayColumnIndex] ?? dayColumnIndex;
      const rules = availabilityRulesByParticipant[participantId] || [];
      return rules.some((rule) => {
        const preference = String(rule.preference || "").toLowerCase();
        if (preference !== "impossible") return false;
        if (Number(rule.day_of_week) !== Number(scheduleDayIndex)) return false;
        const ruleStartSlot = Math.round((parseClockToMin(rule.start_time) - dayStartMin) / slotMin);
        const ruleEndSlot = Math.round((parseClockToMin(rule.end_time) - dayStartMin) / slotMin);
        return overlaps(startSlot, endSlot, ruleStartSlot, ruleEndSlot);
      });
    },
    [availabilityRulesByParticipant, dayIndexByColumn, dayStartMin, slotMin],
  );

  const isTierAllowedForCell = useCallback(
    (sourceCellId: string, participantId: string) => {
      const cell = cellById[sourceCellId];
      if (!cell?.tier_counts || typeof cell.tier_counts !== "object") return true;
      const participantTier = participantTierById[participantId];
      const tierCounts = cell.tier_counts as Partial<Record<TierKey, number>>;
      const hasAnyTierRequirement = (["PRIMARY", "SECONDARY", "TERTIARY"] as TierKey[]).some(
        (tier) => Number(tierCounts[tier] || 0) > 0,
      );
      if (!hasAnyTierRequirement) return true;
      if (!participantTier) return false;
      return Number(tierCounts[participantTier] || 0) > 0;
    },
    [cellById, participantTierById],
  );

  const updatePlacementInState = useCallback((placementId: string, updater: (placement: SchedulePlacement) => SchedulePlacement) => {
    setSchedulePlacements((prev) =>
      prev.map((placement) => (String(placement.id) === placementId ? updater(placement) : placement)),
    );
  }, []);

  const removePlacementFromSchedule = useCallback(
    async (payload: Extract<ParticipantDragPayload, { kind: "placed" }>) => {
      if (!canEditParticipantDraft || participantEditBusy) return;
      const placementId = String(payload.placementId || "");
      const participantIdToRemove = String(payload.ownerParticipantId || "");
      if (!placementId || !participantIdToRemove) return;

      const previousPlacements = schedulePlacements;
      const targetPlacement = previousPlacements.find((placement) => String(placement.id) === placementId);
      if (!targetPlacement) return;

      const existingAssigned = Array.isArray(targetPlacement.assigned_participants)
        ? targetPlacement.assigned_participants.map(String)
        : [];
      const nextAssigned = existingAssigned.filter((pid) => pid !== participantIdToRemove);
      const nextAssignedApi = nextAssigned.map((pid) => (/^\d+$/.test(pid) ? Number(pid) : pid));

      setParticipantEditError(null);
      setParticipantEditBusy(true);
      try {
        if (nextAssigned.length === 0) {
          setSchedulePlacements((prev) => prev.filter((placement) => String(placement.id) !== placementId));
          const res = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const raw = await res.text().catch(() => "");
            throw new Error(
              normalizeApiError(
                raw || `Could not remove placement (${res.status})`,
                "Could not remove participant from placement.",
              ),
            );
          }
          return;
        }

        updatePlacementInState(placementId, (placement) => ({
          ...placement,
          assigned_participants: nextAssigned,
        }));
        const res = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assigned_participants: nextAssignedApi,
          }),
        });
        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          throw new Error(
            normalizeApiError(
              raw || `Could not update placement (${res.status})`,
              "Could not remove participant from placement.",
            ),
          );
        }
      } catch (error: unknown) {
        setSchedulePlacements(previousPlacements);
        setParticipantEditError(
          normalizeApiError(error instanceof Error ? error.message : "", "Could not remove participant from placement."),
        );
      } finally {
        setParticipantEditBusy(false);
      }
    },
    [canEditParticipantDraft, participantEditBusy, schedulePlacements, updatePlacementInState],
  );

  const movePlacedCard = useCallback(
    async (payload: Extract<ParticipantDragPayload, { kind: "placed" }>, targetDayColumn: number) => {
      if (!canEditParticipantDraft || participantEditBusy) return;
      if (payload.ownerParticipantId == null) return;
      if (hasImpossibleRuleCollision(payload.ownerParticipantId, targetDayColumn, payload.startSlot, payload.endSlot)) {
        setParticipantEditError("This participant has an Impossible availability rule in that time range.");
        return;
      }
      setParticipantEditError(null);
      const targetDayIndex = dayIndexByColumn[targetDayColumn] ?? targetDayColumn;
      const unchangedPosition =
        Number(payload.startSlot) === Number(
          schedulePlacements.find((placement) => String(placement.id) === payload.placementId)?.start_slot,
        ) &&
        Number(payload.endSlot) === Number(
          schedulePlacements.find((placement) => String(placement.id) === payload.placementId)?.end_slot,
        ) &&
        Number(targetDayIndex) === Number(
          schedulePlacements.find((placement) => String(placement.id) === payload.placementId)?.day_index,
        );
      if (unchangedPosition) return;
      const originalPlacement = schedulePlacements.find((placement) => String(placement.id) === payload.placementId);
      if (!originalPlacement) return;

      updatePlacementInState(payload.placementId, (placement) => ({
        ...placement,
        day_index: targetDayIndex,
        start_slot: payload.startSlot,
        end_slot: payload.endSlot,
      }));

      setParticipantEditBusy(true);
      try {
        const res = await fetch(`/api/schedule-placements/${encodeURIComponent(payload.placementId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            day_index: targetDayIndex,
            start_slot: payload.startSlot,
            end_slot: payload.endSlot,
          }),
        });
        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          throw new Error(normalizeApiError(raw || `Could not move placement (${res.status})`, "Could not move placement."));
        }
      } catch (error: unknown) {
        updatePlacementInState(payload.placementId, () => originalPlacement);
        setParticipantEditError(normalizeApiError(error instanceof Error ? error.message : "", "Could not move placement."));
      } finally {
        setParticipantEditBusy(false);
      }
    },
    [canEditParticipantDraft, dayIndexByColumn, hasImpossibleRuleCollision, participantEditBusy, schedulePlacements, updatePlacementInState],
  );

  const addPlacementFromCatalog = useCallback(
    async (
      payload: Extract<ParticipantDragPayload, { kind: "catalog" }>,
      targetParticipantId: string,
      targetDayColumn: number,
    ) => {
      if (!canEditParticipantDraft || participantEditBusy) return;
      if (!scheduleId) {
        setParticipantEditError("No draft schedule available.");
        return;
      }
      if (!payload.bundleId) {
        setParticipantEditError("This cell has no bundle assigned.");
        return;
      }
      if (!isTierAllowedForCell(payload.sourceCellId, targetParticipantId)) {
        setParticipantEditError("This participant tier is not eligible for this cell.");
        return;
      }
      const targetDayIndex = dayIndexByColumn[targetDayColumn] ?? targetDayColumn;
      const normalizedSourceCell = /^\d+$/.test(payload.sourceCellId)
        ? Number(payload.sourceCellId)
        : payload.sourceCellId;
      const normalizedBundle = /^\d+$/.test(payload.bundleId)
        ? Number(payload.bundleId)
        : payload.bundleId;
      const normalizedParticipant = /^\d+$/.test(targetParticipantId)
        ? Number(targetParticipantId)
        : targetParticipantId;
      const bundleKey = String(payload.bundleId);
      const matchingPlacements = schedulePlacements.filter((placement) => {
        const placementSource = readEntityId(placement.source_cell_id ?? placement.source_cell);
        const placementBundle = readEntityId(placement.bundle_id ?? placement.bundle);
        return placementSource === payload.sourceCellId && placementBundle === bundleKey;
      });
      const sameDayCandidates = matchingPlacements.filter(
        (placement) => Number(placement.day_index) === Number(targetDayIndex),
      );
      const sameDayPlacement =
        sameDayCandidates.find((placement) => Number(placement.start_slot) === Number(payload.startSlot)) ??
        sameDayCandidates
          .slice()
          .sort(
            (a, b) =>
              Number(a.start_slot) - Number(b.start_slot) ||
              Number(a.end_slot) - Number(b.end_slot),
          )[0];
      const targetStartSlot = sameDayPlacement ? Number(sameDayPlacement.start_slot) : Number(payload.startSlot);
      const targetEndSlot = sameDayPlacement ? Number(sameDayPlacement.end_slot) : Number(payload.endSlot);
      if (hasImpossibleRuleCollision(targetParticipantId, targetDayColumn, targetStartSlot, targetEndSlot)) {
        setParticipantEditError("This participant has an Impossible availability rule in that time range.");
        return;
      }

      setParticipantEditError(null);

      setParticipantEditBusy(true);
      try {
        if (sameDayPlacement) {
          const placementId = String(sameDayPlacement.id);
          const previousPlacement = sameDayPlacement;
          const existingAssigned = Array.isArray(sameDayPlacement.assigned_participants)
            ? sameDayPlacement.assigned_participants.map(String)
            : [];
          const mergedAssigned = Array.from(new Set([...existingAssigned, targetParticipantId]));
          const mergedAssignedApi = mergedAssigned.map((participantId) =>
            /^\d+$/.test(participantId) ? Number(participantId) : participantId,
          );
          const noChangesNeeded = mergedAssigned.length === existingAssigned.length;
          if (noChangesNeeded) return;

          updatePlacementInState(placementId, (placement) => ({
            ...placement,
            assigned_participants: mergedAssigned,
          }));
          const patchRes = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              assigned_participants: mergedAssignedApi,
            }),
          });
          if (!patchRes.ok) {
            const raw = await patchRes.text().catch(() => "");
            updatePlacementInState(placementId, () => previousPlacement);
            throw new Error(
              normalizeApiError(raw || `Could not update placement (${patchRes.status})`, "Could not place cell."),
            );
          }
        } else {
          const res = await fetch(`/api/schedule-placements/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              schedule: scheduleId,
              source_cell: normalizedSourceCell,
              bundle: normalizedBundle,
              day_index: targetDayIndex,
              start_slot: payload.startSlot,
              end_slot: payload.endSlot,
              assigned_participants: [normalizedParticipant],
            }),
          });
          if (!res.ok) {
            const raw = await res.text().catch(() => "");
            const rawText = String(raw || "");
            const looksLikeUniqueSet =
              rawText.toLowerCase().includes("must make a unique set") ||
              rawText.toLowerCase().includes("schedule, source_cell, bundle, day_index, start_slot");
            if (looksLikeUniqueSet) {
              const concurrentSameDayCandidates = schedulePlacements.filter((placement) => {
                const placementSource = readEntityId(placement.source_cell_id ?? placement.source_cell);
                const placementBundle = readEntityId(placement.bundle_id ?? placement.bundle);
                return (
                  placementSource === payload.sourceCellId &&
                  placementBundle === bundleKey &&
                  Number(placement.day_index) === Number(targetDayIndex)
                );
              });
              const concurrentSameDayPlacement =
                concurrentSameDayCandidates.find(
                  (placement) => Number(placement.start_slot) === Number(payload.startSlot),
                ) ??
                concurrentSameDayCandidates
                  .slice()
                  .sort(
                    (a, b) =>
                      Number(a.start_slot) - Number(b.start_slot) ||
                      Number(a.end_slot) - Number(b.end_slot),
                  )[0];
              if (concurrentSameDayPlacement) {
                const existingAssigned = Array.isArray(concurrentSameDayPlacement.assigned_participants)
                  ? concurrentSameDayPlacement.assigned_participants.map(String)
                  : [];
                const mergedAssigned = Array.from(new Set([...existingAssigned, targetParticipantId]));
                const mergedAssignedApi = mergedAssigned.map((participantId) =>
                  /^\d+$/.test(participantId) ? Number(participantId) : participantId,
                );
                const patchRes = await fetch(
                  `/api/schedule-placements/${encodeURIComponent(String(concurrentSameDayPlacement.id))}`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      assigned_participants: mergedAssignedApi,
                    }),
                  },
                );
                if (!patchRes.ok) {
                  const patchRaw = await patchRes.text().catch(() => "");
                  throw new Error(
                    normalizeApiError(
                      patchRaw || `Could not update placement (${patchRes.status})`,
                      "Could not place cell.",
                    ),
                  );
                }
                updatePlacementInState(String(concurrentSameDayPlacement.id), (placement) => ({
                  ...placement,
                  assigned_participants: mergedAssigned,
                }));
                return;
              }
            }
            throw new Error(normalizeApiError(raw || `Could not place cell (${res.status})`, "Could not place cell."));
          }
          const created = (await res.json().catch(() => ({}))) as SchedulePlacement;
          if (created?.id == null) return;
          setSchedulePlacements((prev) => [
            ...prev,
            {
              ...created,
              source_cell_id: readEntityId(created.source_cell_id ?? created.source_cell) ?? payload.sourceCellId,
              bundle_id: readEntityId(created.bundle_id ?? created.bundle) ?? payload.bundleId,
              assigned_participants: Array.isArray(created.assigned_participants)
                ? created.assigned_participants
                : [targetParticipantId],
            },
          ]);
        }
      } catch (error: unknown) {
        setParticipantEditError(normalizeApiError(error instanceof Error ? error.message : "", "Could not place cell."));
      } finally {
        setParticipantEditBusy(false);
      }
    },
    [
      canEditParticipantDraft,
      participantEditBusy,
      scheduleId,
      isTierAllowedForCell,
      hasImpossibleRuleCollision,
      dayIndexByColumn,
      schedulePlacements,
      updatePlacementInState,
    ],
  );

  if (unitNoOverlapEnabled) {
    return (
      <>
        <div className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
          <div className="bg-gray-50 border-b h-12 flex items-center justify-center px-1.5">
            {canUseDraftHistory && (
              <div className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  title="Undo (Ctrl+Z)"
                  onClick={() => {
                    if (!canUndoDraft) return;
                    void undoDraft();
                  }}
                  aria-disabled={!canUndoDraft}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                    canUndoDraft ? "text-gray-700 hover:text-black" : "text-gray-300 cursor-default"
                  }`}
                >
                  <Undo2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  title="Redo (Ctrl+Y)"
                  onClick={() => {
                    if (!canRedoDraft) return;
                    void redoDraft();
                  }}
                  aria-disabled={!canRedoDraft}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                    canRedoDraft ? "text-gray-700 hover:text-black" : "text-gray-300 cursor-default"
                  }`}
                >
                  <Redo2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  title="Restore Draft From Published Version"
                  onClick={() => {
                    if (!canRestoreDraft) return;
                    promptRestorePublished();
                  }}
                  aria-disabled={!canRestoreDraft}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                    canRestoreDraft ? "text-gray-700 hover:text-black" : "text-gray-300 cursor-default"
                  }`}
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
          {days.map((day) => (
            <div key={day} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
              {day}
            </div>
          ))}
        </div>

        <div
          data-schedule-scroll
          className="relative max-h-[70vh] overflow-y-auto hide-scrollbar"
        >
          {historyError && (
            <div className="sticky top-2 left-0 z-[80] mx-3 my-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
              {historyError}
            </div>
          )}
          <div className="pointer-events-none absolute left-0 top-0 z-[2]" style={{ width: timeColPx, height: bodyHeight }}>
            <div className="absolute inset-x-0 top-1 text-center text-xs text-gray-500">{fmt(dayStartMin)}</div>
            {rows.slice(1).map((time, index) => (
              <div
                key={`time-axis-${time}`}
                className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-gray-500"
                style={{ top: (index + 1) * rowPx }}
              >
                {fmt(time)}
              </div>
            ))}
            <div className="absolute inset-x-0 bottom-1 text-center text-xs text-gray-500">{fmt(dayEndMin)}</div>
          </div>

          {rows.map((time) => (
            <div key={time} className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
              <div className="h-16 border-r" />
              {days.map((day, dayIndex) => (
                <div
                  key={`${time}-${day}`}
                  className={`border-b ${dayIndex < days.length - 1 ? "border-r" : ""} h-16 hover:bg-gray-50`}
                />
              ))}
            </div>
          ))}

          <UnitTabs
            gridId={gridId}
            role={role}
            units={units}
            daysCount={days.length}
            dayLabels={days}
            rowPx={rowPx}
            timeColPx={timeColPx}
            bodyHeight={bodyHeight}
            dayStartMin={dayStartMin}
            slotMin={slotMin}
            scheduleViewMode={scheduleViewMode}
            enablePinning={role === "supervisor" && scheduleViewMode === "draft"}
            externalRefreshTick={contextRefreshTick}
            onDraftMutated={handleDraftMutated}
          />
        </div>

        <GradualBlur
          target="parent"
          position="top"
          height="2.1rem"
          strength={2}
          divCount={5}
          curve="bezier"
          exponential
          opacity={1}
          showWhen="not-at-start"
          style={{ top: "3rem" }}
        />
        <GradualBlur
          target="parent"
          position="bottom"
          height="2.1rem"
          strength={2}
          divCount={5}
          curve="bezier"
          exponential
          opacity={1}
          showWhen="not-at-end"
        />
      </>
    );
  }

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}>
        <div className="bg-gray-50 border-b h-12 flex items-center justify-center px-1.5">
          {canUseDraftHistory && (
            <div className="inline-flex items-center gap-0.5">
              <button
                type="button"
                title="Undo (Ctrl+Z)"
                onClick={() => {
                  if (!canUndoDraft) return;
                  void undoDraft();
                }}
                aria-disabled={!canUndoDraft}
                className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  canUndoDraft ? "text-gray-700 hover:text-black" : "text-gray-300 cursor-default"
                }`}
              >
                <Undo2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                title="Redo (Ctrl+Y)"
                onClick={() => {
                  if (!canRedoDraft) return;
                  void redoDraft();
                }}
                aria-disabled={!canRedoDraft}
                className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  canRedoDraft ? "text-gray-700 hover:text-black" : "text-gray-300 cursor-default"
                }`}
              >
                <Redo2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                title="Restore Draft From Published Version"
                onClick={() => {
                  if (!canRestoreDraft) return;
                  promptRestorePublished();
                }}
                aria-disabled={!canRestoreDraft}
                className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  canRestoreDraft ? "text-gray-700 hover:text-black" : "text-gray-300 cursor-default"
                }`}
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
        {days.map((day) => (
          <div key={day} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
            {day}
          </div>
        ))}
      </div>

      <div
        ref={participantBoardRef}
        data-schedule-scroll
        data-participant-edit-root
        className="relative max-h-[70vh] overflow-y-auto hide-scrollbar"
      >
        {historyError && (
          <div className="sticky top-2 left-0 z-[80] mx-3 my-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {historyError}
          </div>
        )}
        {participantEditError && (
          <div className="sticky top-2 left-0 z-[80] mx-3 my-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {participantEditError}
          </div>
        )}
        {participantsLoading && (
          <div className="px-3 py-3 space-y-2">
            <div className="text-xs text-gray-500 px-1">Loading participants...</div>
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <div
                key={`participants-skeleton-${rowIndex}`}
                className="grid animate-pulse"
                style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}
              >
                <div className="border-r border-b px-3 py-3 bg-white">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-20 rounded bg-gray-100" />
                </div>
                {days.map((day, dayIndex) => (
                  <div
                    key={`participants-skeleton-${rowIndex}-${day}`}
                    className={`border-b ${dayIndex < days.length - 1 ? "border-r" : ""} min-h-[108px] p-0`}
                  >
                    <div className="m-[10px] h-[calc(100%-20px)] rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {!participantsLoading && orderedParticipants.length === 0 && (
          <div className="px-4 py-6 text-sm text-gray-500">No participants found for this grid.</div>
        )}
        {orderedParticipants.map((participant) => {
          const pid = String(participant.id);
          const tier = participant.tier ? TIER_LABEL[String(participant.tier)] || String(participant.tier) : "No tier";
          return (
            <div
              key={pid}
              className="grid"
              style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}
            >
              <div className="border-r border-b px-3 py-3 bg-white">
                <div className="font-medium text-sm text-gray-900">{participant.displayName}</div>
                <div className="text-xs text-gray-500 mt-1">{tier}</div>
              </div>
              {days.map((day, dayColumnIndex) => {
                const entries = entriesByParticipantDay[pid]?.[dayColumnIndex] || [];
                const targetCellKey = `${pid}-${dayColumnIndex}`;
                const isDropActive = dragHoverCellKey === targetCellKey;
                return (
                  <div
                    key={`${pid}-${day}`}
                    className={`relative border-b ${dayColumnIndex < days.length - 1 ? "border-r" : ""} min-h-[108px] p-0 ${
                      isDropActive ? "bg-emerald-50/60" : ""
                    }`}
                    onDragOver={(event) => {
                      if (!canEditParticipantDraft || !participantEditMode || participantEditBusy || !dragPayload) return;
                      if (
                        dragPayload.kind === "placed" &&
                        dragPayload.ownerParticipantId !== pid
                      ) {
                        return;
                      }
                      if (
                        dragPayload.kind === "catalog" &&
                        !isTierAllowedForCell(dragPayload.sourceCellId, pid)
                      ) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragHoverCellKey(targetCellKey);
                    }}
                    onDragEnter={(event) => {
                      if (!canEditParticipantDraft || !participantEditMode || participantEditBusy || !dragPayload) return;
                      if (
                        dragPayload.kind === "placed" &&
                        dragPayload.ownerParticipantId !== pid
                      ) {
                        return;
                      }
                      if (
                        dragPayload.kind === "catalog" &&
                        !isTierAllowedForCell(dragPayload.sourceCellId, pid)
                      ) {
                        return;
                      }
                      event.preventDefault();
                      setDragHoverCellKey(targetCellKey);
                    }}
                    onDragLeave={(event) => {
                      const next = event.relatedTarget as Node | null;
                      if (next && (event.currentTarget as HTMLDivElement).contains(next)) return;
                      setDragHoverCellKey((prev) => (prev === targetCellKey ? null : prev));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragHoverCellKey(null);
                      if (!canEditParticipantDraft || !participantEditMode || participantEditBusy || !dragPayload) return;
                      if (dragPayload.kind === "placed") {
                        if (dragPayload.ownerParticipantId !== pid) {
                          setParticipantEditError("Placed cards can only be moved inside the same participant row.");
                          return;
                        }
                        void movePlacedCard(dragPayload, dayColumnIndex);
                        return;
                      }
                      void addPlacementFromCatalog(dragPayload, pid, dayColumnIndex);
                    }}
                  >
                    <div className={`absolute inset-[10px] ${entries.length > 1 ? "flex flex-col gap-[6px]" : ""}`}>
                      {entries.map((entry) => (
                        <div
                          key={entry.key}
                          draggable={canEditParticipantDraft && participantEditMode && !participantEditBusy}
                          onPointerDown={() => {
                            if (!canEditParticipantDraft || participantEditMode) return;
                            clearLongPressTimer();
                            longPressTimerRef.current = window.setTimeout(() => {
                              setParticipantEditMode(true);
                              longPressTimerRef.current = null;
                            }, 320);
                          }}
                          onPointerUp={() => clearLongPressTimer()}
                          onPointerCancel={() => clearLongPressTimer()}
                          onDragStart={(event) => {
                            if (!canEditParticipantDraft || !participantEditMode || participantEditBusy) {
                              event.preventDefault();
                              return;
                            }
                            const payload: ParticipantDragPayload = {
                              kind: "placed",
                              cardKey: entry.key,
                              placementId: entry.placementId,
                              sourceCellId: entry.sourceCellId,
                              bundleId: entry.bundleId,
                              ownerParticipantId: pid,
                              assignedParticipantIds: entry.assignedParticipantIds,
                              startSlot: entry.startSlot,
                              endSlot: entry.endSlot,
                              durationSlots: entry.durationSlots,
                            };
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", entry.key);
                            setParticipantEditError(null);
                            setIsDeleteDropActive(false);
                            setDragPayload(payload);
                          }}
                          onDragEnd={() => {
                            setDragPayload(null);
                            setDragHoverCellKey(null);
                            setIsDeleteDropActive(false);
                          }}
                          className={`relative rounded-md border px-3 py-2 text-xs leading-tight ${
                            entries.length > 1 ? "flex-1 min-h-0" : "h-full"
                          } ${
                            canEditParticipantDraft && participantEditMode && !participantEditBusy
                              ? dragPayload?.cardKey === entry.key
                                ? "opacity-80 cursor-grabbing"
                                : "cursor-grab"
                              : canEditParticipantDraft && !participantEditMode
                              ? "cursor-pointer"
                              : ""
                          }`}
                          style={{
                            backgroundColor: entry.color || "#f3f4f6",
                            borderColor: "#d1d5db",
                          }}
                        >
                          <div className="flex h-full w-full flex-col items-center justify-center text-center">
                            <div className="font-semibold text-gray-900 truncate w-full">{entry.cellName}</div>
                            <div className="mt-0.5 text-[10px] font-normal text-gray-600 truncate w-full">
                              {entry.bundleLabel}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-700">{entry.timeLabel}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {canEditParticipantDraft && participantEditMode && (
          <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[210] pointer-events-none animate-[participant-edit-pop_180ms_cubic-bezier(0.22,1,0.36,1)]">
            <div
              ref={deleteDropRef}
              data-participant-delete-drop
              className={`relative isolate w-12 h-12 rounded-full border shadow-md pointer-events-auto transition-all duration-150 flex items-center justify-center ${
                isDeleteDropActive
                  ? "bg-red-600 border-red-700 scale-110"
                  : "bg-white border-gray-300"
              }`}
              title="Drop here to remove this participant from the placement"
              onDragOver={(event) => {
                if (!dragPayload || dragPayload.kind !== "placed" || participantEditBusy) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setIsDeleteDropActive(true);
              }}
              onDragEnter={(event) => {
                if (!dragPayload || dragPayload.kind !== "placed" || participantEditBusy) return;
                event.preventDefault();
                setIsDeleteDropActive(true);
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && (event.currentTarget as HTMLDivElement).contains(next)) return;
                setIsDeleteDropActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const payload = dragPayload;
                setIsDeleteDropActive(false);
                setDragHoverCellKey(null);
                setDragPayload(null);
                if (!payload || payload.kind !== "placed") return;
                void removePlacementFromSchedule(payload);
              }}
            >
              <Trash2 className={`w-5 h-5 ${isDeleteDropActive ? "text-white" : "text-red-600"}`} />
              <div
                className={`absolute left-full top-1/2 -translate-y-1/2 ml-[-22px] h-44 w-9 overflow-hidden pointer-events-none transition-all duration-150 -z-10 ${
                  isDeleteDropActive ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
              >
                <div
                  className="absolute top-1/2 left-0 h-[220px] w-[220px] -translate-y-1/2 -translate-x-[190px] rounded-full border-[6px] border-red-500/85 shadow-[0_0_34px_rgba(239,68,68,0.34)]"
                  style={{ background: "transparent" }}
                />
              </div>
            </div>
          </div>
        )}

        {canEditParticipantDraft && participantEditMode && (
          <div
            className="fixed right-[-108px] top-1/2 -translate-y-1/2 z-[210] pointer-events-none animate-[participant-edit-pop_180ms_cubic-bezier(0.22,1,0.36,1)]"
            data-participant-stack
          >
            <div className="w-[228px] pointer-events-auto">
              <div
                className="relative h-[312px] pr-2 overflow-visible overscroll-contain"
                onWheel={(event) => {
                  event.stopPropagation();
                  if (cellCatalog.length <= 1) return;
                  event.preventDefault();
                  const dir = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
                  if (!dir) return;
                  setCatalogFocusIndex((prev) =>
                    Math.max(0, Math.min(cellCatalog.length - 1, prev + dir)),
                  );
                }}
              >
                {cellCatalog.map((cell, index) => {
                  const distance = index - catalogFocusIndex;
                  if (Math.abs(distance) > 2) return null;
                  const absDistance = Math.abs(distance);
                  const scale = absDistance === 0 ? 1 : absDistance === 1 ? 0.78 : 0.62;
                  const opacity = absDistance === 0 ? 1 : absDistance === 1 ? 0.92 : 0.82;
                  const cardHeight = absDistance === 0 ? 86 : 52;
                  const baseCenterY = 156;
                  const visualNearHeight = 52 * 0.78;
                  const visualFarHeight = 52 * 0.62;
                  const sign = distance === 0 ? 0 : distance > 0 ? 1 : -1;
                  const nearOffset = 52;
                  const nearToFarOffset = visualNearHeight / 2 + visualFarHeight / 2;
                  const yOffset =
                    absDistance === 0
                      ? 0
                      : absDistance === 1
                      ? nearOffset
                      : nearOffset + nearToFarOffset;
                  const y = baseCenterY + sign * yOffset;
                  const z = 120 - absDistance * 20;
                  const canDragCard = Boolean(cell.bundleId) && !participantEditBusy;
                  const isDraggingCard = dragPayload?.cardKey === cell.cardKey;
                  return (
                    <div
                      key={cell.cardKey}
                      draggable={canDragCard}
                      onDragStart={(event) => {
                        if (!canDragCard) {
                          event.preventDefault();
                          return;
                        }
                        const payload: ParticipantDragPayload = {
                          kind: "catalog",
                          cardKey: cell.cardKey,
                          sourceCellId: cell.sourceCellId,
                          bundleId: cell.bundleId,
                          startSlot: cell.startSlot,
                          endSlot: cell.endSlot,
                          durationSlots: cell.durationSlots,
                        };
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", cell.cardKey);
                        setParticipantEditError(null);
                        setIsDeleteDropActive(false);
                        setDragPayload(payload);
                      }}
                      onDragEnd={() => {
                        setDragPayload(null);
                        setDragHoverCellKey(null);
                        setIsDeleteDropActive(false);
                      }}
                      className={`absolute left-0 right-2 rounded-xl border px-3 py-2 shadow-[0_12px_18px_-14px_rgba(0,0,0,0.55)] ${
                        isDraggingCard ? "transition-none" : "transition-transform duration-150"
                      } ${
                        canDragCard ? (isDraggingCard ? "cursor-grabbing" : "cursor-grab") : "cursor-not-allowed"
                      }`}
                      style={{
                        top: `${y - cardHeight / 2}px`,
                        height: `${cardHeight}px`,
                        backgroundColor: cell.color || "#9CA3AF",
                        borderColor: "#d1d5db",
                        transform: isDraggingCard ? "scale(1)" : `scale(${scale})`,
                        opacity: canDragCard ? opacity : Math.max(0.45, opacity * 0.6),
                        zIndex: isDraggingCard ? 320 : z,
                      }}
                    >
                      <div className="flex h-full w-full items-center justify-start text-left">
                        <div className="min-w-0 w-full">
                          <div className="truncate text-xs font-semibold text-gray-50" title={cell.name}>
                            {cell.name}
                          </div>
                          {absDistance === 0 && (
                            <div className="mt-1 text-[10px] font-medium text-gray-900">
                              {cell.timeLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <SolveOverlay
          gridId={gridId}
          role={role}
          daysCount={days.length}
          dayLabels={days}
          rowPx={rowPx}
          timeColPx={timeColPx}
          bodyHeight={bodyHeight}
          dayStartMin={dayStartMin}
          slotMin={slotMin}
          selectedUnitId={null}
          hideScheduleOverlay
          suppressRightDock={participantEditMode}
          scheduleViewMode={scheduleViewMode}
          externalRefreshTick={contextRefreshTick}
          onDraftMutated={handleDraftMutated}
        />
      </div>

      <GradualBlur
        target="parent"
        position="top"
        height="2.1rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
        showWhen="not-at-start"
        style={{ top: "3rem" }}
      />
      <GradualBlur
        target="parent"
        position="bottom"
        height="2.1rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
        showWhen="not-at-end"
      />
    </>
  );
}



