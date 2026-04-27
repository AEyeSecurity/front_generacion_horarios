"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import UnitTabs from "@/components/grid/UnitTabs";
import SolveOverlay from "@/components/grid/SolveOverlay";
import ScheduleErrorCard from "@/components/grid/ScheduleErrorCard";
import GradualBlur from "@/components/animations/GradualBlur";
import { formatSlotRange } from "@/lib/schedule";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
} from "@/lib/schedule-view";
import { GRID_COMMENTS_PANEL_TOGGLE_EVENT } from "@/lib/grid-comments-panel";
import { fetchGridScreenContext, getContextList, invalidateGridScreenContext } from "@/lib/screen-context";
import { useI18n } from "@/lib/use-i18n";
import { authFetch } from "@/lib/client-auth";

type Unit = { id: number | string; name: string };

type Participant = {
  id: number | string;
  name?: string;
  surname?: string;
  tier?: "PRIMARY" | "SECONDARY" | "TERTIARY" | null;
  hours_week_mode?: "default" | "custom" | "not_available" | null;
  min_hours_week_override?: number | null;
  max_hours_week_override?: number | null;
};

type Cell = {
  id: number | string;
  name?: string;
  colorHex?: string;
  color_hex?: string;
  duration_min?: number | string;
  division_days?: number | string | null;
  split_parts_min?: Array<number | string> | null;
  allow_overstaffing?: boolean | null;
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
  selfParticipantId?: number | null;
  units: Unit[];
  days: string[];
  dayStartMin: number;
  dayEndMin: number;
  slotMin: number;
  rowPx: number;
  timeColPx: number;
  historyMode?: boolean;
  historyGridCode?: string | null;
};

