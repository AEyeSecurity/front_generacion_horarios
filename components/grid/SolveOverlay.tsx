"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  FileDown,
  History as HistoryIcon,
  Lightbulb,
  LightbulbOff,
  Lock,
  Loader2,
  MessageSquare,
  Trash2,
  Upload,
  Users,
  Unlock,
  X,
} from "lucide-react";
import { formatSlotRange } from "@/lib/schedule";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildSolverParamsPayload,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";
import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK, CELL_TEXT_LIGHT } from "@/lib/cell-colors";
import { writeGridScheduleViewMode } from "@/lib/schedule-view";
import {
  fetchGridScreenContext,
  getContextList,
  invalidateGridScreenContext,
} from "@/lib/screen-context";
import type { ScheduleViewMode } from "@/lib/schedule-view";
import { useI18n } from "@/lib/use-i18n";

const shadeHex = (hex: string, amt: number) => {
  if (!/^#([0-9a-f]{6})$/i.test(hex)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = clamp(Math.round(r + (255 - r) * amt));
  const ng = clamp(Math.round(g + (255 - g) * amt));
  const nb = clamp(Math.round(b + (255 - b) * amt));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
};

type ScheduleResource = {
  id: number;
  status?: string;
  source_run?: number | null;
  source_candidate_index?: number | null;
  runtime_ms?: number;
  created_at?: string;
  updated_at?: string;
  placements?: Array<{
    id: number | string;
    source_cell?: string | number | null;
    source_cell_id?: string | number | null;
    bundle?: string | number | null;
    bundle_id?: string | number | null;
    day_index: number;
    start_slot: number;
    end_slot: number;
    assigned_participants?: Array<string | number>;
    locked?: boolean;
  }>;
};

type ScheduleRow = {
  cell_id: string;
  source_cell_id?: string | number;
  bundle_id?: string | number;
  bundle?: string | number;
  day_index: number;
  start_slot: number;
  end_slot: number;
  assigned_participants?: Array<string | number>;
  participants?: Array<string | number>;
  units?: Array<string | number>;
  locked?: boolean;
};

type CandidateStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR";

type SolveCandidate = {
  index: number;
  label?: string;
  status?: CandidateStatus;
  objective_value?: number | null;
  runtime_ms?: number | null;
  schedule?: ScheduleRow[];
  violations?: unknown[];
  solver_stats?: Record<string, unknown>;
  weights?: Record<string, unknown>;
  delta?: Record<string, unknown>;
};

type CandidateReasonOption = {
  code: string;
  label: string;
};

type SolveCandidatesResponse = {
  run_id?: string;
  candidates?: SolveCandidate[];
  selectable_candidate_indexes?: number[];
  all_candidates_failed?: boolean;
  none_option?: {
    reason_options?: Array<string | { code?: string; label?: string; reason?: string; text?: string }>;
  };
  preference?: Record<string, unknown>;
};

type AvailabilityRule = {
  id: number | string;
  participant: number | string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preference?: "preferred" | "flexible" | "impossible" | string;
};

type CellPinMeta = {
  locked_day_index: number | null;
  locked_start_slot: number | null;
  locked_bundle_index: number | null;
  bundles: Array<number | string>;
};

type PlacementComment = {
  id: number | string;
  schedule: number | string;
  source_cell_id: number | string;
  bundle: number | string;
  day_index: number;
  start_slot: number;
  text: string;
  created_at?: string;
  author_id?: number | string;
  author_name?: string;
};

type CommentAnchor = {
  scheduleId: number;
  sourceCellId: string;
  bundleId: number | string;
  dayIndex: number;
  startSlot: number;
  cellName: string;
  timeLabel: string;
};

type CommentPlacementOption = {
  key: string;
  anchor: CommentAnchor;
  label: string;
  count: number;
};

function buildPlacementKey(
  scheduleId: number | string,
  sourceCellId: number | string,
  bundleId: number | string,
  dayIndex: number,
  startSlot: number,
) {
  return `${scheduleId}|${sourceCellId}|${bundleId}|${dayIndex}|${startSlot}`;
}

const DAY_LABEL_TO_INDEX: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

const parseClockToMin = (value: string) => {
  const [h, m] = String(value ?? "").split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
};

const extractAuthorId = (author: unknown): string | number | undefined => {
  if (author == null) return undefined;
  if (typeof author === "number" || typeof author === "string") return author;
  if (typeof author === "object" && "id" in author) {
    const id = (author as { id?: string | number }).id;
    if (id != null) return id;
  }
  return undefined;
};

const extractAuthorName = (raw: any): string | undefined => {
  const direct = raw.author_name;
  if (typeof direct === "string" && direct.trim()) return direct;
  const author = raw.author;
  if (author && typeof author === "object") {
    const candidate =
      author.full_name ??
      author.name ??
      author.email;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
};

type Props = {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  daysCount: number;
  dayLabels?: string[];
  rowPx: number;
  timeColPx: number;
  bodyHeight: number;
  dayStartMin: number;
  slotMin: number;
  selectedUnitId?: string | null;
  topOffset?: number;
  hideScheduleOverlay?: boolean;
  suppressRightDock?: boolean;
  enablePinning?: boolean;
  scheduleViewMode?: ScheduleViewMode;
  externalRefreshTick?: number;
  onDraftMutated?: () => void;
  commentsPanelOpen?: boolean;
  onCommentsPanelOpenChange?: (open: boolean) => void;
  historyMode?: boolean;
  historyGridCode?: string | null;
};

type DragState = {
  dragType: "placement" | "unassigned";
  cardKey: string;
  placementId?: string;
  sourceBundleId?: string | number | null;
  sourceCellId: string;
  cellName: string;
  originalDayIndex: number | null;
  originalStartSlot: number | null;
  durationSlots: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  grabOffsetX: number;
  grabOffsetY: number;
};

type TierKey = "PRIMARY" | "SECONDARY" | "TERTIARY";

type PlacementAssignmentOption = {
  id: string;
  source: "staff" | "pool";
  participantIds: string[];
  label: string;
  recommended: boolean;
};

type PendingPlacementRequest = {
  sourceCellId: string;
  bundleId: string | number;
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
};

export default function SolveOverlay({
  gridId,
  role,
  daysCount,
  dayLabels,
  rowPx,
  timeColPx,
  bodyHeight,
  dayStartMin,
  slotMin,
  selectedUnitId,
  topOffset = 0,
  hideScheduleOverlay = false,
  suppressRightDock = false,
  enablePinning = false,
  scheduleViewMode = "draft",
  externalRefreshTick = 0,
  onDraftMutated,
  commentsPanelOpen = false,
  onCommentsPanelOpenChange,
  historyMode = false,
  historyGridCode = null,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [hasCells, setHasCells] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solveStartedAt, setSolveStartedAt] = useState<number | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<ScheduleResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellStaffsById, setCellStaffsById] = useState<Record<string, string[]>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [staffMembersByStaffId, setStaffMembersByStaffId] = useState<Record<string, string[]>>({});
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [participantNameById, setParticipantNameById] = useState<Record<string, string>>({});
  const [participantTierById, setParticipantTierById] = useState<Record<string, TierKey | null>>({});
  const [cellTierCountsById, setCellTierCountsById] = useState<Record<string, Record<TierKey, number>>>({});
  const [cellTierPoolsById, setCellTierPoolsById] = useState<Record<string, Record<TierKey, string[]>>>({});
  const [cellPinMetaById, setCellPinMetaById] = useState<Record<string, CellPinMeta>>({});
  const [cellTimeRangeById, setCellTimeRangeById] = useState<Record<string, string>>({});
  const [cellDurationSlotsById, setCellDurationSlotsById] = useState<Record<string, number>>({});
  const [cellAllowOverstaffById, setCellAllowOverstaffById] = useState<Record<string, boolean>>({});
  const [cellRequiredPlacementsById, setCellRequiredPlacementsById] = useState<Record<string, number>>({});
  const [bundleUnitsById, setBundleUnitsById] = useState<Record<string, string[]>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [unitNameById, setUnitNameById] = useState<Record<string, string>>({});
  const [timeRangeMetaById, setTimeRangeMetaById] = useState<
    Record<string, { name: string; startSlot: number; endSlot: number }>
  >({});
  const [availabilityRulesByParticipant, setAvailabilityRulesByParticipant] = useState<
    Record<string, AvailabilityRule[]>
  >({});
  const [previewParticipantRules, setPreviewParticipantRules] = useState<AvailabilityRule[]>([]);
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [placementComments, setPlacementComments] = useState<PlacementComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const [hoveredCommentPlacementKey, setHoveredCommentPlacementKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [inputSignature, setInputSignature] = useState<string | null>(null);
  const [isInputSignatureLoading, setIsInputSignatureLoading] = useState(false);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [candidateRunId, setCandidateRunId] = useState<string | null>(null);
  const [solveCandidates, setSolveCandidates] = useState<SolveCandidate[]>([]);
  const [selectableCandidateIndexes, setSelectableCandidateIndexes] = useState<number[]>([]);
  const [allCandidatesFailed, setAllCandidatesFailed] = useState(false);
  const [candidatePreference, setCandidatePreference] = useState<Record<string, unknown> | null>(null);
  const [rejectReasonOptions, setRejectReasonOptions] = useState<CandidateReasonOption[]>([]);
  const [rejectReasonCode, setRejectReasonCode] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [pendingSolveSignature, setPendingSolveSignature] = useState<string | null>(null);
  const [previewCandidateIndex, setPreviewCandidateIndex] = useState<number | null>(null);
  const [previewParticipantsOpen, setPreviewParticipantsOpen] = useState(false);
  const [previewParticipantId, setPreviewParticipantId] = useState<string | null>(null);
  const [previewSelectedUnitId, setPreviewSelectedUnitId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"candidate" | "participant">("candidate");
  const [previewParticipantsQuery, setPreviewParticipantsQuery] = useState("");
  const [pinOptimisticByCard, setPinOptimisticByCard] = useState<Record<string, boolean>>({});
  const [isJiggleMode, setIsJiggleMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isDeleteDropActive, setIsDeleteDropActive] = useState(false);
  const [unassignedFocusIndex, setUnassignedFocusIndex] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState<PlacementAssignmentOption[]>([]);
  const [selectedAssignmentOptionId, setSelectedAssignmentOptionId] = useState<string | null>(null);
  const [pendingPlacementRequest, setPendingPlacementRequest] = useState<PendingPlacementRequest | null>(null);
  const [lastAssignedParticipantsByCellBundle, setLastAssignedParticipantsByCellBundle] = useState<Record<string, string[]>>({});
  const [isClientReady, setIsClientReady] = useState(false);
  const [publishedHistorySchedules, setPublishedHistorySchedules] = useState<
    Array<{
      key: string;
      publishedVersion: number | null;
      createdAt: string | null;
      updatedAt: string | null;
      schedule: ScheduleResource;
    }>
  >([]);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string>("");
  const [historyPanelBusy, setHistoryPanelBusy] = useState(false);
  const [historyPanelError, setHistoryPanelError] = useState<string | null>(null);
  const [restoringHistoryVersion, setRestoringHistoryVersion] = useState(false);
  const [exportingHistoryVersion, setExportingHistoryVersion] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const deleteDropRef = useRef<HTMLDivElement | null>(null);

  const canSolve = role === "supervisor" && !historyMode;
  const notifyDraftMutation = useCallback(() => {
    onDraftMutated?.();
  }, [onDraftMutated]);
  const solveSignatureStorageKey = `grid:${gridId}:last-solve-signature`;

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const parseTimestamp = (value: unknown) => {
    if (typeof value !== "string") return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const stableStringify = (value: any): string => {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  };

  const sortByStableString = <T,>(items: T[]) =>
    items
      .map((item) => ({ item, key: stableStringify(item) }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((x) => x.item);

  const TIERS: TierKey[] = ["PRIMARY", "SECONDARY", "TERTIARY"];

  const readEntityId = (value: unknown): string | number | undefined => {
    if (value == null) return undefined;
    if (typeof value === "string" || typeof value === "number") return value;
    if (typeof value === "object" && "id" in (value as Record<string, unknown>)) {
      const id = (value as { id?: string | number }).id;
      if (id != null) return id;
    }
    return undefined;
  };

  const normalizeIdArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => readEntityId(item))
      .filter((id): id is string | number => id != null)
      .map((id) => String(id));
  };

  const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
    startA < endB && endA > startB;

  const stripForSignature = (value: any): any => {
    if (Array.isArray(value)) return sortByStableString(value.map((v) => stripForSignature(v)));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        if (key === "created_at" || key === "updated_at") continue;
        out[key] = stripForSignature((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };

  const getMaxUpdatedAt = (items: any[]) =>
    items.reduce((max, item) => {
      if (!item || typeof item !== "object") return max;
      const updatedAt = parseTimestamp((item as any).updated_at);
      const createdAt = parseTimestamp((item as any).created_at);
      return Math.max(max, updatedAt, createdAt);
    }, 0);

  const normalizeReasonOptions = (
    options: Array<string | { code?: string; label?: string; reason?: string; text?: string }> | undefined,
  ): CandidateReasonOption[] => {
    if (!Array.isArray(options)) return [];
    return options
      .map((item) => {
        if (typeof item === "string") {
          return { code: item, label: item.replace(/_/g, " ") };
        }
        const code = item.code ?? item.reason ?? item.label ?? item.text;
        if (!code) return null;
        const label = item.label ?? item.text ?? String(code).replace(/_/g, " ");
        return { code: String(code), label: String(label) };
      })
      .filter((v): v is CandidateReasonOption => Boolean(v));
  };

  const computeCurrentSolveInputSignature = async () => {
    const settingsKey = getGridSolverSettingsKey(gridId);
    const parsedSettings = parseGridSolverSettings(window.localStorage.getItem(settingsKey));
    const solverParams = buildSolverParamsPayload(parsedSettings);

    const context = await fetchGridScreenContext(gridId, scheduleViewMode);
    const cells = getContextList(context?.cells);
    const participants = getContextList(context?.participants);
    const timeRanges = getContextList(context?.time_ranges);
    const bundles = getContextList(context?.bundles);
    const staffs = getContextList(context?.staffs);
    const explicitStaffMembers = getContextList(context?.staff_members);
    const derivedStaffMembers = staffs.flatMap((staff: any) => {
      const staffId = readEntityId(staff?.id);
      const members = Array.isArray(staff?.members) ? staff.members : [];
      if (staffId == null || members.length === 0) return [];
      return members
        .map((participant: unknown) => {
          const participantId = readEntityId(participant);
          if (participantId == null) return null;
          return { staff: staffId, participant: participantId };
        })
        .filter(Boolean);
    });
    const staffMembers = explicitStaffMembers.length > 0 ? explicitStaffMembers : derivedStaffMembers;
    const availabilityRules = getContextList(context?.availability_rules);

    const maxUpdatedAt = Math.max(
      getMaxUpdatedAt(cells),
      getMaxUpdatedAt(participants),
      getMaxUpdatedAt(timeRanges),
      getMaxUpdatedAt(bundles),
      getMaxUpdatedAt(staffs),
      getMaxUpdatedAt(staffMembers),
      getMaxUpdatedAt(availabilityRules),
    );

    const signaturePayload = {
      solver_params: stripForSignature(solverParams),
      cells: stripForSignature(cells),
      participants: stripForSignature(participants),
      time_ranges: stripForSignature(timeRanges),
      bundles: stripForSignature(bundles),
      staffs: stripForSignature(staffs),
      staff_members: stripForSignature(staffMembers),
      availability_rules: stripForSignature(availabilityRules),
    };

    return {
      signature: stableStringify(signaturePayload),
      solverParams,
      maxUpdatedAt,
    };
  };

  const normalizeScheduleResource = useCallback(
    (raw: unknown): ScheduleResource | null => {
      const root = (raw ?? {}) as Record<string, unknown>;
      const candidate = Array.isArray(root.results)
        ? (root.results[0] as Record<string, unknown> | undefined)
        : ((root.schedule ??
            root.published_schedule ??
            root.latest ??
            root) as Record<string, unknown>);
      if (!candidate || typeof candidate !== "object") return null;
      const placementsRaw = Array.isArray((candidate as any).placements)
        ? (candidate as any).placements
        : Array.isArray((candidate as any).schedule)
        ? (candidate as any).schedule
        : Array.isArray((candidate as any).snapshot_placements)
        ? (candidate as any).snapshot_placements
        : [];
      const scheduleId =
        Number((candidate as any).id ?? (candidate as any).schedule_id ?? (candidate as any).schedule) || 0;
      if (!scheduleId && placementsRaw.length === 0) return null;
      return {
        ...(candidate as Record<string, unknown>),
        id: scheduleId || Number(gridId),
        placements: placementsRaw,
      } as ScheduleResource;
    },
    [gridId],
  );

  const fetchCurrentSchedule = useCallback(async (): Promise<ScheduleResource | null> => {
    const endpoint =
      scheduleViewMode === "published"
        ? `/api/grids/${gridId}/published-schedule/`
        : `/api/grids/${gridId}/schedule/`;
    const r = await fetch(endpoint, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(txt || `Failed to load schedule (${r.status})`);
    }
    const raw = await r.json().catch(() => ({} as Record<string, unknown>));
    return normalizeScheduleResource(raw);
  }, [gridId, normalizeScheduleResource, scheduleViewMode]);

  const readPublishedVersion = (value: unknown): number | null => {
    const raw = (value ?? {}) as Record<string, unknown>;
    const candidate = Number(
      raw.published_version ??
        raw.version ??
        raw.publishedVersion ??
        ((raw.schedule as Record<string, unknown> | undefined)?.published_version ?? null),
    );
    return Number.isFinite(candidate) ? candidate : null;
  };

  useEffect(() => {
    if (!historyMode) {
      setPublishedHistorySchedules([]);
      setSelectedHistoryKey("");
      setHistoryPanelError(null);
      setHistoryPanelBusy(false);
      setRestoringHistoryVersion(false);
      setExportingHistoryVersion(false);
      return;
    }
    let active = true;
    (async () => {
      setHistoryPanelBusy(true);
      setHistoryPanelError(null);
      try {
        const res = await fetch(`/api/grids/${gridId}/published-schedules/`, { cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed to load published versions (${res.status})`);
        }
        const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const listRaw = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.results)
          ? payload.results
          : Array.isArray(payload.published_schedules)
          ? payload.published_schedules
          : Array.isArray(payload.schedules)
          ? payload.schedules
          : [];

        const normalized = listRaw
          .map((entry, index) => {
            const entryRaw = (entry ?? {}) as Record<string, unknown>;
            const schedule = normalizeScheduleResource(entryRaw);
            if (!schedule) return null;
            const publishedVersion = readPublishedVersion(entryRaw);
            const createdAt =
              (entryRaw.published_at as string | undefined) ??
              (entryRaw.created_at as string | undefined) ??
              schedule.created_at ??
              null;
            const updatedAt =
              (entryRaw.updated_at as string | undefined) ??
              schedule.updated_at ??
              null;
            const key =
              publishedVersion != null
                ? `version-${publishedVersion}`
                : `schedule-${String(schedule.id)}-${index}`;
            return {
              key,
              publishedVersion,
              createdAt,
              updatedAt,
              schedule,
            };
          })
          .filter((item): item is {
            key: string;
            publishedVersion: number | null;
            createdAt: string | null;
            updatedAt: string | null;
            schedule: ScheduleResource;
          } => Boolean(item))
          .sort((a, b) => {
            if (
              typeof a.publishedVersion === "number" &&
              typeof b.publishedVersion === "number" &&
              a.publishedVersion !== b.publishedVersion
            ) {
              return b.publishedVersion - a.publishedVersion;
            }
            const aTs = parseTimestamp(a.createdAt ?? a.updatedAt);
            const bTs = parseTimestamp(b.createdAt ?? b.updatedAt);
            if (aTs !== bTs) return bTs - aTs;
            return Number(b.schedule.id) - Number(a.schedule.id);
          });

        if (!active) return;
        setPublishedHistorySchedules(normalized);
        if (normalized.length === 0) {
          setSelectedHistoryKey("");
          setCurrentSchedule(null);
          return;
        }
        setSelectedHistoryKey((prev) =>
          normalized.some((entry) => entry.key === prev) ? prev : normalized[0].key,
        );
      } catch (error: unknown) {
        if (!active) return;
        setPublishedHistorySchedules([]);
        setSelectedHistoryKey("");
        setCurrentSchedule(null);
        setHistoryPanelError(
          error instanceof Error ? error.message : t("solve_overlay.could_not_load_published_versions"),
        );
      } finally {
        if (active) setHistoryPanelBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [externalRefreshTick, gridId, historyMode, normalizeScheduleResource]);

  useEffect(() => {
    if (!historyMode) return;
    if (publishedHistorySchedules.length === 0) {
      setCurrentSchedule(null);
      return;
    }
    const selected =
      publishedHistorySchedules.find((entry) => entry.key === selectedHistoryKey) ??
      publishedHistorySchedules[0];
    if (selected.key !== selectedHistoryKey) {
      setSelectedHistoryKey(selected.key);
    }
    setCurrentSchedule(selected.schedule);
  }, [historyMode, publishedHistorySchedules, selectedHistoryKey]);

  useEffect(() => {
    if (historyMode) {
      setPlacementComments([]);
      setCommentsLoading(false);
      return;
    }
    const scheduleId = currentSchedule?.id;
    if (!scheduleId) {
      setPlacementComments([]);
      return;
    }
    let active = true;
    (async () => {
      setCommentsLoading(true);
      try {
        const r = await fetch(
          `/api/placement-comments/?schedule=${encodeURIComponent(String(scheduleId))}&grid=${encodeURIComponent(String(gridId))}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`Failed to load comments (${r.status})`);
        const data = await r.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        const normalized: PlacementComment[] = list
          .map((raw: any) => {
            const bundleRaw =
              typeof raw.bundle === "object" && raw.bundle?.id != null ? raw.bundle.id : raw.bundle;
            const message =
              raw.message ??
              raw.text ??
              raw.comment ??
              "";
            if (
              raw?.id == null ||
              raw?.schedule == null ||
              raw?.source_cell_id == null ||
              bundleRaw == null ||
              raw?.day_index == null ||
              raw?.start_slot == null
            ) {
              return null;
            }
            return {
              id: raw.id,
              schedule: raw.schedule,
              source_cell_id: raw.source_cell_id,
              bundle: bundleRaw,
              day_index: Number(raw.day_index),
              start_slot: Number(raw.start_slot),
              text: String(message),
              created_at: raw.created_at,
              author_id: raw.author_id ?? extractAuthorId(raw.author),
              author_name: extractAuthorName(raw),
            } as PlacementComment;
          })
          .filter(Boolean) as PlacementComment[];
        if (active) setPlacementComments(normalized);
      } catch {
        if (active) setPlacementComments([]);
      } finally {
        if (active) setCommentsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [gridId, historyMode, currentSchedule?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let clist: any[] = [];
        let blist: any[] = [];
        let smlist: any[] = [];
        let slist: any[] = [];
        let plist: any[] = [];
        let ulist: any[] = [];
        let trlist: any[] = [];
        let arlist: any[] = [];

        const context = await fetchGridScreenContext(gridId, scheduleViewMode, {
          force: externalRefreshTick > 0,
        });
        clist = getContextList(context?.cells);
        blist = getContextList(context?.bundles);
        slist = getContextList(context?.staffs);
        plist = getContextList(context?.participants);
        ulist = getContextList(context?.units);
        trlist = getContextList(context?.time_ranges);
        arlist = getContextList(context?.availability_rules);

        const hasOwn = (obj: unknown, key: string) =>
          Boolean(obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key));
        const needsCellContractEnrichment = clist.some(
          (cell: any) =>
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
          let cellsFromApi: any[] = [];
          for (const endpoint of candidateEndpoints) {
            try {
              const res = await fetch(endpoint, { cache: "no-store" });
              if (!res.ok) continue;
              const payload = await res.json().catch(() => ({}));
              cellsFromApi = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.results)
                ? payload.results
                : [];
              if (cellsFromApi.length > 0) break;
            } catch {
              // keep trying fallback endpoint
            }
          }
          if (cellsFromApi.length > 0) {
            const apiCellById = new Map<string, any>();
            for (const apiCell of cellsFromApi) {
              const apiId = readEntityId(apiCell?.id);
              if (apiId == null) continue;
              apiCellById.set(String(apiId), apiCell);
            }
            clist = clist.map((cell: any) => {
              const cellId = readEntityId(cell?.id);
              if (cellId == null) return cell;
              const apiCell = apiCellById.get(String(cellId));
              if (!apiCell) return cell;
              const merged = { ...cell };
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

        const explicitStaffMembers = getContextList(context?.staff_members);
        const derivedStaffMembers = slist.flatMap((staff: any) => {
          const staffId = readEntityId(staff?.id);
          const members = Array.isArray(staff?.members) ? staff.members : [];
          if (staffId == null || members.length === 0) return [];
          return members
            .map((participant: unknown) => {
              const participantId = readEntityId(participant);
              if (participantId == null) return null;
              return { staff: staffId, participant: participantId };
            })
            .filter(Boolean);
        });
        smlist = explicitStaffMembers.length > 0 ? explicitStaffMembers : derivedStaffMembers;

        const scheduleCandidate =
          context?.schedule ?? context?.published_schedule ?? context?.latest ?? null;
        if (!historyMode && active && scheduleCandidate && typeof scheduleCandidate === "object") {
          const placementsRaw = Array.isArray((scheduleCandidate as any).placements)
            ? (scheduleCandidate as any).placements
            : Array.isArray((scheduleCandidate as any).schedule)
            ? (scheduleCandidate as any).schedule
            : [];
          const scheduleId =
            Number(
              (scheduleCandidate as any).id ??
                (scheduleCandidate as any).schedule_id ??
                (scheduleCandidate as any).schedule,
            ) || 0;
          if (scheduleId || placementsRaw.length > 0) {
            setCurrentSchedule({
              ...(scheduleCandidate as Record<string, unknown>),
              id: scheduleId || Number(gridId),
              placements: placementsRaw,
            } as ScheduleResource);
          }
        }

        const cmap: Record<string, string> = {};
        const cstaffs: Record<string, string[]> = {};
        const ccolors: Record<string, string> = {};
        const ctierCounts: Record<string, Record<TierKey, number>> = {};
        const ctierPools: Record<string, Record<TierKey, string[]>> = {};
        const cpins: Record<string, CellPinMeta> = {};
        const ctrange: Record<string, string> = {};
        const cdurationSlots: Record<string, number> = {};
        const callowOverstaff: Record<string, boolean> = {};
        const crequiredPlacements: Record<string, number> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            callowOverstaff[cid] = Boolean(c?.allow_overstaffing);
            const splitPartsCount = Array.isArray(c?.split_parts_min)
              ? c.split_parts_min
                  .map((part: unknown) => Number(part))
                  .filter((part: number) => Number.isFinite(part) && part > 0).length
              : 0;
            const legacyDivisionDays = Number(c?.division_days ?? 0);
            crequiredPlacements[cid] = Math.max(
              1,
              splitPartsCount > 0
                ? splitPartsCount
                : Number.isFinite(legacyDivisionDays) && legacyDivisionDays > 0
                ? Math.round(legacyDivisionDays)
                : 1,
            );
            if (c?.colorHex) ccolors[cid] = c.colorHex;
            else if (c?.color_hex) ccolors[cid] = c.color_hex;
            if (Array.isArray(c.staffs)) cstaffs[cid] = normalizeIdArray(c.staffs);
            const rawTierCounts = (c?.tier_counts ?? {}) as Partial<Record<TierKey, unknown>>;
            ctierCounts[cid] = {
              PRIMARY: Math.max(0, Number(rawTierCounts.PRIMARY ?? 0) || 0),
              SECONDARY: Math.max(0, Number(rawTierCounts.SECONDARY ?? 0) || 0),
              TERTIARY: Math.max(0, Number(rawTierCounts.TERTIARY ?? 0) || 0),
            };
            const rawTierPools = (c?.tier_pools ?? {}) as Partial<Record<TierKey, unknown>>;
            ctierPools[cid] = {
              PRIMARY: normalizeIdArray(rawTierPools.PRIMARY),
              SECONDARY: normalizeIdArray(rawTierPools.SECONDARY),
              TERTIARY: normalizeIdArray(rawTierPools.TERTIARY),
            };
            const lockedDayIndex =
              typeof c.locked_day_index === "number"
                ? c.locked_day_index
                : typeof c.pin_day_index === "number"
                ? c.pin_day_index
                : null;
            const lockedStartSlot =
              typeof c.locked_start_slot === "number"
                ? c.locked_start_slot
                : typeof c.pin_start_slot === "number"
                ? c.pin_start_slot
                : null;
            const lockedBundleIndex =
              typeof c.locked_bundle_index === "number"
                ? c.locked_bundle_index
                : typeof c.pinned_bundle_index === "number"
                ? c.pinned_bundle_index
                : null;
            cpins[cid] = {
              locked_day_index: lockedDayIndex,
              locked_start_slot: lockedStartSlot,
              locked_bundle_index: lockedBundleIndex,
              bundles: Array.isArray(c.bundles)
                ? c.bundles
                    .map((value: unknown) => readEntityId(value))
                    .filter((id: unknown): id is string | number => id != null)
                : [],
            };
            const trRaw =
              c?.time_range != null && typeof c.time_range === "object" && c.time_range?.id != null
                ? c.time_range.id
                : c?.time_range;
            if (trRaw != null) ctrange[cid] = String(trRaw);
            const durationMin = Number(c?.duration_min ?? c?.duration ?? 0);
            if (Number.isFinite(durationMin) && durationMin > 0) {
              cdurationSlots[cid] = Math.max(1, Math.ceil(durationMin / slotMin));
            }
          }
        }

        const trmap: Record<string, { name: string; startSlot: number; endSlot: number }> = {};
        for (const tr of trlist) {
          if (tr?.id == null) continue;
          const startMin = parseClockToMin(String(tr.start_time || "00:00"));
          const endMin = parseClockToMin(String(tr.end_time || "00:00"));
          trmap[String(tr.id)] = {
            name: String(tr.name || `Time range ${tr.id}`),
            startSlot: Math.round((startMin - dayStartMin) / slotMin),
            endSlot: Math.round((endMin - dayStartMin) / slotMin),
          };
        }

        const rulesByParticipant: Record<string, AvailabilityRule[]> = {};
        for (const rule of arlist) {
          const participantRaw =
            typeof rule?.participant === "object" && rule?.participant?.id != null
              ? rule.participant.id
              : rule?.participant;
          if (participantRaw == null) continue;
          const pid = String(participantRaw);
          if (!rulesByParticipant[pid]) rulesByParticipant[pid] = [];
          rulesByParticipant[pid].push({
            id: rule?.id ?? `${pid}-${rule?.day_of_week}-${rule?.start_time}-${rule?.end_time}`,
            participant: participantRaw,
            day_of_week: Number(rule?.day_of_week ?? 0),
            start_time: String(rule?.start_time ?? ""),
            end_time: String(rule?.end_time ?? ""),
            preference: String(rule?.preference ?? "flexible"),
          });
        }

        const bundleUnitsMap: Record<string, string[]> = {};
        const bundleNamesMap: Record<string, string> = {};
        for (const b of blist) {
          if (b?.id == null) continue;
          const unitIds = Array.isArray(b.units)
            ? b.units
                .map((u: unknown) => {
                  if (u == null) return null;
                  if (typeof u === "number" || typeof u === "string") return String(u);
                  if (typeof u === "object" && "id" in u && (u as { id?: number | string }).id != null) {
                    return String((u as { id?: number | string }).id);
                  }
                  return null;
                })
                .filter((v: string | null): v is string => Boolean(v))
                .sort()
            : [];
          bundleUnitsMap[String(b.id)] = unitIds;
          bundleNamesMap[String(b.id)] = b.name || `Bundle ${b.id}`;
        }

        const smm: Record<string, string[]> = {};
        for (const m of smlist) {
          const sid = String(m.staff);
          const pid = String(m.participant);
          if (!smm[sid]) smm[sid] = [];
          smm[sid].push(pid);
        }
        const snames: Record<string, string> = {};
        for (const s of slist) {
          if (s?.id != null) snames[String(s.id)] = s.name || `Staff ${s.id}`;
        }
        const pmap: Record<string, string> = {};
        const ptier: Record<string, TierKey | null> = {};
        for (const p of plist) {
          if (p?.id == null) continue;
          const pid = String(p.id);
          pmap[pid] = `${p.name}${p.surname ? " " + p.surname : ""}`;
          const tierRaw = typeof p?.tier === "string" ? p.tier.toUpperCase() : null;
          ptier[pid] = tierRaw === "PRIMARY" || tierRaw === "SECONDARY" || tierRaw === "TERTIARY"
            ? (tierRaw as TierKey)
            : null;
        }
        const umap: Record<string, string> = {};
        for (const u of ulist) {
          if (u?.id != null) umap[String(u.id)] = u.name || `Unit ${u.id}`;
        }
        if (active) {
          setHasCells(clist.length > 0);
          setCellNameById(cmap);
          setCellStaffsById(cstaffs);
          setCellColorById(ccolors);
          setCellTierCountsById(ctierCounts);
          setCellTierPoolsById(ctierPools);
          setCellPinMetaById(cpins);
          setCellTimeRangeById(ctrange);
          setCellDurationSlotsById(cdurationSlots);
          setCellAllowOverstaffById(callowOverstaff);
          setCellRequiredPlacementsById(crequiredPlacements);
          setBundleUnitsById(bundleUnitsMap);
          setBundleNameById(bundleNamesMap);
          setUnitNameById(umap);
          setTimeRangeMetaById(trmap);
          setAvailabilityRulesByParticipant(rulesByParticipant);
          setStaffMembersByStaffId(smm);
          setStaffNameById(snames);
          setParticipantNameById(pmap);
          setParticipantTierById(ptier);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [dayStartMin, externalRefreshTick, gridId, historyMode, scheduleViewMode, slotMin]);

  useEffect(() => {
    if (!isSolving) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [isSolving]);

  useEffect(() => {
    if (!canSolve) {
      setInputSignature(null);
      return;
    }
    let active = true;
    (async () => {
      setIsInputSignatureLoading(true);
      try {
        const { signature, maxUpdatedAt } = await computeCurrentSolveInputSignature();
        if (!active) return;
        const saved = window.localStorage.getItem(solveSignatureStorageKey);
        let baseline = saved;
        if (!baseline && currentSchedule && Array.isArray(currentSchedule.placements) && currentSchedule.placements.length > 0) {
          const scheduleUpdatedAt = Math.max(
            parseTimestamp(currentSchedule.updated_at),
            parseTimestamp(currentSchedule.created_at),
          );
          if (scheduleUpdatedAt > 0 && maxUpdatedAt <= scheduleUpdatedAt) {
            baseline = signature;
            window.localStorage.setItem(solveSignatureStorageKey, signature);
          }
        }
        setInputSignature(baseline && baseline === signature ? signature : null);
      } catch {
        if (active) setInputSignature(null);
      } finally {
        if (active) setIsInputSignatureLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [canSolve, gridId, hasCells, currentSchedule?.id, currentSchedule?.updated_at, currentSchedule?.created_at]);

  const solveElapsedMs = useMemo(() => {
    if (!solveStartedAt) return 0;
    return Date.now() - solveStartedAt;
  }, [solveStartedAt, tick]);

  async function runSolve() {
    try {
      const { signature, solverParams } = await computeCurrentSolveInputSignature();
      const saved = window.localStorage.getItem(solveSignatureStorageKey);
      if (saved && saved === signature) {
        setError(t("solve_overlay.input_unchanged_latest_solution"));
        return;
      }

      setIsSolving(true);
      setSolveStartedAt(Date.now());
      setError(null);
      setCandidateError(null);
      setCandidateDialogOpen(false);
      setPreviewCandidateIndex(null);
      setPreviewParticipantsOpen(false);
      setPreviewParticipantId(null);
      setPreviewSelectedUnitId(null);
      setPendingSolveSignature(signature);

      const r = await fetch(`/api/grids/${gridId}/solve-candidates/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          solver_params: solverParams,
          candidate_min_diff_ratio: 0.1,
        }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `Solve candidates failed (${r.status})`);
      }
      const data = (await r.json()) as SolveCandidatesResponse;
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      const selectable = Array.isArray(data.selectable_candidate_indexes)
        ? data.selectable_candidate_indexes
            .map((idx) => Number(idx))
            .filter((idx) => Number.isFinite(idx))
        : [];
      const reasonOptions = normalizeReasonOptions(data.none_option?.reason_options);

      setCandidateRunId(data.run_id ?? null);
      setSolveCandidates(candidates);
      setSelectableCandidateIndexes(selectable);
      setAllCandidatesFailed(Boolean(data.all_candidates_failed));
      setCandidatePreference(data.preference ?? null);
      setRejectReasonOptions(reasonOptions);
      setRejectReasonCode(reasonOptions[0]?.code ?? "");
      setRejectNote("");
      setCandidateDialogOpen(false);
      const firstCandidateIndex =
        candidates
          .slice()
          .sort((a, b) => Number(a.index) - Number(b.index))
          .map((candidate) => Number(candidate.index))
          .find((index) => Number.isFinite(index)) ?? null;
      setPreviewCandidateIndex(firstCandidateIndex);

      if (data.all_candidates_failed) {
        setError(t("solve_overlay.all_three_candidates_failed"));
      }
    } catch (e: any) {
      setError(e?.message || t("solve_overlay.solver_error"));
    } finally {
      setIsSolving(false);
    }
  }

  const refreshGridView = useCallback(() => {
    invalidateGridScreenContext(gridId);
    if (pathname?.startsWith("/grid/")) {
      router.replace(pathname);
    }
    router.refresh();
  }, [gridId, pathname, router]);

  const chooseCandidate = async (candidateIndex: number) => {
    if (!candidateRunId) {
      setCandidateError(t("solve_overlay.missing_candidate_run_id"));
      return;
    }
    setCandidateBusy(true);
    setCandidateError(null);
    try {
      const res = await fetch(
        `/api/grids/${gridId}/solve-candidates/${encodeURIComponent(candidateRunId)}/choose/`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidate_index: candidateIndex }),
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to choose candidate (${res.status})`);
      }
      const chosen = (await res.json().catch(() => ({}))) as {
        schedule?: ScheduleResource;
        detail?: string;
      };
      const materializedSchedule =
        chosen?.schedule && chosen.schedule.id != null
          ? chosen.schedule
          : await fetchCurrentSchedule();
      setCurrentSchedule(materializedSchedule);
      setCandidateDialogOpen(false);
      setPreviewCandidateIndex(null);
      setPreviewParticipantsOpen(false);
      setPreviewParticipantId(null);
      setPreviewSelectedUnitId(null);
      setError(null);
      if (pendingSolveSignature) {
        window.localStorage.setItem(solveSignatureStorageKey, pendingSolveSignature);
        setInputSignature(pendingSolveSignature);
      }
      refreshGridView();
    } catch (e: any) {
      setCandidateError(e?.message || t("solve_overlay.could_not_choose_candidate"));
    } finally {
      setCandidateBusy(false);
    }
  };

  const rejectCandidates = async () => {
    if (!candidateRunId) {
      setCandidateError(t("solve_overlay.missing_candidate_run_id"));
      return;
    }
    const reason = rejectReasonCode || rejectReasonOptions[0]?.code;
    if (!reason) {
      setCandidateError(t("solve_overlay.select_reject_reason"));
      return;
    }
    setCandidateBusy(true);
    setCandidateError(null);
    try {
      const res = await fetch(
        `/api/grids/${gridId}/solve-candidates/${encodeURIComponent(candidateRunId)}/reject/`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason_code: reason,
            note: rejectNote.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to reject candidates (${res.status})`);
      }
      setCandidateDialogOpen(false);
      setError(t("solve_overlay.candidates_rejected_adjust_and_run_again"));
      refreshGridView();
    } catch (e: any) {
      setCandidateError(e?.message || t("solve_overlay.could_not_reject_candidates"));
    } finally {
      setCandidateBusy(false);
    }
  };

  const selectableCandidateSet = useMemo(
    () => new Set(selectableCandidateIndexes),
    [selectableCandidateIndexes],
  );

  const schedule = useMemo<ScheduleRow[]>(() => {
    const placements = Array.isArray(currentSchedule?.placements) ? currentSchedule.placements : [];
    return placements.map((placement) => {
      const bundleId =
        readEntityId((placement as { bundle_id?: unknown }).bundle_id) ??
        readEntityId((placement as { bundle?: unknown }).bundle) ??
        undefined;
      const sourceCellId =
        readEntityId((placement as { source_cell?: unknown }).source_cell) ??
        readEntityId((placement as { source_cell_id?: unknown }).source_cell_id) ??
        String(placement.id);
      const assignedParticipants = normalizeIdArray((placement as { assigned_participants?: unknown }).assigned_participants);
      return {
        cell_id: String(placement.id),
        source_cell_id: sourceCellId,
        bundle_id: bundleId,
        bundle: bundleId,
        day_index: Number(placement.day_index),
        start_slot: Number(placement.start_slot),
        end_slot: Number(placement.end_slot),
        assigned_participants: assignedParticipants,
        participants: assignedParticipants,
        units:
          bundleId != null
            ? (bundleUnitsById[String(bundleId)] || []).map(String)
            : [],
        locked: Boolean(placement.locked),
      };
    });
  }, [currentSchedule, bundleUnitsById]);

  const filteredSchedule = selectedUnitId
    ? schedule.filter((s: any) => Array.isArray(s.units) && s.units.map(String).includes(String(selectedUnitId)))
    : schedule;

  useEffect(() => {
    if (!Array.isArray(schedule) || schedule.length === 0) return;
    setLastAssignedParticipantsByCellBundle((prev) => {
      const next = { ...prev };
      for (const row of schedule) {
        const sourceCellId = String(row.source_cell_id ?? row.cell_id);
        const bundleIdRaw = readEntityId(row.bundle_id) ?? readEntityId(row.bundle);
        if (bundleIdRaw == null) continue;
        const participantIds = normalizeIdArray(row.assigned_participants);
        if (participantIds.length === 0) continue;
        next[`${sourceCellId}|${String(bundleIdRaw)}`] = participantIds;
      }
      return next;
    });
  }, [schedule]);

  const unassignedCells = useMemo(() => {
    const placedCountBySourceCell = schedule.reduce<Record<string, number>>((acc, row) => {
      const sourceCellId = String(row.source_cell_id ?? row.cell_id);
      acc[sourceCellId] = (acc[sourceCellId] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(cellNameById)
      .flatMap(([cellId, name]) => {
        const cellKey = String(cellId);
        const requiredPlacements = Math.max(1, Number(cellRequiredPlacementsById[cellKey] ?? 1));
        const currentPlacements = Number(placedCountBySourceCell[cellKey] ?? 0);
        const needsPlacement = currentPlacements < requiredPlacements;
        const allowsOverstaffing = Boolean(cellAllowOverstaffById[cellKey]);
        if (!needsPlacement && !allowsOverstaffing) return [];
        const trId = cellTimeRangeById[cellKey];
        const trMeta = trId ? timeRangeMetaById[trId] : undefined;
        const trDurationSlots =
          trMeta
            ? Math.max(1, trMeta.endSlot - trMeta.startSlot)
            : null;
        const durationSlots = cellDurationSlotsById[cellKey] ?? trDurationSlots ?? 1;
        const timeLabel = trMeta
          ? formatSlotRange(dayStartMin, slotMin, trMeta.startSlot, trMeta.endSlot)
          : t("grid_schedule.no_time_range");
        const cellBundles = (cellPinMetaById[cellKey]?.bundles || []).map(String);
        const matchingBundles = selectedUnitId
          ? cellBundles.filter((bundleId) =>
              (bundleUnitsById[bundleId] || []).map(String).includes(String(selectedUnitId)),
            )
          : cellBundles;
        if (selectedUnitId && matchingBundles.length === 0) return [];
        const selectedBundleId = matchingBundles[0] ?? cellBundles[0] ?? null;
        const unitIds = selectedBundleId
          ? (bundleUnitsById[selectedBundleId] || []).map(String)
          : [];
        const canGrabForCurrentTab = selectedBundleId != null;
        return [{
          id: cellKey,
          name,
          color: cellColorById[cellKey] || "",
          timeLabel,
          durationSlots,
          selectedBundleId,
          unitIds,
          canGrabForCurrentTab,
        }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    bundleUnitsById,
    cellAllowOverstaffById,
    cellColorById,
    cellDurationSlotsById,
    cellNameById,
    cellPinMetaById,
    cellRequiredPlacementsById,
    cellTimeRangeById,
    schedule,
    selectedUnitId,
    dayStartMin,
    slotMin,
    timeRangeMetaById,
  ]);

  useEffect(() => {
    setUnassignedFocusIndex((prev) => {
      if (unassignedCells.length <= 1) return 0;
      return Math.max(0, Math.min(unassignedCells.length - 1, prev));
    });
  }, [unassignedCells.length]);

  const isInputUnchanged = Boolean(inputSignature);
  const canUseSolve = canSolve && hasCells && !isSolving && !isInputUnchanged && !isInputSignatureLoading;
  const canPublishDraft =
    canSolve &&
    scheduleViewMode === "draft" &&
    Array.isArray(currentSchedule?.placements) &&
    currentSchedule.placements.length > 0 &&
    !isPublishing;
  const canPinCards = enablePinning && role === "supervisor" && scheduleViewMode === "draft";
  const canManualEditCards = role === "supervisor" && scheduleViewMode === "draft";
  const canCommentCards =
    scheduleViewMode === "published" &&
    Boolean(currentSchedule?.id) &&
    !historyMode;
  const selectedHistoryEntry = useMemo(
    () => publishedHistorySchedules.find((entry) => entry.key === selectedHistoryKey) ?? null,
    [publishedHistorySchedules, selectedHistoryKey],
  );

  const closeHistoryView = useCallback(() => {
    const target = `/grid/${encodeURIComponent(historyGridCode || String(gridId))}`;
    router.push(target);
  }, [gridId, historyGridCode, router]);

  const fileNameFromDisposition = (disposition: string | null, fallback: string) => {
    if (!disposition) return fallback;
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8?.[1]) return decodeURIComponent(utf8[1]).replace(/[/\\]/g, "_");
    const simple = disposition.match(/filename=\"?([^\";]+)\"?/i);
    if (simple?.[1]) return simple[1].replace(/[/\\]/g, "_");
    return fallback;
  };

  const downloadHistoryVersionExport = async () => {
    if (!historyMode || !selectedHistoryEntry || exportingHistoryVersion) return;
    setExportingHistoryVersion(true);
    setHistoryPanelError(null);
    try {
      const query = new URLSearchParams({ view: "published" });
      if (typeof selectedHistoryEntry.publishedVersion === "number") {
        query.set("published_version", String(selectedHistoryEntry.publishedVersion));
      }
      const res = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}/schedule/export?${query.toString()}`, {
        method: "GET",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to export schedule (${res.status})`);
      }
      const blob = await res.blob();
      const versionLabel =
        typeof selectedHistoryEntry.publishedVersion === "number"
          ? `v${selectedHistoryEntry.publishedVersion}`
          : "published";
      const fallbackName = `grid-${gridId}-${versionLabel}-schedule.xlsx`;
      const filename = fileNameFromDisposition(res.headers.get("content-disposition"), fallbackName);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      setHistoryPanelError(error instanceof Error ? error.message : t("solve_overlay.could_not_export_version"));
    } finally {
      setExportingHistoryVersion(false);
    }
  };

  const restoreHistoryVersionToDraft = async () => {
    if (!historyMode || role !== "supervisor" || !selectedHistoryEntry || restoringHistoryVersion) return;
    setRestoringHistoryVersion(true);
    setHistoryPanelError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (typeof selectedHistoryEntry.publishedVersion === "number") {
        payload.published_version = selectedHistoryEntry.publishedVersion;
      }
      const res = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}/schedule/restore-published/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `${t("solve_overlay.could_not_restore_draft")} (${res.status})`);
      }
      writeGridScheduleViewMode(gridId, "draft");
      invalidateGridScreenContext(gridId);
      closeHistoryView();
      router.refresh();
    } catch (error: unknown) {
      setHistoryPanelError(
        error instanceof Error ? error.message : t("solve_overlay.could_not_restore_published_version"),
      );
    } finally {
      setRestoringHistoryVersion(false);
    }
  };

  const dayIndexByColumn = useMemo(
    () =>
      Array.from({ length: daysCount }).map((_, idx) => {
        const label = String(dayLabels?.[idx] ?? "").trim().slice(0, 3).toLowerCase();
        return typeof DAY_LABEL_TO_INDEX[label] === "number" ? DAY_LABEL_TO_INDEX[label] : idx;
      }),
    [dayLabels, daysCount],
  );

  const dragPreview = useMemo(() => {
    if (!dragState) return null;
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const dayWidth = (rect.width - timeColPx) / daysCount;
    if (!Number.isFinite(dayWidth) || dayWidth <= 0) return null;
    const cardLeft = dragState.clientX - rect.left - timeColPx - dragState.grabOffsetX;
    const cardTop = dragState.clientY - rect.top - dragState.grabOffsetY;
    if (!Number.isFinite(cardLeft) || !Number.isFinite(cardTop)) return null;
    const cardContentWidth = Math.max(1, dayWidth - 12);
    const cardCenterX = cardLeft + cardContentWidth / 2;
    const dayIndex = Math.max(0, Math.min(daysCount - 1, Math.floor(cardCenterX / dayWidth)));
    const slotCount = Math.max(0, Math.round(bodyHeight / rowPx));
    const rawStart = Math.round(cardTop / rowPx);
    const maxStart = Math.max(0, slotCount - dragState.durationSlots);
    const startSlot = Math.max(0, Math.min(maxStart, rawStart));
    return {
      dayIndex,
      startSlot,
      top: startSlot * rowPx,
      height: Math.max(6, dragState.durationSlots * rowPx),
      left: `calc(${timeColPx}px + ${dayIndex} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`,
      width: `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`,
      cellName: dragState.cellName,
      sourceCellId: dragState.sourceCellId,
    };
  }, [bodyHeight, daysCount, dragState, rowPx, timeColPx]);

  const dragTimeRangeGuide = useMemo(() => {
    if (!dragPreview) return null;
    const trId = cellTimeRangeById[dragPreview.sourceCellId];
    if (!trId) return null;
    const meta = timeRangeMetaById[trId];
    if (!meta) return null;
    const slotCount = Math.max(0, Math.round(bodyHeight / rowPx));
    const startSlot = Math.max(0, Math.min(slotCount, meta.startSlot));
    const endSlot = Math.max(0, Math.min(slotCount, meta.endSlot));
    if (endSlot <= startSlot) return null;
    return {
      startTop: startSlot * rowPx,
      endTop: endSlot * rowPx,
      name: meta.name,
    };
  }, [bodyHeight, cellTimeRangeById, dragPreview, rowPx, timeRangeMetaById]);

  const dragConstraintContext = useMemo(() => {
    if (!dragState || !dragPreview || dragState.dragType !== "placement" || !dragState.placementId) return null;
    const draggedRow = schedule.find((row) => String(row.cell_id) === dragState.placementId);
    if (!draggedRow) return null;
    const participantIds = Array.isArray(draggedRow.assigned_participants)
      ? draggedRow.assigned_participants.map(String)
      : Array.isArray(draggedRow.participants)
      ? draggedRow.participants.map(String)
      : [];
    const sourceCellId = String(draggedRow.source_cell_id ?? draggedRow.cell_id);
    const bundleId = (draggedRow as { bundle_id?: string | number; bundle?: string | number }).bundle_id
      ?? (draggedRow as { bundle_id?: string | number; bundle?: string | number }).bundle;
    const bundleUnitIds = Array.isArray(draggedRow.units) && draggedRow.units.length > 0
      ? draggedRow.units.map(String)
      : bundleId != null
      ? (bundleUnitsById[String(bundleId)] || []).map(String)
      : [];
    return {
      draggedRow,
      sourceCellId,
      participantIds,
      bundleUnitIds,
      targetDayIndex: dragPreview.dayIndex,
      targetStartSlot: dragPreview.startSlot,
      targetEndSlot: dragPreview.startSlot + dragState.durationSlots,
    };
  }, [bundleUnitsById, dragPreview, dragState, schedule]);

  const dragAvailabilityZones = useMemo(() => {
    if (!dragConstraintContext) return [];
    const slotCount = Math.max(1, Math.round(bodyHeight / rowPx));
    const normalizedRules = dragConstraintContext.participantIds.flatMap((pid) =>
      (availabilityRulesByParticipant[pid] || [])
        .map((rule) => {
          const startMin = parseClockToMin(rule.start_time);
          const endMin = parseClockToMin(rule.end_time);
          const startSlot = Math.round((startMin - dayStartMin) / slotMin);
          const endSlot = Math.round((endMin - dayStartMin) / slotMin);
          return {
            day: Number(rule.day_of_week),
            startSlot,
            endSlot,
            preference: String(rule.preference || "").toLowerCase(),
          };
        })
        .filter((rule) => rule.endSlot > rule.startSlot),
    );

    if (normalizedRules.length === 0) return [];

    type ZoneKind = "impossible" | "flexible" | "preferred" | "preferred-strong";
    const zones: Array<{ col: number; startSlot: number; endSlot: number; kind: ZoneKind }> = [];

    for (let col = 0; col < daysCount; col += 1) {
      const day = dayIndexByColumn[col];
      const statuses: Array<ZoneKind | "none"> = Array.from({ length: slotCount }, () => "none");

      for (let slot = 0; slot < slotCount; slot += 1) {
        const nextSlot = slot + 1;
        const matches = normalizedRules.filter(
          (rule) => rule.day === day && rule.startSlot < nextSlot && rule.endSlot > slot,
        );
        if (matches.length === 0) continue;
        const hasImpossible = matches.some((rule) => rule.preference === "impossible");
        if (hasImpossible) {
          statuses[slot] = "impossible";
          continue;
        }
        const preferredCount = matches.filter((rule) => rule.preference === "preferred").length;
        const flexibleCount = matches.filter((rule) => rule.preference === "flexible").length;
        const allPreferred = preferredCount > 0 && preferredCount === matches.length && flexibleCount === 0;
        if (allPreferred) {
          statuses[slot] = preferredCount > 1 ? "preferred-strong" : "preferred";
          continue;
        }
        statuses[slot] = "flexible";
      }

      let start = 0;
      while (start < slotCount) {
        const kind = statuses[start];
        if (kind === "none") {
          start += 1;
          continue;
        }
        let end = start + 1;
        while (end < slotCount && statuses[end] === kind) end += 1;
        zones.push({ col, startSlot: start, endSlot: end, kind });
        start = end;
      }
    }

    return zones;
  }, [availabilityRulesByParticipant, bodyHeight, dayIndexByColumn, dayStartMin, daysCount, dragConstraintContext, rowPx, slotMin]);

  const dragCollisionCards = useMemo(() => {
    if (!dragConstraintContext) return [];
    const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
      aStart < bEnd && bStart < aEnd;

    type CollisionCategory = "active-unit" | "bundle-unit" | "participants";
    type CollisionCard = {
      key: string;
      category: CollisionCategory;
      col: number;
      cellName: string;
      unitName?: string;
      participantName?: string;
      startSlot: number;
      endSlot: number;
      timeLabel: string;
    };

    const selectedUnit = selectedUnitId ? String(selectedUnitId) : null;
    const targetDay = dragConstraintContext.targetDayIndex;
    const targetStart = dragConstraintContext.targetStartSlot;
    const targetEnd = dragConstraintContext.targetEndSlot;
    const bundleUnits = dragConstraintContext.bundleUnitIds;
    const participantIds = new Set(dragConstraintContext.participantIds);

    const byCategory: Record<CollisionCategory, CollisionCard[]> = {
      "active-unit": [],
      "bundle-unit": [],
      participants: [],
    };

    for (const row of schedule) {
      if (String(row.cell_id) === String(dragConstraintContext.draggedRow.cell_id)) continue;
      const rowDay = Number(row.day_index);
      if (rowDay !== Number(targetDay)) continue;
      if (!overlap(Number(row.start_slot), Number(row.end_slot), targetStart, targetEnd)) continue;

      const rowCol = dayIndexByColumn.indexOf(rowDay);
      if (rowCol < 0 || rowCol >= daysCount) continue;

      const rowSourceCellId = String(row.source_cell_id ?? row.cell_id);
      const rowCellName = cellNameById[rowSourceCellId] || `Cell ${rowSourceCellId}`;
      const rowBundleId = (row as { bundle_id?: string | number; bundle?: string | number }).bundle_id
        ?? (row as { bundle_id?: string | number; bundle?: string | number }).bundle;
      const rowUnits = Array.isArray(row.units) && row.units.length > 0
        ? row.units.map(String)
        : rowBundleId != null
        ? (bundleUnitsById[String(rowBundleId)] || []).map(String)
        : [];
      const rowParticipants = Array.isArray(row.assigned_participants)
        ? row.assigned_participants.map(String)
        : Array.isArray(row.participants)
        ? row.participants.map(String)
        : [];
      const startSlot = Number(row.start_slot);
      const endSlot = Number(row.end_slot);
      const base = {
        key: `${row.cell_id}-${rowDay}-${startSlot}-${endSlot}`,
        col: rowCol,
        cellName: rowCellName,
        startSlot,
        endSlot,
        timeLabel: formatSlotRange(dayStartMin, slotMin, startSlot, endSlot),
      };

      if (selectedUnit && rowUnits.includes(selectedUnit)) {
        byCategory["active-unit"].push({
          ...base,
          category: "active-unit",
          unitName: unitNameById[selectedUnit] || `Unit ${selectedUnit}`,
        });
        continue;
      }

      const bundleMatch = rowUnits.find(
        (unitId) => bundleUnits.includes(unitId) && (!selectedUnit || unitId !== selectedUnit),
      );
      if (bundleMatch) {
        byCategory["bundle-unit"].push({
          ...base,
          category: "bundle-unit",
          unitName: unitNameById[bundleMatch] || `Unit ${bundleMatch}`,
        });
        continue;
      }

      const participantMatch = rowParticipants.find((pid) => participantIds.has(pid));
      if (participantMatch) {
        byCategory.participants.push({
          ...base,
          category: "participants",
          participantName: participantNameById[participantMatch] || `#${participantMatch}`,
        });
      }
    }

    const categoryOrder: CollisionCategory[] = ["active-unit", "bundle-unit", "participants"];
    const activeCategory = categoryOrder.find((category) => byCategory[category].length > 0);
    if (!activeCategory) return [];
    return byCategory[activeCategory].sort(
      (a, b) => a.startSlot - b.startSlot || a.endSlot - b.endSlot || a.cellName.localeCompare(b.cellName),
    );
  }, [
    bundleUnitsById,
    cellNameById,
    dayIndexByColumn,
    dayStartMin,
    daysCount,
    dragConstraintContext,
    participantNameById,
    schedule,
    selectedUnitId,
    slotMin,
    unitNameById,
  ]);

  const arraysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  const resolveBundleIdsForPatch = (sourceCellId: string, scheduleUnitIds: string[]) => {
    const pinMeta = cellPinMetaById[sourceCellId];
    const cellBundles = Array.isArray(pinMeta?.bundles) ? pinMeta!.bundles!.map(String) : [];
    if (cellBundles.length <= 1) return cellBundles;
    if (scheduleUnitIds.length > 0) {
      const matched = cellBundles.find((bundleId) =>
        arraysEqual(bundleUnitsById[bundleId] || [], scheduleUnitIds),
      );
      if (matched) return [matched];
    }
    return [cellBundles[0]];
  };

  const resolveBundleIdForCard = (entry: ScheduleRow) => {
    const directBundle = (entry as any).bundle_id ?? (entry as any).bundle;
    if (directBundle != null) return directBundle as number | string;
    const sourceCellId = String(entry.source_cell_id ?? entry.cell_id);
    const scheduleUnitIds = Array.isArray(entry.units) ? entry.units.map(String).sort() : [];
    const fallback = resolveBundleIdsForPatch(sourceCellId, scheduleUnitIds)[0];
    if (fallback == null) return null;
    return /^\d+$/.test(String(fallback)) ? Number(fallback) : fallback;
  };

  const commentCountByPlacement = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of placementComments) {
      const key = buildPlacementKey(
        c.schedule,
        c.source_cell_id,
        c.bundle,
        Number(c.day_index),
        Number(c.start_slot),
      );
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [placementComments]);

  const commentPlacementOptions = useMemo<CommentPlacementOption[]>(() => {
    if (!canCommentCards || currentSchedule?.id == null) return [];
    const deduped = new Map<string, CommentPlacementOption>();
    for (const s of filteredSchedule) {
      const sourceCellId = String(s.source_cell_id ?? s.cell_id);
      const resolvedBundleId = resolveBundleIdForCard(s);
      if (resolvedBundleId == null) continue;
      const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
      const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
      const key = buildPlacementKey(currentSchedule.id, sourceCellId, resolvedBundleId, s.day_index, s.start_slot);
      if (deduped.has(key)) continue;
      deduped.set(key, {
        key,
        label: `${cellName} - ${timeLabel}`,
        count: commentCountByPlacement[key] || 0,
        anchor: {
          scheduleId: currentSchedule.id,
          sourceCellId,
          bundleId: resolvedBundleId,
          dayIndex: s.day_index,
          startSlot: s.start_slot,
          cellName,
          timeLabel,
        },
      });
    }
    return Array.from(deduped.values()).sort((a, b) =>
      a.anchor.dayIndex - b.anchor.dayIndex ||
      a.anchor.startSlot - b.anchor.startSlot ||
      a.anchor.cellName.localeCompare(b.anchor.cellName),
    );
  }, [
    canCommentCards,
    cellNameById,
    commentCountByPlacement,
    currentSchedule?.id,
    dayStartMin,
    filteredSchedule,
    resolveBundleIdForCard,
    slotMin,
  ]);

  useEffect(() => {
    if (!commentsPanelOpen) return;
    if (commentPlacementOptions.length === 0) {
      setCommentAnchor(null);
      return;
    }
    if (!commentAnchor) {
      setCommentAnchor(commentPlacementOptions[0].anchor);
      return;
    }
    const hasCurrent = commentPlacementOptions.some(
      (option) =>
        Number(option.anchor.scheduleId) === Number(commentAnchor.scheduleId) &&
        String(option.anchor.sourceCellId) === String(commentAnchor.sourceCellId) &&
        String(option.anchor.bundleId) === String(commentAnchor.bundleId) &&
        Number(option.anchor.dayIndex) === Number(commentAnchor.dayIndex) &&
        Number(option.anchor.startSlot) === Number(commentAnchor.startSlot),
    );
    if (!hasCurrent) {
      setCommentAnchor(commentPlacementOptions[0].anchor);
    }
  }, [commentAnchor, commentPlacementOptions, commentsPanelOpen]);

  useEffect(() => {
    if (commentsPanelOpen) return;
    setCommentError(null);
    setCommentBusy(false);
    setHoveredCommentPlacementKey(null);
  }, [commentsPanelOpen]);

  useEffect(() => {
    if (!commentsPanelOpen || canCommentCards) return;
    onCommentsPanelOpenChange?.(false);
  }, [canCommentCards, commentsPanelOpen, onCommentsPanelOpenChange]);

  const activePlacementComments = useMemo(() => {
    if (!commentAnchor) return [];
    return placementComments.filter((c) => {
      return (
        Number(c.schedule) === Number(commentAnchor.scheduleId) &&
        String(c.source_cell_id) === String(commentAnchor.sourceCellId) &&
        String(c.bundle) === String(commentAnchor.bundleId) &&
        Number(c.day_index) === Number(commentAnchor.dayIndex) &&
        Number(c.start_slot) === Number(commentAnchor.startSlot)
      );
    });
  }, [commentAnchor, placementComments]);

  const selectedCommentPlacementKey = commentAnchor
    ? buildPlacementKey(
        commentAnchor.scheduleId,
        commentAnchor.sourceCellId,
        commentAnchor.bundleId,
        commentAnchor.dayIndex,
        commentAnchor.startSlot,
      )
    : "";
  const shouldDimScheduleForCommentFocus =
    commentsPanelOpen && Boolean(selectedCommentPlacementKey);

  const orderedActivePlacementComments = useMemo(() => {
    return [...activePlacementComments].sort((a, b) => {
      const aTime = parseTimestamp(a.created_at);
      const bTime = parseTimestamp(b.created_at);
      return bTime - aTime;
    });
  }, [activePlacementComments]);

  const submitPlacementComment = async () => {
    if (!commentAnchor || !commentDraft.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const payload = {
        schedule: commentAnchor.scheduleId,
        source_cell_id: commentAnchor.sourceCellId,
        bundle: commentAnchor.bundleId,
        day_index: commentAnchor.dayIndex,
        start_slot: commentAnchor.startSlot,
        text: commentDraft.trim(),
      };
      const res = await fetch("/api/placement-comments/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to add comment (${res.status})`);
      }
      const raw = await res.json().catch(() => ({}));
      const bundleRaw =
        typeof raw.bundle === "object" && raw.bundle?.id != null ? raw.bundle.id : raw.bundle;
      const next: PlacementComment = {
        id: raw.id,
        schedule: raw.schedule ?? commentAnchor.scheduleId,
        source_cell_id: raw.source_cell_id ?? commentAnchor.sourceCellId,
        bundle: bundleRaw ?? commentAnchor.bundleId,
        day_index: Number(raw.day_index ?? commentAnchor.dayIndex),
        start_slot: Number(raw.start_slot ?? commentAnchor.startSlot),
        text: String(raw.text ?? raw.message ?? commentDraft.trim()),
        created_at: raw.created_at,
        author_id: raw.author_id ?? extractAuthorId(raw.author),
        author_name: extractAuthorName(raw),
      };
      setPlacementComments((prev) => [next, ...prev]);
      setCommentDraft("");
    } catch (e: unknown) {
      setCommentError(e instanceof Error ? e.message : t("solve_overlay.could_not_add_comment"));
    } finally {
      setCommentBusy(false);
    }
  };

  const togglePlacementLock = async (
    placementId: string,
    currentlyLocked: boolean,
    cardKey: string,
  ) => {
    if (!canPinCards || pinBusyKey || !currentSchedule?.placements) return;
    const nextLocked = !currentlyLocked;
    const previousPlacements = currentSchedule.placements;
    const nextPlacements = previousPlacements.map((placement) =>
      String(placement.id) === placementId
        ? {
            ...placement,
            locked: nextLocked,
          }
        : placement,
    );
    setPinError(null);
    setPinOptimisticByCard((prev) => ({
      ...prev,
      [cardKey]: nextLocked,
    }));
    setCurrentSchedule((prev) =>
      prev
        ? {
            ...prev,
            placements: nextPlacements,
          }
        : prev,
    );
    setPinBusyKey(cardKey);
    try {
      const res = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locked: nextLocked }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to update lock (${res.status})`);
      }
      notifyDraftMutation();
    } catch (e: unknown) {
      setCurrentSchedule((prev) =>
        prev
          ? {
              ...prev,
              placements: previousPlacements,
            }
          : prev,
      );
      setPinError(e instanceof Error ? e.message : t("solve_overlay.could_not_update_placement_lock"));
    } finally {
      setPinOptimisticByCard((prev) => {
        if (!(cardKey in prev)) return prev;
        const next = { ...prev };
        delete next[cardKey];
        return next;
      });
      setPinBusyKey(null);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const isInsideDeleteDropTarget = useCallback((clientX: number, clientY: number) => {
    const el = deleteDropRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  const deleteSchedulePlacement = useCallback(
    async (placementId: string) => {
      if (!currentSchedule?.placements) return;
      const previousPlacements = currentSchedule.placements;
      const targetPlacement = previousPlacements.find((placement) => String(placement.id) === placementId);
      if (!targetPlacement) return;

      const participantIdToRemove =
        previewMode === "participant" && previewParticipantId ? String(previewParticipantId) : null;
      const assignedParticipants = normalizeIdArray(
        (targetPlacement as { assigned_participants?: unknown }).assigned_participants,
      );
      const shouldRemoveOnlyParticipant =
        participantIdToRemove != null && assignedParticipants.includes(participantIdToRemove);

      if (shouldRemoveOnlyParticipant) {
        const nextAssigned = assignedParticipants.filter((pid) => pid !== participantIdToRemove);
        const nextAssignedApi = nextAssigned.map((pid) => (/^\d+$/.test(pid) ? Number(pid) : pid));
        const nextPlacements =
          nextAssigned.length === 0
            ? previousPlacements.filter((placement) => String(placement.id) !== placementId)
            : previousPlacements.map((placement) =>
                String(placement.id) === placementId
                  ? {
                      ...placement,
                      assigned_participants: nextAssigned,
                    }
                  : placement,
              );

        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: nextPlacements,
              }
            : prev,
        );

        try {
          if (nextAssigned.length === 0) {
            const deleteRes = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
              method: "DELETE",
            });
            if (!deleteRes.ok) {
              const txt = await deleteRes.text().catch(() => "");
              throw new Error(txt || `${t("solve_overlay.could_not_remove_placement")} (${deleteRes.status})`);
            }
          } else {
            const patchRes = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                assigned_participants: nextAssignedApi,
              }),
            });
            if (!patchRes.ok) {
              const txt = await patchRes.text().catch(() => "");
              throw new Error(txt || `${t("solve_overlay.could_not_update_placement")} (${patchRes.status})`);
            }
          }
          notifyDraftMutation();
        } catch (error: unknown) {
          setCurrentSchedule((prev) =>
            prev
              ? {
                  ...prev,
                  placements: previousPlacements,
                }
              : prev,
          );
          setPinError(error instanceof Error ? error.message : t("solve_overlay.could_not_remove_participant"));
        }
        return;
      }

      const nextPlacements = previousPlacements.filter((placement) => String(placement.id) !== placementId);

      setCurrentSchedule((prev) =>
        prev
          ? {
              ...prev,
              placements: nextPlacements,
            }
          : prev,
      );
      try {
        const res = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `${t("solve_overlay.could_not_remove_placement")} (${res.status})`);
        }
        notifyDraftMutation();
      } catch (error: unknown) {
        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: previousPlacements,
              }
            : prev,
        );
        setPinError(error instanceof Error ? error.message : t("solve_overlay.could_not_remove_placement"));
      }
    },
    [currentSchedule, normalizeIdArray, notifyDraftMutation, previewMode, previewParticipantId],
  );

  const isParticipantAvailableForPlacement = useCallback(
    (
      participantId: string,
      dayIndex: number,
      startSlot: number,
      endSlot: number,
      excludePlacementId?: string,
    ) => {
      const dayOfWeek = dayIndexByColumn[dayIndex] ?? dayIndex;
      const participantRules = availabilityRulesByParticipant[participantId] || [];
      for (const rule of participantRules) {
        if (Number(rule.day_of_week) !== dayOfWeek) continue;
        const preference = String(rule.preference ?? "").toLowerCase();
        if (preference !== "impossible") continue;
        const ruleStartSlot = Math.round((parseClockToMin(String(rule.start_time)) - dayStartMin) / slotMin);
        const ruleEndSlot = Math.round((parseClockToMin(String(rule.end_time)) - dayStartMin) / slotMin);
        if (rangesOverlap(startSlot, endSlot, ruleStartSlot, ruleEndSlot)) {
          return false;
        }
      }

      for (const row of schedule) {
        if (excludePlacementId && String(row.cell_id) === String(excludePlacementId)) continue;
        if (Number(row.day_index) !== dayIndex) continue;
        if (!rangesOverlap(startSlot, endSlot, Number(row.start_slot), Number(row.end_slot))) continue;
        const assigned = normalizeIdArray(row.assigned_participants);
        if (assigned.includes(participantId)) return false;
      }

      return true;
    },
    [availabilityRulesByParticipant, dayIndexByColumn, dayStartMin, normalizeIdArray, schedule, slotMin],
  );

  const getPlacementAssignmentOptions = useCallback(
    (
      sourceCellId: string,
      bundleId: string | number,
      dayIndex: number,
      startSlot: number,
      endSlot: number,
    ): { options: PlacementAssignmentOption[]; error?: string } => {
      const normalizedBundleId = String(bundleId);
      const bundleUnitIds = (bundleUnitsById[normalizedBundleId] || []).map(String);
      if (bundleUnitIds.length === 0) {
        return { options: [], error: t("solve_overlay.selected_bundle_has_no_units") };
      }

      const unitOverlap = schedule.some((row) => {
        if (Number(row.day_index) !== dayIndex) return false;
        if (!rangesOverlap(startSlot, endSlot, Number(row.start_slot), Number(row.end_slot))) return false;
        const rowUnits = Array.isArray(row.units) ? row.units.map(String) : [];
        return rowUnits.some((unitId) => bundleUnitIds.includes(unitId));
      });
      if (unitOverlap) {
        return { options: [], error: t("solve_overlay.cannot_place_cell_bundle_unit_occupied") };
      }

      const tierCounts = cellTierCountsById[sourceCellId] || {
        PRIMARY: 0,
        SECONDARY: 0,
        TERTIARY: 0,
      };
      const tierPools = cellTierPoolsById[sourceCellId] || {
        PRIMARY: [],
        SECONDARY: [],
        TERTIARY: [],
      };
      const headcount = TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0);
      const previousAssigned =
        lastAssignedParticipantsByCellBundle[`${sourceCellId}|${normalizedBundleId}`] || [];

      const options: PlacementAssignmentOption[] = [];
      const seen = new Set<string>();
      const addOption = (option: PlacementAssignmentOption) => {
        const key = option.participantIds.slice().sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        options.push(option);
      };

      const isRecommendedSet = (participantIds: string[]) =>
        previousAssigned.length > 0 &&
        previousAssigned.length === participantIds.length &&
        previousAssigned.every((pid) => participantIds.includes(String(pid)));

      const staffIds = (cellStaffsById[sourceCellId] || []).map(String);
      for (const staffId of staffIds) {
        const members = Array.from(new Set((staffMembersByStaffId[staffId] || []).map(String)));
        if (members.length === 0) continue;
        if (headcount > 0 && members.length !== headcount) continue;
        const allAvailable = members.every((participantId) =>
          isParticipantAvailableForPlacement(participantId, dayIndex, startSlot, endSlot),
        );
        if (!allAvailable) continue;
        const memberNames = members
          .map((participantId) => participantNameById[participantId] || `#${participantId}`)
          .join(", ");
        addOption({
          id: `staff:${staffId}`,
          source: "staff",
          participantIds: members,
          label: t("solve_overlay.staff_assignment_label", { name: staffNameById[staffId] || memberNames }),
          recommended: isRecommendedSet(members),
        });
      }

      if (headcount > 0) {
        const selectedFromPools: string[] = [];
        let poolShortage = false;
        for (const tier of TIERS) {
          const required = Math.max(0, Number(tierCounts[tier] || 0));
          if (required === 0) continue;
          const poolCandidates = Array.from(new Set((tierPools[tier] || []).map(String)))
            .filter((participantId) => participantTierById[participantId] === tier)
            .filter((participantId) =>
              isParticipantAvailableForPlacement(participantId, dayIndex, startSlot, endSlot),
            )
            .sort((a, b) => (participantNameById[a] || a).localeCompare(participantNameById[b] || b));
          if (poolCandidates.length < required) {
            poolShortage = true;
            break;
          }
          selectedFromPools.push(...poolCandidates.slice(0, required));
        }

        const previousIsValid =
          previousAssigned.length === headcount &&
          previousAssigned.every((participantId) =>
            isParticipantAvailableForPlacement(String(participantId), dayIndex, startSlot, endSlot),
          ) &&
          TIERS.every((tier) => {
            const required = Math.max(0, Number(tierCounts[tier] || 0));
            const actual = previousAssigned.filter(
              (participantId) => participantTierById[String(participantId)] === tier,
            ).length;
            return actual === required;
          });
        if (previousIsValid) {
          addOption({
            id: "pool:recommended",
            source: "pool",
            participantIds: previousAssigned.map(String),
            label: t("solve_overlay.tier_pools_recommended"),
            recommended: true,
          });
        }

        if (!poolShortage && selectedFromPools.length === headcount) {
          addOption({
            id: "pool:auto",
            source: "pool",
            participantIds: selectedFromPools,
            label: t("solve_overlay.tier_pools"),
            recommended: isRecommendedSet(selectedFromPools),
          });
        }
      }

      if (options.length === 0) {
        return {
          options: [],
          error: t("solve_overlay.no_valid_participants_for_slot"),
        };
      }

      options.sort((a, b) => Number(b.recommended) - Number(a.recommended));
      return { options };
    },
    [
      bundleUnitsById,
      cellStaffsById,
      cellTierCountsById,
      cellTierPoolsById,
      isParticipantAvailableForPlacement,
      lastAssignedParticipantsByCellBundle,
      participantNameById,
      participantTierById,
      schedule,
      staffMembersByStaffId,
      staffNameById,
    ],
  );

  const createSchedulePlacement = useCallback(
    async (
      sourceCellId: string,
      bundleId: string | number,
      nextDayIndex: number,
      nextStartSlot: number,
      durationSlots: number,
      assignedParticipantIds: string[] = [],
    ) => {
      if (!currentSchedule?.id) {
        setPinError(t("grid_schedule.no_draft_schedule_error"));
        return;
      }
      const scheduleId = Number(currentSchedule.id);
      const nextEndSlot = nextStartSlot + durationSlots;
      const normalizedSourceCell =
        /^\d+$/.test(String(sourceCellId)) ? Number(sourceCellId) : sourceCellId;
      const normalizedBundle =
        /^\d+$/.test(String(bundleId)) ? Number(bundleId) : bundleId;
      const normalizedAssignedParticipants = assignedParticipantIds
        .map((id) => (/^\d+$/.test(String(id)) ? Number(id) : id))
        .filter((id) => id != null);

      const tempId = `temp-${sourceCellId}-${Date.now()}`;
      const previousPlacements = Array.isArray(currentSchedule.placements)
        ? currentSchedule.placements
        : [];
      const tempPlacement = {
        id: tempId,
        source_cell: normalizedSourceCell,
        source_cell_id: normalizedSourceCell,
        bundle: normalizedBundle,
        bundle_id: normalizedBundle,
        day_index: nextDayIndex,
        start_slot: nextStartSlot,
        end_slot: nextEndSlot,
        assigned_participants: normalizedAssignedParticipants,
        locked: false,
      };

      setCurrentSchedule((prev) =>
        prev
          ? {
              ...prev,
              placements: [...(Array.isArray(prev.placements) ? prev.placements : []), tempPlacement],
            }
          : prev,
      );

      try {
        const res = await fetch(`/api/schedule-placements/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schedule: scheduleId,
            source_cell: normalizedSourceCell,
            bundle: normalizedBundle,
            day_index: nextDayIndex,
            start_slot: nextStartSlot,
            end_slot: nextEndSlot,
            assigned_participants: normalizedAssignedParticipants,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `${t("grid_schedule.could_not_place_cell")} (${res.status})`);
        }
        const raw = await res.json().catch(() => ({} as Record<string, unknown>));
        const rawSourceCellId =
          readEntityId((raw as any).source_cell_id) ??
          readEntityId((raw as any).source_cell) ??
          normalizedSourceCell;
        const rawBundleId =
          readEntityId((raw as any).bundle_id) ??
          readEntityId((raw as any).bundle) ??
          normalizedBundle;
        const createdPlacement = {
          id: (raw as any).id ?? tempId,
          source_cell: rawSourceCellId,
          source_cell_id: rawSourceCellId,
          bundle: rawBundleId,
          bundle_id: rawBundleId,
          day_index: Number((raw as any).day_index ?? nextDayIndex),
          start_slot: Number((raw as any).start_slot ?? nextStartSlot),
          end_slot: Number((raw as any).end_slot ?? nextEndSlot),
          assigned_participants: normalizeIdArray((raw as any).assigned_participants),
          locked: Boolean((raw as any).locked),
        };

        const assignedKey = `${String(normalizedSourceCell)}|${String(normalizedBundle)}`;
        if (createdPlacement.assigned_participants.length > 0) {
          setLastAssignedParticipantsByCellBundle((prev) => ({
            ...prev,
            [assignedKey]: createdPlacement.assigned_participants.map(String),
          }));
        }

        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: (Array.isArray(prev.placements) ? prev.placements : []).map((placement) =>
                  String((placement as any).id) === tempId ? createdPlacement : placement,
                ),
              }
            : prev,
        );
        notifyDraftMutation();
      } catch (error: unknown) {
        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: previousPlacements,
              }
            : prev,
        );
        setPinError(error instanceof Error ? error.message : t("grid_schedule.could_not_place_cell"));
      }
    },
    [currentSchedule, normalizeIdArray, notifyDraftMutation, t],
  );

  const requestUnassignedPlacement = useCallback(
    async (
      sourceCellId: string,
      bundleId: string | number,
      dayIndex: number,
      startSlot: number,
      durationSlots: number,
    ) => {
      const normalizedBundleId = String(bundleId);
      const endSlot = startSlot + durationSlots;

      if (currentSchedule?.id) {
        try {
          const res = await fetch(`/api/grids/${gridId}/schedule/placement-options/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              schedule_id: currentSchedule.id,
              source_cell_id: sourceCellId,
              bundle_id: /^\d+$/.test(normalizedBundleId) ? Number(normalizedBundleId) : normalizedBundleId,
              day_index: dayIndex,
              start_slot: startSlot,
              end_slot: endSlot,
            }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({} as Record<string, unknown>));
            const rawOptions = ((data as any)?.options ?? {}) as Record<string, unknown>;
            const rawValidAssignments = Array.isArray((rawOptions as any).valid_assignments)
              ? (rawOptions as any).valid_assignments
              : [];
            const backendOptions: PlacementAssignmentOption[] = rawValidAssignments
              .map((assignment: any, index: number) => {
                const participantIds = Array.from(
                  new Set(
                    normalizeIdArray(
                      assignment?.participant_ids ??
                        assignment?.assigned_participants ??
                        assignment?.members ??
                        assignment?.participants ??
                        [],
                    ),
                  ),
                );
                if (participantIds.length === 0) return null;
                const staffId = readEntityId(assignment?.staff_id ?? assignment?.staff);
                const isStaff = staffId != null;
                const participantLabel = participantIds
                  .map((participantId) => participantNameById[participantId] || `#${participantId}`)
                  .join(", ");
                const label =
                  typeof assignment?.label === "string" && assignment.label.trim()
                    ? assignment.label
                    : isStaff
                    ? t("solve_overlay.staff_assignment_label", { name: staffNameById[String(staffId)] || participantLabel })
                    : t("solve_overlay.tier_pools_assignment_label", { names: participantLabel });
                const recommendedByBackend = Boolean(assignment?.recommended);
                const previousAssigned =
                  lastAssignedParticipantsByCellBundle[`${sourceCellId}|${normalizedBundleId}`] || [];
                const recommendedByPrevious =
                  !recommendedByBackend &&
                  previousAssigned.length === participantIds.length &&
                  previousAssigned.every((pid) => participantIds.includes(String(pid)));
                return {
                  id: `${isStaff ? "staff" : "pool"}:${String(staffId ?? index)}`,
                  source: isStaff ? "staff" : "pool",
                  participantIds,
                  label,
                  recommended: recommendedByBackend || recommendedByPrevious,
                } as PlacementAssignmentOption;
              })
              .filter(Boolean) as PlacementAssignmentOption[];

            if (backendOptions.length > 0) {
              backendOptions.sort((a, b) => Number(b.recommended) - Number(a.recommended));
              if (backendOptions.length === 1) {
                void createSchedulePlacement(
                  sourceCellId,
                  bundleId,
                  dayIndex,
                  startSlot,
                  durationSlots,
                  backendOptions[0].participantIds,
                );
                return;
              }
              setAssignmentOptions(backendOptions);
              setSelectedAssignmentOptionId(
                backendOptions.find((option) => option.recommended)?.id ?? backendOptions[0].id,
              );
              setPendingPlacementRequest({
                sourceCellId,
                bundleId,
                dayIndex,
                startSlot,
                durationSlots,
              });
              setAssignmentDialogOpen(true);
              return;
            }

            const backendErrors = Array.isArray((data as any)?.errors)
              ? (data as any).errors.map((item: unknown) => String(item)).filter(Boolean)
              : [];
            if (backendErrors.length > 0) {
              setPinError(backendErrors[0]);
              return;
            }
          }
        } catch {
          // fallback below
        }
      }

      const { options, error: assignmentError } = getPlacementAssignmentOptions(
        sourceCellId,
        bundleId,
        dayIndex,
        startSlot,
        endSlot,
      );
      if (assignmentError) {
        setPinError(assignmentError);
        return;
      }
      if (options.length === 1) {
        void createSchedulePlacement(
          sourceCellId,
          bundleId,
          dayIndex,
          startSlot,
          durationSlots,
          options[0].participantIds,
        );
        return;
      }
      setAssignmentOptions(options);
      setSelectedAssignmentOptionId(options.find((option) => option.recommended)?.id ?? options[0].id);
      setPendingPlacementRequest({
        sourceCellId,
        bundleId,
        dayIndex,
        startSlot,
        durationSlots,
      });
      setAssignmentDialogOpen(true);
    },
    [
      createSchedulePlacement,
      currentSchedule?.id,
      getPlacementAssignmentOptions,
      gridId,
      lastAssignedParticipantsByCellBundle,
      normalizeIdArray,
      participantNameById,
      staffNameById,
    ],
  );

  const confirmSelectedAssignmentAndPlace = useCallback(() => {
    if (!pendingPlacementRequest || !selectedAssignmentOptionId) return;
    const chosenOption = assignmentOptions.find((option) => option.id === selectedAssignmentOptionId);
    if (!chosenOption) return;
    setAssignmentDialogOpen(false);
    setPendingPlacementRequest(null);
    setAssignmentOptions([]);
    setSelectedAssignmentOptionId(null);
    void createSchedulePlacement(
      pendingPlacementRequest.sourceCellId,
      pendingPlacementRequest.bundleId,
      pendingPlacementRequest.dayIndex,
      pendingPlacementRequest.startSlot,
      pendingPlacementRequest.durationSlots,
      chosenOption.participantIds,
    );
  }, [assignmentOptions, createSchedulePlacement, pendingPlacementRequest, selectedAssignmentOptionId]);

  const patchPlacementPosition = useCallback(
    async (placementId: string, nextDayIndex: number, nextStartSlot: number, durationSlots: number) => {
      if (!currentSchedule?.placements) return;
      const targetPlacement = currentSchedule.placements.find((placement) => String(placement.id) === placementId);
      if (!targetPlacement) return;
      if (targetPlacement.locked) {
        setPinError(t("solve_overlay.locked_placements_cannot_be_moved"));
        return;
      }
      const nextEndSlot = nextStartSlot + durationSlots;
      const previousPlacements = currentSchedule.placements;
      const updatedPlacements = previousPlacements.map((placement) =>
        String(placement.id) === placementId
          ? {
              ...placement,
              day_index: nextDayIndex,
              start_slot: nextStartSlot,
              end_slot: nextEndSlot,
            }
          : placement,
      );
      setCurrentSchedule((prev) =>
        prev
          ? {
              ...prev,
              placements: updatedPlacements,
            }
          : prev,
      );
      try {
        const res = await fetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            day_index: nextDayIndex,
            start_slot: nextStartSlot,
            end_slot: nextEndSlot,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `${t("grid_schedule.could_not_move_placement")} (${res.status})`);
        }
        notifyDraftMutation();
      } catch (error: unknown) {
        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: previousPlacements,
              }
            : prev,
        );
        setPinError(error instanceof Error ? error.message : t("grid_schedule.could_not_move_placement"));
      }
    },
    [currentSchedule, notifyDraftMutation, t],
  );

  useEffect(() => {
    return () => clearLongPressTimer();
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      const isInsideDelete = isInsideDeleteDropTarget(event.clientX, event.clientY);
      setIsDeleteDropActive((prev) => (prev === isInsideDelete ? prev : isInsideDelete));
      setDragState((prev) =>
        prev && prev.pointerId === event.pointerId
          ? {
              ...prev,
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : prev,
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      const activeDrag = dragState;
      setDragState(null);
      const droppedOnDelete = isInsideDeleteDropTarget(event.clientX, event.clientY);
      setIsDeleteDropActive(false);
      if (droppedOnDelete && activeDrag.dragType === "placement" && activeDrag.placementId) {
        void deleteSchedulePlacement(activeDrag.placementId);
        return;
      }

      const overlay = overlayRef.current;
      if (!overlay) return;

      const rect = overlay.getBoundingClientRect();
      const dayWidth = (rect.width - timeColPx) / daysCount;
      const cardLeft = event.clientX - rect.left - timeColPx - activeDrag.grabOffsetX;
      const cardTop = event.clientY - rect.top - activeDrag.grabOffsetY;
      const cardContentWidth = Math.max(1, dayWidth - 12);
      const cardCenterX = cardLeft + cardContentWidth / 2;
      if (
        !Number.isFinite(cardCenterX) ||
        !Number.isFinite(cardTop) ||
        cardCenterX < 0 ||
        cardCenterX >= dayWidth * daysCount
      ) {
        return;
      }

      const droppedDay = Math.max(0, Math.min(daysCount - 1, Math.floor(cardCenterX / dayWidth)));
      const slotCount = Math.max(0, Math.round(bodyHeight / rowPx));
      const rawStartSlot = Math.round(cardTop / rowPx);
      const maxStartSlot = Math.max(0, slotCount - activeDrag.durationSlots);
      const droppedStart = Math.max(0, Math.min(maxStartSlot, rawStartSlot));
      if (activeDrag.dragType === "placement" && activeDrag.placementId) {
        if (droppedDay === activeDrag.originalDayIndex && droppedStart === activeDrag.originalStartSlot) {
          return;
        }
        void patchPlacementPosition(activeDrag.placementId, droppedDay, droppedStart, activeDrag.durationSlots);
        return;
      }
      if (activeDrag.dragType === "unassigned") {
        if (activeDrag.sourceBundleId == null) {
          setPinError(t("solve_overlay.select_matching_unit_tab_before_placing"));
          return;
        }
        void requestUnassignedPlacement(
          activeDrag.sourceCellId,
          activeDrag.sourceBundleId,
          droppedDay,
          droppedStart,
          activeDrag.durationSlots,
        );
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      setDragState(null);
      setIsDeleteDropActive(false);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [
    bodyHeight,
    daysCount,
    deleteSchedulePlacement,
    dragState,
    isInsideDeleteDropTarget,
    patchPlacementPosition,
    requestUnassignedPlacement,
    rowPx,
    timeColPx,
  ]);

  useEffect(() => {
    if (dragState) return;
    setIsDeleteDropActive(false);
  }, [dragState]);

  useEffect(() => {
    if (!isJiggleMode) return;
    const dock = document.getElementById("sidedock");
    const prevOpacity = dock?.style.opacity ?? "";
    const prevPointerEvents = dock?.style.pointerEvents ?? "";
    if (dock) {
      dock.style.opacity = "0";
      dock.style.pointerEvents = "none";
      dock.style.transition = "opacity 140ms ease";
    }
    return () => {
      if (!dock) return;
      dock.style.opacity = prevOpacity;
      dock.style.pointerEvents = prevPointerEvents;
    };
  }, [isJiggleMode]);

  useEffect(() => {
    if (!isJiggleMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDragState(null);
      clearLongPressTimer();
      setIsJiggleMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isJiggleMode]);

  useEffect(() => {
    if (canManualEditCards) return;
    setIsJiggleMode(false);
    clearLongPressTimer();
    setDragState(null);
  }, [canManualEditCards]);

  useEffect(() => {
    if (!isJiggleMode) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-schedule-scroll]")) return;
      if (target.closest("[data-unit-tabs]")) return;
      if (target.closest("[data-jiggle-delete-drop]")) return;
      if (target.closest("[data-jiggle-unassigned]")) return;
      setIsJiggleMode(false);
      clearLongPressTimer();
      setDragState(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [isJiggleMode]);

  const solveDisabledReason = !canSolve
    ? t("solve_overlay.solve_unavailable")
    : !hasCells
    ? t("solve_overlay.create_cells_to_enable_solve")
    : isInputUnchanged
    ? t("solve_overlay.input_unchanged_latest_solution")
    : isInputSignatureLoading
    ? t("solve_overlay.checking_changes")
    : isSolving
    ? t("solve_overlay.solving")
    : t("solve_overlay.solve");

  const candidateStatusClass = (status?: CandidateStatus) => {
    if (status === "OPTIMAL") return "text-green-700 bg-green-50 border border-green-200";
    if (status === "FEASIBLE") return "text-blue-700 bg-blue-50 border border-blue-200";
    if (status === "INFEASIBLE") return "text-amber-700 bg-amber-50 border border-amber-200";
    if (status === "ERROR") return "text-red-700 bg-red-50 border border-red-200";
    return "text-gray-700 bg-gray-50 border border-gray-200";
  };

  const orderedCandidates = useMemo(
    () => [...solveCandidates].sort((a, b) => Number(a.index) - Number(b.index)),
    [solveCandidates],
  );

  const previewCandidate = useMemo(
    () => orderedCandidates.find((candidate) => Number(candidate.index) === Number(previewCandidateIndex)) ?? null,
    [orderedCandidates, previewCandidateIndex],
  );

  const previewSchedule = useMemo(() => {
    if (!previewCandidate || !Array.isArray(previewCandidate.schedule)) return [];
    return previewCandidate.schedule;
  }, [previewCandidate]);

  const getPreviewScheduleUnitIds = useCallback((
    row: ScheduleRow,
  ): string[] => {
    if (Array.isArray(row.units) && row.units.length > 0) {
      return row.units.map(String).sort();
    }
    const directBundle = (row as { bundle_id?: string | number; bundle?: string | number }).bundle_id
      ?? (row as { bundle_id?: string | number; bundle?: string | number }).bundle;
    if (directBundle != null) {
      return bundleUnitsById[String(directBundle)] || [];
    }
    const sourceCellId = String(row.source_cell_id ?? row.cell_id);
    const cellBundles = (cellPinMetaById[sourceCellId]?.bundles || []).map(String);
    if (cellBundles.length === 1) {
      return bundleUnitsById[cellBundles[0]] || [];
    }
    return [];
  }, [bundleUnitsById, cellPinMetaById]);

  const previewBundleLabelById = useCallback(
    (bundleId: string | number): string => {
      const key = String(bundleId);
      if (bundleNameById[key]) return bundleNameById[key];
      const unitIds = bundleUnitsById[key] || [];
      if (unitIds.length > 0) {
        return unitIds.map((uid) => unitNameById[uid] || t("format.unit_with_id", { id: uid })).join(" + ");
      }
      return t("format.bundle_with_id", { id: key });
    },
    [bundleNameById, bundleUnitsById, unitNameById, t],
  );

  const getPreviewBundleLabel = useCallback(
    (row: ScheduleRow): string => {
      const directBundle = (row as { bundle_id?: string | number; bundle?: string | number }).bundle_id
        ?? (row as { bundle_id?: string | number; bundle?: string | number }).bundle;
      if (directBundle != null) return previewBundleLabelById(directBundle);
      const sourceCellId = String(row.source_cell_id ?? row.cell_id);
      const cellBundles = (cellPinMetaById[sourceCellId]?.bundles || []).map(String);
      if (cellBundles.length === 0) return "";
      return cellBundles.map((bundleId) => previewBundleLabelById(bundleId)).join(" + ");
    },
    [cellPinMetaById, previewBundleLabelById],
  );

  const previewUnitTabs = useMemo(() => {
    const ids = new Set<string>();
    for (const row of previewSchedule) {
      for (const unitId of getPreviewScheduleUnitIds(row)) ids.add(String(unitId));
    }
    return Array.from(ids)
      .sort((a, b) => (unitNameById[a] || a).localeCompare(unitNameById[b] || b))
      .map((id) => ({ id, name: unitNameById[id] || t("format.unit_with_id", { id }) }));
  }, [previewSchedule, unitNameById, getPreviewScheduleUnitIds, t]);

  useEffect(() => {
    if (!previewCandidate) {
      setPreviewSelectedUnitId(null);
      return;
    }
    setPreviewSelectedUnitId((prev) => {
      if (prev && previewUnitTabs.some((tab) => tab.id === prev)) return prev;
      return previewUnitTabs[0]?.id ?? null;
    });
  }, [previewCandidate, previewUnitTabs]);

  const previewParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of previewSchedule) {
      const assigned = Array.isArray(row.assigned_participants)
        ? row.assigned_participants
        : Array.isArray(row.participants)
        ? row.participants
        : [];
      for (const pid of assigned) ids.add(String(pid));
    }
    return Array.from(ids).sort((a, b) =>
      (participantNameById[a] || a).localeCompare(participantNameById[b] || b),
    );
  }, [previewSchedule, participantNameById]);

  const previewScheduleByUnit = useMemo(() => {
    if (!previewSelectedUnitId) return previewSchedule;
    return previewSchedule.filter((row) =>
      getPreviewScheduleUnitIds(row).includes(previewSelectedUnitId),
    );
  }, [previewSchedule, previewSelectedUnitId, getPreviewScheduleUnitIds]);

  const previewParticipantSchedule = useMemo(() => {
    if (!previewParticipantId) return [];
    return previewSchedule.filter((row) => {
      const assigned = Array.isArray(row.assigned_participants)
        ? row.assigned_participants
        : Array.isArray(row.participants)
        ? row.participants
        : [];
      return assigned.map(String).includes(previewParticipantId);
    });
  }, [previewParticipantId, previewSchedule]);

  const previewIsParticipantMode = previewMode === "participant" && Boolean(previewParticipantId);
  const previewScheduleForCards = previewIsParticipantMode ? previewParticipantSchedule : previewScheduleByUnit;

  const previewParticipantName = previewParticipantId
    ? (participantNameById[previewParticipantId] || `#${previewParticipantId}`)
    : "";

  const previewParticipantOptions = useMemo(() => {
    const q = previewParticipantsQuery.trim().toLowerCase();
    return previewParticipantIds
      .map((pid) => ({ id: pid, name: participantNameById[pid] || `#${pid}` }))
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [previewParticipantIds, participantNameById, previewParticipantsQuery]);

  const previewSlotCount = Math.max(1, Math.floor(bodyHeight / rowPx));
  const previewTimeLabel = (slot: number) =>
    formatSlotRange(dayStartMin, slotMin, slot, slot + 1).split(" - ")[0];

  useEffect(() => {
    let active = true;
    if (!previewIsParticipantMode || !previewParticipantId) {
      setPreviewParticipantRules([]);
      return () => {
        active = false;
      };
    }

    (async () => {
      const pid = encodeURIComponent(previewParticipantId);
      const endpoints = [
        `/api/availability_rules?participant=${pid}`,
        `/api/availability_rules/?participant=${pid}`,
      ];
      try {
        let loaded: any[] = [];
        for (const endpoint of endpoints) {
          const res = await fetch(endpoint, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json().catch(() => ([]));
          loaded = Array.isArray(data) ? data : data?.results ?? [];
          break;
        }
        if (!active) return;
        setPreviewParticipantRules(
          loaded
            .filter((rule) => rule?.participant != null)
            .map((rule) => ({
              id: rule.id ?? `${rule.participant}-${rule.day_of_week}-${rule.start_time}-${rule.end_time}`,
              participant: rule.participant,
              day_of_week: Number(rule.day_of_week),
              start_time: String(rule.start_time ?? ""),
              end_time: String(rule.end_time ?? ""),
              preference: rule.preference,
            })),
        );
      } catch {
        if (!active) return;
        setPreviewParticipantRules([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [previewIsParticipantMode, previewParticipantId]);

  const previewDayIndexByColumn = useMemo(
    () =>
      Array.from({ length: daysCount }).map((_, idx) => {
        const label = String(dayLabels?.[idx] ?? "").trim().slice(0, 3).toLowerCase();
        return typeof DAY_LABEL_TO_INDEX[label] === "number" ? DAY_LABEL_TO_INDEX[label] : idx;
      }),
    [dayLabels, daysCount],
  );

  const previewAvailabilityCards = useMemo(() => {
    if (!previewIsParticipantMode || !previewParticipantId) return [];
    const rules = previewParticipantRules;
    if (rules.length === 0) return [];

    const columnByDay = new Map<number, number>();
    previewDayIndexByColumn.forEach((dayIndex, col) => {
      if (!columnByDay.has(dayIndex)) columnByDay.set(dayIndex, col);
    });

    return rules
      .map((rule) => {
        const col = columnByDay.get(Number(rule.day_of_week));
        if (col == null || col < 0 || col >= daysCount) return null;
        const startMin = parseClockToMin(rule.start_time);
        const endMin = parseClockToMin(rule.end_time);
        if (endMin <= startMin) return null;
        const startSlot = (startMin - dayStartMin) / slotMin;
        const endSlot = (endMin - dayStartMin) / slotMin;
        if (endSlot <= 0 || startSlot >= previewSlotCount) return null;
        return {
          key: String(rule.id),
          col,
          startSlot: Math.max(0, startSlot),
          endSlot: Math.min(previewSlotCount, endSlot),
          preference: String(rule.preference || ""),
        };
      })
      .filter(
        (
          value,
        ): value is {
          key: string;
          col: number;
          startSlot: number;
          endSlot: number;
          preference: string;
        } => Boolean(value),
      );
  }, [
    dayStartMin,
    daysCount,
    previewDayIndexByColumn,
    previewIsParticipantMode,
    previewParticipantId,
    previewParticipantRules,
    previewSlotCount,
    slotMin,
  ]);

  const previewCanChoose = useMemo(
    () =>
      previewCandidate != null &&
      selectableCandidateSet.has(Number(previewCandidate.index)) &&
      !allCandidatesFailed,
    [previewCandidate, selectableCandidateSet, allCandidatesFailed],
  );

  const openCandidatePreview = (candidateIndex: number) => {
    setPreviewMode("candidate");
    setPreviewParticipantId(null);
    setPreviewSelectedUnitId(null);
    setPreviewParticipantsOpen(false);
    setPreviewParticipantsQuery("");
    setPreviewCandidateIndex(candidateIndex);
    setCandidateDialogOpen(false);
  };

  const shiftPreviewCandidate = (direction: -1 | 1) => {
    if (orderedCandidates.length === 0) return;
    const indexes = orderedCandidates.map((candidate) => Number(candidate.index));
    const currentIndex = previewCandidate ? Number(previewCandidate.index) : indexes[0];
    const currentPosition = indexes.indexOf(currentIndex);
    const from = currentPosition >= 0 ? currentPosition : 0;
    const next = (from + direction + indexes.length) % indexes.length;
    setPreviewMode("candidate");
    setPreviewCandidateIndex(indexes[next]);
    setPreviewParticipantsOpen(false);
    setPreviewParticipantId(null);
    setPreviewSelectedUnitId(null);
    setPreviewParticipantsQuery("");
    setCandidateError(null);
  };

  const openPreviewParticipantSchedule = (participantId: string) => {
    setPreviewParticipantId(participantId);
    setPreviewMode("participant");
    setPreviewParticipantsOpen(false);
  };

  const backToCandidateMainView = () => {
    setPreviewMode("candidate");
    setPreviewParticipantId(null);
    setPreviewParticipantsOpen(false);
    setPreviewParticipantsQuery("");
  };

  const canRejectFromPreview =
    Boolean(candidateRunId) &&
    !candidateBusy &&
    Boolean(rejectReasonCode || rejectReasonOptions[0]?.code);

  const rejectFromPreview = () => {
    if (!canRejectFromPreview) return;
    const confirmed = window.confirm(t("solve_overlay.reject_all_candidates_confirm"));
    if (!confirmed) return;
    void rejectCandidates();
  };

  const publishDraftSchedule = async () => {
    if (!canPublishDraft) return;
    setIsPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/grids/${gridId}/schedule/publish/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to publish schedule (${res.status})`);
      }

      writeGridScheduleViewMode(gridId, "published");

      const latestPublished = await fetch(`/api/grids/${gridId}/published-schedule/`, {
        cache: "no-store",
      });
      if (latestPublished.ok) {
        const raw = (await latestPublished.json().catch(() => ({}))) as ScheduleResource;
        if (raw?.id != null) setCurrentSchedule(raw);
      }

      refreshGridView();
    } catch (e: any) {
      setError(e?.message || t("solve_overlay.could_not_publish_schedule"));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <>
      {/* Schedule overlay */}
      {!hideScheduleOverlay && filteredSchedule.length > 0 && (
        <div
          ref={overlayRef}
          className="pointer-events-none absolute inset-x-0"
          style={{ top: topOffset, height: bodyHeight }}
        >
          {pinError && (
            <div className="absolute left-3 top-3 z-[120] rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-600">
              {pinError}
            </div>
          )}
          {dragCollisionCards.map((item, idx) => {
            const top = item.startSlot * rowPx + 4;
            const height = Math.max(10, (item.endSlot - item.startSlot) * rowPx - 8);
            const left = `calc(${timeColPx}px + ${item.col} * ((100% - ${timeColPx}px) / ${daysCount}) + 8px)`;
            const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 16px)`;
            const borderColor = item.category === "active-unit"
              ? "rgba(71, 85, 105, 0.8)"
              : item.category === "bundle-unit"
              ? "rgba(79, 70, 229, 0.75)"
              : "rgba(14, 116, 144, 0.75)";
            const bgColor = item.category === "active-unit"
              ? "rgba(241, 245, 249, 0.96)"
              : item.category === "bundle-unit"
              ? "rgba(238, 242, 255, 0.94)"
              : "rgba(236, 254, 255, 0.94)";
            return (
              <div
                key={`${item.key}-${item.category}-${idx}`}
                className="absolute pointer-events-none z-[44] rounded-md border shadow-sm"
                style={{
                  top,
                  left,
                  width,
                  height,
                  borderColor,
                  backgroundColor: bgColor,
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center px-2 text-center leading-tight">
                  <div className="max-w-full truncate text-[10px] font-semibold text-gray-800">{item.cellName}</div>
                  {item.participantName && (
                    <div className="max-w-full truncate text-[10px] text-gray-700">Participant: {item.participantName}</div>
                  )}
                  <div className="mt-1 text-[10px] font-medium text-gray-800">{item.timeLabel}</div>
                </div>
              </div>
            );
          })}
          {dragAvailabilityZones.map((zone, index) => {
            const top = zone.startSlot * rowPx + 3;
            const height = Math.max(6, (zone.endSlot - zone.startSlot) * rowPx - 6);
            const left = `calc(${timeColPx}px + ${zone.col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
            const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
            const isPreferredStrong = zone.kind === "preferred-strong";
            const isPreferred = zone.kind === "preferred" || isPreferredStrong;
            const isImpossible = zone.kind === "impossible";
            const borderColor = isPreferredStrong
              ? "rgba(21, 128, 61, 0.62)"
              : isPreferred
              ? "rgba(22, 163, 74, 0.45)"
              : isImpossible
              ? "rgba(220, 38, 38, 0.45)"
              : "rgba(217, 119, 6, 0.45)";
            const bgColor = isPreferredStrong
              ? "rgba(21, 128, 61, 0.12)"
              : isPreferred
              ? "rgba(34, 197, 94, 0.06)"
              : isImpossible
              ? "rgba(239, 68, 68, 0.06)"
              : "rgba(245, 158, 11, 0.06)";

            return (
              <div
                key={`drag-rule-zone-${zone.col}-${zone.startSlot}-${zone.endSlot}-${zone.kind}-${index}`}
                className="absolute pointer-events-none z-[43] rounded-md border-2"
                style={{
                  top,
                  left,
                  width,
                  height,
                  borderColor,
                  backgroundColor: bgColor,
                  borderStyle: "dotted",
                }}
              />
            );
          })}
          {dragTimeRangeGuide && (
            <>
              <div
                className="absolute pointer-events-none z-[44]"
                style={{
                  top: dragTimeRangeGuide.startTop,
                  left: timeColPx,
                  width: `calc(100% - ${timeColPx}px)`,
                }}
              >
                <div className="flex items-center">
                  <span className="h-px flex-1 bg-gray-500/75" />
                  <span className="px-2 text-[10px] font-medium text-gray-600 whitespace-nowrap">
                    {dragTimeRangeGuide.name}
                  </span>
                  <span className="h-px flex-1 bg-gray-500/75" />
                </div>
              </div>
              <div
                className="absolute pointer-events-none z-[44]"
                style={{
                  top: dragTimeRangeGuide.endTop,
                  left: timeColPx,
                  width: `calc(100% - ${timeColPx}px)`,
                }}
              >
                <div className="flex items-center">
                  <span className="h-px flex-1 bg-gray-500/75" />
                  <span className="px-2 text-[10px] font-medium text-gray-600 whitespace-nowrap">
                    {dragTimeRangeGuide.name}
                  </span>
                  <span className="h-px flex-1 bg-gray-500/75" />
                </div>
              </div>
            </>
          )}
          {dragPreview && (
            <div
              className="absolute pointer-events-none z-[45]"
              style={{
                top: dragPreview.top,
                left: dragPreview.left,
                width: dragPreview.width,
                height: dragPreview.height,
              }}
            >
              <div className="relative h-full w-full rounded-md border border-dashed border-gray-400/90 bg-gray-100/20 shadow-[0_6px_18px_rgba(0,0,0,0.12)]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-2 text-[10px] font-semibold text-gray-700 whitespace-nowrap">
                    {dragPreview.cellName}
                  </span>
                </div>
              </div>
            </div>
          )}
          {filteredSchedule.map((s, idx) => {
            const col = s.day_index;
            if (col < 0 || col >= daysCount) return null;
            const sourceCellId = String(s.source_cell_id ?? s.cell_id);
            const cardKey = `${sourceCellId}-${s.day_index}-${s.start_slot}-${idx}`;
            const placementId = String(s.cell_id ?? "");
            const top = s.start_slot * rowPx;
            const height = Math.max(6, (s.end_slot - s.start_slot) * rowPx);
            const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
            const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
            const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
            const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
            const staffIds = cellStaffsById[sourceCellId] || [];
            const bg = cellColorById[sourceCellId] || "";
            const colorIdx = CELL_COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
            const useColor = Boolean(bg && colorIdx >= 0);
            const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "#1f2937";
            const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "#111827";
            const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
            const isPlacementLocked = Boolean(s.locked);
            const isCardBusy = pinBusyKey === cardKey;
            const optimisticPinned = pinOptimisticByCard[cardKey];
            const isPinnedVisual =
              typeof optimisticPinned === "boolean" ? optimisticPinned : isPlacementLocked;
            const pinColor = textDark;
            const pinTrackBg = isPinnedVisual
              ? useColor
                ? shadeHex(bg, 0.28)
                : "#cfd4dc"
              : useColor
              ? shadeHex(bg, 0.18)
              : "#dce1e8";
            const pinTrackBorder = useColor ? shadeHex(bg, -0.12) : "#8f96a3";
            const pinKnobBg = useColor ? shadeHex(bg, 0.42) : "#e7ebf1";
            const pinTrackInsetDark = useColor ? shadeHex(bg, -0.24) : "#aeb4c0";
            const pinTrackInsetLight = useColor ? shadeHex(bg, 0.1) : "#edf1f6";
            const pinKnobBorder = useColor ? shadeHex(bg, -0.08) : "#b8bfc9";
            const pinKnobTranslatePx = isPinnedVisual ? 16 : 0;
            const resolvedBundleId = resolveBundleIdForCard(s);
            const commentAnchorForCard =
              canCommentCards && currentSchedule?.id != null && resolvedBundleId != null
                ? {
                    scheduleId: currentSchedule.id,
                    sourceCellId,
                    bundleId: resolvedBundleId,
                    dayIndex: s.day_index,
                    startSlot: s.start_slot,
                    cellName,
                    timeLabel,
                  }
                : null;
            const cardCommentPlacementKey = commentAnchorForCard
              ? buildPlacementKey(
                  commentAnchorForCard.scheduleId,
                  commentAnchorForCard.sourceCellId,
                  commentAnchorForCard.bundleId,
                  commentAnchorForCard.dayIndex,
                  commentAnchorForCard.startSlot,
                )
              : null;
            const isCommentFocusedCard =
              commentsPanelOpen &&
              Boolean(cardCommentPlacementKey) &&
              cardCommentPlacementKey === selectedCommentPlacementKey;
            const isCommentHoveredCard =
              commentsPanelOpen &&
              Boolean(cardCommentPlacementKey) &&
              hoveredCommentPlacementKey === cardCommentPlacementKey;
            const assignedParticipantIds = Array.isArray(s.assigned_participants)
              ? s.assigned_participants.map(String).sort()
              : Array.isArray(s.participants)
              ? s.participants.map(String).sort()
              : [];
            let assignmentLabel = assignedParticipantIds
              .map((pid) => participantNameById[pid] || `#${pid}`)
              .join(assignedParticipantIds.length > 2 ? " + " : ", ");
            if (assignedParticipantIds.length > 0) {
              const matchedStaffId = staffIds.find((sid) => {
                const members = (staffMembersByStaffId[sid] || []).map(String).sort();
                return members.length === assignedParticipantIds.length && members.every((id, index) => id === assignedParticipantIds[index]);
              });
              if (matchedStaffId) {
                assignmentLabel = staffNameById[matchedStaffId] || `Staff ${matchedStaffId}`;
              }
            }
            const isDraggingCard = dragState?.cardKey === cardKey;
            const dragTranslateX = isDraggingCard ? dragState.clientX - dragState.offsetX : 0;
            const dragTranslateY = isDraggingCard ? dragState.clientY - dragState.offsetY : 0;
            const commentScale =
              commentsPanelOpen && !isDraggingCard
                ? isCommentFocusedCard
                  ? 1.08
                  : isCommentHoveredCard
                  ? 1.04
                  : 1
                : 1;
            const transformParts: string[] = [];
            if (isDraggingCard) transformParts.push(`translate(${dragTranslateX}px, ${dragTranslateY}px)`);
            if (commentScale !== 1) transformParts.push(`scale(${commentScale})`);
            const composedTransform = transformParts.length > 0 ? transformParts.join(" ") : undefined;
            const cardZIndex = isDraggingCard
              ? 70
              : isCommentFocusedCard
              ? 60
              : shouldDimScheduleForCommentFocus
              ? 40
              : isCommentHoveredCard
              ? 52
              : undefined;
            const durationSlots = Math.max(1, s.end_slot - s.start_slot);
            const cursorClass =
              commentsPanelOpen && commentAnchorForCard
                ? "cursor-pointer"
                : canManualEditCards
                ? isPlacementLocked
                  ? "cursor-not-allowed"
                  : isDraggingCard
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "";
            return (
              <div
                key={cardKey}
                className={`absolute pointer-events-auto ${cursorClass} ${
                  isDraggingCard ? "transition-none" : "transition-transform duration-150 ease-out"
                }`}
                style={{
                  top,
                  left,
                  width,
                  height,
                  transform: composedTransform,
                  zIndex: cardZIndex,
                  transformOrigin: "center",
                }}
                onClick={(event) => {
                  if (!commentsPanelOpen || !commentAnchorForCard) return;
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("[data-card-lock-toggle]")) return;
                  setCommentAnchor(commentAnchorForCard);
                  setCommentError(null);
                }}
                onPointerDown={(event) => {
                  if (commentsPanelOpen) return;
                  if (!canManualEditCards || isCardBusy || isPlacementLocked || !placementId) return;
                  clearLongPressTimer();
                  const cardRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const startDrag = () => {
                      setPinError(null);
                      setDragState({
                        dragType: "placement",
                        cardKey,
                        placementId,
                        sourceBundleId: resolvedBundleId ?? null,
                        sourceCellId,
                        cellName,
                        originalDayIndex: s.day_index,
                      originalStartSlot: s.start_slot,
                      durationSlots,
                      pointerId: event.pointerId,
                      clientX: event.clientX,
                      clientY: event.clientY,
                      offsetX: event.clientX,
                      offsetY: event.clientY,
                      grabOffsetX: event.clientX - cardRect.left,
                      grabOffsetY: event.clientY - cardRect.top,
                    });
                  };
                  if (isJiggleMode) {
                    startDrag();
                    return;
                  }
                  longPressTimerRef.current = window.setTimeout(() => {
                    setIsJiggleMode(true);
                    startDrag();
                    longPressTimerRef.current = null;
                  }, 360);
                }}
                onPointerUp={() => clearLongPressTimer()}
                onPointerCancel={() => clearLongPressTimer()}
                onPointerEnter={() => {
                  if (!commentsPanelOpen || !cardCommentPlacementKey) return;
                  setHoveredCommentPlacementKey(cardCommentPlacementKey);
                }}
                onPointerLeave={() => {
                  clearLongPressTimer();
                  if (!cardCommentPlacementKey) return;
                  setHoveredCommentPlacementKey((prev) =>
                    prev === cardCommentPlacementKey ? null : prev,
                  );
                }}
              >
                <div
                  className={`group relative w-full h-full rounded-md border px-2 py-2 text-[11px] ${
                    isJiggleMode && !isPlacementLocked ? "shift-jiggle" : ""
                  }`}
                  style={{
                    backgroundColor: bg || "#f3f4f6",
                    borderColor: border,
                    color: textDark,
                    animationDelay: `${(idx % 6) * 35}ms`,
                  }}
                >
                  {isCommentFocusedCard && (
                    <>
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md border-2 schedule-comment-ring"
                        style={{ borderColor: bg || border }}
                      />
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md border-2 schedule-comment-ring schedule-comment-ring-delay"
                        style={{ borderColor: bg || border }}
                      />
                    </>
                  )}
                  {canPinCards && (
                    <button
                      type="button"
                      data-card-lock-toggle
                      className={`absolute left-2 bottom-2 z-10 h-6 w-10 rounded-full border p-0 transition-all duration-200 hover:scale-[1.02] ${
                        isCardBusy ? "animate-pulse" : ""
                      }`}
                      style={{
                        color: pinColor,
                        backgroundColor: pinTrackBg,
                        borderColor: pinTrackBorder,
                        boxShadow: `inset 1.5px 1.5px 3px ${pinTrackInsetDark}, inset -1.5px -1.5px 3px ${pinTrackInsetLight}, 0 1px 3px rgba(0,0,0,0.16)`,
                        opacity: isCardBusy ? 0.92 : 1,
                      }}
                      title={isPinnedVisual ? t("solve_overlay.unlock_placement") : t("solve_overlay.lock_placement")}
                      aria-busy={isCardBusy}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!placementId) return;
                        void togglePlacementLock(placementId, isPinnedVisual, cardKey);
                      }}
                      disabled={Boolean(pinBusyKey)}
                    >
                      <span
                        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 transition-all duration-200 ${
                          isPinnedVisual ? "left-1.5" : "right-1.5"
                        }`}
                      >
                        {isPinnedVisual ? (
                          <Lock className="h-3 w-3" style={{ opacity: 0.85 }} />
                        ) : (
                          <Unlock className="h-3 w-3" style={{ opacity: 0.85 }} />
                        )}
                      </span>
                      <span
                        className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full border transition-transform duration-200 ease-out"
                        style={{
                          backgroundColor: pinKnobBg,
                          borderColor: pinKnobBorder,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.3)",
                          transform: `translateX(${pinKnobTranslatePx}px)`,
                        }}
                      />
                    </button>
                  )}
                  <div className="flex h-full flex-col items-center justify-center text-center leading-tight">
                    <div className="font-semibold" style={{ color: textLight }}>{cellName}</div>
                    {assignmentLabel && <div className="px-1">{assignmentLabel}</div>}
                    <div className="h-2" />
                    <div className="text-[10px] font-medium" style={{ color: textDark }}>{timeLabel}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {shouldDimScheduleForCommentFocus && (
            <div
              className="absolute pointer-events-none z-[46] bg-slate-200/40"
              style={{
                top: 0,
                left: timeColPx,
                width: `calc(100% - ${timeColPx}px)`,
                height: bodyHeight,
              }}
            />
          )}
        </div>
      )}

      <Dialog
        open={assignmentDialogOpen}
        onOpenChange={(open) => {
          setAssignmentDialogOpen(open);
          if (!open) {
            setPendingPlacementRequest(null);
            setAssignmentOptions([]);
            setSelectedAssignmentOptionId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[620px] z-[170]">
          <DialogHeader>
            <DialogTitle>{t("solve_overlay.choose_participants_for_placement")}</DialogTitle>
            <DialogDescription>
              {pendingPlacementRequest
                ? `${cellNameById[pendingPlacementRequest.sourceCellId] || t("format.cell_with_id", { id: pendingPlacementRequest.sourceCellId })} - ${formatSlotRange(
                    dayStartMin,
                    slotMin,
                    pendingPlacementRequest.startSlot,
                    pendingPlacementRequest.startSlot + pendingPlacementRequest.durationSlots,
                  )}`
                : t("solve_overlay.select_one_assignment_option")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
            {assignmentOptions.map((option) => {
              const selected = selectedAssignmentOptionId === option.id;
              const participantLabel = option.participantIds
                .map((participantId) => participantNameById[participantId] || `#${participantId}`)
                .join(", ");
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedAssignmentOptionId(option.id)}
                  className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-black bg-gray-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {option.source === "staff" ? t("solve_overlay.staff_option") : t("solve_overlay.tier_pools_option")}
                    </span>
                    {option.recommended && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {t("solve_overlay.recommended")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{option.label}</div>
                  <div className="mt-1 text-sm text-gray-900">{participantLabel}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              className="h-9 px-3 rounded border text-sm"
              onClick={() => {
                setAssignmentDialogOpen(false);
                setPendingPlacementRequest(null);
                setAssignmentOptions([]);
                setSelectedAssignmentOptionId(null);
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded bg-black text-white text-sm disabled:opacity-60"
              onClick={confirmSelectedAssignmentAndPlace}
              disabled={!selectedAssignmentOptionId}
            >
              {t("solve_overlay.place_cell")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {historyMode &&
        isClientReady &&
        createPortal(
          <aside
            className="fixed right-0 z-[130] w-[340px] max-w-full border-l border-gray-200 bg-gray-50"
            style={{ top: "56px", height: "calc(100dvh - 56px)" }}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <HistoryIcon className="h-4 w-4 text-gray-700" />
                  <h2 className="text-xl font-semibold text-gray-900">{t("solve_overlay.history")}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-200 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                    title={t("solve_overlay.export_selected_version")}
                    onClick={() => void downloadHistoryVersionExport()}
                    disabled={!selectedHistoryEntry || exportingHistoryVersion}
                  >
                    {exportingHistoryVersion ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-200 hover:text-black"
                    title={t("solve_overlay.close_history")}
                    onClick={closeHistoryView}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {historyPanelBusy ? (
                  <div className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("solve_overlay.loading_published_versions")}
                  </div>
                ) : publishedHistorySchedules.length === 0 ? (
                  <div className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                    {t("solve_overlay.no_published_versions")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {publishedHistorySchedules.map((entry, idx) => {
                      const isSelected = entry.key === selectedHistoryKey;
                      const versionLabel =
                        typeof entry.publishedVersion === "number"
                          ? t("solve_overlay.version_with_number", { version: entry.publishedVersion })
                          : t("solve_overlay.published_snapshot_with_index", { index: publishedHistorySchedules.length - idx });
                      const createdLabel = entry.createdAt
                        ? new Date(entry.createdAt).toLocaleString()
                        : t("solve_overlay.no_timestamp");
                      const placementsCount = Array.isArray(entry.schedule.placements)
                        ? entry.schedule.placements.length
                        : 0;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? "border-black bg-white"
                              : "border-gray-200 bg-white hover:bg-gray-100"
                          }`}
                          onClick={() => {
                            setSelectedHistoryKey(entry.key);
                            setCurrentSchedule(entry.schedule);
                            setHistoryPanelError(null);
                          }}
                        >
                          <div className="text-sm font-medium text-gray-900">{versionLabel}</div>
                          <div className="mt-1 text-xs text-gray-500">{createdLabel}</div>
                          <div className="mt-1 text-xs text-gray-600">
                            {t("solve_overlay.placements_count", { count: placementsCount })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {historyPanelError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {historyPanelError}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 px-4 py-3">
                <button
                  type="button"
                  className="h-9 w-full rounded bg-black px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void restoreHistoryVersionToDraft()}
                  disabled={role !== "supervisor" || !selectedHistoryEntry || restoringHistoryVersion}
                >
                  {restoringHistoryVersion
                    ? t("solve_overlay.restoring")
                    : t("solve_overlay.restore_draft_selected")}
                </button>
                <div className="mt-2 text-xs text-gray-500">
                  {t("solve_overlay.restore_draft_selected_help")}
                </div>
              </div>
            </div>
          </aside>,
          document.body,
        )}

      {!historyMode &&
        commentsPanelOpen &&
        isClientReady &&
        createPortal(
        <aside
          className="fixed right-0 z-[130] w-[340px] max-w-full border-l border-gray-200 bg-gray-50"
          style={{ top: "56px", height: "calc(100dvh - 56px)" }}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-700" />
                <h2 className="text-xl font-semibold text-gray-900">{t("solve_overlay.comments")}</h2>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-200 hover:text-black"
                title={t("solve_overlay.close_comments_panel")}
                onClick={() => {
                  onCommentsPanelOpenChange?.(false);
                  setCommentError(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {!canCommentCards ? (
                <div className="text-sm text-gray-500">{t("solve_overlay.comments_unavailable")}</div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">{t("solve_overlay.placement")}</label>
                    <select
                      className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm"
                      value={selectedCommentPlacementKey}
                      onChange={(event) => {
                        const selected = commentPlacementOptions.find((option) => option.key === event.target.value);
                        if (!selected) return;
                        setCommentAnchor(selected.anchor);
                        setCommentError(null);
                      }}
                      disabled={commentPlacementOptions.length === 0}
                    >
                      {commentPlacementOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                          {option.count > 0 ? ` (${option.count})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {commentsLoading ? (
                    <div className="text-sm text-gray-500">{t("solve_overlay.loading_comments")}</div>
                  ) : orderedActivePlacementComments.length === 0 ? (
                    <div className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                      {t("solve_overlay.no_comments_for_placement")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {orderedActivePlacementComments.map((c) => (
                        <div key={String(c.id)} className="rounded border border-gray-200 bg-white p-2">
                          <div className="mb-1 text-xs text-gray-500">
                            {c.author_name || t("solve_overlay.default_comment_author")}
                            {c.created_at ? ` - ${new Date(c.created_at).toLocaleString()}` : ""}
                          </div>
                          <div className="whitespace-pre-wrap text-sm text-gray-900">{c.text}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {role === "supervisor" && (
                    <div className="space-y-2 border-t border-gray-200 pt-3">
                      <textarea
                        className="min-h-[100px] w-full rounded border bg-white px-3 py-2 text-sm"
                        placeholder={t("solve_overlay.write_comment_selected")}
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        disabled={commentBusy}
                      />
                      {commentError && <div className="text-xs text-red-600">{commentError}</div>}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="h-9 rounded bg-black px-3 text-sm text-white disabled:opacity-60"
                          onClick={() => void submitPlacementComment()}
                          disabled={commentBusy || !commentDraft.trim() || !commentAnchor}
                        >
                          {commentBusy ? t("solve_overlay.saving") : t("solve_overlay.add_comment")}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>,
        document.body,
      )}
      <Dialog
        open={candidateDialogOpen}
        onOpenChange={(open) => {
          if (candidateBusy) return;
          setCandidateDialogOpen(open);
          if (!open) setCandidateError(null);
        }}
      >
        <DialogContent className="sm:max-w-[760px] z-[170]">
          <DialogHeader>
            <DialogTitle>{t("solve_overlay.choose_candidate_title")}</DialogTitle>
            <DialogDescription>
              {t("solve_overlay.choose_candidate_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {candidatePreference && (
                <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  {t("solve_overlay.candidate_preference_loaded")}
                </div>
            )}

            {orderedCandidates.length === 0 && (
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {t("solve_overlay.no_candidates_returned")}
              </div>
            )}

            {orderedCandidates.map((candidate) => {
              const idx = Number(candidate.index);
              const canChoose = selectableCandidateSet.has(idx) && !allCandidatesFailed;
              const scheduleCount = Array.isArray(candidate.schedule) ? candidate.schedule.length : 0;
              const violationCount = Array.isArray(candidate.violations) ? candidate.violations.length : 0;
              const runtimeMs =
                typeof candidate.runtime_ms === "number" && Number.isFinite(candidate.runtime_ms)
                  ? candidate.runtime_ms
                  : null;
              const objectiveValue =
                typeof candidate.objective_value === "number" && Number.isFinite(candidate.objective_value)
                  ? candidate.objective_value
                  : null;

              return (
                <div key={`candidate-${idx}`} className="rounded border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-sm font-semibold text-gray-900 underline decoration-gray-300 underline-offset-4 hover:text-black"
                          onClick={() => openCandidatePreview(idx)}
                        >
                          {t("solve_overlay.candidate_with_index", { index: idx + 1 })}
                        </button>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${candidateStatusClass(candidate.status)}`}>
                          {candidate.status || t("solve_overlay.unknown_status")}
                        </span>
                      </div>
                      {candidate.label && (
                        <div className="mt-1 text-xs text-gray-600">{candidate.label}</div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                          {t("solve_overlay.placements_count", { count: scheduleCount })}
                        </span>
                        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                          {t("solve_overlay.violations_count", { count: violationCount })}
                        </span>
                        {runtimeMs != null && (
                          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                            {t("solve_overlay.runtime_ms", { value: Math.round(runtimeMs) })}
                          </span>
                        )}
                        {objectiveValue != null && (
                          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                            {t("solve_overlay.objective_value", { value: objectiveValue.toFixed(2) })}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="h-9 px-3 rounded bg-black text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!canChoose || candidateBusy}
                      onClick={() => void chooseCandidate(idx)}
                    >
                      {candidateBusy ? t("solve_overlay.choosing") : t("solve_overlay.choose")}
                    </button>
                  </div>
                </div>
              );
            })}

            {allCandidatesFailed && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t("solve_overlay.all_candidates_failed_edit_and_run_again")}
              </div>
            )}

            <div className="rounded border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium text-gray-900">{t("solve_overlay.reject_all_candidates")}</div>
              <div className="text-xs text-gray-600">
                {t("solve_overlay.reject_this_run")}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <select
                  className="h-9 rounded border px-2 text-sm"
                  value={rejectReasonCode}
                  onChange={(e) => setRejectReasonCode(e.target.value)}
                  disabled={candidateBusy || rejectReasonOptions.length === 0}
                >
                  {rejectReasonOptions.length === 0 ? (
                    <option value="">{t("solve_overlay.no_reasons_available")}</option>
                  ) : (
                    rejectReasonOptions.map((reason) => (
                      <option key={reason.code} value={reason.code}>
                        {reason.label}
                      </option>
                    ))
                  )}
                </select>
                <input
                  className="h-9 rounded border px-3 text-sm"
                  placeholder={t("solve_overlay.optional_note")}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  disabled={candidateBusy}
                />
              </div>
              <div className="flex items-center justify-between">
                {candidateError ? (
                  <div className="text-xs text-red-600">{candidateError}</div>
                ) : (
                  <div className="text-xs text-gray-500">{t("solve_overlay.only_selectable_can_be_chosen")}</div>
                )}
                <button
                  type="button"
                  className="h-9 px-3 rounded border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={
                    candidateBusy ||
                    !candidateRunId ||
                    rejectReasonOptions.length === 0 ||
                    !rejectReasonCode
                  }
                  onClick={() => void rejectCandidates()}
                >
                  {candidateBusy ? t("solve_overlay.submitting") : t("solve_overlay.reject_all")}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {previewCandidate && (
        <div className="fixed inset-0 z-[175] bg-[#f3f4f6]">
          <div className="h-full flex flex-col">
            <div className="h-14 border-b bg-white px-4 grid grid-cols-[40px_1fr_40px] items-center">
              <button
                type="button"
                className="justify-self-start inline-flex items-center p-2 text-gray-700 hover:text-black"
                title={previewIsParticipantMode ? t("solve_overlay.back_to_candidate") : t("solve_overlay.previous_candidate")}
                onClick={() => {
                  if (previewIsParticipantMode) {
                    backToCandidateMainView();
                    return;
                  }
                  shiftPreviewCandidate(-1);
                }}
              >
                {previewIsParticipantMode ? <ArrowLeft className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>

              <div className="flex items-center justify-center gap-3">
                <div className="text-base font-bold text-gray-900">
                  {t("solve_overlay.candidate_with_index", { index: Number(previewCandidate.index) + 1 })}
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${candidateStatusClass(previewCandidate.status)}`}>
                  {previewCandidate.status || t("solve_overlay.unknown_status")}
                </span>
                {previewIsParticipantMode && (
                  <span className="text-sm font-medium text-gray-700">{previewParticipantName}</span>
                )}
              </div>

              {previewIsParticipantMode ? (
                <div className="h-9 w-9" />
              ) : (
                <button
                  type="button"
                  className="justify-self-end inline-flex items-center p-2 text-gray-700 hover:text-black"
                  title={t("solve_overlay.next_candidate")}
                  onClick={() => shiftPreviewCandidate(1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="pointer-events-none">
              <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[178] flex flex-col gap-3 pointer-events-auto">
                <button
                  type="button"
                  title={t("solve_overlay.participants")}
                  onClick={() =>
                    setPreviewParticipantsOpen((prev) => {
                      const next = !prev;
                      return next;
                    })
                  }
                  className={`w-12 h-12 rounded-full shadow-md border border-gray-200 bg-white flex items-center justify-center transition-all duration-200 ${
                    previewParticipantsOpen ? "scale-100" : "scale-75 opacity-90"
                  }`}
                >
                  <Users className={`w-5 h-5 ${previewParticipantsOpen ? "text-black" : "text-gray-500"}`} />
                </button>
              </div>

              {previewParticipantsOpen && (
                <>
                  <button
                    type="button"
                    aria-label={t("solve_overlay.close_participants_panel")}
                    className="fixed inset-0 z-[177] pointer-events-auto cursor-default"
                    onClick={() => setPreviewParticipantsOpen(false)}
                  />

                  <div className="fixed left-[84px] top-[72px] bottom-[24px] z-[178] w-[360px] rounded-xl border bg-white shadow-lg p-4 pointer-events-auto">
                    <div className="flex items-center justify-between">
                      <div className="text-base font-semibold">{t("solve_overlay.participants")}</div>
                      <button
                        type="button"
                        className="rounded p-1 text-gray-500 hover:text-black"
                        onClick={() => setPreviewParticipantsOpen(false)}
                        title={t("common.close")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{t("solve_overlay.participants_panel_help")}</div>
                    <div className="mt-3">
                      <input
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder={t("common.search")}
                        value={previewParticipantsQuery}
                        onChange={(e) => setPreviewParticipantsQuery(e.target.value)}
                      />
                    </div>
                    <div className="mt-3 h-[calc(100%-112px)] overflow-y-auto border rounded bg-white p-2 space-y-2">
                      {previewParticipantOptions.map((participant) => (
                        <button
                          key={`preview-p-${participant.id}`}
                          type="button"
                          className={`w-full rounded border px-3 py-2 text-left text-sm ${
                            previewParticipantId === participant.id && previewIsParticipantMode
                              ? "border-black bg-gray-50"
                              : "hover:bg-gray-50"
                          }`}
                          onClick={() => openPreviewParticipantSchedule(participant.id)}
                        >
                          {participant.name}
                        </button>
                      ))}
                      {previewParticipantOptions.length === 0 && (
                        <div className="rounded border px-3 py-2 text-sm text-gray-500">
                          {previewParticipantIds.length === 0
                            ? t("solve_overlay.no_assigned_participants_candidate")
                            : t("solve_overlay.no_participants_match_search")}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="fixed right-4 top-1/2 -translate-y-1/2 z-[178] pointer-events-auto flex flex-col gap-3">
                <button
                  type="button"
                  title={previewCanChoose ? t("solve_overlay.choose_this_candidate") : t("solve_overlay.candidate_not_selectable")}
                  disabled={!previewCanChoose || candidateBusy}
                  onClick={() => void chooseCandidate(Number(previewCandidate.index))}
                  className={`w-12 h-12 rounded-full shadow-md border flex items-center justify-center transition-colors ${
                    previewCanChoose && !candidateBusy
                      ? "bg-black border-gray-800"
                      : "bg-gray-700 border-gray-600 cursor-not-allowed"
                  }`}
                >
                  {candidateBusy ? (
                    <Loader2 className="w-5 h-5 text-gray-200 animate-spin" />
                  ) : (
                    <Check className="w-5 h-5 text-gray-100" />
                  )}
                </button>
                <button
                  type="button"
                  title={canRejectFromPreview ? t("solve_overlay.reject_all_candidates") : t("solve_overlay.reject_unavailable")}
                  disabled={!canRejectFromPreview}
                  onClick={rejectFromPreview}
                  className={`w-12 h-12 rounded-full shadow-md border flex items-center justify-center transition-colors ${
                    canRejectFromPreview
                      ? "bg-red-600 border-red-700 hover:bg-red-700"
                      : "bg-red-300 border-red-400 cursor-not-allowed"
                  }`}
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              <div className="w-[80%] mx-auto relative border rounded-lg bg-white overflow-hidden shadow-sm">
                <div className="grid" style={{ gridTemplateColumns: `100px repeat(${daysCount}, 1fr)` }}>
                  <div className="bg-gray-50 border-b h-12" />
                  {Array.from({ length: daysCount }).map((_, index) => (
                    <div key={`preview-day-${index}`} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
                      {dayLabels?.[index] || t("solve_overlay.day_with_index", { index: index + 1 })}
                    </div>
                  ))}
                </div>

                <div data-schedule-scroll className="relative max-h-[70vh] overflow-y-auto hide-scrollbar">
                  <div className="pointer-events-none absolute left-0 top-0 z-[2]" style={{ width: timeColPx, height: bodyHeight }}>
                    <div className="absolute inset-x-0 top-1 text-center text-xs text-gray-500">
                      {previewTimeLabel(0)}
                    </div>
                    {Array.from({ length: Math.max(0, previewSlotCount - 1) }).map((_, index) => (
                      <div
                        key={`preview-time-${index}`}
                        className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-gray-500"
                        style={{ top: (index + 1) * rowPx }}
                      >
                        {previewTimeLabel(index + 1)}
                      </div>
                    ))}
                    <div className="absolute inset-x-0 bottom-1 text-center text-xs text-gray-500">
                      {previewTimeLabel(previewSlotCount)}
                    </div>
                  </div>

                  {Array.from({ length: previewSlotCount }).map((_, rowIndex) => (
                    <div key={`preview-row-${rowIndex}`} className="grid" style={{ gridTemplateColumns: `100px repeat(${daysCount}, 1fr)` }}>
                      <div className="h-16 border-r" />
                      {Array.from({ length: daysCount }).map((_, dayIndex) => (
                        <div
                          key={`preview-cell-${rowIndex}-${dayIndex}`}
                          className={`border-b ${dayIndex < daysCount - 1 ? "border-r" : ""} h-16 hover:bg-gray-50`}
                        />
                      ))}
                    </div>
                  ))}

                  <div className="pointer-events-none absolute inset-x-0" style={{ top: 0, height: bodyHeight }}>
                    {previewAvailabilityCards.map((rule) => {
                      const top = rule.startSlot * rowPx + 3;
                      const height = Math.max(6, (rule.endSlot - rule.startSlot) * rowPx - 6);
                      const left = `calc(${timeColPx}px + ${rule.col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
                      const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
                      const isPreferred = rule.preference.toLowerCase() === "preferred";
                      const isImpossible = rule.preference.toLowerCase() === "impossible";
                      const borderColor = isPreferred
                        ? "rgba(22, 163, 74, 0.45)"
                        : isImpossible
                        ? "rgba(220, 38, 38, 0.45)"
                        : "rgba(217, 119, 6, 0.45)";
                      const bgColor = isPreferred
                        ? "rgba(34, 197, 94, 0.06)"
                        : isImpossible
                        ? "rgba(239, 68, 68, 0.06)"
                        : "rgba(245, 158, 11, 0.06)";

                      return (
                        <div
                          key={`preview-rule-${rule.key}`}
                          className="absolute rounded-md border-2"
                          style={{
                            top,
                            left,
                            width,
                            height,
                            borderColor,
                            backgroundColor: bgColor,
                            borderStyle: "dotted",
                          }}
                        />
                      );
                    })}
                    {previewScheduleForCards.map((s, idx) => {
                      const col = s.day_index;
                      if (col < 0 || col >= daysCount) return null;
                      const sourceCellId = String(s.source_cell_id ?? s.cell_id);
                      const cardKey = `${sourceCellId}-${s.day_index}-${s.start_slot}-${idx}`;
                      const rawTop = s.start_slot * rowPx;
                      const rawHeight = Math.max(6, (s.end_slot - s.start_slot) * rowPx);
                      const top = previewIsParticipantMode ? rawTop + rawHeight * 0.05 : rawTop;
                      const height = previewIsParticipantMode ? Math.max(6, rawHeight * 0.9) : rawHeight;
                      const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
                      const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
                      const cellName = cellNameById[sourceCellId] || t("format.cell_with_id", { id: sourceCellId });
                      const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
                      const staffIds = cellStaffsById[sourceCellId] || [];
                      const bg = cellColorById[sourceCellId] || "";
                      const colorIdx = CELL_COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
                      const useColor = Boolean(bg && colorIdx >= 0);
                      const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "#1f2937";
                      const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "#111827";
                      const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
                      const bundleLabel = getPreviewBundleLabel(s);
                      const assignedParticipantIds = Array.isArray(s.assigned_participants)
                        ? s.assigned_participants.map(String).sort()
                        : Array.isArray(s.participants)
                        ? s.participants.map(String).sort()
                        : [];
                      let assignmentLabel = assignedParticipantIds
                        .map((pid) => participantNameById[pid] || `#${pid}`)
                        .join(assignedParticipantIds.length > 2 ? " + " : ", ");
                      if (assignedParticipantIds.length > 0) {
                        const matchedStaffId = staffIds.find((sid) => {
                          const members = (staffMembersByStaffId[sid] || []).map(String).sort();
                          return (
                            members.length === assignedParticipantIds.length &&
                            members.every((id, index) => id === assignedParticipantIds[index])
                          );
                        });
                        if (matchedStaffId) {
                          assignmentLabel = staffNameById[matchedStaffId] || t("format.staff_with_id", { id: matchedStaffId });
                        }
                      }
                      const secondaryLabel = previewIsParticipantMode ? bundleLabel : assignmentLabel;

                      return (
                        <div key={cardKey} className="absolute pointer-events-auto" style={{ top, left, width, height }}>
                          <div
                            className="w-full h-full rounded-md border px-2 py-2 text-[11px]"
                            style={{ backgroundColor: bg || "#f3f4f6", borderColor: border, color: textDark }}
                          >
                            <div className="flex h-full flex-col items-center justify-center text-center leading-tight">
                              <div className="font-semibold" style={{ color: textLight }}>{cellName}</div>
                              {secondaryLabel && <div className="px-1">{secondaryLabel}</div>}
                              <div className="h-2" />
                              <div className="text-[10px] font-medium" style={{ color: textDark }}>{timeLabel}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {!previewIsParticipantMode && previewUnitTabs.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-[178] pointer-events-none">
                <div className="max-w-5xl mx-auto flex items-end gap-2 px-4 pt-2 pb-0 overflow-x-auto overflow-y-hidden pointer-events-auto">
                  {previewUnitTabs.map((tab) => (
                    <button
                      key={`preview-tab-${tab.id}`}
                      type="button"
                      onClick={() => setPreviewSelectedUnitId(tab.id)}
                      className={[
                        "px-4 py-2 text-sm border rounded-t-xl rounded-b-none origin-bottom",
                        "transition-colors transition-shadow transition-transform duration-150 ease-out",
                        previewSelectedUnitId === tab.id
                          ? "bg-white text-black shadow-lg border-gray-300"
                          : "bg-gray-100 text-gray-700 shadow-md hover:shadow-lg hover:bg-white hover:scale-[1.02]",
                      ].join(" ")}
                    >
                      {tab.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right-side published dock */}
      {canSolve &&
        scheduleViewMode === "published" &&
        !isJiggleMode &&
        !suppressRightDock &&
        !commentsPanelOpen &&
        canCommentCards && (
        <div
          className="fixed top-1/2 -translate-y-1/2 z-[140] pointer-events-none"
          style={{ right: "1rem" }}
        >
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              title={t("solve_overlay.comments")}
              onClick={() => onCommentsPanelOpenChange?.(true)}
              className="w-12 h-12 rounded-full shadow-md border flex items-center justify-center pointer-events-auto transition-colors bg-black border-gray-800"
            >
              <MessageSquare className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Right-side solve dock */}
      {canSolve &&
        scheduleViewMode === "draft" &&
        !isJiggleMode &&
        !suppressRightDock &&
        !commentsPanelOpen && (
        <div
          className="fixed top-1/2 -translate-y-1/2 z-[140] pointer-events-none"
          style={{ right: "1rem" }}
        >
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              title={solveDisabledReason}
              onClick={() => {
                if (canUseSolve) runSolve();
              }}
              disabled={!canUseSolve}
              className={`w-12 h-12 rounded-full shadow-md border flex items-center justify-center pointer-events-auto disabled:cursor-not-allowed transition-colors ${
                canUseSolve ? "bg-black border-gray-800" : "bg-gray-700 border-gray-600"
              }`}
              aria-disabled={!canUseSolve}
            >
              {canUseSolve ? (
                <Lightbulb className="w-5 h-5 text-amber-300" />
              ) : (
                <LightbulbOff className="w-5 h-5 text-gray-300" />
              )}
            </button>

            <button
              type="button"
              title={canPublishDraft ? t("solve_overlay.publish_draft_schedule") : t("solve_overlay.nothing_to_publish")}
              onClick={() => {
                void publishDraftSchedule();
              }}
              disabled={!canPublishDraft}
              className={`w-12 h-12 rounded-full shadow-md border flex items-center justify-center pointer-events-auto disabled:cursor-not-allowed transition-colors ${
                canPublishDraft ? "bg-black border-gray-800" : "bg-gray-700 border-gray-600"
              }`}
              aria-disabled={!canPublishDraft}
            >
              {isPublishing ? (
                <Loader2 className="w-5 h-5 text-gray-200 animate-spin" />
              ) : (
                <Upload className={`w-5 h-5 ${canPublishDraft ? "text-white" : "text-gray-300"}`} />
              )}
            </button>
          </div>
          {error && <div className="mt-2 w-48 text-xs text-red-600 text-right">{error}</div>}
          {isSolving && (
            <div className="mt-1 w-48 text-xs text-gray-600 text-right">
              {t("solve_overlay.solving")} {Math.round(solveElapsedMs / 100) / 10}s
            </div>
          )}
        </div>
      )}

      {canManualEditCards && isJiggleMode && (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[165] pointer-events-none">
          <div
            ref={deleteDropRef}
            data-jiggle-delete-drop
            className={`relative isolate w-12 h-12 rounded-full border shadow-md pointer-events-auto transition-all duration-150 flex items-center justify-center ${
              isDeleteDropActive
                ? "bg-red-600 border-red-700 scale-110"
                : "bg-white border-gray-300"
            }`}
            title={t("solve_overlay.drop_to_remove_placement")}
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

      {canManualEditCards && isJiggleMode && (
        <div className="fixed right-[-108px] top-1/2 -translate-y-1/2 z-[220] pointer-events-none" data-jiggle-unassigned>
          <div className="w-[228px] pointer-events-auto">
            <div
              className="relative h-[312px] pr-2 overflow-visible overscroll-contain"
              onWheel={(event) => {
                event.stopPropagation();
                if (unassignedCells.length <= 1) return;
                event.preventDefault();
                const dir = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
                if (!dir) return;
                setUnassignedFocusIndex((prev) =>
                  Math.max(0, Math.min(unassignedCells.length - 1, prev + dir)),
                );
              }}
            >
              {unassignedCells.map((cell, index) => {
                const distance = index - unassignedFocusIndex;
                if (Math.abs(distance) > 2) return null;
                const cardKey = `unassigned-${cell.id}`;
                const colorIdx = CELL_COLOR_OPTIONS.findIndex(
                  (color) => color.toLowerCase() === (cell.color || "").toLowerCase(),
                );
                const useColor = Boolean(cell.color && colorIdx >= 0);
                const bg = useColor ? cell.color : "#9CA3AF";
                const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "#111827";
                const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "#F9FAFB";
                const border = useColor ? shadeHex(bg, -0.33) : "#6B7280";
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
                const isDraggingCard = dragState?.cardKey === cardKey;
                const dragTranslateX = isDraggingCard ? dragState.clientX - dragState.offsetX : 0;
                const dragTranslateY = isDraggingCard ? dragState.clientY - dragState.offsetY : 0;
                const canGrabCard =
                  canManualEditCards &&
                  isJiggleMode &&
                  Boolean(cell.selectedBundleId) &&
                  cell.canGrabForCurrentTab;
                return (
                  <div
                    key={`unassigned-cell-${cell.id}`}
                    className={`absolute left-0 right-2 rounded-xl border px-3 py-2 shadow-[0_12px_18px_-14px_rgba(0,0,0,0.55)] ${
                      isDraggingCard ? "transition-none" : "transition-transform duration-150"
                    } ${
                      canGrabCard ? (isDraggingCard ? "cursor-grabbing" : "cursor-grab") : "cursor-not-allowed"
                    }`}
                    style={{
                      top: `${y - cardHeight / 2}px`,
                      height: `${cardHeight}px`,
                      backgroundColor: bg,
                      borderColor: border,
                      transform: isDraggingCard
                        ? `translate(${dragTranslateX}px, ${dragTranslateY}px) scale(1)`
                        : `scale(${scale})`,
                      opacity: canGrabCard ? opacity : Math.max(0.45, opacity * 0.6),
                      zIndex: isDraggingCard ? 320 : z,
                      willChange: isDraggingCard ? "transform" : undefined,
                    }}
                    onPointerDown={(event) => {
                      if (!canManualEditCards || !isJiggleMode) return;
                      if (!canGrabCard || cell.selectedBundleId == null) {
                        setPinError(t("solve_overlay.select_matching_unit_tab_before_placing"));
                        return;
                      }
                      clearLongPressTimer();
                      const cardRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                      setPinError(null);
                      setDragState({
                        dragType: "unassigned",
                        cardKey,
                        sourceCellId: String(cell.id),
                        sourceBundleId: cell.selectedBundleId,
                        cellName: cell.name,
                        originalDayIndex: null,
                        originalStartSlot: null,
                        durationSlots: Math.max(1, Number(cell.durationSlots) || 1),
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        offsetX: event.clientX,
                        offsetY: event.clientY,
                        grabOffsetX: event.clientX - cardRect.left,
                        grabOffsetY: event.clientY - cardRect.top,
                      });
                    }}
                    onPointerUp={() => clearLongPressTimer()}
                    onPointerCancel={() => clearLongPressTimer()}
                    onPointerLeave={() => clearLongPressTimer()}
                  >
                    <div className="flex h-full w-full items-center justify-start text-left">
                      <div className="min-w-0 w-full">
                        <div
                          className="truncate text-xs font-semibold"
                          style={{ color: textLight }}
                          title={cell.name}
                        >
                          {cell.name}
                        </div>
                        {absDistance === 0 && (
                          <div className="mt-1 text-[10px] font-medium" style={{ color: textDark }}>
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

    </>
  );
}