type ParticipantCellEntry = {
  key: string;
  placementId: string;
  sourceCellId: string;
  bundleId: string | null;
  bundleUnitIds: string[];
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

type AvailabilityCoverageKind = "none" | "impossible" | "preferred" | "preferred-strong" | "flexible";

const TIER_ORDER: Record<string, number> = {
  PRIMARY: 0,
  SECONDARY: 1,
  TERTIARY: 2,
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
const GRID_COMMENTS_PANEL_STATE_EVENT = "shift:grid-comments-panel-state";
const GRID_LEFT_PANEL_STATE_EVENT = "shift:grid-left-panel-state";

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
        return fallback;
      }
      if (text.toLowerCase().includes("overlap")) {
        return fallback;
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
  selfParticipantId = null,
  units,
  days,
  dayStartMin,
  dayEndMin,
  slotMin,
  rowPx,
  timeColPx,
  historyMode = false,
  historyGridCode = null,
}: Props) {
  const { t } = useI18n();
  const tierLabelByKey = useMemo<Record<TierKey, string>>(
    () => ({
      PRIMARY: t("tier.primary"),
      SECONDARY: t("tier.secondary"),
      TERTIARY: t("tier.tertiary"),
    }),
    [t],
  );
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let t = dayStartMin; t < dayEndMin; t += slotMin) out.push(t);
    return out;
  }, [dayStartMin, dayEndMin, slotMin]);
  const bodyHeight = rows.length * rowPx;

  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>(
    historyMode ? "published" : "draft",
  );
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [cellById, setCellById] = useState<Record<string, Cell>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [bundleUnitsById, setBundleUnitsById] = useState<Record<string, string[]>>({});
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
  const [historyErrorAnchor, setHistoryErrorAnchor] = useState<{ left: number; top: number } | null>(null);
  const [contextRefreshTick, setContextRefreshTick] = useState(0);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [dragPayload, setDragPayload] = useState<ParticipantDragPayload | null>(null);
  const [dragHoverCellKey, setDragHoverCellKey] = useState<string | null>(null);
  const [isDeleteDropActive, setIsDeleteDropActive] = useState(false);
  const [catalogFocusIndex, setCatalogFocusIndex] = useState(0);
  const [participantBoardSelectedUnitId, setParticipantBoardSelectedUnitId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const participantBoardRef = useRef<HTMLDivElement | null>(null);
  const deleteDropRef = useRef<HTMLDivElement | null>(null);
  const panelRootRef = useRef<HTMLDivElement | null>(null);
  const scheduleShellRef = useRef<HTMLElement | null>(null);
  const scheduleScrollRef = useRef<HTMLDivElement | null>(null);
  const commentsOpenShellWidthPercent = 82;
  const commentsOpenShellLeftShiftPx = 50;
  const scheduleShellBaseStyleRef = useRef<{
    maxWidth: string;
    marginLeft: string;
    marginRight: string;
    transition: string;
  } | null>(null);

  useEffect(() => {
    if (historyMode) {
      setScheduleViewMode("published");
      return;
    }
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
  }, [gridId, historyMode]);

  useEffect(() => {
    if (historyMode) return;
    const onToggleCommentsPanel = (event: Event) => {
      const customEvent = event as CustomEvent<{ gridId?: string }>;
      if (customEvent.detail?.gridId !== String(gridId)) return;
      setCommentsPanelOpen((prev) => !prev);
    };
    window.addEventListener(GRID_COMMENTS_PANEL_TOGGLE_EVENT, onToggleCommentsPanel as EventListener);
    return () => {
      window.removeEventListener(GRID_COMMENTS_PANEL_TOGGLE_EVENT, onToggleCommentsPanel as EventListener);
    };
  }, [gridId, historyMode]);

  useEffect(() => {
    if (historyMode || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent<{ gridId: string; open: boolean }>(GRID_COMMENTS_PANEL_STATE_EVENT, {
        detail: { gridId: String(gridId), open: commentsPanelOpen },
      }),
    );
  }, [commentsPanelOpen, gridId, historyMode]);

  useEffect(() => {
    if (historyMode || typeof window === "undefined") return;
    const onLeftPanelState = (event: Event) => {
      const custom = event as CustomEvent<{ gridId?: string; open?: boolean }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      if (custom.detail?.open) setCommentsPanelOpen(false);
    };
    window.addEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
    return () => window.removeEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
  }, [gridId, historyMode]);

  useEffect(() => {
    if (!historyError) {
      setHistoryErrorAnchor(null);
      return;
    }
    const updateAnchor = () => {
      const viewport = scheduleScrollRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const left = Math.max(24, Math.min(window.innerWidth - 24, rect.left + rect.width / 2));
      const top = Math.max(12, Math.min(window.innerHeight - 12, rect.bottom - 56));
      setHistoryErrorAnchor({ left, top });
    };
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [historyError]);

  useEffect(() => {
    if (!historyMode) return;
    setCommentsPanelOpen(false);
  }, [historyMode]);

  const sidePanelOpen = commentsPanelOpen || historyMode;

  useEffect(() => {
    const root = panelRootRef.current;
    const shell = root?.parentElement as HTMLElement | null;
    if (!shell) return;

    if (scheduleShellRef.current !== shell) {
      if (scheduleShellRef.current && scheduleShellBaseStyleRef.current) {
        const prevShell = scheduleShellRef.current;
        const base = scheduleShellBaseStyleRef.current;
        prevShell.style.maxWidth = base.maxWidth;
        prevShell.style.marginLeft = base.marginLeft;
        prevShell.style.marginRight = base.marginRight;
        prevShell.style.transition = base.transition;
        prevShell.style.transform = "";
      }
      scheduleShellRef.current = shell;
      scheduleShellBaseStyleRef.current = {
        maxWidth: shell.style.maxWidth,
        marginLeft: shell.style.marginLeft,
        marginRight: shell.style.marginRight,
        transition: shell.style.transition,
      };
    }

    const base = scheduleShellBaseStyleRef.current;
    if (!base) return;

    shell.style.transition =
      "max-width 220ms cubic-bezier(0.22,1,0.36,1), margin-left 220ms cubic-bezier(0.22,1,0.36,1), margin-right 220ms cubic-bezier(0.22,1,0.36,1)";
    shell.style.transform = "";

    if (sidePanelOpen) {
      shell.style.maxWidth = `${commentsOpenShellWidthPercent}%`;
      shell.style.marginLeft = `-${commentsOpenShellLeftShiftPx}px`;
      shell.style.marginRight = "auto";
      return;
    }

    shell.style.maxWidth = base.maxWidth;
    shell.style.marginLeft = base.marginLeft;
    shell.style.marginRight = base.marginRight;
  }, [sidePanelOpen]);

  useEffect(() => {
    return () => {
      const shell = scheduleShellRef.current;
      const base = scheduleShellBaseStyleRef.current;
      if (!shell || !base) return;
      shell.style.maxWidth = base.maxWidth;
      shell.style.marginLeft = base.marginLeft;
      shell.style.marginRight = base.marginRight;
      shell.style.transition = base.transition;
      shell.style.transform = "";
    };
  }, []);

  useEffect(() => {
    let active = true;
    setParticipantsLoading(true);
    (async () => {
      try {
        const contextJson = await fetchGridScreenContext(gridId, scheduleViewMode);
        const participantsList = getContextList<Participant>(contextJson?.participants);
        let cellsList = getContextList<Cell>(contextJson?.cells);
        const bundlesList = getContextList<Bundle>(contextJson?.bundles);
        const timeRangesList = getContextList<TimeRange>(contextJson?.time_ranges);
        const availabilityRules = getContextList<AvailabilityRule>(contextJson?.availability_rules);
        const resolveGridAllowsOverstaffing = async () => {
          const contextGrid = contextJson?.grid;
          if (contextGrid && typeof contextGrid === "object") {
            const fromContext = (contextGrid as { allow_overstaffing?: unknown }).allow_overstaffing;
            if (typeof fromContext === "boolean") {
              return fromContext;
            }
          }
          const gridEndpoints = [`/api/grids/${gridId}/`, `/api/grids/${gridId}`];
          for (const endpoint of gridEndpoints) {
            try {
              const res = await authFetch(endpoint, { cache: "no-store" });
              if (!res.ok) continue;
              const payload = (await res.json().catch(() => ({}))) as { allow_overstaffing?: unknown };
              if (typeof payload.allow_overstaffing === "boolean") {
                return payload.allow_overstaffing;
              }
            } catch {
              // try next endpoint
            }
          }
          return true;
        };
        const gridAllowsOverstaffing = await resolveGridAllowsOverstaffing();
        const hasOwn = (obj: unknown, key: string) =>
          Boolean(obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key));
        const needsCellContractEnrichment = cellsList.some(
          (cell) =>
            cell?.id != null &&
            (!hasOwn(cell, "allow_overstaffing") ||
              !hasOwn(cell, "split_parts_min") ||
              !hasOwn(cell, "division_days")),
        );
        if (needsCellContractEnrichment) {
          const gridQuery = encodeURIComponent(String(gridId));
          const candidateEndpoints = [
            `/api/cells/?grid=${gridQuery}`,
            `/api/cells?grid=${gridQuery}`,
          ];
          let cellsFromApi: Cell[] = [];
          for (const endpoint of candidateEndpoints) {
            try {
              const res = await authFetch(endpoint, { cache: "no-store" });
              if (!res.ok) continue;
              const payload = await res.json().catch(() => ({}));
              cellsFromApi = Array.isArray(payload)
                ? (payload as Cell[])
                : Array.isArray((payload as { results?: unknown }).results)
                ? ((payload as { results: Cell[] }).results ?? [])
                : [];
              if (cellsFromApi.length > 0) break;
            } catch {
              // keep trying fallback endpoint
            }
          }
          if (cellsFromApi.length > 0) {
            const apiCellById = new Map<string, Cell>();
            for (const apiCell of cellsFromApi) {
              if (apiCell?.id == null) continue;
              apiCellById.set(String(apiCell.id), apiCell);
            }
            cellsList = cellsList.map((cell) => {
              const apiCell = apiCellById.get(String(cell?.id));
              if (!apiCell) return cell;
              const merged: Cell = { ...cell };
              if (!hasOwn(merged, "allow_overstaffing") && hasOwn(apiCell, "allow_overstaffing")) {
                merged.allow_overstaffing = apiCell.allow_overstaffing;
              }
              if (!hasOwn(merged, "split_parts_min") && hasOwn(apiCell, "split_parts_min")) {
                merged.split_parts_min = apiCell.split_parts_min;
              }
              if (!hasOwn(merged, "division_days") && hasOwn(apiCell, "division_days")) {
                merged.division_days = apiCell.division_days;
              }
              if (!hasOwn(merged, "duration_min") && hasOwn(apiCell, "duration_min")) {
                merged.duration_min = apiCell.duration_min;
              }
              if ((!Array.isArray(merged.bundles) || merged.bundles.length === 0) && Array.isArray(apiCell.bundles)) {
                merged.bundles = apiCell.bundles;
              }
              return merged;
            });
          }
        }
        const cellMap: Record<string, Cell> = {};
        for (const cell of cellsList) {
          if (cell?.id == null) continue;
          cellMap[String(cell.id)] = gridAllowsOverstaffing ? cell : { ...cell, allow_overstaffing: null };
        }
        const bundleNameMap: Record<string, string> = {};
        const bundleUnitsMap: Record<string, string[]> = {};
        for (const bundle of bundlesList) {
          if (bundle?.id == null) continue;
          const key = String(bundle.id);
          bundleNameMap[key] = bundle.name || t("format.bundle_with_id", { id: key });
          bundleUnitsMap[key] = Array.isArray(bundle.units) ? bundle.units.map(String) : [];
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
            name: tr.name || t("format.time_range_with_id", { id: trId }),
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
          setBundleUnitsById(bundleUnitsMap);
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
          setBundleUnitsById({});
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
  }, [gridId, scheduleViewMode, dayStartMin, slotMin, contextRefreshTick, t]);

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
        displayName:
          `${p.name || ""}${p.surname ? ` ${p.surname}` : ""}`.trim() ||
          t("format.participant_with_id", { id: p.id }),
      }));
  }, [participants, t]);

  const participantBoardUnitTabs = useMemo(
    () =>
      units
        .filter((unit) => {
          const id = String(unit.id).toLowerCase();
          const name = (unit.name || "").toLowerCase();
          return id !== "all" && name !== "all";
        })
        .map((unit) => ({ id: String(unit.id), name: unit.name })),
    [units],
  );

  useEffect(() => {
    if (participantBoardUnitTabs.length === 0) {
      setParticipantBoardSelectedUnitId(null);
      return;
    }
    setParticipantBoardSelectedUnitId((prev) => {
      if (prev && participantBoardUnitTabs.some((tab) => tab.id === prev)) return prev;
      return participantBoardUnitTabs[0].id;
    });
  }, [participantBoardUnitTabs]);

  const visibleParticipants = useMemo(() => {
    if (role !== "editor") return orderedParticipants;
    if (selfParticipantId == null) return [];
    const mine = String(selfParticipantId);
    return orderedParticipants.filter((participant) => String(participant.id) === mine);
  }, [orderedParticipants, role, selfParticipantId]);

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
      const bundleUnitIds = bundleId ? (bundleUnitsById[bundleId] || []).map(String) : [];
      const cell = cellById[sourceCellId];
      const cellName = cell?.name || t("format.cell_with_id", { id: sourceCellId });
      const color = cell?.colorHex || cell?.color_hex || undefined;
      const bundleLabel = bundleId
        ? bundleNameById[bundleId] || t("format.bundle_with_id", { id: bundleId })
        : t("grid_schedule.no_bundle");
      const trId = readEntityId(cell?.time_range);
      const trName = trId
        ? timeRangeMetaById[trId]?.name || t("grid_schedule.no_time_range")
        : t("grid_schedule.no_time_range");
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
          bundleUnitIds,
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
  }, [
    schedulePlacements,
    dayColumnByIndex,
    days.length,
    cellById,
    bundleNameById,
    bundleUnitsById,
    dayStartMin,
    slotMin,
    timeRangeMetaById,
    t,
  ]);

  const cellCatalog = useMemo(() => {
    const placementCountByCellId = schedulePlacements.reduce<Record<string, number>>((acc, placement) => {
      const sourceCellId = readEntityId(placement.source_cell_id ?? placement.source_cell ?? placement.id);
      if (!sourceCellId) return acc;
      const key = String(sourceCellId);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.values(cellById)
      .flatMap((cell) => {
        const sourceCellId = String(cell.id);
        const splitPartsCount = Array.isArray(cell.split_parts_min)
          ? cell.split_parts_min
              .map((part) => Number(part))
              .filter((part) => Number.isFinite(part) && part > 0).length
          : 0;
        const legacyDivisionDays = Number(cell.division_days ?? 0);
        const requiredPlacements = Math.max(
          1,
          splitPartsCount > 0
            ? splitPartsCount
            : Number.isFinite(legacyDivisionDays) && legacyDivisionDays > 0
            ? Math.round(legacyDivisionDays)
            : 1,
        );
        const currentPlacements = Number(placementCountByCellId[sourceCellId] ?? 0);
        const needsPlacement = currentPlacements < requiredPlacements;
        if (!needsPlacement) return [];
        const bundleIds = Array.isArray(cell.bundles) ? cell.bundles.map(String) : [];
        const matchingBundleIds = participantBoardSelectedUnitId
          ? bundleIds.filter((bundleId) =>
              (bundleUnitsById[bundleId] || []).map(String).includes(participantBoardSelectedUnitId),
            )
          : bundleIds;
        if (participantBoardSelectedUnitId && matchingBundleIds.length === 0) return [];
        const bundleId = matchingBundleIds[0] ?? bundleIds[0] ?? null;
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
        return [{
          sourceCellId,
          cardKey: `catalog-${sourceCellId}`,
          name: cell.name || t("format.cell_with_id", { id: sourceCellId }),
          color: cell.colorHex || cell.color_hex || undefined,
          bundleId,
          bundleLabel: bundleId
            ? bundleNameById[bundleId] || t("format.bundle_with_id", { id: bundleId })
            : t("grid_schedule.no_bundle"),
          timeLabel,
          startSlot,
          endSlot,
          durationSlots: Math.max(1, endSlot - startSlot),
          tierCounts,
          canGrabForCurrentTab: bundleId != null,
        }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    bundleNameById,
    bundleUnitsById,
    cellById,
    dayStartMin,
    participantBoardSelectedUnitId,
    schedulePlacements,
    slotMin,
    t,
    timeRangeMetaById,
  ]);

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

  const canEditParticipantDraft = role === "supervisor" && scheduleViewMode === "draft";
  const canUseDraftHistory = !historyMode && role === "supervisor" && scheduleViewMode === "draft";
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
      const res = await authFetch(`/api/grids/${gridId}/schedule/history/`, { cache: "no-store" });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(raw || `${t("grid_schedule.history_load_error")} (${res.status})`);
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const historyRaw = data?.draft_history ?? data?.history ?? data;
      setDraftHistory(normalizeDraftHistory(historyRaw));
      setHistoryError(null);
    } catch (error: unknown) {
      setDraftHistory(EMPTY_DRAFT_HISTORY);
      setHistoryError(
        normalizeApiError(error instanceof Error ? error.message : "", t("grid_schedule.history_load_error")),
      );
    }
  }, [canUseDraftHistory, gridId, t]);

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
        const res = await authFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          throw new Error(raw || `${t("grid_schedule.history_apply_error")} (${res.status})`);
        }
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const historyRaw = data?.draft_history ?? data?.history ?? (data?.schedule as Record<string, unknown>)?.history;
        setDraftHistory(normalizeDraftHistory(historyRaw));
        refreshAfterDraftMutation();
      } catch (error: unknown) {
        setHistoryError(
          normalizeApiError(error instanceof Error ? error.message : "", t("grid_schedule.history_apply_error")),
        );
      } finally {
        setHistoryBusy(false);
      }
    },
    [canUseDraftHistory, historyBusy, refreshAfterDraftMutation, t],
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
    void restorePublishedInDraft();
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

  const getAvailabilityCoverageKind = useCallback(
    (participantId: string, dayColumnIndex: number, startSlot: number, endSlot: number) => {
      const scheduleDayIndex = dayIndexByColumn[dayColumnIndex] ?? dayColumnIndex;
      const rules = availabilityRulesByParticipant[participantId] || [];
      const overlappingRules = rules.filter((rule) => {
        if (Number(rule.day_of_week) !== Number(scheduleDayIndex)) return false;
        const ruleStartSlot = Math.round((parseClockToMin(rule.start_time) - dayStartMin) / slotMin);
        const ruleEndSlot = Math.round((parseClockToMin(rule.end_time) - dayStartMin) / slotMin);
        if (ruleEndSlot <= ruleStartSlot) return false;
        return overlaps(startSlot, endSlot, ruleStartSlot, ruleEndSlot);
      });
      if (overlappingRules.length === 0) return "none";
      const hasImpossible = overlappingRules.some(
        (rule) => String(rule.preference || "").toLowerCase() === "impossible",
      );
      if (hasImpossible) return "impossible";
      const preferredCount = overlappingRules.filter(
        (rule) => String(rule.preference || "").toLowerCase() === "preferred",
      ).length;
      const flexibleCount = overlappingRules.filter((rule) => {
        const preference = String(rule.preference || "").toLowerCase();
        return preference === "flexible" || preference === "";
      }).length;
      const allPreferred =
        preferredCount > 0 &&
        preferredCount === overlappingRules.length &&
        flexibleCount === 0;
      if (allPreferred) return preferredCount > 1 ? "preferred-strong" : "preferred";
      return "flexible";
    },
    [availabilityRulesByParticipant, dayIndexByColumn, dayStartMin, slotMin],
  );

  const hasImpossibleRuleCollision = useCallback(
    (participantId: string, dayColumnIndex: number, startSlot: number, endSlot: number) =>
      getAvailabilityCoverageKind(participantId, dayColumnIndex, startSlot, endSlot) === "impossible",
    [getAvailabilityCoverageKind],
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
      const hasSecondaryOrTertiaryRequirement =
        Number(tierCounts.SECONDARY || 0) > 0 || Number(tierCounts.TERTIARY || 0) > 0;
      const hasAnyParticipantTier = Object.values(participantTierById).some((tier) => tier != null);
      // Non-tier grids keep headcount in PRIMARY and participants without tier.
      if (!hasSecondaryOrTertiaryRequirement && !hasAnyParticipantTier) return true;
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
          const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const raw = await res.text().catch(() => "");
            throw new Error(
              normalizeApiError(
                raw || `${t("grid_schedule.could_not_remove_participant")} (${res.status})`,
                t("grid_schedule.could_not_remove_participant"),
              ),
            );
          }
          return;
        }

        updatePlacementInState(placementId, (placement) => ({
          ...placement,
          assigned_participants: nextAssigned,
        }));
        const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
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
              raw || `${t("grid_schedule.could_not_remove_participant")} (${res.status})`,
              t("grid_schedule.could_not_remove_participant"),
            ),
          );
        }
      } catch (error: unknown) {
        setSchedulePlacements(previousPlacements);
        setParticipantEditError(
          normalizeApiError(error instanceof Error ? error.message : "", t("grid_schedule.could_not_remove_participant")),
        );
      } finally {
        setParticipantEditBusy(false);
      }
    },
    [canEditParticipantDraft, participantEditBusy, schedulePlacements, updatePlacementInState, t],
  );

  const movePlacedCard = useCallback(
    async (payload: Extract<ParticipantDragPayload, { kind: "placed" }>, targetDayColumn: number) => {
      if (!canEditParticipantDraft || participantEditBusy) return;
      if (payload.ownerParticipantId == null) return;
      if (hasImpossibleRuleCollision(payload.ownerParticipantId, targetDayColumn, payload.startSlot, payload.endSlot)) {
        setParticipantEditError(t("grid_schedule.impossible_availability_error"));
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
        const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(payload.placementId)}`, {
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
          throw new Error(
            normalizeApiError(
              raw || `${t("grid_schedule.could_not_move_placement")} (${res.status})`,
              t("grid_schedule.could_not_move_placement"),
            ),
          );
        }
      } catch (error: unknown) {
        updatePlacementInState(payload.placementId, () => originalPlacement);
        setParticipantEditError(
          normalizeApiError(error instanceof Error ? error.message : "", t("grid_schedule.could_not_move_placement")),
        );
      } finally {
        setParticipantEditBusy(false);
      }
    },
    [
      canEditParticipantDraft,
      dayIndexByColumn,
      hasImpossibleRuleCollision,
      participantEditBusy,
      schedulePlacements,
      updatePlacementInState,
      t,
    ],
  );

  const addPlacementFromCatalog = useCallback(
    async (
      payload: Extract<ParticipantDragPayload, { kind: "catalog" }>,
      targetParticipantId: string,
      targetDayColumn: number,
    ) => {
      if (!canEditParticipantDraft || participantEditBusy) return;
      if (!scheduleId) {
        setParticipantEditError(t("grid_schedule.no_draft_schedule_error"));
        return;
      }
      if (!payload.bundleId) {
        setParticipantEditError(t("grid_schedule.cell_without_bundle_error"));
        return;
      }
      if (!isTierAllowedForCell(payload.sourceCellId, targetParticipantId)) {
        setParticipantEditError(t("grid_schedule.participant_tier_not_eligible_error"));
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
        setParticipantEditError(t("grid_schedule.impossible_availability_error"));
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
          const patchRes = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
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
              normalizeApiError(
                raw || `${t("grid_schedule.could_not_place_cell")} (${patchRes.status})`,
                t("grid_schedule.could_not_place_cell"),
              ),
            );
          }
        } else {
          const res = await authFetch(`/api/schedule-placements/`, {
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
                const patchRes = await authFetch(
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
                      patchRaw || `${t("grid_schedule.could_not_place_cell")} (${patchRes.status})`,
                      t("grid_schedule.could_not_place_cell"),
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
            throw new Error(
              normalizeApiError(
                raw || `${t("grid_schedule.could_not_place_cell")} (${res.status})`,
                t("grid_schedule.could_not_place_cell"),
              ),
            );
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
        setParticipantEditError(
          normalizeApiError(error instanceof Error ? error.message : "", t("grid_schedule.could_not_place_cell")),
        );
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
      t,
    ],
  );

  return (
    <>
      <div ref={panelRootRef}>
        <div className="grid select-none" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
          <div className="bg-gray-50 border-b h-12 flex items-center justify-center px-1.5">
            {canUseDraftHistory && (
              <div className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  title={t("grid_schedule.undo_title")}
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
                  title={t("grid_schedule.redo_title")}
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
                  title={t("grid_schedule.restore_draft_title")}
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
          ref={scheduleScrollRef}
          data-schedule-scroll
          className="relative max-h-[70vh] overflow-y-auto hide-scrollbar select-none"
        >
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
            commentsPanelOpen={historyMode ? false : commentsPanelOpen}
            onCommentsPanelOpenChange={historyMode ? undefined : setCommentsPanelOpen}
            historyMode={historyMode}
            historyGridCode={historyGridCode}

          />
        </div>
        {historyError && historyErrorAnchor && (
          <ScheduleErrorCard
            message={historyError}
            left={historyErrorAnchor.left}
            top={historyErrorAnchor.top}
            onClose={() => setHistoryError(null)}
          />
        )}

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
      </div>
    </>
  );
}



