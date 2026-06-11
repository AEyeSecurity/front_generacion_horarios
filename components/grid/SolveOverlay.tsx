"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  FileDown,
  History as HistoryIcon,
  Lock,
  Loader2,
  MessageSquare,
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
import RightSideDock from "@/components/layout/RightSideDock";
import GlassSurface from "@/components/ui/GlassSurface";
import ScheduleErrorCard from "@/components/grid/ScheduleErrorCard";
import BreakDialog from "@/components/grid/BreakDialog";
import PlacementCommentBubble from "@/components/grid/PlacementCommentBubble";
import type { ScheduleViewMode } from "@/lib/schedule-view";
import { useI18n } from "@/lib/use-i18n";
import { authFetch } from "@/lib/client-auth";
import { readGridTierEnabled } from "@/lib/grid-tier";

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
  schedule_id?: number | string | null;
  published_schedule_id?: number | string | null;
  status?: string;
  source_run?: number | null;
  source_candidate_index?: number | null;
  runtime_ms?: number;
  created_at?: string;
  updated_at?: string;
  placements?: Array<{
    id: number | string;
    placement_id?: number | string;
    schedule_placement_id?: number | string;
    snapshot_placement_id?: number | string | null;
    source_cell?: string | number | null;
    source_cell_id?: string | number | null;
    bundle?: string | number | null;
    bundle_id?: string | number | null;
    unit_ids?: Array<string | number>;
    units?: Array<string | number>;
    day_index: number;
    start_slot: number;
    end_slot: number;
    assigned_participants?: Array<string | number>;
    participants?: Array<string | number>;
    breaks?: Array<{ offset_min: number; duration_min: number }>;
    locked?: boolean;
    status?: string;
    reasons?: unknown[];
  }>;
};

type ScheduleRow = {
  cell_id: string;
  placement_id?: string | number;
  schedule_placement_id?: string | number;
  published_placement_id?: string | number | null;
  snapshot_placement_id?: string | number | null;
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
  breaks?: Array<{ offset_min: number; duration_min: number }>;
};

type BreakEntry = {
  offset_min: number;
  duration_min: number;
};

type ScheduleBlockage = {
  id: string;
  schedule: number;
  day_index: number;
  start_slot: number;
  end_slot: number;
  note?: string;
  unit_ids: string[];
};

type CandidateStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR";

type CandidatePreviewContext = {
  schedule_id: number | null;
  locked_placements: ScheduleRow[];
  blockages: ScheduleBlockage[];
};

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
  preview_context?: CandidatePreviewContext | null;
};

type PrecheckSeverity = "ERROR" | "WARNING" | string;

type PrecheckViolation = {
  severity?: PrecheckSeverity;
  type?: string;
  detail?: string;
  [key: string]: unknown;
};

type PrecheckResponse = {
  ok?: boolean;
  errors?: PrecheckViolation[];
  warnings?: PrecheckViolation[];
  violations?: PrecheckViolation[];
  metrics?: Record<string, unknown> | null;
  runtime_ms?: number | null;
  input_snapshot?: {
    payload?: unknown;
  } | null;
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
  preview_context?: CandidatePreviewContext;
  precheck?: PrecheckResponse;
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
  published_schedule: number | string;
  schedule?: number | string | null;
  published_placement?: number | string | null;
  schedule_placement?: number | string | null;
  source_cell_id: number | string;
  bundle: number | string | null;
  end_slot?: number | null;
  day_index: number;
  start_slot: number;
  text: string;
  created_at?: string;
  author_id?: number | string;
  author_name?: string;
};

type CommentAnchor = {
  placementId?: number | string | null;
  publishedPlacementId?: number | string | null;
  scheduleId: number;
  publishedScheduleId: number | string;
  sourceCellId: string;
  bundleId: number | string | null;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  cellName: string;
  timeLabel: string;
};

type CommentPlacementOption = {
  key: string;
  anchor: CommentAnchor;
  label: string;
  count: number;
};

type OverlapGroupMeta = {
  dayIndex: number;
  groupSize: number;
  groupPosition: number;
};

type PrecheckDialogState = {
  open: boolean;
  blocking: boolean;
  lines: string[];
};

type PinErrorCardState = { message: string };

function buildPlacementKey(
  publishedScheduleId: number | string,
  sourceCellId: number | string,
  bundleId: number | string | null,
  dayIndex: number,
  startSlot: number,
  publishedPlacementId?: number | string | null,
) {
  if (publishedPlacementId != null && String(publishedPlacementId).trim()) {
    return `published-placement|${publishedScheduleId}|${publishedPlacementId}`;
  }
  return `published|${publishedScheduleId}|${sourceCellId}|${bundleId == null ? "__no_bundle__" : bundleId}|${dayIndex}|${startSlot}`;
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

const OVERLAP_CAROUSEL_INTERVAL_MS = 2500;
const UNIT_TAB_SELECT_EVENT = "shift:unit-tab:select";
const GRID_LEFT_PANEL_STATE_EVENT = "shift:grid-left-panel-state";
const NO_UNIT_TAB_ID = "__no_unit__";
const GLOBAL_BLOCKAGE_TAB_ID = "__global__";

const parseClockToMin = (value: string) => {
  const [h, m] = String(value ?? "").split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
};

const flattenErrorText = (value: unknown): string[] => {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenErrorText(entry));
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const fromDetail = flattenErrorText(source.detail);
    if (fromDetail.length > 0) return fromDetail;
    return Object.entries(source).flatMap(([key, entry]) =>
      flattenErrorText(entry).map((message) => `${key}: ${message}`),
    );
  }
  return [];
};

const parseApiErrorMessage = (raw: string, fallback: string) => {
  const text = raw.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as unknown;
    const flattened = flattenErrorText(parsed);
    if (flattened.length > 0) return flattened.join(" ");
  } catch {
    return text;
  }
  return fallback;
};

const isLikelyHtmlResponse = (raw: string, contentType: string) => {
  const normalizedContentType = contentType.toLowerCase();
  const trimmed = raw.trim().slice(0, 120).toLowerCase();
  return (
    normalizedContentType.includes("text/html") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  );
};

const parseJsonObjectResponse = (raw: string, contentType: string, endpointFallback: string, parseFallback: string) => {
  const text = raw.trim();
  if (!text) return {} as Record<string, unknown>;
  if (isLikelyHtmlResponse(text, contentType)) {
    throw new Error(endpointFallback);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(contentType.toLowerCase().includes("json") ? parseFallback : endpointFallback);
  }
};

const stripNonFieldPrefix = (message: string) =>
  message
    .replace(/^non_field_errors:\s*/i, "")
    .replace(/^errors?:\s*/i, "")
    .trim();

const extractPlacementIdsFromMessage = (message: string): string[] => {
  const found = new Set<string>();
  const patterns = [
    /placement(?:\s*id)?\s*[:#]?\s*(\d+)/gi,
    /existing placement\s+(\d+)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(message)) !== null) {
      const id = String(match[1] ?? "").trim();
      if (id) found.add(id);
    }
  }
  return Array.from(found);
};

const normalizePrecheckViolationList = (value: unknown): PrecheckViolation[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => {
      const severityRaw = typeof entry.severity === "string" ? entry.severity : undefined;
      const typeRaw = typeof entry.type === "string" ? entry.type : undefined;
      const detailRaw = typeof entry.detail === "string" ? entry.detail : undefined;
      return {
        ...entry,
        severity: severityRaw,
        type: typeRaw,
        detail: detailRaw,
      } as PrecheckViolation;
    });
};

const normalizePrecheckResponse = (value: unknown): PrecheckResponse => {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: [], warnings: [], violations: [] };
  }
  const source = value as Record<string, unknown>;
  return {
    ok: typeof source.ok === "boolean" ? source.ok : undefined,
    errors: normalizePrecheckViolationList(source.errors),
    warnings: normalizePrecheckViolationList(source.warnings),
    violations: normalizePrecheckViolationList(source.violations),
    metrics: source.metrics && typeof source.metrics === "object" ? (source.metrics as Record<string, unknown>) : null,
    runtime_ms:
      typeof source.runtime_ms === "number" && Number.isFinite(source.runtime_ms)
        ? source.runtime_ms
        : null,
    input_snapshot:
      source.input_snapshot && typeof source.input_snapshot === "object"
        ? (source.input_snapshot as { payload?: unknown })
        : null,
  };
};

const normalizeViolationSeverity = (value: unknown) => String(value ?? "").trim().toUpperCase();

const getPrecheckDiagnostics = (precheck: PrecheckResponse | null) => {
  if (!precheck) {
    return {
      all: [] as PrecheckViolation[],
      errors: [] as PrecheckViolation[],
      warnings: [] as PrecheckViolation[],
      hasBlockingErrors: false,
    };
  }
  const allFromViolations = Array.isArray(precheck.violations) ? precheck.violations : [];
  const errorsFromField = Array.isArray(precheck.errors) ? precheck.errors : [];
  const warningsFromField = Array.isArray(precheck.warnings) ? precheck.warnings : [];
  const inferredErrors = allFromViolations.filter(
    (violation) => normalizeViolationSeverity(violation.severity) === "ERROR",
  );
  const inferredWarnings = allFromViolations.filter(
    (violation) => normalizeViolationSeverity(violation.severity) === "WARNING",
  );
  const errors = errorsFromField.length > 0 ? errorsFromField : inferredErrors;
  const warnings = warningsFromField.length > 0 ? warningsFromField : inferredWarnings;
  const all = allFromViolations.length > 0 ? allFromViolations : [...errors, ...warnings];
  const hasBlockingErrors = errors.length > 0 || precheck.ok === false;
  return { all, errors, warnings, hasBlockingErrors };
};

const formatPrecheckViolation = (violation: PrecheckViolation) => {
  const typeText = typeof violation.type === "string" && violation.type.trim() ? violation.type.trim() : "";
  const detailText = typeof violation.detail === "string" && violation.detail.trim() ? violation.detail.trim() : "";
  if (typeText && detailText) return `${typeText}: ${detailText}`;
  if (detailText) return detailText;
  if (typeText) return typeText;
  return "";
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
  onGlobalScopeMetaChange?: (meta: {
    hasUnitlessPlacements: boolean;
    hasNoUnitCells: boolean;
    blockageGlobalModeActive: boolean;
  }) => void;
  historyMode?: boolean;
  historyGridCode?: string | null;
};

type PlacementOrUnassignedDragState = {
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

type ParticipantToolDragState = {
  dragType: "participant-tool";
  cardKey: string;
  participantId: string;
  participantName: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  grabOffsetX: number;
  grabOffsetY: number;
};

type DragState = PlacementOrUnassignedDragState | ParticipantToolDragState;

type TierKey = "PRIMARY" | "SECONDARY" | "TERTIARY";

type PlacementAssignmentOption = {
  id: string;
  source: "staff" | "pool" | "open";
  participantIds: string[];
  label: string;
  recommended: boolean;
};

type PendingPlacementRequest = {
  sourceCellId: string;
  bundleId: string | number | null;
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  previewItem?: PlacementPreviewItem | null;
};

type PendingDropWhilePreviewLoading = {
  dragType: "placement" | "unassigned";
  placementId?: string;
  sourceCellId: string;
  sourceBundleId?: string | number | null;
  originalDayIndex: number | null;
  originalStartSlot: number | null;
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
};

type PlacementMode = "MOVE_ASSIGNED_CELL" | "PLACE_UNASSIGNED_CELL";

type PlacementStatus = "VALID" | "WARNING" | "INVALID";
type PlacementQuality = "RECOMMENDED" | "NEUTRAL";
type PlacementVisualKind = "BLOCKED" | "DEFAULT";
type PlacementTimeRangeKind = "INSIDE" | "SOFT_OUTSIDE" | "HARD_OUTSIDE";

type PlacementReasonType =
  | "BLOCKED_RANGE"
  | "UNIT_OVERLAP"
  | "PARTICIPANT_OVERLAP"
  | "STAFF_GROUP_MEMBER_OVERLAP"
  | "PARTICIPANT_UNAVAILABLE"
  | "STAFF_GROUP_MEMBER_UNAVAILABLE"
  | "HEADCOUNT_NOT_REACHABLE"
  | "OUTSIDE_HARD_TIME_RANGE"
  | "OUTSIDE_SOFT_TIME_RANGE"
  | "NON_PREFERRED_AVAILABILITY"
  | "PREFERRED_AVAILABILITY"
  | "OUT_OF_BOUNDS";

type CandidatePlacementRequest = {
  day_index: number;
  start_slot: number;
};

type PlacementPreviewRequest = {
  mode: PlacementMode;
  schedule_id?: number | string;
  placement_id?: number | string;
  bundle_id?: number | string;
  candidate_placements?: CandidatePlacementRequest[];
};

type PlacementReason = {
  type?: PlacementReasonType | string;
  message?: string;
  detail?: string;
  participant_id?: number | string;
  staff_group_id?: number | string;
  unit_id?: number | string;
  required_headcount?: number;
  assignable_count?: number;
  distance_slots?: number;
  [key: string]: unknown;
};

type PlacementClassification = {
  preferred_count?: number;
  non_preferred_count?: number;
  time_range_distance_slots?: number | null;
  has_hard_conflict?: boolean;
};

type AssignmentPreview = {
  headcount: number;
  assignable_count: number;
  preferred_count: number;
  non_preferred_count: number;
  requires_user_selection: boolean;
  recommended_participant_ids: Array<number | string>;
  available_staff_group_ids: Array<number | string>;
  blocked_staff_groups: unknown[];
  reason?: string;
};

type PlacementPreviewItem = {
  day_index: number;
  slot: number;
  start_slot?: number;
  end_slot?: number;
  status: PlacementStatus;
  drop_allowed: boolean;
  quality: PlacementQuality;
  visual_kind: PlacementVisualKind;
  time_range: {
    kind: PlacementTimeRangeKind;
    distance_slots: number | null;
  };
  hard_conflict?: boolean;
  reasons: PlacementReason[];
  classification: PlacementClassification;
  assignment_preview: AssignmentPreview | null;
};

type PlacementPreviewResponse = {
  cell_id: number | string;
  mode: PlacementMode;
  schedule_id?: number | string;
  schedule_revision: string;
  context_cache_hit?: boolean;
  context_cache_key?: string;
  placement_id?: number | string | null;
  bundle_id?: number | string | null;
  duration_slots: number;
  slot_map: PlacementPreviewItem[];
  placements?: PlacementPreviewItem[];
};

type ConfirmPlacementRequest = {
  mode: PlacementMode;
  schedule_id: number | string;
  placement_id?: number | string;
  bundle_id?: number | string;
  day_index: number;
  start_slot: number;
  selected_participant_ids?: Array<number | string>;
  auto_select_participants?: boolean;
};

type ConfirmPlacementResponse = {
  cell_id?: number | string;
  mode?: PlacementMode;
  schedule_id?: number | string;
  schedule_revision: string;
  placement: NonNullable<ScheduleResource["placements"]>[number];
};

type PlacementPreviewRegion = {
  day_index: number;
  start_slot: number;
  end_slot: number;
  status: PlacementStatus;
  quality: PlacementQuality;
  visual_kind: PlacementVisualKind;
  time_range_kind: PlacementTimeRangeKind;
  placements: PlacementPreviewItem[];
};

type BlockageDeleteScope = "GLOBAL" | "CURRENT_UNIT_ONLY";

type PreviewCacheKey = string;

const placementPreviewCache = new Map<PreviewCacheKey, PlacementPreviewResponse>();
const lastKnownScheduleRevisionBySchedule = new Map<string, string>();

const getScheduleRevisionCacheId = (gridId: number | string, scheduleId: number | string) =>
  `${String(gridId)}:${String(scheduleId)}`;

const normalizePreviewCachePart = (value: string | number | null | undefined) => {
  if (value == null) return "none";
  const text = String(value).trim();
  return text || "none";
};

const getVisibleCandidateHash = (candidatePlacements: CandidatePlacementRequest[]) =>
  candidatePlacements
    .map((candidate) => `${candidate.day_index}-${candidate.start_slot}`)
    .sort()
    .join("|");

const buildPlacementPreviewCacheKey = (args: {
  gridId: number | string;
  scheduleId: number | string;
  scheduleRevision?: string | null;
  cellId: number | string;
  mode: PlacementMode;
  placementId?: number | string | null;
  bundleId?: number | string | null;
  candidatePlacements: CandidatePlacementRequest[];
}): PreviewCacheKey =>
  [
    "placement-preview",
    args.gridId,
    args.scheduleId,
    args.scheduleRevision || "unknown",
    args.cellId,
    args.mode,
    normalizePreviewCachePart(args.placementId),
    normalizePreviewCachePart(args.bundleId),
    getVisibleCandidateHash(args.candidatePlacements),
  ].join(":");

const invalidatePlacementPreviewCacheForSchedule = (
  gridId: number | string,
  scheduleId: number | string | null | undefined,
) => {
  if (scheduleId == null) return;
  const prefix = `placement-preview:${String(gridId)}:${String(scheduleId)}:`;
  for (const key of Array.from(placementPreviewCache.keys())) {
    if (key.startsWith(prefix)) placementPreviewCache.delete(key);
  }
};

type BlockageDraft = {
  pointerId: number;
  anchorDayIndex: number;
  anchorSlot: number;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
};

type BlockageDragState = {
  pointerId: number;
  blockageId: string;
  mode: "move" | "resize-start" | "resize-end";
  durationSlots: number;
  grabOffsetY: number;
  originalBlockage: ScheduleBlockage;
};

type BreakDialogState = {
  open: boolean;
  placementId: string | null;
  sourceCellId: string | null;
  startSlot: number;
  endSlot: number;
  breaks: BreakEntry[];
};

type EditToolMode = "none" | "break" | "blockage" | "unassigned" | "participants";

type PendingCandidateRunSnapshot = {
  run_id: string;
  candidates: SolveCandidate[];
  selectable_candidate_indexes: number[];
  all_candidates_failed: boolean;
  preference: Record<string, unknown> | null;
  reject_reason_options: CandidateReasonOption[];
  preview_context: CandidatePreviewContext | null;
  pending_solve_signature: string | null;
  preview_candidate_index: number | null;
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
  onGlobalScopeMetaChange,
  historyMode = false,
  historyGridCode = null,
}: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [hasCells, setHasCells] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solveStartedAt, setSolveStartedAt] = useState<number | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<ScheduleResource | null>(null);
  const activePublishedScheduleId =
    scheduleViewMode === "published"
      ? currentSchedule?.published_schedule_id ?? currentSchedule?.id ?? null
      : null;
  const [error, setError] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<PrecheckResponse | null>(null);
  const [precheckBusy, setPrecheckBusy] = useState(false);
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [precheckSignature, setPrecheckSignature] = useState<string | null>(null);
  const [precheckRefreshTick, setPrecheckRefreshTick] = useState(0);
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
  const [cellSplitPartSlotsById, setCellSplitPartSlotsById] = useState<Record<string, number[]>>({});
  const [cellRequiredPlacementsById, setCellRequiredPlacementsById] = useState<Record<string, number>>({});
  const [bundleUnitsById, setBundleUnitsById] = useState<Record<string, string[]>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [unitNameById, setUnitNameById] = useState<Record<string, string>>({});
  const [timeRangeMetaById, setTimeRangeMetaById] = useState<
    Record<string, { name: string; startSlot: number; endSlot: number }>
  >({});
  const [previewParticipantRules, setPreviewParticipantRules] = useState<AvailabilityRule[]>([]);
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinErrorCard, setPinErrorCard] = useState<PinErrorCardState | null>(null);
  const [pinErrorCardAnchor, setPinErrorCardAnchor] = useState<{ left: number; top: number } | null>(null);
  const [collisionBeatingPlacementId, setCollisionBeatingPlacementId] = useState<string | null>(null);
  const [placementComments, setPlacementComments] = useState<PlacementComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const [hoveredCommentPlacementKey, setHoveredCommentPlacementKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
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
  const [candidatePreviewContext, setCandidatePreviewContext] = useState<CandidatePreviewContext | null>(null);
  const [previewCandidateIndex, setPreviewCandidateIndex] = useState<number | null>(null);
  const [previewParticipantsOpen, setPreviewParticipantsOpen] = useState(false);
  const [previewParticipantId, setPreviewParticipantId] = useState<string | null>(null);
  const [previewSelectedUnitId, setPreviewSelectedUnitId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"candidate" | "participant">("candidate");
  const [previewParticipantsQuery, setPreviewParticipantsQuery] = useState("");
  const [pinOptimisticByCard, setPinOptimisticByCard] = useState<Record<string, boolean>>({});
  const [hoveredJiggleCardKey, setHoveredJiggleCardKey] = useState<string | null>(null);
  const [isJiggleMode, setIsJiggleMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [participantDragHoverPlacementId, setParticipantDragHoverPlacementId] = useState<string | null>(null);
  const [participantDropGhost, setParticipantDropGhost] = useState<{
    token: number;
    mode: "valid" | "invalid";
    phase: "start" | "rebound" | "end";
    x: number;
    y: number;
    participantId: string;
    participantName: string;
  } | null>(null);
  const [isDeleteDropActive, setIsDeleteDropActive] = useState(false);
  const [editToolMode, setEditToolMode] = useState<EditToolMode>("none");
  const [breakDialogState, setBreakDialogState] = useState<BreakDialogState>({
    open: false,
    placementId: null,
    sourceCellId: null,
    startSlot: 0,
    endSlot: 0,
    breaks: [],
  });
  const [breakDraftDurationMin, setBreakDraftDurationMin] = useState<number>(5);
  const [breakDialogBusy, setBreakDialogBusy] = useState(false);
  const [breakDialogError, setBreakDialogError] = useState<string | null>(null);
  const [scheduleBlockages, setScheduleBlockages] = useState<ScheduleBlockage[]>([]);
  const [blockagesBusy, setBlockagesBusy] = useState(false);
  const [blockagesRefreshTick, setBlockagesRefreshTick] = useState(0);
  const [blockageDraft, setBlockageDraft] = useState<BlockageDraft | null>(null);
  const [blockageDragState, setBlockageDragState] = useState<BlockageDragState | null>(null);
  const [pendingBlockageDelete, setPendingBlockageDelete] = useState<{
    blockage: ScheduleBlockage;
    unitId: string;
  } | null>(null);
  const [blockageDeleteBusy, setBlockageDeleteBusy] = useState(false);
  const [cellAllowOverstaffById, setCellAllowOverstaffById] = useState<Record<string, boolean>>({});
  const [gridAllowsOverstaffing, setGridAllowsOverstaffing] = useState(false);
  const [gridTierEnabled, setGridTierEnabled] = useState(true);
  const [overlapCarouselPage, setOverlapCarouselPage] = useState(0);
  const [overlapCarouselPaused, setOverlapCarouselPaused] = useState(false);
  const [previewOverlapCarouselPage, setPreviewOverlapCarouselPage] = useState(0);
  const [previewOverlapCarouselPaused, setPreviewOverlapCarouselPaused] = useState(false);
  const [mainCarouselCenterX, setMainCarouselCenterX] = useState<number | null>(null);
  const [previewCarouselCenterX, setPreviewCarouselCenterX] = useState<number | null>(null);
  const [precheckDialogState, setPrecheckDialogState] = useState<PrecheckDialogState>({
    open: false,
    blocking: false,
    lines: [],
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState<PlacementAssignmentOption[]>([]);
  const [selectedAssignmentOptionId, setSelectedAssignmentOptionId] = useState<string | null>(null);
  const [pendingPlacementRequest, setPendingPlacementRequest] = useState<PendingPlacementRequest | null>(null);
  const [placementPreviewBySlot, setPlacementPreviewBySlot] = useState<Record<string, PlacementPreviewItem>>({});
  const [placementPreviewDurationSlots, setPlacementPreviewDurationSlots] = useState<number | null>(null);
  const [backendPreviewActive, setBackendPreviewActive] = useState(false);
  const [placementPreviewBusy, setPlacementPreviewBusy] = useState(false);
  const [blockageMutationBusy, setBlockageMutationBusy] = useState(false);
  const [pendingDropWhilePreviewLoading, setPendingDropWhilePreviewLoading] =
    useState<PendingDropWhilePreviewLoading | null>(null);
  const [placementPreviewMaskRect, setPlacementPreviewMaskRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [, setPlacementPreviewError] = useState<string | null>(null);
  const [, setLastAssignedParticipantsByCellBundle] = useState<Record<string, string[]>>({});
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
  const [blockagesBusyAnchor, setBlockagesBusyAnchor] = useState<{ left: number; top: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const participantDropGhostTimersRef = useRef<number[]>([]);
  const participantDropGhostTokenRef = useRef(0);
  const placementPreviewRequestRef = useRef(0);
  const placementPreviewVisibleRequestRef = useRef<number | null>(null);
  const optimisticPlacementCounterRef = useRef(0);
  const hasAttemptedDraftBootstrapRef = useRef(false);
  const commentManuallyDeselectedRef = useRef(false);
  const lastHandledPinErrorRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const mainScheduleScrollRef = useRef<HTMLElement | null>(null);
  const previewScheduleScrollRef = useRef<HTMLDivElement | null>(null);
  const rightDockCloseSignalRef = useRef(0);
  const lastPlacementAttemptRef = useRef<{
    sourceCellId: string;
    dayIndex: number;
    startSlot: number;
    endSlot: number;
    participantIds?: string[];
  } | null>(null);
  const [rightDockCloseSignal, setRightDockCloseSignal] = useState(0);

  const closeRightDockFan = useCallback(() => {
    rightDockCloseSignalRef.current += 1;
    setRightDockCloseSignal(rightDockCloseSignalRef.current);
  }, []);

  const canSolve = role === "supervisor" && !historyMode;
  const notifyDraftMutation = useCallback(() => {
    if (historyMode) return;
    if (scheduleViewMode !== "draft") return;

    invalidatePlacementPreviewCacheForSchedule(gridId, currentSchedule?.id);
    onDraftMutated?.();
  }, [currentSchedule?.id, gridId, historyMode, onDraftMutated, scheduleViewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 460px)");
    const sync = () => setIsNarrowMobile(media.matches);
    sync();
    const onChange = () => sync();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authFetch("/api/whoami", { cache: "no-store" });
        if (!response.ok) return;
        const me = await response.json().catch(() => null);
        const id = me?.id;
        if (active && id != null) setCurrentUserId(String(id));
      } catch {
        if (active) setCurrentUserId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLeftPanelState = (event: Event) => {
      const custom = event as CustomEvent<{ gridId?: string; open?: boolean }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      setLeftPanelOpen(Boolean(custom.detail?.open));
    };
    window.addEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
    return () => window.removeEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
  }, [gridId]);
  const solveSignatureStorageKey = `grid:${gridId}:last-solve-signature`;
  const pendingCandidateStorageKey = `grid:${gridId}:pending-candidate-run`;

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const persistPendingCandidateRun = useCallback(
    (snapshot: PendingCandidateRunSnapshot | null) => {
      if (typeof window === "undefined") return;
      if (!snapshot) {
        window.localStorage.removeItem(pendingCandidateStorageKey);
        return;
      }
      window.localStorage.setItem(pendingCandidateStorageKey, JSON.stringify(snapshot));
    },
    [pendingCandidateStorageKey],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canSolve || scheduleViewMode !== "draft") return;
    try {
      const raw = window.localStorage.getItem(pendingCandidateStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PendingCandidateRunSnapshot>;
      const runId = typeof parsed.run_id === "string" ? parsed.run_id : "";
      if (!runId) {
        window.localStorage.removeItem(pendingCandidateStorageKey);
        return;
      }
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
      if (candidates.length === 0) {
        window.localStorage.removeItem(pendingCandidateStorageKey);
        return;
      }
      setCandidateRunId(runId);
      setSolveCandidates(candidates);
      setSelectableCandidateIndexes(
        Array.isArray(parsed.selectable_candidate_indexes)
          ? parsed.selectable_candidate_indexes.map((idx) => Number(idx)).filter((idx) => Number.isFinite(idx))
          : [],
      );
      setAllCandidatesFailed(Boolean(parsed.all_candidates_failed));
      setCandidatePreference(
        parsed.preference && typeof parsed.preference === "object"
          ? (parsed.preference as Record<string, unknown>)
          : null,
      );
      const reasons = Array.isArray(parsed.reject_reason_options)
        ? parsed.reject_reason_options.filter(
            (item): item is CandidateReasonOption =>
              Boolean(item && typeof item.code === "string" && typeof item.label === "string"),
          )
        : [];
      setRejectReasonOptions(reasons);
      setRejectReasonCode(reasons[0]?.code ?? "");
      setCandidatePreviewContext(
        parsed.preview_context && typeof parsed.preview_context === "object"
          ? (parsed.preview_context as CandidatePreviewContext)
          : null,
      );
      setPendingSolveSignature(
        typeof parsed.pending_solve_signature === "string" ? parsed.pending_solve_signature : null,
      );
      const previewIdx = Number(parsed.preview_candidate_index);
      setPreviewCandidateIndex(Number.isFinite(previewIdx) ? previewIdx : Number(candidates[0]?.index ?? 0));
    } catch {
      window.localStorage.removeItem(pendingCandidateStorageKey);
    }
  }, [canSolve, pendingCandidateStorageKey, scheduleViewMode]);

  useEffect(() => {
    if (!canSolve) return;
    const key = getGridSolverSettingsKey(gridId);
    const refresh = () => {
      setPrecheckRefreshTick((prev) => prev + 1);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [canSolve, gridId]);

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

  const toApiEntityId = (value: string | number | null | undefined): string | number | undefined => {
    if (value == null) return undefined;
    const text = String(value).trim();
    if (!text) return undefined;
    return /^\d+$/.test(text) ? Number(text) : text;
  };

  const getPlacementPreviewSlotKey = (dayIndex: number, startSlot: number) =>
    `${Math.max(0, Math.round(dayIndex))}:${Math.max(0, Math.round(startSlot))}`;

  const getPlacementIdentity = (placement: unknown): string | null => {
    if (!placement || typeof placement !== "object") return null;
    const source = placement as Record<string, unknown>;
    const id =
      readEntityId(source.placement_id) ??
      readEntityId(source.placementId) ??
      readEntityId(source.schedule_placement_id) ??
      readEntityId(source.schedulePlacementId) ??
      readEntityId(source.schedule_placement) ??
      readEntityId(source.id);
    return id == null ? null : String(id);
  };

  const getDropValidation = (
    dayIndex: number,
    startSlot: number,
    durationSlots: number,
    slotStatusMap: Record<string, PlacementPreviewItem>,
  ):
    | { canDrop: true; occupied: PlacementPreviewItem[]; startItem: PlacementPreviewItem | null }
    | { canDrop: false; reasonItem: PlacementPreviewItem | null } => {
    const normalizedDuration = Math.max(1, Math.round(durationSlots) || 1);
    const occupied: PlacementPreviewItem[] = [];
    for (let slot = startSlot; slot < startSlot + normalizedDuration; slot += 1) {
      const item = slotStatusMap[getPlacementPreviewSlotKey(dayIndex, slot)] ?? null;
      if (!item) return { canDrop: false, reasonItem: null };
      occupied.push(item);
      if (!item.drop_allowed) {
        return { canDrop: false, reasonItem: item };
      }
    }
    return {
      canDrop: true,
      occupied,
      startItem: occupied[0] ?? null,
    };
  };

  const normalizePlacementStatus = (value: unknown): PlacementStatus => {
    const status = String(value ?? "").trim().toUpperCase();
    if (status === "INVALID" || status === "WARNING" || status === "VALID") {
      return status;
    }
    return "VALID";
  };

  const normalizePlacementQuality = (value: unknown, rawStatus: string): PlacementQuality => {
    const quality = String(value ?? "").trim().toUpperCase();
    if (quality === "RECOMMENDED") return "RECOMMENDED";
    if (rawStatus === "RECOMMENDED") return "RECOMMENDED";
    return "NEUTRAL";
  };

  const normalizePlacementVisualKind = (value: unknown): PlacementVisualKind => {
    const visualKind = String(value ?? "").trim().toUpperCase();
    return visualKind === "BLOCKED" ? "BLOCKED" : "DEFAULT";
  };

  const normalizePlacementTimeRangeKind = (value: unknown, status: PlacementStatus): PlacementTimeRangeKind => {
    const kind = String(value ?? "").trim().toUpperCase();
    if (kind === "SOFT_OUTSIDE" || kind === "HARD_OUTSIDE" || kind === "INSIDE") return kind;
    return status === "WARNING" ? "SOFT_OUTSIDE" : "INSIDE";
  };

  const normalizePlacementReason = (value: unknown): PlacementReason => {
    if (typeof value === "string") {
      return { message: value };
    }
    if (value && typeof value === "object") {
      return value as PlacementReason;
    }
    return { message: String(value ?? "") };
  };

  const normalizeAssignmentPreview = (value: unknown): AssignmentPreview | null => {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    return {
      headcount: Math.max(0, Number(source.headcount) || 0),
      assignable_count: Math.max(0, Number(source.assignable_count) || 0),
      preferred_count: Math.max(0, Number(source.preferred_count) || 0),
      non_preferred_count: Math.max(0, Number(source.non_preferred_count) || 0),
      requires_user_selection: Boolean(source.requires_user_selection),
      recommended_participant_ids: normalizeIdArray(source.recommended_participant_ids),
      available_staff_group_ids: normalizeIdArray(source.available_staff_group_ids),
      blocked_staff_groups: Array.isArray(source.blocked_staff_groups) ? source.blocked_staff_groups : [],
      reason: typeof source.reason === "string" ? source.reason : undefined,
    };
  };

  const normalizePlacementPreviewItem = (value: unknown): PlacementPreviewItem | null => {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const dayIndex = Number(source.day_index);
    const slot = Number(source.slot ?? source.start_slot);
    const endSlot = Number(source.end_slot);
    if (!Number.isFinite(dayIndex) || !Number.isFinite(slot)) return null;
    const normalizedSlot = Math.max(0, Math.round(slot));
    const normalizedEnd = Number.isFinite(endSlot)
      ? Math.max(normalizedSlot + 1, Math.round(endSlot))
      : normalizedSlot + 1;
    const classificationSource =
      source.classification && typeof source.classification === "object"
        ? (source.classification as Record<string, unknown>)
        : {};
    const distance = Number(classificationSource.time_range_distance_slots);
    const normalizedReasons = Array.isArray(source.reasons) ? source.reasons.map(normalizePlacementReason) : [];
    const rawStatus = String(source.status ?? "").trim().toUpperCase();
    const hasBlockedReason = normalizedReasons.some(
      (reason) => String(reason.type ?? "").trim().toUpperCase() === "BLOCKED_RANGE",
    );
    const inferredVisualKind =
      source.visual_kind ?? (rawStatus === "BLOCKED" || hasBlockedReason ? "BLOCKED" : "DEFAULT");
    const normalizedStatus =
      rawStatus === "BLOCKED"
        ? "INVALID"
        : rawStatus === "RECOMMENDED" || rawStatus === "NEUTRAL"
        ? "VALID"
        : normalizePlacementStatus(source.status);
    const timeRangeSource =
      source.time_range && typeof source.time_range === "object"
        ? (source.time_range as Record<string, unknown>)
        : {};
    const timeRangeDistance = Number(timeRangeSource.distance_slots);
    const fallbackDistance = Number(classificationSource.time_range_distance_slots);
    const dropAllowed =
      typeof source.drop_allowed === "boolean" ? source.drop_allowed : normalizedStatus !== "INVALID";
    return {
      day_index: Math.max(0, Math.round(dayIndex)),
      slot: normalizedSlot,
      start_slot: normalizedSlot,
      end_slot: normalizedEnd,
      status: normalizedStatus,
      drop_allowed: dropAllowed,
      quality: normalizePlacementQuality(source.quality, rawStatus),
      visual_kind: normalizePlacementVisualKind(inferredVisualKind),
      time_range: {
        kind: normalizePlacementTimeRangeKind(timeRangeSource.kind, normalizedStatus),
        distance_slots: Number.isFinite(timeRangeDistance)
          ? timeRangeDistance
          : Number.isFinite(fallbackDistance)
          ? fallbackDistance
          : null,
      },
      hard_conflict: Boolean(source.hard_conflict),
      reasons: normalizedReasons,
      classification: {
        preferred_count: Math.max(0, Number(classificationSource.preferred_count) || 0),
        non_preferred_count: Math.max(0, Number(classificationSource.non_preferred_count) || 0),
        time_range_distance_slots: Number.isFinite(distance) ? distance : null,
        has_hard_conflict: Boolean(classificationSource.has_hard_conflict),
      },
      assignment_preview: normalizeAssignmentPreview(source.assignment_preview),
    };
  };

  const formatPlacementReasonMessage = (reason: PlacementReason) => {
    const explicit = typeof reason.message === "string" && reason.message.trim()
      ? reason.message.trim()
      : typeof reason.detail === "string" && reason.detail.trim()
      ? reason.detail.trim()
      : "";
    if (explicit) return explicit;
    const typeText = typeof reason.type === "string" ? reason.type.replace(/_/g, " ").toLowerCase() : "";
    const required = Number(reason.required_headcount);
    const assignable = Number(reason.assignable_count);
    if (Number.isFinite(required) && Number.isFinite(assignable)) {
      return `${typeText || "headcount"}: ${assignable}/${required}`;
    }
    const distance = Number(reason.distance_slots);
    if (Number.isFinite(distance) && typeText) {
      return `${typeText}: ${distance} slots`;
    }
    return typeText || t("solve_overlay.no_reasons_available");
  };

  const formatPlacementPreviewMessage = (item: PlacementPreviewItem | null | undefined, fallback: string) => {
    if (!item) return fallback;
    const reasonMessages = item.reasons
      .map(formatPlacementReasonMessage)
      .filter((message) => message.trim().length > 0);
    if (reasonMessages.length > 0) return reasonMessages.join(" ");
    const assignmentReason = item.assignment_preview?.reason;
    if (assignmentReason && assignmentReason.trim()) return assignmentReason.trim();
    const distance = item.classification.time_range_distance_slots;
    if (typeof distance === "number" && distance > 0) {
      return t("solve_overlay.placement_preview_distance_warning", { distance });
    }
    return fallback;
  };

  const getBundleUnitIds = (bundle: unknown): string[] => {
    if (!bundle || typeof bundle !== "object") return [];
    const source = bundle as Record<string, unknown>;
    const candidates = [
      source.units,
      source.unit_ids,
      source.unitIds,
      source.category_values,
      source.categoryValues,
      source.values,
    ];
    for (const candidate of candidates) {
      const ids = normalizeIdArray(candidate);
      if (ids.length > 0) return ids;
    }
    return [];
  };

  const normalizeUnitScopeIds = (value: unknown): string[] =>
    normalizeIdArray(value).filter((id, idx, arr) => arr.indexOf(id) === idx);

  const toApiId = (value: string) => (/^\d+$/.test(value) ? Number(value) : value);

  const slotCount = useMemo(() => Math.max(0, Math.round(bodyHeight / rowPx)), [bodyHeight, rowPx]);

  const clampSlotRange = useCallback(
    (startSlot: number, endSlot: number) => {
      const safeStart = Math.max(0, Math.min(slotCount - 1, Math.round(startSlot)));
      const safeEnd = Math.max(safeStart + 1, Math.min(slotCount, Math.round(endSlot)));
      return { startSlot: safeStart, endSlot: safeEnd };
    },
    [slotCount],
  );

  const getGridPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return null;
      const rect = overlay.getBoundingClientRect();
      const dayWidth = (rect.width - timeColPx) / daysCount;
      if (!Number.isFinite(dayWidth) || dayWidth <= 0) return null;
      const x = clientX - rect.left - timeColPx;
      const y = clientY - rect.top;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const dayIndex = Math.max(0, Math.min(daysCount - 1, Math.floor(x / dayWidth)));
      const slot = Math.max(0, Math.min(slotCount - 1, Math.floor(y / rowPx)));
      return { dayIndex, slot };
    },
    [daysCount, rowPx, slotCount, timeColPx],
  );

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

  const normalizeScheduleRowFromAny = (raw: unknown, fallbackId: string): ScheduleRow | null => {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const dayIndex = Number(source.day_index);
    const startSlot = Number(source.start_slot);
    const endSlot = Number(source.end_slot);
    if (!Number.isFinite(dayIndex) || !Number.isFinite(startSlot) || !Number.isFinite(endSlot)) return null;
    if (endSlot <= startSlot) return null;

    const placementId =
      readEntityId(source.placement_id) ??
      readEntityId(source.placementId) ??
      readEntityId(source.schedule_placement_id) ??
      readEntityId(source.schedulePlacementId) ??
      readEntityId(source.schedule_placement) ??
      readEntityId(source.id) ??
      readEntityId(source.cell_id) ??
      fallbackId;
    const sourceCellId =
      readEntityId(source.source_cell_id) ??
      readEntityId(source.source_cell) ??
      readEntityId(source.cell) ??
      readEntityId(source.cell_id) ??
      fallbackId;
    const bundleId = readEntityId(source.bundle_id) ?? readEntityId(source.bundle);
    const assignedParticipants = normalizeIdArray(
      source.assigned_participants ?? source.participants,
    );
    const unitIds = normalizeIdArray(source.units ?? source.unit_ids);
    const breaks = Array.isArray(source.breaks)
      ? source.breaks
          .map((entry) => {
            const offsetMin = Number((entry as { offset_min?: unknown })?.offset_min);
            const durationMin = Number((entry as { duration_min?: unknown })?.duration_min);
            if (!Number.isFinite(offsetMin) || !Number.isFinite(durationMin)) return null;
            if (durationMin <= 0) return null;
            return {
              offset_min: Math.max(0, Math.round(offsetMin)),
              duration_min: Math.max(5, Math.round(durationMin)),
            };
          })
          .filter((entry): entry is BreakEntry => Boolean(entry))
      : [];

    return {
      cell_id: String(placementId),
      placement_id: placementId,
      schedule_placement_id: placementId,
      source_cell_id: sourceCellId,
      bundle_id: bundleId,
      bundle: bundleId,
      day_index: Math.max(0, Math.round(dayIndex)),
      start_slot: Math.max(0, Math.round(startSlot)),
      end_slot: Math.max(1, Math.round(endSlot)),
      assigned_participants: assignedParticipants,
      participants: assignedParticipants,
      units: unitIds,
      locked: Boolean(source.locked),
      breaks,
    };
  };

  const normalizeScheduleBlockageFromAny = (raw: unknown, fallbackId: string): ScheduleBlockage | null => {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const dayIndex = Number(source.day_index);
    const startSlot = Number(source.start_slot);
    const endSlot = Number(source.end_slot);
    if (!Number.isFinite(dayIndex) || !Number.isFinite(startSlot) || !Number.isFinite(endSlot)) return null;
    if (endSlot <= startSlot) return null;
    const scheduleId = Number(readEntityId(source.schedule) ?? readEntityId(source.schedule_id) ?? 0);
    return {
      id: String(readEntityId(source.id) ?? fallbackId),
      schedule: Number.isFinite(scheduleId) ? scheduleId : 0,
      day_index: Math.max(0, Math.round(dayIndex)),
      start_slot: Math.max(0, Math.round(startSlot)),
      end_slot: Math.max(1, Math.round(endSlot)),
      note: typeof source.note === "string" ? source.note : undefined,
      unit_ids: normalizeUnitScopeIds(source.unit_ids),
    };
  };

  const normalizeCandidatePreviewContext = (raw: unknown): CandidatePreviewContext | null => {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const scheduleIdRaw = Number(readEntityId(source.schedule_id) ?? readEntityId(source.schedule) ?? NaN);
    const lockedPlacementsRaw = Array.isArray(source.locked_placements) ? source.locked_placements : [];
    const blockagesRaw = Array.isArray(source.blockages) ? source.blockages : [];
    return {
      schedule_id: Number.isFinite(scheduleIdRaw) ? scheduleIdRaw : null,
      locked_placements: lockedPlacementsRaw
        .map((entry, index) => normalizeScheduleRowFromAny(entry, `locked-${index}`))
        .filter((entry): entry is ScheduleRow => Boolean(entry)),
      blockages: blockagesRaw
        .map((entry, index) => normalizeScheduleBlockageFromAny(entry, `preview-blockage-${index}`))
        .filter((entry): entry is ScheduleBlockage => Boolean(entry)),
    };
  };

  const normalizeSolveCandidate = (raw: unknown, fallbackIndex: number): SolveCandidate | null => {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const parsedIndex = Number(source.index ?? source.candidate_index ?? fallbackIndex);
    if (!Number.isFinite(parsedIndex)) return null;
    const scheduleRaw = Array.isArray(source.schedule)
      ? source.schedule
      : Array.isArray(source.placements)
      ? source.placements
      : [];
    const normalizedSchedule = scheduleRaw
      .map((entry, index) => normalizeScheduleRowFromAny(entry, `candidate-${parsedIndex}-${index}`))
      .filter((entry): entry is ScheduleRow => Boolean(entry));

    return {
      index: parsedIndex,
      label: typeof source.label === "string" ? source.label : undefined,
      status: typeof source.status === "string" ? (source.status as CandidateStatus) : undefined,
      objective_value:
        typeof source.objective_value === "number" && Number.isFinite(source.objective_value)
          ? source.objective_value
          : null,
      runtime_ms:
        typeof source.runtime_ms === "number" && Number.isFinite(source.runtime_ms)
          ? source.runtime_ms
          : null,
      schedule: normalizedSchedule,
      violations: Array.isArray(source.violations) ? source.violations : [],
      solver_stats:
        source.solver_stats && typeof source.solver_stats === "object"
          ? (source.solver_stats as Record<string, unknown>)
          : undefined,
      weights:
        source.weights && typeof source.weights === "object"
          ? (source.weights as Record<string, unknown>)
          : undefined,
      delta:
        source.delta && typeof source.delta === "object"
          ? (source.delta as Record<string, unknown>)
          : undefined,
      preview_context: normalizeCandidatePreviewContext(source.preview_context),
    };
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
    const scheduleCandidate =
      (context?.schedule ??
        context?.published_schedule ??
        context?.latest ??
        null) as Record<string, unknown> | null;
    const rawSchedulePlacements = Array.isArray(scheduleCandidate?.placements)
      ? scheduleCandidate.placements
      : Array.isArray(scheduleCandidate?.schedule)
      ? scheduleCandidate.schedule
      : [];
    const rawScheduleBlockages = Array.isArray(scheduleCandidate?.blockages)
      ? scheduleCandidate.blockages
      : Array.isArray(context?.blockages)
      ? (context?.blockages as unknown[])
      : [];
    const schedulePlacements = rawSchedulePlacements
      .map((entry, index) => normalizeScheduleRowFromAny(entry, `signature-placement-${index}`))
      .filter((entry): entry is ScheduleRow => Boolean(entry));
    const scheduleBlockages = rawScheduleBlockages
      .map((entry, index) => normalizeScheduleBlockageFromAny(entry, `signature-blockage-${index}`))
      .filter((entry): entry is ScheduleBlockage => Boolean(entry));
    const scheduleUpdatedAt = Math.max(
      parseTimestamp(scheduleCandidate?.updated_at),
      parseTimestamp(scheduleCandidate?.created_at),
    );

    const maxUpdatedAt = Math.max(
      getMaxUpdatedAt(cells),
      getMaxUpdatedAt(participants),
      getMaxUpdatedAt(timeRanges),
      getMaxUpdatedAt(bundles),
      getMaxUpdatedAt(staffs),
      getMaxUpdatedAt(staffMembers),
      getMaxUpdatedAt(availabilityRules),
      getMaxUpdatedAt(rawSchedulePlacements),
      getMaxUpdatedAt(rawScheduleBlockages),
      scheduleUpdatedAt,
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
      schedule_placements: stripForSignature(schedulePlacements),
      schedule_blockages: stripForSignature(scheduleBlockages),
    };

    return {
      signature: stableStringify(signaturePayload),
      solverParams,
      maxUpdatedAt,
    };
  };

  const sanitizeSolverParamsForSolve = (solverParams: Record<string, unknown>) => {
    const next = { ...solverParams };
    if (Object.prototype.hasOwnProperty.call(next, "allow_overstaffing")) {
      delete (next as { allow_overstaffing?: unknown }).allow_overstaffing;
    }
    return next;
  };

  const runPrecheckRequest = useCallback(
    async (
      solverParams: Record<string, unknown>,
      options?: { signature?: string; signal?: AbortSignal },
    ): Promise<PrecheckResponse> => {
      const sanitizedSolverParams = sanitizeSolverParamsForSolve(solverParams);
      const payload =
        Object.keys(sanitizedSolverParams).length > 0
          ? { solver_params: sanitizedSolverParams }
          : {};
      const res = await authFetch(`/api/grids/${gridId}/precheck/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(raw, t("solve_overlay.precheck_could_not_run")));
      }
      const rawPayload = (await res.json().catch(() => ({}))) as unknown;
      const normalized = normalizePrecheckResponse(rawPayload);
      setPrecheck(normalized);
      setPrecheckError(null);
      if (options?.signature) {
        setPrecheckSignature(options.signature);
      }
      return normalized;
    },
    [gridId, t],
  );

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
      const candidateRecord = candidate as Record<string, unknown>;
      const placementsRaw = Array.isArray(candidateRecord.placements)
        ? candidateRecord.placements
        : Array.isArray(candidateRecord.schedule)
        ? candidateRecord.schedule
        : Array.isArray(candidateRecord.snapshot_placements)
        ? candidateRecord.snapshot_placements
        : [];
      const candidateScheduleId =
        readEntityId(candidateRecord.schedule_id) ??
        readEntityId(candidateRecord.source_schedule) ??
        readEntityId(candidateRecord.schedule) ??
        readEntityId(candidateRecord.id);
      const scheduleId =
        Number(candidateScheduleId) || 0;
      if (!scheduleId && placementsRaw.length === 0) return null;
      const normalizedPlacements = placementsRaw.map((placement) => {
        if (!placement || typeof placement !== "object") return placement;
        const placementRecord = placement as Record<string, unknown>;
        const realPlacementId =
          readEntityId(placementRecord.placement_id) ??
          readEntityId(placementRecord.placementId) ??
          readEntityId(placementRecord.schedule_placement_id) ??
          readEntityId(placementRecord.schedulePlacementId) ??
          readEntityId(placementRecord.schedule_placement) ??
          readEntityId(placementRecord.id);
        if (realPlacementId == null) return { ...placementRecord };
        const snapshotPlacementId = readEntityId(placementRecord.id);
        return {
          ...placementRecord,
          snapshot_placement_id:
            snapshotPlacementId != null && String(snapshotPlacementId) !== String(realPlacementId)
              ? snapshotPlacementId
              : readEntityId(placementRecord.snapshot_placement_id) ?? null,
          id: realPlacementId,
          placement_id: realPlacementId,
          schedule_placement_id: realPlacementId,
        };
      });
      return {
        ...candidateRecord,
        schedule_id: scheduleId || candidateRecord.schedule_id,
        published_schedule_id:
          candidateRecord.schedule_id != null || candidateRecord.source_schedule != null
            ? (readEntityId(candidateRecord.id) ?? null)
            : readEntityId(candidateRecord.published_schedule_id),
        id: scheduleId || Number(gridId),
        placements: normalizedPlacements,
      } as ScheduleResource;
    },
    [gridId],
  );

  const buildPlacementCandidateRequests = useCallback(
    (_durationSlots: number): CandidatePlacementRequest[] => {
      const slotCount = Math.max(0, Math.round(bodyHeight / rowPx));
      const candidates: CandidatePlacementRequest[] = [];
      for (let dayIndex = 0; dayIndex < daysCount; dayIndex += 1) {
        for (let startSlot = 0; startSlot < slotCount; startSlot += 1) {
          candidates.push({ day_index: dayIndex, start_slot: startSlot });
        }
      }
      return candidates;
    },
    [bodyHeight, daysCount, rowPx],
  );

  const clearPlacementPreviewState = useCallback(() => {
    placementPreviewVisibleRequestRef.current = null;
    setPendingDropWhilePreviewLoading(null);
    setPlacementPreviewBySlot({});
    setPlacementPreviewDurationSlots(null);
    setBackendPreviewActive(false);
    setPlacementPreviewBusy(false);
    setPlacementPreviewError(null);
  }, []);

  const applyPlacementPreviewResponse = useCallback((response: PlacementPreviewResponse) => {
    const nextMap: Record<string, PlacementPreviewItem> = {};
    for (const item of response.slot_map) {
      nextMap[getPlacementPreviewSlotKey(item.day_index, item.slot)] = item;
    }
    setPlacementPreviewBySlot(nextMap);
    setPlacementPreviewDurationSlots(Math.max(1, Math.round(response.duration_slots) || 1));
    setBackendPreviewActive(true);
    setPlacementPreviewError(null);
  }, []);

  const previewCellPlacement = useCallback(
    async (sourceCellId: string, payload: PlacementPreviewRequest): Promise<PlacementPreviewResponse> => {
      const res = await authFetch(
        `/api/grids/${gridId}/cells/${encodeURIComponent(String(sourceCellId))}/placement-preview/`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const rawText = await res.text().catch(() => "");
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        if (isLikelyHtmlResponse(rawText, contentType)) {
          throw new Error(t("solve_overlay.placement_preview_endpoint_not_reached"));
        }
        throw new Error(parseApiErrorMessage(rawText, t("solve_overlay.placement_preview_failed")));
      }
      const raw = parseJsonObjectResponse(
        rawText,
        contentType,
        t("solve_overlay.placement_preview_endpoint_not_reached"),
        t("solve_overlay.placement_preview_failed"),
      );
      const rawSlotMap = Array.isArray(raw.slot_map)
        ? raw.slot_map
        : Array.isArray(raw.placements)
        ? raw.placements
        : [];
      const normalizedSlotMap = rawSlotMap
        .map(normalizePlacementPreviewItem)
        .filter((item): item is PlacementPreviewItem => Boolean(item));
      return {
        cell_id: readEntityId(raw.cell_id) ?? sourceCellId,
        mode: payload.mode,
        schedule_id: readEntityId(raw.schedule_id) ?? payload.schedule_id,
        schedule_revision: String(raw.schedule_revision ?? "unknown"),
        context_cache_hit: Boolean(raw.context_cache_hit),
        context_cache_key: typeof raw.context_cache_key === "string" ? raw.context_cache_key : undefined,
        placement_id: readEntityId(raw.placement_id) ?? payload.placement_id ?? null,
        bundle_id: readEntityId(raw.bundle_id) ?? payload.bundle_id ?? null,
        duration_slots: Math.max(1, Number(raw.duration_slots) || 1),
        slot_map: normalizedSlotMap,
        placements: normalizedSlotMap,
      };
    },
    [gridId, t],
  );

  const normalizeConfirmedPlacement = useCallback(
    (rawPlacement: unknown, fallback: ConfirmPlacementRequest & { sourceCellId: string }) => {
      const fallbackId =
        fallback.placement_id != null
          ? String(fallback.placement_id)
          : `confirmed-${fallback.sourceCellId}-${fallback.day_index}-${fallback.start_slot}`;
      const normalized = normalizeScheduleRowFromAny(rawPlacement, fallbackId);
      const source =
        rawPlacement && typeof rawPlacement === "object" ? (rawPlacement as Record<string, unknown>) : {};
      const placementId =
        readEntityId(source.placement_id) ??
        readEntityId(source.schedule_placement_id) ??
        readEntityId(source.id) ??
        normalized?.cell_id ??
        fallbackId;
      const sourceCellId =
        normalized?.source_cell_id ??
        readEntityId(source.source_cell_id) ??
        readEntityId(source.source_cell) ??
        fallback.sourceCellId;
      const bundleId =
        normalized?.bundle_id ??
        readEntityId(source.bundle_id) ??
        readEntityId(source.bundle) ??
        fallback.bundle_id ??
        null;
      const startSlot = normalized?.start_slot ?? Math.max(0, Math.round(fallback.start_slot));
      const rawEndSlot = Number(source.end_slot);
      const endSlot =
        normalized?.end_slot ??
        Math.max(startSlot + 1, Number.isFinite(rawEndSlot) ? rawEndSlot : startSlot + 1);
      const assignedParticipants =
        normalized?.assigned_participants ??
        normalizeIdArray((source as { assigned_participants?: unknown }).assigned_participants);
      const units =
        normalized?.units ??
        normalizeIdArray((source as { unit_ids?: unknown; units?: unknown }).unit_ids ?? source.units);
      const breaks =
        normalized?.breaks ??
        (Array.isArray((source as { breaks?: unknown }).breaks)
          ? ((source as { breaks?: unknown }).breaks as Array<{ offset_min: number; duration_min: number }>)
          : []);
      return {
        ...(source as Record<string, unknown>),
        id: placementId,
        placement_id: placementId,
        schedule_placement_id: placementId,
        schedule: fallback.schedule_id,
        schedule_id: fallback.schedule_id,
        source_cell: sourceCellId,
        source_cell_id: sourceCellId,
        bundle: bundleId,
        bundle_id: bundleId,
        unit_ids: units,
        units,
        day_index: normalized?.day_index ?? Math.max(0, Math.round(fallback.day_index)),
        start_slot: startSlot,
        end_slot: endSlot,
        assigned_participants: assignedParticipants,
        participants: assignedParticipants,
        breaks,
        locked: Boolean((source as { locked?: unknown }).locked),
        status:
          typeof (source as { status?: unknown }).status === "string"
            ? ((source as { status?: string }).status)
            : undefined,
        reasons: Array.isArray((source as { reasons?: unknown }).reasons)
          ? ((source as { reasons?: unknown[] }).reasons ?? [])
          : [],
      };
    },
    [normalizeIdArray, normalizeScheduleRowFromAny],
  );

  const confirmCellPlacement = useCallback(
    async (
      sourceCellId: string,
      payload: ConfirmPlacementRequest,
    ): Promise<ConfirmPlacementResponse> => {
      const res = await authFetch(`/api/grids/${gridId}/cells/${encodeURIComponent(String(sourceCellId))}/place/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text().catch(() => "");
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        if (isLikelyHtmlResponse(rawText, contentType)) {
          throw new Error(t("solve_overlay.placement_endpoint_not_reached"));
        }
        throw new Error(parseApiErrorMessage(rawText, t("grid_schedule.could_not_place_cell")));
      }
      const raw = parseJsonObjectResponse(
        rawText,
        contentType,
        t("solve_overlay.placement_endpoint_not_reached"),
        t("grid_schedule.could_not_place_cell"),
      );
      const rawPlacement = raw.placement ?? raw;
      return {
        cell_id: readEntityId(raw.cell_id) ?? sourceCellId,
        mode: payload.mode,
        schedule_id: readEntityId(raw.schedule_id) ?? payload.schedule_id,
        schedule_revision: String(raw.schedule_revision ?? "unknown"),
        placement: normalizeConfirmedPlacement(rawPlacement, {
          ...payload,
          sourceCellId,
        }),
      };
    },
    [gridId, normalizeConfirmedPlacement, t],
  );

  const applyConfirmedPlacement = useCallback(
    (
      confirmedPlacement: NonNullable<ScheduleResource["placements"]>[number],
      options: { replacementPlacementId?: string | number | null } = {},
    ) => {
      const confirmedId = getPlacementIdentity(confirmedPlacement);
      const replacementId = options.replacementPlacementId == null ? null : String(options.replacementPlacementId);
      setCurrentSchedule((prev) => {
        if (!prev) return prev;
        const placements = Array.isArray(prev.placements) ? prev.placements : [];
        let replaced = false;
        const nextPlacements = placements.map((placement) => {
          const placementId = getPlacementIdentity(placement);
          const matchesReplacement = replacementId != null && placementId === replacementId;
          const matchesConfirmed = confirmedId != null && placementId === confirmedId;
          if (matchesReplacement || matchesConfirmed) {
            replaced = true;
            return confirmedPlacement;
          }
          return placement;
        });
        return {
          ...prev,
          placements: replaced ? nextPlacements : [...nextPlacements, confirmedPlacement],
        };
      });
      const normalizedSourceCellId =
        readEntityId((confirmedPlacement as { source_cell_id?: unknown }).source_cell_id) ??
        readEntityId((confirmedPlacement as { source_cell?: unknown }).source_cell);
      const normalizedBundleId =
        readEntityId((confirmedPlacement as { bundle_id?: unknown }).bundle_id) ??
        readEntityId((confirmedPlacement as { bundle?: unknown }).bundle);
      const assigned = normalizeIdArray(
        (confirmedPlacement as { assigned_participants?: unknown }).assigned_participants,
      );
      if (normalizedSourceCellId != null && assigned.length > 0) {
        setLastAssignedParticipantsByCellBundle((prev) => ({
          ...prev,
          [`${String(normalizedSourceCellId)}|${String(normalizedBundleId ?? "__no_bundle__")}`]: assigned,
        }));
      }
    },
    [normalizeIdArray],
  );

  const applyConfirmedPlacementResponse = useCallback(
    (
      result: ConfirmPlacementResponse,
      scheduleId: number | string,
      options: { replacementPlacementId?: string | number | null } = {},
    ) => {
      applyConfirmedPlacement(result.placement, options);
      if (result.schedule_revision && result.schedule_revision !== "unknown") {
        lastKnownScheduleRevisionBySchedule.set(
          getScheduleRevisionCacheId(gridId, scheduleId),
          result.schedule_revision,
        );
      }
      invalidatePlacementPreviewCacheForSchedule(gridId, scheduleId);
    },
    [applyConfirmedPlacement, gridId],
  );

  const buildOptimisticPlacement = useCallback(
    (args: {
      sourceCellId: string;
      bundleId?: string | number | null;
      dayIndex: number;
      startSlot: number;
      durationSlots: number;
      assignedParticipants?: Array<string | number>;
      replacement?: NonNullable<ScheduleResource["placements"]>[number] | null;
    }): NonNullable<ScheduleResource["placements"]>[number] => {
      const optimisticId = `optimistic-${args.sourceCellId}-${Date.now()}-${optimisticPlacementCounterRef.current++}`;
      return {
        ...(args.replacement ?? {}),
        id: optimisticId,
        placement_id: optimisticId,
        source_cell_id:
          readEntityId((args.replacement as { source_cell_id?: unknown } | null | undefined)?.source_cell_id) ??
          readEntityId((args.replacement as { source_cell?: unknown } | null | undefined)?.source_cell) ??
          args.sourceCellId,
        bundle_id:
          readEntityId((args.replacement as { bundle_id?: unknown } | null | undefined)?.bundle_id) ??
          readEntityId((args.replacement as { bundle?: unknown } | null | undefined)?.bundle) ??
          args.bundleId ??
          null,
        day_index: args.dayIndex,
        start_slot: args.startSlot,
        end_slot: args.startSlot + Math.max(1, Math.round(args.durationSlots) || 1),
        assigned_participants:
          args.assignedParticipants ??
          normalizeIdArray(
            (args.replacement as { assigned_participants?: unknown } | null | undefined)?.assigned_participants,
          ),
        breaks: Array.isArray((args.replacement as { breaks?: unknown } | null | undefined)?.breaks)
          ? ((args.replacement as { breaks?: Array<{ offset_min: number; duration_min: number }> }).breaks ?? [])
          : [],
        locked: Boolean((args.replacement as { locked?: unknown } | null | undefined)?.locked),
        status: "optimistic",
      };
    },
    [normalizeIdArray],
  );

  useEffect(() => {
    placementPreviewRequestRef.current += 1;
    placementPreviewVisibleRequestRef.current = null;
    placementPreviewCache.clear();
    clearPlacementPreviewState();
    if (!historyMode) {
      setCurrentSchedule(null);
      setScheduleBlockages([]);
      setPlacementComments([]);
    }
  }, [clearPlacementPreviewState, gridId, historyMode, scheduleViewMode]);

  const fetchCurrentSchedule = useCallback(async (): Promise<ScheduleResource | null> => {
    const endpoint =
      scheduleViewMode === "published"
        ? `/api/grids/${gridId}/published-schedule/`
        : `/api/grids/${gridId}/schedule/`;
    const r = await authFetch(endpoint, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(txt || `Failed to load schedule (${r.status})`);
    }
    const raw = await r.json().catch(() => ({} as Record<string, unknown>));
    return normalizeScheduleResource(raw);
  }, [gridId, normalizeScheduleResource, scheduleViewMode]);

  const ensureDraftSchedule = useCallback(async (): Promise<ScheduleResource | null> => {
    if (scheduleViewMode !== "draft") return null;
    if (currentSchedule?.id) return currentSchedule;
    const fetched = await fetchCurrentSchedule();
    if (fetched?.id) {
      setCurrentSchedule(fetched);
      return fetched;
    }
    invalidateGridScreenContext(gridId, "draft");
    try {
      const context = await fetchGridScreenContext(gridId, "draft", { force: true });
      const contextSchedule = normalizeScheduleResource({
        schedule: context?.schedule ?? context?.latest ?? context?.published_schedule ?? null,
      });
      if (contextSchedule?.id) {
        setCurrentSchedule(contextSchedule);
        return contextSchedule;
      }
    } catch {
      // fallback to schedule bootstrap attempt
    }
    if (!hasAttemptedDraftBootstrapRef.current) {
      hasAttemptedDraftBootstrapRef.current = true;
      const bootstrapPayloads: Array<Record<string, unknown>> = [
        {},
        { status: "draft" },
      ];
      for (const payload of bootstrapPayloads) {
        try {
          const res = await authFetch(`/api/grids/${gridId}/schedule/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) continue;
          const raw = await res.json().catch(() => ({} as Record<string, unknown>));
          const bootstrapped =
            normalizeScheduleResource(raw) ??
            normalizeScheduleResource({ schedule: raw }) ??
            (Number((raw as any)?.id)
              ? ({
                  ...(raw as Record<string, unknown>),
                  id: Number((raw as any).id),
                  placements: Array.isArray((raw as any).placements) ? (raw as any).placements : [],
                } as ScheduleResource)
              : null);
          if (bootstrapped?.id) {
            setCurrentSchedule(bootstrapped);
            return bootstrapped;
          }
          invalidateGridScreenContext(gridId, "draft");
          const context = await fetchGridScreenContext(gridId, "draft", { force: true });
          const contextSchedule = normalizeScheduleResource({
            schedule: context?.schedule ?? context?.latest ?? context?.published_schedule ?? null,
          });
          if (contextSchedule?.id) {
            setCurrentSchedule(contextSchedule);
            return contextSchedule;
          }
        } catch {
          // try next payload shape
        }
      }
    }
    return null;
  }, [currentSchedule, fetchCurrentSchedule, gridId, normalizeScheduleResource, scheduleViewMode]);

  const loadPlacementPreviewForDrag = useCallback(
    async (args: {
      mode: PlacementMode;
      sourceCellId: string;
      durationSlots: number;
      placementId?: string | number | null;
      bundleId?: string | number | null;
    }) => {
      const requestId = placementPreviewRequestRef.current + 1;
      placementPreviewRequestRef.current = requestId;
      placementPreviewVisibleRequestRef.current = requestId;
      try {
        const scheduleForPreview =
          currentSchedule?.id || scheduleViewMode !== "draft"
            ? currentSchedule
            : await ensureDraftSchedule();
        const scheduleId = scheduleForPreview?.id ?? currentSchedule?.id;
        if (!scheduleId) {
          throw new Error(t("grid_schedule.no_draft_schedule_error"));
        }
        const candidatePlacements = buildPlacementCandidateRequests(args.durationSlots);
        const scheduleRevisionCacheId = getScheduleRevisionCacheId(gridId, scheduleId);
        const lastKnownScheduleRevision = lastKnownScheduleRevisionBySchedule.get(scheduleRevisionCacheId);
        const cacheKey = buildPlacementPreviewCacheKey({
          gridId,
          scheduleId,
          scheduleRevision: lastKnownScheduleRevision,
          cellId: args.sourceCellId,
          mode: args.mode,
          placementId: args.placementId ?? null,
          bundleId: args.bundleId ?? null,
          candidatePlacements,
        });
        const cachedPreview = placementPreviewCache.get(cacheKey);
        if (cachedPreview) {
          placementPreviewVisibleRequestRef.current = null;
          setPlacementPreviewBusy(false);
          applyPlacementPreviewResponse(cachedPreview);
          return;
        }

        setPlacementPreviewBusy(true);
        setPlacementPreviewError(null);
        setPlacementPreviewBySlot({});
        setPlacementPreviewDurationSlots(null);
        setBackendPreviewActive(false);
        const bundleApiId = toApiEntityId(args.bundleId ?? null);
        const placementApiId = toApiEntityId(args.placementId ?? null);
        const payload: PlacementPreviewRequest = {
          mode: args.mode,
          schedule_id: scheduleId,
          candidate_placements: candidatePlacements,
        };
        if (args.mode === "MOVE_ASSIGNED_CELL" && placementApiId != null) {
          payload.placement_id = placementApiId;
        }
        if (bundleApiId != null) {
          payload.bundle_id = bundleApiId;
        }
        const preview = await previewCellPlacement(args.sourceCellId, payload);
        if (placementPreviewRequestRef.current !== requestId) return;
        if (preview.schedule_revision && preview.schedule_revision !== "unknown") {
          lastKnownScheduleRevisionBySchedule.set(scheduleRevisionCacheId, preview.schedule_revision);
        }
        const finalCacheKey = buildPlacementPreviewCacheKey({
          gridId,
          scheduleId,
          scheduleRevision: preview.schedule_revision,
          cellId: args.sourceCellId,
          mode: args.mode,
          placementId: args.placementId ?? null,
          bundleId: args.bundleId ?? null,
          candidatePlacements,
        });
        placementPreviewCache.set(finalCacheKey, preview);
        if (placementPreviewVisibleRequestRef.current === requestId) {
          applyPlacementPreviewResponse(preview);
        }
      } catch (error: unknown) {
        if (placementPreviewRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : t("solve_overlay.placement_preview_failed");
        if (placementPreviewVisibleRequestRef.current === requestId) {
          setPendingDropWhilePreviewLoading(null);
          setPlacementPreviewBySlot({});
          setBackendPreviewActive(false);
          setPlacementPreviewError(message);
          setPinError(message);
        }
      } finally {
        if (
          placementPreviewRequestRef.current === requestId &&
          placementPreviewVisibleRequestRef.current === requestId
        ) {
          setPlacementPreviewBusy(false);
          placementPreviewVisibleRequestRef.current = null;
        }
      }
    },
    [
      applyPlacementPreviewResponse,
      buildPlacementCandidateRequests,
      currentSchedule,
      ensureDraftSchedule,
      gridId,
      previewCellPlacement,
      scheduleViewMode,
      t,
    ],
  );

  useEffect(() => {
    hasAttemptedDraftBootstrapRef.current = false;
  }, [gridId]);

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
        const res = await authFetch(`/api/grids/${gridId}/published-schedules/`, { cache: "no-store" });
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
    setCurrentSchedule(normalizeScheduleResource(selected.schedule));
  }, [historyMode, normalizeScheduleResource, publishedHistorySchedules, selectedHistoryKey]);

  useEffect(() => {
    if (historyMode) {
      setPlacementComments([]);
      setCommentsLoading(false);
      return;
    }
    if (!activePublishedScheduleId) {
      setPlacementComments([]);
      setCommentsLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setCommentsLoading(true);
      try {
        const r = await authFetch(
          `/api/placement-comments/?published_schedule_id=${encodeURIComponent(String(activePublishedScheduleId))}`,
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
            const commentPublishedScheduleId = readEntityId(
              raw.published_schedule_id ?? raw.published_schedule ?? raw.publishedScheduleId,
            );
            if (
              raw?.id == null ||
              commentPublishedScheduleId == null ||
              raw?.source_cell_id == null ||
              raw?.day_index == null ||
              raw?.start_slot == null
            ) {
              return null;
            }
            return {
              id: raw.id,
              published_schedule: commentPublishedScheduleId,
              schedule: raw.schedule ?? raw.schedule_id ?? null,
              published_placement:
                raw.published_placement_id ??
                raw.published_placement ??
                raw.publishedPlacementId ??
                null,
              schedule_placement:
                raw.schedule_placement ??
                raw.schedule_placement_id ??
                raw.placement_id ??
                raw.placementId ??
                null,
              source_cell_id: raw.source_cell_id,
              bundle: bundleRaw,
              day_index: Number(raw.day_index),
              start_slot: Number(raw.start_slot),
              end_slot: raw.end_slot == null ? null : Number(raw.end_slot),
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
  }, [activePublishedScheduleId, historyMode]);

  useEffect(() => {
    const scheduleId = Number(currentSchedule?.id ?? 0);
    if (!scheduleId) {
      setScheduleBlockages([]);
      return;
    }
    let active = true;
    (async () => {
      setBlockagesBusy(true);
      try {
        const r = await authFetch(`/api/schedule-blockages/?schedule=${encodeURIComponent(String(scheduleId))}`, {
          cache: "no-store",
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(txt || `Failed to load blockages (${r.status})`);
        }
        const data = await r.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        const normalized = list
          .map((raw: any) => {
            const id = raw?.id;
            const dayIndex = Number(raw?.day_index);
            const startSlot = Number(raw?.start_slot);
            const endSlot = Number(raw?.end_slot);
            if (id == null || !Number.isFinite(dayIndex) || !Number.isFinite(startSlot) || !Number.isFinite(endSlot)) {
              return null;
            }
            if (endSlot <= startSlot) return null;
            return {
              id: String(id),
              schedule: Number(raw?.schedule ?? scheduleId),
              day_index: dayIndex,
              start_slot: startSlot,
              end_slot: endSlot,
              note: typeof raw?.note === "string" ? raw.note : "",
              unit_ids: normalizeUnitScopeIds(raw?.unit_ids),
            } satisfies ScheduleBlockage;
          })
          .filter((entry: ScheduleBlockage | null): entry is ScheduleBlockage => Boolean(entry));
        if (active) setScheduleBlockages(normalized);
      } catch {
        if (active) setScheduleBlockages([]);
      } finally {
        if (active) setBlockagesBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [blockagesRefreshTick, currentSchedule?.id, externalRefreshTick]);

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

        const context = await fetchGridScreenContext(gridId, scheduleViewMode, {
          force: externalRefreshTick > 0,
        });
        clist = getContextList(context?.cells);
        blist = getContextList(context?.bundles);
        slist = getContextList(context?.staffs);
        plist = getContextList(context?.participants);
        ulist = getContextList(context?.units);
        trlist = getContextList(context?.time_ranges);

        if (blist.length === 0) {
          const bundleEndpoints = [`/api/bundles?grid=${gridId}`, `/api/bundles/?grid=${gridId}`];
          for (const endpoint of bundleEndpoints) {
            try {
              const res = await authFetch(endpoint, { cache: "no-store" });
              if (!res.ok) continue;
              const payload = await res.json().catch(() => ({}));
              const list = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.results)
                ? payload.results
                : [];
              if (list.length > 0) {
                blist = list;
                break;
              }
            } catch {
              // keep trying
            }
          }
        }

        if (ulist.length === 0) {
          const unitEndpoints = [`/api/units?grid=${gridId}`, `/api/units/?grid=${gridId}`];
          for (const endpoint of unitEndpoints) {
            try {
              const res = await authFetch(endpoint, { cache: "no-store" });
              if (!res.ok) continue;
              const payload = await res.json().catch(() => ({}));
              const list = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.results)
                ? payload.results
                : [];
              if (list.length > 0) {
                ulist = list;
                break;
              }
            } catch {
              // keep trying
            }
          }
        }

        const resolveGridSettings = async () => {
          let allowOverstaffing: boolean | null = null;
          let tierEnabled = true;
          const contextGrid = context?.grid;
          if (contextGrid && typeof contextGrid === "object") {
            const fromContext = (contextGrid as { allow_overstaffing?: unknown }).allow_overstaffing;
            if (typeof fromContext === "boolean") {
              allowOverstaffing = fromContext;
            }
            tierEnabled = readGridTierEnabled(contextGrid, tierEnabled);
          }
          const gridEndpoints = [`/api/grids/${gridId}/`, `/api/grids/${gridId}`];
          for (const endpoint of gridEndpoints) {
            try {
              const res = await authFetch(endpoint, { cache: "no-store" });
              if (!res.ok) continue;
              const payload = (await res.json().catch(() => ({}))) as { allow_overstaffing?: unknown };
              if (typeof payload.allow_overstaffing === "boolean") allowOverstaffing = payload.allow_overstaffing;
              tierEnabled = readGridTierEnabled(payload, tierEnabled);
              break;
            } catch {
              // try next endpoint
            }
          }
          return { allowOverstaffing: allowOverstaffing ?? true, tierEnabled };
        };
        const gridSettings = await resolveGridSettings();

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
              const res = await authFetch(endpoint, { cache: "no-store" });
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
          const normalizedSchedule = normalizeScheduleResource(scheduleCandidate);
          if (normalizedSchedule) setCurrentSchedule(normalizedSchedule);
        }

        const cmap: Record<string, string> = {};
        const cstaffs: Record<string, string[]> = {};
        const ccolors: Record<string, string> = {};
        const ctierCounts: Record<string, Record<TierKey, number>> = {};
        const ctierPools: Record<string, Record<TierKey, string[]>> = {};
        const cpins: Record<string, CellPinMeta> = {};
        const ctrange: Record<string, string> = {};
        const cdurationSlots: Record<string, number> = {};
        const csplitPartSlots: Record<string, number[]> = {};
        const crequiredPlacements: Record<string, number> = {};
        const coverstaff: Record<string, boolean> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            coverstaff[cid] = Boolean(c?.allow_overstaffing);
            const splitPartsCount = Array.isArray(c?.split_parts_min)
              ? c.split_parts_min
                  .map((part: unknown) => Number(part))
                  .filter((part: number) => Number.isFinite(part) && part > 0).length
              : 0;
            const splitPartSlots = Array.isArray(c?.split_parts_min)
              ? c.split_parts_min
                  .map((part: unknown) => Math.max(1, Math.ceil((Number(part) || 0) / slotMin)))
                  .filter((part: number) => Number.isFinite(part) && part > 0)
              : [];
            csplitPartSlots[cid] = splitPartSlots;
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
            const computedTierCounts = {
              PRIMARY: Math.max(0, Number(rawTierCounts.PRIMARY ?? 0) || 0),
              SECONDARY: Math.max(0, Number(rawTierCounts.SECONDARY ?? 0) || 0),
              TERTIARY: Math.max(0, Number(rawTierCounts.TERTIARY ?? 0) || 0),
            };
            const totalTierCount =
              computedTierCounts.PRIMARY + computedTierCounts.SECONDARY + computedTierCounts.TERTIARY;
            if (totalTierCount < 1) {
              const headcountFallback = Math.max(0, Number(c?.headcount ?? 0) || 0);
              if (headcountFallback > 0) {
                computedTierCounts.PRIMARY = headcountFallback;
              }
            }
            ctierCounts[cid] = computedTierCounts;
            const rawTierPools = (c?.tier_pools ?? {}) as Partial<Record<TierKey, unknown>>;
            const eligibleFallback = normalizeIdArray(c?.eligible_participants);
            const primaryPool = normalizeIdArray(rawTierPools.PRIMARY);
            ctierPools[cid] = {
              PRIMARY: primaryPool.length > 0 ? primaryPool : eligibleFallback,
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

        const bundleUnitsMap: Record<string, string[]> = {};
        const bundleNamesMap: Record<string, string> = {};
        const unitNameToIdMap: Record<string, string> = {};
        for (const u of ulist) {
          if (u?.id == null) continue;
          const uid = String(u.id);
          const uname = String(u.name || "").trim();
          if (!uname) continue;
          unitNameToIdMap[uname.toLowerCase()] = uid;
        }
        for (const b of blist) {
          if (b?.id == null) continue;
          let unitIds = getBundleUnitIds(b).sort();
          if (unitIds.length === 0) {
            const bundleName = String(b?.name || "");
            const inferred = bundleName
              .split("+")
              .map((token) => token.trim().toLowerCase())
              .map((token) => unitNameToIdMap[token])
              .filter((id): id is string => Boolean(id));
            if (inferred.length > 0) unitIds = Array.from(new Set(inferred)).sort();
          }
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
        // Fallback: some backends expose placements keyed by bundle_id but do not expose bundle records.
        // In that case, treat bundle_id as a direct unit id to avoid collapsing everything into "No-Unit".
        for (const unitId of Object.keys(umap)) {
          if (!bundleUnitsMap[unitId]) bundleUnitsMap[unitId] = [unitId];
          if (!bundleNamesMap[unitId]) bundleNamesMap[unitId] = umap[unitId];
        }
        if (active) {
          setHasCells(clist.length > 0);
          setGridAllowsOverstaffing(Boolean(gridSettings.allowOverstaffing));
          setGridTierEnabled(Boolean(gridSettings.tierEnabled));
          setCellNameById(cmap);
          setCellAllowOverstaffById(coverstaff);
          setCellStaffsById(cstaffs);
          setCellColorById(ccolors);
          setCellTierCountsById(ctierCounts);
          setCellTierPoolsById(ctierPools);
          setCellPinMetaById(cpins);
          setCellTimeRangeById(ctrange);
          setCellDurationSlotsById(cdurationSlots);
          setCellSplitPartSlotsById(csplitPartSlots);
          setCellRequiredPlacementsById(crequiredPlacements);
          setBundleUnitsById(bundleUnitsMap);
          setBundleNameById(bundleNamesMap);
          setUnitNameById(umap);
          setTimeRangeMetaById(trmap);
          setStaffMembersByStaffId(smm);
          setStaffNameById(snames);
          setParticipantNameById(pmap);
          setParticipantTierById(ptier);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [dayStartMin, externalRefreshTick, gridId, historyMode, normalizeScheduleResource, scheduleViewMode, slotMin]);

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

  useEffect(() => {
    if (!canSolve || historyMode || scheduleViewMode !== "draft" || !hasCells) {
      setPrecheck(null);
      setPrecheckBusy(false);
      setPrecheckError(null);
      setPrecheckSignature(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const { signature, solverParams } = await computeCurrentSolveInputSignature();
        if (!active) return;
        if (precheckSignature && precheckSignature === signature) {
          return;
        }
        setPrecheckBusy(true);
        setPrecheckError(null);
        await runPrecheckRequest(solverParams, { signature, signal: controller.signal });
      } catch (err: unknown) {
        if (!active) return;
        if ((err as { name?: string })?.name === "AbortError") return;
        setPrecheck(null);
        setPrecheckError(
          err instanceof Error ? err.message : t("solve_overlay.precheck_could_not_run"),
        );
      } finally {
        if (active) {
          setPrecheckBusy(false);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    canSolve,
    currentSchedule?.created_at,
    currentSchedule?.id,
    currentSchedule?.updated_at,
    externalRefreshTick,
    gridId,
    hasCells,
    historyMode,
    precheckSignature,
    precheckRefreshTick,
    runPrecheckRequest,
    scheduleViewMode,
    t,
  ]);

  const solveElapsedMs = useMemo(() => {
    if (!solveStartedAt) return 0;
    return Date.now() - solveStartedAt;
  }, [solveStartedAt, tick]);

  const openPrecheckDialog = useCallback(
    (blocking: boolean, lines: string[]) => {
      const normalizedLines = lines
        .map((line) => String(line || "").trim())
        .filter((line) => line.length > 0);
      setPrecheckDialogState({
        open: true,
        blocking,
        lines: normalizedLines,
      });
    },
    [],
  );

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
      setPrecheckDialogState((prev) => ({ ...prev, open: false }));

      setPrecheckBusy(true);
      setPrecheckError(null);
      const precheckResult = await runPrecheckRequest(solverParams, { signature });
      const precheckDiagnostics = getPrecheckDiagnostics(precheckResult);
      if (precheckDiagnostics.hasBlockingErrors) {
        const blockingLines = (precheckDiagnostics.errors.length > 0
          ? precheckDiagnostics.errors
          : precheckDiagnostics.all
        )
          .map((violation) => formatPrecheckViolation(violation))
          .filter(Boolean);
        openPrecheckDialog(true, blockingLines);
        return;
      }

      const sanitizedSolverParams = sanitizeSolverParamsForSolve(solverParams);
      const r = await authFetch(`/api/grids/${gridId}/solve-candidates/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          solver_params: sanitizedSolverParams,
          candidate_min_diff_ratio: 0.1,
        }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `Solve candidates failed (${r.status})`);
      }
      const data = (await r.json()) as SolveCandidatesResponse;
      const responsePrecheck = data.precheck ? normalizePrecheckResponse(data.precheck) : null;
      if (responsePrecheck) {
        setPrecheck(responsePrecheck);
        setPrecheckError(null);
        setPrecheckSignature(signature);
      }
      const candidates = (Array.isArray(data.candidates) ? data.candidates : [])
        .map((candidate, index) => normalizeSolveCandidate(candidate, index))
        .filter((candidate): candidate is SolveCandidate => Boolean(candidate));
      const previewContext =
        normalizeCandidatePreviewContext(data.preview_context) ??
        candidates.find((candidate) => candidate.preview_context != null)?.preview_context ??
        null;
      const selectable = Array.isArray(data.selectable_candidate_indexes)
        ? data.selectable_candidate_indexes
            .map((idx) => Number(idx))
            .filter((idx) => Number.isFinite(idx))
        : [];
      const skippedByPrecheck = candidates.some((candidate) =>
        Boolean((candidate.solver_stats as { skipped_solver?: unknown } | undefined)?.skipped_solver),
      );
      const reasonOptions = normalizeReasonOptions(data.none_option?.reason_options);

      setCandidateRunId(data.run_id ?? null);
      setSolveCandidates(candidates);
      setSelectableCandidateIndexes(selectable);
      setAllCandidatesFailed(Boolean(data.all_candidates_failed));
      setCandidatePreference(data.preference ?? null);
      setCandidatePreviewContext(previewContext);
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
      setPreviewParticipantsOpen(false);
      setPreviewParticipantId(null);
      setPreviewSelectedUnitId(null);
      setPreviewParticipantsQuery("");

      if (data.run_id && candidates.length > 0) {
        persistPendingCandidateRun({
          run_id: data.run_id,
          candidates,
          selectable_candidate_indexes: selectable,
          all_candidates_failed: Boolean(data.all_candidates_failed),
          preference: data.preference ?? null,
          reject_reason_options: reasonOptions,
          preview_context: previewContext,
          pending_solve_signature: signature,
          preview_candidate_index: firstCandidateIndex,
        });
      } else {
        persistPendingCandidateRun(null);
      }

      if (skippedByPrecheck) {
        const fallbackPrecheck = normalizePrecheckResponse({
          ok: false,
          violations: candidates.flatMap((candidate) =>
            Array.isArray(candidate.violations) ? candidate.violations : [],
          ),
        });
        const normalizedPrecheck = responsePrecheck ?? fallbackPrecheck;
        setPrecheck(normalizedPrecheck);
        setPrecheckError(null);
        setPrecheckSignature(signature);
        const skippedDiagnostics = getPrecheckDiagnostics(normalizedPrecheck);
        const skippedLines = (skippedDiagnostics.errors.length > 0
          ? skippedDiagnostics.errors
          : skippedDiagnostics.all
        )
          .map((violation) => formatPrecheckViolation(violation))
          .filter(Boolean);
        openPrecheckDialog(true, skippedLines);
        return;
      }

      if (data.all_candidates_failed) {
        setError(t("solve_overlay.all_three_candidates_failed"));
      }
    } catch (e: any) {
      setError(e?.message || t("solve_overlay.solver_error"));
    } finally {
      setPrecheckBusy(false);
      setIsSolving(false);
    }
  }

  const refreshGridView = useCallback((scope: ScheduleViewMode | "all" = "all") => {
    if (scope === "all") {
      invalidateGridScreenContext(gridId);
    } else {
      invalidateGridScreenContext(gridId, scope);
    }
    if (pathname?.startsWith("/grid/")) {
      router.replace(pathname);
    }
    router.refresh();
  }, [gridId, pathname, router]);

  const hardReloadGridView = useCallback((scope: ScheduleViewMode | "all" = "all") => {
    if (typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    refreshGridView(scope);
  }, [refreshGridView]);

  const chooseCandidate = async (candidateIndex: number) => {
    if (!candidateRunId) {
      setCandidateError(t("solve_overlay.missing_candidate_run_id"));
      return;
    }
    setCandidateBusy(true);
    setCandidateError(null);
    try {
      const res = await authFetch(
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
      persistPendingCandidateRun(null);
      hardReloadGridView("draft");
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
      const res = await authFetch(
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
      persistPendingCandidateRun(null);
      hardReloadGridView("draft");
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
      const placementIdentityRaw =
        readEntityId((placement as { placement_id?: unknown }).placement_id) ??
        readEntityId((placement as { placementId?: unknown }).placementId) ??
        readEntityId((placement as { schedule_placement_id?: unknown }).schedule_placement_id) ??
        readEntityId((placement as { schedulePlacementId?: unknown }).schedulePlacementId) ??
        readEntityId((placement as { schedule_placement?: unknown }).schedule_placement) ??
        readEntityId(placement.id);
      const placementIdentity = placementIdentityRaw == null ? String(placement.id) : String(placementIdentityRaw);
      const bundleId =
        readEntityId((placement as { bundle_id?: unknown }).bundle_id) ??
        readEntityId((placement as { bundle?: unknown }).bundle) ??
        undefined;
      const sourceCellId =
        readEntityId((placement as { source_cell?: unknown }).source_cell) ??
        readEntityId((placement as { source_cell_id?: unknown }).source_cell_id) ??
        String(placement.id);
      const assignedParticipants = normalizeIdArray((placement as { assigned_participants?: unknown }).assigned_participants);
      const placementUnitIds = normalizeIdArray(
        (placement as { unit_ids?: unknown; units?: unknown }).unit_ids ??
          (placement as { unit_ids?: unknown; units?: unknown }).units,
      );
      const sourceCellBundleIds = (cellPinMetaById[String(sourceCellId)]?.bundles || []).map(String);
      const resolvedUnitIdsFromBundle =
        bundleId != null
          ? (bundleUnitsById[String(bundleId)] || []).map(String)
          : [];
      const resolvedUnitIds =
        placementUnitIds.length > 0
          ? placementUnitIds
          : resolvedUnitIdsFromBundle.length > 0
          ? resolvedUnitIdsFromBundle
          : bundleId != null && unitNameById[String(bundleId)]
          ? [String(bundleId)]
          : sourceCellBundleIds.filter((id) => Boolean(unitNameById[String(id)]));
      const breaks = Array.isArray((placement as { breaks?: unknown }).breaks)
        ? ((placement as { breaks?: unknown }).breaks as unknown[])
            .map((entry) => {
              const offsetMin = Number((entry as any)?.offset_min);
              const durationMin = Number((entry as any)?.duration_min);
              if (!Number.isFinite(offsetMin) || !Number.isFinite(durationMin)) return null;
              if (durationMin <= 0) return null;
              return { offset_min: Math.round(offsetMin), duration_min: Math.round(durationMin) };
            })
            .filter((entry): entry is BreakEntry => Boolean(entry))
        : [];
      return {
        cell_id: placementIdentity,
        placement_id: placementIdentity,
        schedule_placement_id: placementIdentity,
        published_placement_id:
          readEntityId((placement as { published_placement_id?: unknown }).published_placement_id) ??
          readEntityId((placement as { publishedPlacementId?: unknown }).publishedPlacementId) ??
          null,
        snapshot_placement_id:
          readEntityId((placement as { snapshot_placement_id?: unknown }).snapshot_placement_id) ??
          readEntityId((placement as { snapshotPlacementId?: unknown }).snapshotPlacementId) ??
          null,
        source_cell_id: sourceCellId,
        bundle_id: bundleId,
        bundle: bundleId,
        day_index: Number(placement.day_index),
        start_slot: Number(placement.start_slot),
        end_slot: Number(placement.end_slot),
        assigned_participants: assignedParticipants,
        participants: assignedParticipants,
        units: resolvedUnitIds,
        locked: Boolean(placement.locked),
        breaks,
      };
    });
  }, [currentSchedule, bundleUnitsById, cellPinMetaById, unitNameById]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stats: Record<string, { placementCount: number }> = {};
    for (const row of schedule) {
      const sourceCellId = String(row.source_cell_id ?? row.cell_id ?? "");
      if (!sourceCellId) continue;
      const trId = cellTimeRangeById[sourceCellId];
      if (!trId) continue;
      if (!stats[trId]) stats[trId] = { placementCount: 0 };
      stats[trId].placementCount += 1;
    }
    window.dispatchEvent(
      new CustomEvent("shift:time-range-stats", {
        detail: { gridId: String(gridId), statsByTimeRangeId: stats },
      }),
    );
  }, [cellTimeRangeById, gridId, schedule]);

  const isNoUnitScopeSelected = selectedUnitId === NO_UNIT_TAB_ID || selectedUnitId === "*";
  const isGlobalBlockageScopeSelected = selectedUnitId === GLOBAL_BLOCKAGE_TAB_ID;
  const scopedUnitId =
    selectedUnitId &&
    selectedUnitId !== NO_UNIT_TAB_ID &&
    selectedUnitId !== GLOBAL_BLOCKAGE_TAB_ID &&
    selectedUnitId !== "*"
      ? String(selectedUnitId)
      : null;

  const filteredSchedule = useMemo(() => {
    if (scopedUnitId) {
      return schedule.filter(
        (s: any) => Array.isArray(s.units) && s.units.map(String).includes(scopedUnitId),
      );
    }
    if (isNoUnitScopeSelected) {
      return schedule.filter((s: any) => {
        const rowUnits = Array.isArray(s.units) ? s.units.map(String) : [];
        return rowUnits.length === 0;
      });
    }
    return schedule;
  }, [isNoUnitScopeSelected, schedule, scopedUnitId]);

  const hasUnitlessPlacements = useMemo(
    () =>
      schedule.some((row) => {
        const rowUnits = Array.isArray(row.units) ? row.units.map(String) : [];
        return rowUnits.length === 0;
      }),
    [schedule],
  );
  const hasNoUnitCells = useMemo(
    () =>
      Object.entries(cellPinMetaById).some(([, pinMeta]) => {
        const bundles = Array.isArray(pinMeta?.bundles) ? pinMeta.bundles.map(String) : [];
        if (bundles.length === 0) return true;
        return bundles.some((bundleId) => {
          const mapped = bundleUnitsById[bundleId] || [];
          if (mapped.length > 0) return false;
          return !unitNameById[String(bundleId)];
        });
      }),
    [bundleUnitsById, cellPinMetaById, unitNameById],
  );

  const schedulePlacementById = useMemo(() => {
    const map: Record<string, ScheduleRow> = {};
    for (const row of schedule) {
      const placementId = String(row.cell_id ?? "");
      if (!placementId) continue;
      map[placementId] = row;
    }
    return map;
  }, [schedule]);

  const buildCollisionMessage = useCallback(
    (rawMessage: string, placementId: string | null) => {
      const cleaned = stripNonFieldPrefix(rawMessage);
      const formatDayLabel = (dayIndex: number) =>
        dayLabels?.[dayIndex] || t("solve_overlay.day_with_index", { index: dayIndex + 1 });
      const appendDayTimeContext = (base: string, dayIndex: number, startSlot: number, endSlot: number) => {
        const day = formatDayLabel(dayIndex);
        const time = formatSlotRange(dayStartMin, slotMin, Number(startSlot), Number(endSlot));
        if (/\([^()]*:[^()]*\)$/.test(base.trim())) return base;
        return `${base} (${day}: ${time})`;
      };
      const lowered = cleaned.toLowerCase();
      if (
        lowered.includes("schedule, source_cell, bundle, day_index, start_slot must make a unique set") ||
        lowered.includes("must make a unique set")
      ) {
        return t("grid_schedule.multi_day_cells_cannot_overlap_themselves");
      }
      const overlapMatch = cleaned.match(
        /Participant overlap with placement\s+(\d+):\s*shared participants\s*\[([^\]]*)\]/i,
      );
      if (overlapMatch) {
        const collidedPlacementId = String(overlapMatch[1] ?? placementId ?? "").trim();
        const rawParticipantIds = String(overlapMatch[2] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const participantId = rawParticipantIds[0] || "";
        const participantLabel =
          (participantId && participantNameById[participantId]) ||
          (participantId ? t("format.participant_with_id", { id: participantId }) : t("entity.participant"));
        const row = collidedPlacementId ? schedulePlacementById[collidedPlacementId] : null;
        if (row) {
          const sourceCellId = String(row.source_cell_id ?? row.cell_id ?? collidedPlacementId);
          const cellLabel = cellNameById[sourceCellId] || t("format.cell_with_id", { id: sourceCellId });
          const cellTime = formatSlotRange(dayStartMin, slotMin, Number(row.start_slot), Number(row.end_slot));
          const dayLabel = formatDayLabel(Number(row.day_index));
          return t("solve_overlay.participant_has_cell_in_placement", {
            participant: participantLabel,
            cell: cellLabel,
            day: dayLabel,
            time: cellTime,
          });
        }
      }

      const impossibleMatch = cleaned.match(
        /Participant\s+(\d+)\s+has impossible availability at day=([A-Za-z]+)\s+slots=\[([^\]]*)\]/i,
      );
      if (impossibleMatch) {
        const participantId = String(impossibleMatch[1] ?? "").trim();
        const dayToken = String(impossibleMatch[2] ?? "").trim().toLowerCase();
        const slots = String(impossibleMatch[3] ?? "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value))
          .sort((a, b) => a - b);
        const startSlot = slots.length > 0 ? slots[0] : 0;
        const endSlot = slots.length > 0 ? slots[slots.length - 1] + 1 : startSlot + 1;
        const availabilityTime = formatSlotRange(dayStartMin, slotMin, startSlot, endSlot);
        const dayIndex = DAY_LABEL_TO_INDEX[dayToken];
        const dayLabel = Number.isFinite(dayIndex) ? formatDayLabel(Number(dayIndex)) : dayToken;
        const participantLabel =
          participantNameById[participantId] || t("format.participant_with_id", { id: participantId });
        return t("solve_overlay.participant_unavailable_in_placement", {
          participant: participantLabel,
          day: dayLabel,
          time: availabilityTime,
        });
      }

      const blockageMatch = cleaned.match(
        /Placement overlaps blockage\s+(\d+):\s*blocked slots\s*\[\s*(\d+)\s*,\s*(\d+)\s*\)/i,
      );
      if (blockageMatch) {
        const blockageId = String(blockageMatch[1] ?? "").trim();
        const blockedStart = Number(blockageMatch[2] ?? 0);
        const blockedEnd = Number(blockageMatch[3] ?? 0);
        const blockage = scheduleBlockages.find((entry) => String(entry.id) === blockageId);
        const dayIndex = blockage ? Number(blockage.day_index) : null;
        const dayLabel = dayIndex != null && Number.isFinite(dayIndex) ? formatDayLabel(dayIndex) : formatDayLabel(0);
        const time = formatSlotRange(dayStartMin, slotMin, blockedStart, blockedEnd);
        return t("solve_overlay.overlaps_existing_blockage", {
          day: dayLabel,
          time,
        });
      }

      if (placementId) {
        const row = schedulePlacementById[placementId];
        if (row) {
          return appendDayTimeContext(
            cleaned,
            Number(row.day_index),
            Number(row.start_slot),
            Number(row.end_slot),
          );
        }
      }

      return cleaned;
    },
    [cellNameById, dayLabels, dayStartMin, participantNameById, scheduleBlockages, schedulePlacementById, slotMin, t],
  );

  const selectedBlockageUnitScopeIds = useMemo(
    () => {
      if (isGlobalBlockageScopeSelected) return [];
      return scopedUnitId ? [scopedUnitId] : [];
    },
    [isGlobalBlockageScopeSelected, scopedUnitId],
  );

  const visibleScheduleBlockages = useMemo(() => {
    if (isNoUnitScopeSelected || isGlobalBlockageScopeSelected) {
      return scheduleBlockages.filter((blockage) => (blockage.unit_ids ?? []).length === 0);
    }
    if (!scopedUnitId) return scheduleBlockages;
    return scheduleBlockages.filter((blockage) => {
      const scope = blockage.unit_ids ?? [];
      return scope.length === 0 || scope.includes(scopedUnitId);
    });
  }, [isGlobalBlockageScopeSelected, isNoUnitScopeSelected, scheduleBlockages, scopedUnitId]);

  useEffect(() => {
    if (!pinError) {
      lastHandledPinErrorRef.current = null;
      setPinErrorCard(null);
      setPinErrorCardAnchor(null);
      setCollisionBeatingPlacementId(null);
      return;
    }
    if (lastHandledPinErrorRef.current === pinError) return;
    lastHandledPinErrorRef.current = pinError;

    const placementIds = extractPlacementIdsFromMessage(pinError);
    const uniquePlacementId = placementIds.length === 1 ? placementIds[0] : null;
    const message = buildCollisionMessage(pinError, uniquePlacementId);

    if (!uniquePlacementId) {
      setCollisionBeatingPlacementId(null);
      setPinErrorCard({ message });
      return;
    }

    const uniquePlacementRow = schedulePlacementById[uniquePlacementId];
    const placementUnitIds = Array.isArray(uniquePlacementRow?.units)
      ? uniquePlacementRow.units.map(String)
      : [];
    const requestedUnitTabId = placementUnitIds.length > 0 ? placementUnitIds[0] : NO_UNIT_TAB_ID;
    if (requestedUnitTabId && selectedUnitId !== requestedUnitTabId && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<{ unitId: string }>(UNIT_TAB_SELECT_EVENT, {
          detail: { unitId: requestedUnitTabId },
        }),
      );
    }

    setCollisionBeatingPlacementId(uniquePlacementId);

    const selectorPlacementId = uniquePlacementId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const queryTarget = () =>
      document.querySelector<HTMLElement>(`[data-placement-id="${selectorPlacementId}"]`);

    const placeCardNearTarget = () => {
      setPinErrorCard({ message });
      const target = queryTarget();
      if (!target) return;
    };

    const scrollTarget = queryTarget();
    if (scrollTarget) {
      scrollTarget.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
    placeCardNearTarget();
    const delayed = window.setTimeout(placeCardNearTarget, 380);
    return () => window.clearTimeout(delayed);
  }, [buildCollisionMessage, pinError, schedulePlacementById, selectedUnitId, topOffset]);

  useEffect(() => {
    if (!pinErrorCard) {
      setPinErrorCardAnchor(null);
      return;
    }
    const updateAnchor = () => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const scheduleViewport =
        (overlay.closest("[data-schedule-scroll]") as HTMLElement | null) ?? overlay;
      const rect = scheduleViewport.getBoundingClientRect();
      const left = Math.max(24, Math.min(window.innerWidth - 24, rect.left + rect.width / 2));
      const top = Math.max(12, Math.min(window.innerHeight - 12, rect.bottom - 56));
      setPinErrorCardAnchor({
        left,
        top,
      });
    };
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [pinErrorCard]);

  const overlapGroupMetaByPlacementId = useMemo<Record<string, OverlapGroupMeta>>(() => {
    type PlacementEntry = {
      placementId: string;
      dayIndex: number;
      startSlot: number;
      endSlot: number;
    };

    const rowsByDay = new Map<number, PlacementEntry[]>();
    for (const row of filteredSchedule) {
      const placementId = String(row.cell_id ?? "");
      const dayIndex = Number(row.day_index);
      const startSlot = Number(row.start_slot);
      const endSlot = Number(row.end_slot);
      if (!placementId) continue;
      if (!Number.isFinite(dayIndex) || !Number.isFinite(startSlot) || !Number.isFinite(endSlot)) continue;
      if (endSlot <= startSlot) continue;
      const dayRows = rowsByDay.get(dayIndex) ?? [];
      dayRows.push({ placementId, dayIndex, startSlot, endSlot });
      rowsByDay.set(dayIndex, dayRows);
    }

    const nextMeta: Record<string, OverlapGroupMeta> = {};

    for (const [dayIndex, dayRows] of rowsByDay.entries()) {
      const orderedRows = [...dayRows].sort(
        (a, b) =>
          a.startSlot - b.startSlot ||
          a.endSlot - b.endSlot ||
          a.placementId.localeCompare(b.placementId),
      );
      const laneEndByIndex: number[] = [];
      const placementLaneAssignments: Array<{ placementId: string; laneIndex: number }> = [];

      for (const row of orderedRows) {
        let laneIndex = -1;
        for (let idx = 0; idx < laneEndByIndex.length; idx += 1) {
          if (laneEndByIndex[idx] <= row.startSlot) {
            laneIndex = idx;
            break;
          }
        }
        if (laneIndex < 0) {
          laneIndex = laneEndByIndex.length;
          laneEndByIndex.push(row.endSlot);
        } else {
          laneEndByIndex[laneIndex] = row.endSlot;
        }
        placementLaneAssignments.push({ placementId: row.placementId, laneIndex });
      }

      const laneCount = Math.max(1, laneEndByIndex.length);
      for (const assignment of placementLaneAssignments) {
        nextMeta[assignment.placementId] = {
          dayIndex,
          groupSize: laneCount,
          groupPosition: assignment.laneIndex,
        };
      }
    }

    return nextMeta;
  }, [filteredSchedule]);

  const overlapCarouselHasConflicts = useMemo(() => {
    const byDayGroupSize = new Map<number, number>();
    for (const meta of Object.values(overlapGroupMetaByPlacementId)) {
      const current = byDayGroupSize.get(meta.dayIndex) ?? 1;
      byDayGroupSize.set(meta.dayIndex, Math.max(current, meta.groupSize));
    }
    for (const size of byDayGroupSize.values()) {
      if (size > 1) return true;
    }
    return false;
  }, [overlapGroupMetaByPlacementId]);

  const overlapCarouselTotalPages = useMemo(() => {
    if (!overlapCarouselHasConflicts) return 1;
    let maxGroupSize = 2;
    for (const meta of Object.values(overlapGroupMetaByPlacementId)) {
      maxGroupSize = Math.max(maxGroupSize, meta.groupSize);
    }
    return Math.max(2, maxGroupSize);
  }, [overlapCarouselHasConflicts, overlapGroupMetaByPlacementId]);

  useEffect(() => {
    setOverlapCarouselPage((prev) => {
      if (overlapCarouselTotalPages <= 1) return 0;
      return ((prev % overlapCarouselTotalPages) + overlapCarouselTotalPages) % overlapCarouselTotalPages;
    });
  }, [overlapCarouselTotalPages]);

  useEffect(() => {
    if (
      overlapCarouselTotalPages <= 1 ||
      dragState ||
      isJiggleMode ||
      overlapCarouselPaused ||
      commentsPanelOpen
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setOverlapCarouselPage((prev) => (prev + 1) % overlapCarouselTotalPages);
    }, OVERLAP_CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [commentsPanelOpen, dragState, isJiggleMode, overlapCarouselPaused, overlapCarouselTotalPages]);

  const overlapCarouselDisplayByPlacementId = useMemo(() => {
    const next: Record<string, { isVisible: boolean }> = {};
    const normalizedPage =
      overlapCarouselTotalPages <= 1
        ? 0
        : ((overlapCarouselPage % overlapCarouselTotalPages) + overlapCarouselTotalPages) %
          overlapCarouselTotalPages;
    for (const [placementId, meta] of Object.entries(overlapGroupMetaByPlacementId)) {
      const size = Math.max(1, Number(meta.groupSize) || 1);
      next[placementId] = {
        isVisible:
          overlapCarouselTotalPages <= 1
            ? true
            : normalizedPage < size && normalizedPage === meta.groupPosition,
      };
    }
    return next;
  }, [overlapCarouselPage, overlapCarouselTotalPages, overlapGroupMetaByPlacementId]);

  const updateCarouselCenterFromElement = useCallback(
    (element: HTMLElement | null, setter: (value: number | null) => void) => {
      if (!element) {
        setter(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      setter(rect.left + rect.width / 2);
    },
    [],
  );

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const scrollEl = overlay.closest("[data-schedule-scroll]") as HTMLElement | null;
    mainScheduleScrollRef.current = scrollEl;
  }, [filteredSchedule.length, hideScheduleOverlay, historyMode]);

  useEffect(() => {
    if (!blockagesBusy || typeof window === "undefined") {
      setBlockagesBusyAnchor(null);
      return;
    }

    let rafId: number | null = null;
    let observedEl: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const resolveScrollEl = () =>
      mainScheduleScrollRef.current ??
      ((overlayRef.current?.closest("[data-schedule-scroll]") as HTMLElement | null) ?? null);

    const updateAnchor = () => {
      const scrollEl = resolveScrollEl();
      if (!scrollEl) {
        setBlockagesBusyAnchor(null);
        return;
      }
      if (observedEl !== scrollEl) {
        resizeObserver?.disconnect();
        observedEl = scrollEl;
        resizeObserver = new ResizeObserver(requestUpdate);
        resizeObserver.observe(scrollEl);
      }
      const rect = scrollEl.getBoundingClientRect();
      const left = Math.max(rect.left + 8, Math.min(rect.right - 8, rect.left + timeColPx + 12));
      const top = Math.max(rect.top + 8, Math.min(rect.bottom - 8, rect.top + 12));
      setBlockagesBusyAnchor({ left, top });
    };

    const requestUpdate = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateAnchor();
      });
    };

    updateAnchor();
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("scroll", requestUpdate, true);
    return () => {
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("scroll", requestUpdate, true);
      resizeObserver?.disconnect();
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [blockagesBusy, timeColPx, filteredSchedule.length, hideScheduleOverlay, historyMode]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const explicit = mainScheduleScrollRef.current;
    const fallback = (overlay.closest("[data-schedule-scroll]") as HTMLElement | null) ?? null;
    const scrollEl = explicit ?? fallback;
    if (!scrollEl) return;

    let rafId: number | null = null;
    const applyClip = () => {
      const leftInset = Math.max(0, timeColPx + scrollEl.scrollLeft);
      const clip = `inset(0px 0px 0px ${leftInset}px)`;
      overlay.style.setProperty("clip-path", clip);
      overlay.style.setProperty("-webkit-clip-path", clip);
    };
    const requestApply = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyClip();
      });
    };

    applyClip();
    scrollEl.addEventListener("scroll", requestApply, { passive: true });
    window.addEventListener("resize", requestApply);
    return () => {
      scrollEl.removeEventListener("scroll", requestApply);
      window.removeEventListener("resize", requestApply);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [
    timeColPx,
    filteredSchedule.length,
    visibleScheduleBlockages.length,
    isJiggleMode,
    blockageDraft,
    hideScheduleOverlay,
    historyMode,
  ]);

  useEffect(() => {
    const explicit = mainScheduleScrollRef.current;
    const fallback =
      (overlayRef.current?.closest("[data-schedule-scroll]") as HTMLElement | null) ?? null;
    const element = explicit ?? fallback;
    if (!element) {
      setMainCarouselCenterX(null);
      return;
    }
    const update = () => updateCarouselCenterFromElement(element, setMainCarouselCenterX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [
    filteredSchedule.length,
    hideScheduleOverlay,
    historyMode,
    commentsPanelOpen,
    leftPanelOpen,
    isNarrowMobile,
    selectedUnitId,
    updateCarouselCenterFromElement,
  ]);

  useEffect(() => {
    const element = previewScheduleScrollRef.current;
    if (!element) {
      setPreviewCarouselCenterX(null);
      return;
    }
    const update = () => updateCarouselCenterFromElement(element, setPreviewCarouselCenterX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [
    candidateDialogOpen,
    previewMode,
    previewCandidateIndex,
    previewSelectedUnitId,
    updateCarouselCenterFromElement,
  ]);

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
        const remainingPlacements = Math.max(0, requiredPlacements - currentPlacements);
        const needsPlacement = remainingPlacements > 0;
        if (!needsPlacement) return [];
        const trId = cellTimeRangeById[cellKey];
        const trMeta = trId ? timeRangeMetaById[trId] : undefined;
        const trDurationSlots =
          trMeta
            ? Math.max(1, trMeta.endSlot - trMeta.startSlot)
            : null;
        const splitPartSlots = Array.isArray(cellSplitPartSlotsById[cellKey]) ? cellSplitPartSlotsById[cellKey] : [];
        const nextSplitPartSlot =
          splitPartSlots.length > 0
            ? splitPartSlots[Math.min(currentPlacements, splitPartSlots.length - 1)]
            : null;
        const baseDurationSlots = Math.max(1, Number(cellDurationSlotsById[cellKey] ?? trDurationSlots ?? 1) || 1);
        const evenlySplitFallbackSlots =
          requiredPlacements > 1 ? Math.max(1, Math.ceil(baseDurationSlots / requiredPlacements)) : null;
        const durationSlots = nextSplitPartSlot ?? evenlySplitFallbackSlots ?? baseDurationSlots;
        const timeLabel = trMeta
          ? formatSlotRange(dayStartMin, slotMin, trMeta.startSlot, trMeta.endSlot)
          : t("grid_schedule.no_time_range");
        const cellBundles = (cellPinMetaById[cellKey]?.bundles || []).map(String);
        const globalNoUnitBundles = Object.entries(bundleUnitsById)
          .filter(([, unitIds]) => (unitIds || []).length === 0)
          .map(([bundleId]) => String(bundleId));
        const matchingBundles = scopedUnitId
          ? cellBundles.filter((bundleId) =>
              (bundleUnitsById[bundleId] || []).map(String).includes(scopedUnitId),
            )
          : isNoUnitScopeSelected
          ? cellBundles.filter((bundleId) => (bundleUnitsById[bundleId] || []).length === 0)
          : cellBundles;
        const noUnitFallbackBundleId =
          isNoUnitScopeSelected && globalNoUnitBundles.length > 0 ? globalNoUnitBundles[0] : undefined;
        const selectedBundleId =
          matchingBundles[0] ??
          noUnitFallbackBundleId ??
          cellBundles[0] ??
          null;
        if (scopedUnitId && matchingBundles.length === 0) return [];
        if (isNoUnitScopeSelected && matchingBundles.length === 0 && !selectedBundleId && cellBundles.length > 0) {
          return [];
        }
        const unitIds = selectedBundleId
          ? (bundleUnitsById[selectedBundleId] || []).map(String)
          : [];
        const canGrabForCurrentTab =
          selectedBundleId != null || (isNoUnitScopeSelected && cellBundles.length === 0);
        return [{
          id: cellKey,
          name,
          color: cellColorById[cellKey] || "",
          timeLabel,
          durationSlots,
          remainingPlacements,
          totalPlacements: requiredPlacements,
          selectedBundleId,
          unitIds,
          canGrabForCurrentTab,
        }];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    bundleUnitsById,
    cellColorById,
    cellDurationSlotsById,
    cellNameById,
    cellPinMetaById,
    cellSplitPartSlotsById,
    cellRequiredPlacementsById,
    cellTimeRangeById,
    schedule,
    scopedUnitId,
    isNoUnitScopeSelected,
    dayStartMin,
    slotMin,
    timeRangeMetaById,
  ]);

  const eligibleParticipantIdsByCellId = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    const allCellIds = new Set<string>([
      ...Object.keys(cellNameById).map(String),
      ...Object.keys(cellPinMetaById).map(String),
      ...Object.keys(cellTierPoolsById).map(String),
      ...Object.keys(cellStaffsById).map(String),
    ]);
    for (const cellId of allCellIds) {
      const nextSet = new Set<string>();
      const tierPools = cellTierPoolsById[cellId] || ({} as Record<TierKey, string[]>);
      for (const tier of ["PRIMARY", "SECONDARY", "TERTIARY"] as TierKey[]) {
        for (const participantId of tierPools[tier] || []) {
          nextSet.add(String(participantId));
        }
      }
      for (const staffId of cellStaffsById[cellId] || []) {
        for (const participantId of staffMembersByStaffId[String(staffId)] || []) {
          nextSet.add(String(participantId));
        }
      }
      out[cellId] = nextSet;
    }
    return out;
  }, [cellNameById, cellPinMetaById, cellTierPoolsById, cellStaffsById, staffMembersByStaffId]);

  const getCellHeadcount = useCallback(
    (sourceCellId: string) =>
      TIERS.reduce((sum, tier) => sum + Math.max(0, Number(cellTierCountsById[sourceCellId]?.[tier] || 0)), 0),
    [cellTierCountsById],
  );

  const isParticipantEligibleByTierPools = useCallback(
    (sourceCellId: string, participantId: string) => {
      const noTierRequirements = TIERS.every(
        (tier) => Math.max(0, Number(cellTierCountsById[sourceCellId]?.[tier] || 0)) === 0,
      );
      if (noTierRequirements) return true;
      const tierPools = cellTierPoolsById[sourceCellId] || ({} as Record<TierKey, string[]>);
      return TIERS.some((tier) => (tierPools[tier] || []).map(String).includes(String(participantId)));
    },
    [cellTierCountsById, cellTierPoolsById],
  );

  const participantScrollerItems = useMemo(
    () => {
      const allParticipants = Object.entries(participantNameById)
        .map(([id, name]) => ({
          id,
          name: name || `#${id}`,
          tier: gridTierEnabled ? participantTierById[id] ?? null : null,
        }));

      if (!scopedUnitId && !isNoUnitScopeSelected) {
        return allParticipants.sort((a, b) => a.name.localeCompare(b.name));
      }

      const relevantCellIds = Object.keys(cellPinMetaById).flatMap((cellId) => {
        const bundles = (cellPinMetaById[cellId]?.bundles || []).map(String);
        const matchingBundles = scopedUnitId
          ? bundles.filter((bundleId) => (bundleUnitsById[bundleId] || []).map(String).includes(scopedUnitId))
          : isNoUnitScopeSelected
          ? bundles.filter((bundleId) => (bundleUnitsById[bundleId] || []).length === 0)
          : bundles;
        if ((scopedUnitId || isNoUnitScopeSelected) && matchingBundles.length === 0) return [];
        return [String(cellId)];
      });

      const eligible = new Set<string>();
      for (const cellId of relevantCellIds) {
        for (const participantId of eligibleParticipantIdsByCellId[String(cellId)] || []) {
          eligible.add(String(participantId));
        }
      }

      return allParticipants
        .filter((participant) => eligible.has(String(participant.id)))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [
      scopedUnitId,
      isNoUnitScopeSelected,
      cellPinMetaById,
      bundleUnitsById,
      cellTierPoolsById,
      cellStaffsById,
      staffMembersByStaffId,
      participantNameById,
      participantTierById,
      gridTierEnabled,
      eligibleParticipantIdsByCellId,
    ],
  );

  const precheckDiagnostics = useMemo(
    () => getPrecheckDiagnostics(precheck),
    [precheck],
  );
  const hasBlockingPrecheckErrors = precheckDiagnostics.hasBlockingErrors;
  const precheckBlockingLines = useMemo(
    () =>
      (precheckDiagnostics.errors.length > 0 ? precheckDiagnostics.errors : precheckDiagnostics.all)
        .map((violation) => formatPrecheckViolation(violation))
        .filter(Boolean),
    [precheckDiagnostics.all, precheckDiagnostics.errors],
  );
  const precheckWarningLines = useMemo(
    () => precheckDiagnostics.warnings.map((violation) => formatPrecheckViolation(violation)).filter(Boolean),
    [precheckDiagnostics.warnings],
  );

  const isInputUnchanged = Boolean(inputSignature);
  const hasPendingCandidateResolution =
    canSolve &&
    scheduleViewMode === "draft" &&
    Boolean(candidateRunId) &&
    solveCandidates.length > 0;
  const canUseSolve =
    canSolve &&
    hasCells &&
    !isSolving &&
    !hasPendingCandidateResolution &&
    !isInputUnchanged &&
    !isInputSignatureLoading &&
    !precheckBusy;
  const canPublishDraft =
    canSolve &&
    scheduleViewMode === "draft" &&
    Array.isArray(currentSchedule?.placements) &&
    currentSchedule.placements.length > 0 &&
    !isPublishing;
  const canPinCards = enablePinning && role === "supervisor" && scheduleViewMode === "draft";
  const canManualEditCards =
    role === "supervisor" &&
    scheduleViewMode === "draft" &&
    !hasPendingCandidateResolution;
  const canCommentCards =
    scheduleViewMode === "published" &&
    Boolean(currentSchedule?.published_schedule_id ?? currentSchedule?.id) &&
    !historyMode;
  const hasUnassignedCells = unassignedCells.length > 0;
  const hasPlacedCells = Array.isArray(currentSchedule?.placements) && currentSchedule.placements.length > 0;
  const hasOverstaffableCells = useMemo(
    () => gridAllowsOverstaffing && Object.values(cellAllowOverstaffById).some(Boolean),
    [cellAllowOverstaffById, gridAllowsOverstaffing],
  );
  const isUnassignedToolActive = isJiggleMode && editToolMode === "unassigned";
  const isBreakToolActive = isJiggleMode && editToolMode === "break";
  const isBlockageToolActive = isJiggleMode && editToolMode === "blockage";
  const isParticipantsToolActive = isJiggleMode && editToolMode === "participants";

  useEffect(() => {
    onGlobalScopeMetaChange?.({
      hasUnitlessPlacements,
      hasNoUnitCells,
      blockageGlobalModeActive: canManualEditCards && isBlockageToolActive,
    });
  }, [
    canManualEditCards,
    hasNoUnitCells,
    hasUnitlessPlacements,
    isBlockageToolActive,
    onGlobalScopeMetaChange,
  ]);
  const breakDialogDurationMin = Math.max(
    slotMin,
    (Math.max(1, breakDialogState.endSlot - breakDialogState.startSlot) * slotMin),
  );

  const onSolvePressed = () => {
    if (!canUseSolve) return;
    if (precheckError) {
      openPrecheckDialog(true, [precheckError]);
      return;
    }
    if (hasBlockingPrecheckErrors) {
      openPrecheckDialog(true, precheckBlockingLines);
      return;
    }
    if (precheckWarningLines.length > 0) {
      openPrecheckDialog(false, precheckWarningLines);
      return;
    }
    void runSolve();
  };

  const closeEditModes = useCallback(() => {
    setEditToolMode("none");
    setIsJiggleMode(false);
    setBlockageDraft(null);
    setBlockageDragState(null);
    closeRightDockFan();
    clearLongPressTimer();
    setDragState(null);
    clearPlacementPreviewState();
  }, [clearPlacementPreviewState, closeRightDockFan]);

  const activateEditTool = useCallback(
    (tool: EditToolMode) => {
      if (tool === "none") {
        closeEditModes();
        return;
      }
      setEditToolMode(tool);
      setIsJiggleMode(true);
      setPinError(null);
      setBreakDialogError(null);
      if (tool !== "blockage") {
        setBlockageDraft(null);
        setBlockageDragState(null);
      }
      if (tool !== "break") {
        setBreakDialogState((prev) => ({ ...prev, open: false }));
      }
    },
    [closeEditModes],
  );

  const handleUnassignedScrollerGrabStart = useCallback(
    (payload: {
      cardKey: string;
      sourceCellId: string;
      sourceBundleId: string | null;
      cellName: string;
      durationSlots: number;
      pointerId: number;
      clientX: number;
      clientY: number;
      grabOffsetX: number;
      grabOffsetY: number;
      offsetX: number;
      offsetY: number;
    }) => {
      if (!canManualEditCards || !isJiggleMode) return;
      clearLongPressTimer();
      setPinError(null);
      setDragState({
        dragType: "unassigned",
        cardKey: payload.cardKey,
        sourceCellId: payload.sourceCellId,
        sourceBundleId: payload.sourceBundleId,
        cellName: payload.cellName,
        originalDayIndex: null,
        originalStartSlot: null,
        durationSlots: Math.max(1, Number(payload.durationSlots) || 1),
        pointerId: payload.pointerId,
        clientX: payload.clientX,
        clientY: payload.clientY,
        offsetX: payload.offsetX,
        offsetY: payload.offsetY,
        grabOffsetX: payload.grabOffsetX,
        grabOffsetY: payload.grabOffsetY,
      });
      void loadPlacementPreviewForDrag({
        mode: "PLACE_UNASSIGNED_CELL",
        sourceCellId: payload.sourceCellId,
        bundleId: payload.sourceBundleId,
        durationSlots: Math.max(1, Number(payload.durationSlots) || 1),
      });
    },
    [canManualEditCards, clearLongPressTimer, isJiggleMode, loadPlacementPreviewForDrag],
  );

  const handleParticipantScrollerGrabStart = useCallback(
    (payload: {
      cardKey: string;
      participantId: string;
      participantName: string;
      pointerId: number;
      clientX: number;
      clientY: number;
      grabOffsetX: number;
      grabOffsetY: number;
      offsetX: number;
      offsetY: number;
    }) => {
      if (!canManualEditCards || !isJiggleMode) return;
      clearLongPressTimer();
      setPinError(null);
      setDragState({
        dragType: "participant-tool",
        cardKey: payload.cardKey,
        participantId: payload.participantId,
        participantName: payload.participantName,
        pointerId: payload.pointerId,
        clientX: payload.clientX,
        clientY: payload.clientY,
        offsetX: payload.offsetX,
        offsetY: payload.offsetY,
        grabOffsetX: payload.grabOffsetX,
        grabOffsetY: payload.grabOffsetY,
      });
    },
    [canManualEditCards, clearLongPressTimer, isJiggleMode],
  );

  const clearParticipantDropGhostTimers = useCallback(() => {
    for (const timer of participantDropGhostTimersRef.current) {
      window.clearTimeout(timer);
    }
    participantDropGhostTimersRef.current = [];
  }, []);

  const triggerParticipantDropGhost = useCallback(
    (
      mode: "valid" | "invalid",
      payload: { x: number; y: number; participantId: string; participantName: string },
    ) => {
      clearParticipantDropGhostTimers();
      participantDropGhostTokenRef.current += 1;
      const token = participantDropGhostTokenRef.current;
      setParticipantDropGhost({
        token,
        mode,
        phase: "start",
        x: payload.x,
        y: payload.y,
        participantId: payload.participantId,
        participantName: payload.participantName,
      });
      if (mode === "valid") {
        const reboundTimer = window.setTimeout(() => {
          setParticipantDropGhost((prev) =>
            prev && prev.token === token
              ? {
                  ...prev,
                  phase: "rebound",
                }
              : prev,
          );
        }, 95);
        const fadeTimer = window.setTimeout(() => {
          setParticipantDropGhost((prev) =>
            prev && prev.token === token
              ? {
                  ...prev,
                  phase: "end",
                }
              : prev,
          );
        }, 250);
        const cleanupTimer = window.setTimeout(() => {
          setParticipantDropGhost((prev) => (prev && prev.token === token ? null : prev));
        }, 420);
        participantDropGhostTimersRef.current.push(reboundTimer, fadeTimer, cleanupTimer);
        return;
      }

      const fallTimer = window.setTimeout(() => {
        setParticipantDropGhost((prev) =>
          prev && prev.token === token
            ? {
                ...prev,
                phase: "end",
              }
            : prev,
        );
      }, 16);
      const cleanupTimer = window.setTimeout(() => {
        setParticipantDropGhost((prev) => (prev && prev.token === token ? null : prev));
      }, 240);
      participantDropGhostTimersRef.current.push(fallTimer, cleanupTimer);
    },
    [clearParticipantDropGhostTimers],
  );

  const evaluateParticipantDropTarget = useCallback(
    (clientX: number, clientY: number, participantId: string) => {
      const rawTarget = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const placementElement = rawTarget?.closest("[data-placement-id]") as HTMLElement | null;
      const placementId = placementElement?.getAttribute("data-placement-id");
      if (!placementId || !currentSchedule?.placements) {
        return { placementId: null as string | null, placement: null as ScheduleRow | null, sourceCellId: null as string | null, existingAssigned: [] as string[], canDrop: false, reason: "empty" as const };
      }
      const placement =
        currentSchedule.placements.find((entry) => String(entry.id) === String(placementId)) ?? null;
      if (!placement) {
        return { placementId: String(placementId), placement: null as ScheduleRow | null, sourceCellId: null as string | null, existingAssigned: [] as string[], canDrop: false, reason: "empty" as const };
      }
      const sourceCellId = String(
        readEntityId((placement as { source_cell?: unknown }).source_cell) ??
          readEntityId((placement as { source_cell_id?: unknown }).source_cell_id) ??
          placementId,
      );
      const existingAssigned = normalizeIdArray((placement as { assigned_participants?: unknown }).assigned_participants);
      if (existingAssigned.includes(participantId)) {
        return { placementId: String(placementId), placement, sourceCellId, existingAssigned, canDrop: false, reason: "already_assigned" as const };
      }
      const overstaffAllowed = Boolean(cellAllowOverstaffById[sourceCellId]);
      const headcount = getCellHeadcount(sourceCellId);
      if (!overstaffAllowed && existingAssigned.length >= headcount) {
        return { placementId: String(placementId), placement, sourceCellId, existingAssigned, canDrop: false, reason: "capacity" as const };
      }
      const eligibleByTier = isParticipantEligibleByTierPools(sourceCellId, participantId);
      if (!eligibleByTier) {
        return { placementId: String(placementId), placement, sourceCellId, existingAssigned, canDrop: false, reason: "ineligible" as const };
      }
      return { placementId: String(placementId), placement, sourceCellId, existingAssigned, canDrop: true, reason: null as null };
    },
    [
      cellAllowOverstaffById,
      currentSchedule?.placements,
      getCellHeadcount,
      isParticipantEligibleByTierPools,
      normalizeIdArray,
    ],
  );

  useEffect(() => {
    if (editToolMode === "unassigned" && !hasUnassignedCells) {
      closeEditModes();
      return;
    }
    if (editToolMode === "break" && !hasPlacedCells) {
      closeEditModes();
      return;
    }
    if (editToolMode === "participants" && !hasOverstaffableCells) {
      closeEditModes();
    }
  }, [closeEditModes, editToolMode, hasOverstaffableCells, hasPlacedCells, hasUnassignedCells]);

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
      const res = await authFetch(`/api/grids/${encodeURIComponent(String(gridId))}/schedule/export?${query.toString()}`, {
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
      const res = await authFetch(`/api/grids/${encodeURIComponent(String(gridId))}/schedule/restore-published/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `${t("solve_overlay.could_not_restore_draft")} (${res.status})`);
      }
      writeGridScheduleViewMode(gridId, "draft");
      invalidateGridScreenContext(gridId, "draft");
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
    if (dragState.dragType === "participant-tool") return null;
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

  const activeDragPreviewItem = useMemo(() => {
    if (!dragPreview) return null;
    if (!dragState || dragState.dragType === "participant-tool") return null;
    const validation = getDropValidation(
      dragPreview.dayIndex,
      dragPreview.startSlot,
      placementPreviewDurationSlots ?? dragState.durationSlots,
      placementPreviewBySlot,
    );
    return validation.canDrop ? validation.startItem : validation.reasonItem;
  }, [dragPreview, dragState, placementPreviewBySlot, placementPreviewDurationSlots]);

  const backendPreviewRegions = useMemo(() => {
    const byDay = new Map<number, PlacementPreviewItem[]>();
    for (const item of Object.values(placementPreviewBySlot)) {
      if (item.day_index < 0 || item.day_index >= daysCount) continue;
      const normalized = {
        ...item,
        slot: Math.max(0, Math.round(item.slot)),
      };
      const list = byDay.get(normalized.day_index) ?? [];
      list.push(normalized);
      byDay.set(normalized.day_index, list);
    }

    const regions: PlacementPreviewRegion[] = [];
    for (const [dayIndex, items] of byDay.entries()) {
      const sorted = items.sort((a, b) => a.slot - b.slot);
      let current: PlacementPreviewRegion | null = null;
      for (const item of sorted) {
        const itemVisualEnd = item.slot + 1;
        if (
          current &&
          current.status === item.status &&
          current.quality === item.quality &&
          current.visual_kind === item.visual_kind &&
          current.time_range_kind === item.time_range.kind &&
          current.end_slot === item.slot
        ) {
          current.end_slot = itemVisualEnd;
          current.placements.push(item);
          continue;
        }
        if (current) regions.push(current);
        current = {
          day_index: dayIndex,
          start_slot: item.slot,
          end_slot: itemVisualEnd,
          status: item.status,
          quality: item.quality,
          visual_kind: item.visual_kind,
          time_range_kind: item.time_range.kind,
          placements: [item],
        };
      }
      if (current) regions.push(current);
    }

    return regions.sort(
      (a, b) => a.day_index - b.day_index || a.start_slot - b.start_slot || a.end_slot - b.end_slot,
    );
  }, [daysCount, placementPreviewBySlot]);

  const getWarningDistance = (item: PlacementPreviewItem) => {
    const reasonDistance = item.reasons
      .map((reason) => Number(reason.distance_slots))
      .find((value) => Number.isFinite(value) && value > 0);
    return Math.max(
      0,
      Number(item.time_range.distance_slots ?? item.classification.time_range_distance_slots ?? reasonDistance ?? 1) || 1,
    );
  };

  const warningDistanceColor = (distance: number) => {
    const intensity = Math.max(0, Math.min(1, distance / 6));
    return `rgba(${254 - Math.round(intensity * 3)}, ${240 - Math.round(intensity * 94)}, ${138 - Math.round(intensity * 78)}, ${0.36 + intensity * 0.32})`;
  };

  const getPlacementRegionStyle = (region: PlacementPreviewRegion) => {
    if (region.status === "INVALID" && region.visual_kind === "BLOCKED") {
      return {
        outer:
          "border-red-600/80 shadow-[0_10px_28px_rgba(220,38,38,0.28)] ring-1 ring-red-300/70",
        style: {
          background:
            "linear-gradient(to bottom, rgba(248,113,113,0.48), rgba(244,63,94,0.58))",
        } as CSSProperties,
      };
    }
    if (region.status === "WARNING") {
      const placements = region.placements.length > 0 ? region.placements : [];
      const stops = placements.map((placement, index) => {
        const pct =
          placements.length <= 1
            ? 50
            : Math.round((index / Math.max(1, placements.length - 1)) * 100);
        return `${warningDistanceColor(getWarningDistance(placement))} ${pct}%`;
      });
      const isRecommended = region.quality === "RECOMMENDED";
      return {
        outer: isRecommended
          ? "border-emerald-500/90 shadow-[0_8px_22px_rgba(16,185,129,0.18)] ring-1 ring-amber-300/70"
          : "border-amber-500/80 shadow-[0_8px_20px_rgba(245,158,11,0.18)]",
        style: {
          background:
            stops.length > 1
              ? isRecommended
                ? `linear-gradient(to bottom, ${stops.join(", ")}), linear-gradient(to bottom, rgba(16,185,129,0.20), rgba(16,185,129,0.10))`
                : `linear-gradient(to bottom, ${stops.join(", ")})`
              : `linear-gradient(to bottom, ${warningDistanceColor(
                  placements[0] ? getWarningDistance(placements[0]) : 1,
                )}, rgba(251, 146, 60, 0.34))${isRecommended ? ", linear-gradient(to bottom, rgba(16,185,129,0.22), rgba(16,185,129,0.08))" : ""}`,
        } as CSSProperties,
      };
    }
    if (region.status === "INVALID") {
      return {
        outer: "border-red-600/95 shadow-[0_8px_24px_rgba(220,38,38,0.30)]",
        style: {
          background:
            "linear-gradient(to bottom, rgba(248,113,113,0.58), rgba(244,63,94,0.66))",
        } as CSSProperties,
      };
    }
    if (region.quality === "RECOMMENDED") {
      return {
        outer:
          "border-emerald-600/95 shadow-[0_10px_28px_rgba(16,185,129,0.34)] ring-1 ring-emerald-400/70",
        style: {
          background:
            "linear-gradient(to bottom, rgba(52,211,153,0.62), rgba(16,185,129,0.46))",
        } as CSSProperties,
      };
    }
    return {
      outer: "border-gray-300/80 bg-white/45 shadow-[0_6px_16px_rgba(15,23,42,0.08)]",
      style: undefined as CSSProperties | undefined,
    };
  };

  const activeDragPreviewStyle = useMemo(() => {
    if (placementPreviewBusy || !activeDragPreviewItem) {
      return {
        outer: "border-gray-400/90 bg-gray-100/30",
        text: "text-gray-700",
      };
    }
    if (!activeDragPreviewItem.drop_allowed) {
      return {
        outer: "border-red-500/95 bg-red-100/45 shadow-[0_8px_24px_rgba(239,68,68,0.22)]",
        text: "text-red-950",
      };
    }
    if (activeDragPreviewItem.status === "WARNING" && activeDragPreviewItem.quality === "RECOMMENDED") {
      return {
        outer: "border-emerald-500/90 bg-amber-100/45 shadow-[0_8px_24px_rgba(16,185,129,0.18)] ring-1 ring-amber-300/70",
        text: "text-amber-950",
      };
    }
    if (activeDragPreviewItem.status === "WARNING") {
      return {
        outer: "border-amber-500/90 bg-amber-100/45 shadow-[0_8px_24px_rgba(245,158,11,0.22)]",
        text: "text-amber-950",
      };
    }
    if (activeDragPreviewItem.quality === "RECOMMENDED") {
      return {
        outer:
          "border-emerald-600/95 bg-emerald-200/65 shadow-[0_10px_28px_rgba(16,185,129,0.34)] ring-1 ring-emerald-400/70",
        text: "text-emerald-950",
      };
    }
    if (activeDragPreviewItem.status === "VALID") {
      return {
        outer: "border-sky-400/90 bg-sky-100/35 shadow-[0_8px_24px_rgba(14,165,233,0.18)]",
        text: "text-sky-950",
      };
    }
    return {
      outer: "border-red-500/95 bg-red-100/45 shadow-[0_8px_24px_rgba(239,68,68,0.22)]",
      text: "text-red-950",
    };
  }, [activeDragPreviewItem, placementPreviewBusy]);

  const hasUsablePlacementPreviewMap = Object.keys(placementPreviewBySlot).length > 0;
  const placementPreviewLoadingWithoutCache =
    placementPreviewBusy &&
    !hasUsablePlacementPreviewMap &&
    (pendingDropWhilePreviewLoading != null || dragState?.dragType !== "participant-tool");
  const scheduleValidationMaskActive = placementPreviewLoadingWithoutCache || blockageMutationBusy;

  useEffect(() => {
    if (!scheduleValidationMaskActive) {
      setPlacementPreviewMaskRect(null);
      return;
    }
    const syncMaskRect = () => {
      const overlayElement = overlayRef.current;

      const source =
        mainScheduleScrollRef.current ??
        (overlayElement?.closest("[data-schedule-scroll]") as HTMLElement | null | undefined) ??
        overlayElement;

      if (!source) {
        setPlacementPreviewMaskRect(null);
        return;
      }
      const rect = source.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.right);
      const bottom = Math.min(viewportHeight, rect.bottom);
      const next = {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
      setPlacementPreviewMaskRect((prev) =>
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
    };
    syncMaskRect();
    window.addEventListener("resize", syncMaskRect);
    window.addEventListener("scroll", syncMaskRect, true);
    return () => {
      window.removeEventListener("resize", syncMaskRect);
      window.removeEventListener("scroll", syncMaskRect, true);
    };
  }, [scheduleValidationMaskActive]);

  useEffect(() => {
    if (dragState?.dragType === "participant-tool") return;
    setParticipantDragHoverPlacementId(null);
  }, [dragState]);

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

  const getPublishedPlacementIdForCard = useCallback(
    (entry: ScheduleRow): string | number | null => {
      const explicit =
        readEntityId(entry.published_placement_id) ??
        readEntityId((entry as { publishedPlacementId?: unknown }).publishedPlacementId) ??
        readEntityId(entry.snapshot_placement_id) ??
        readEntityId((entry as { snapshotPlacementId?: unknown }).snapshotPlacementId);
      if (explicit != null) return explicit;
      if (scheduleViewMode !== "published") return null;

      const rowId = readEntityId(entry.cell_id);
      const realPlacementId =
        readEntityId(entry.placement_id) ??
        readEntityId(entry.schedule_placement_id) ??
        readEntityId((entry as { schedule_placement?: unknown }).schedule_placement);
      if (rowId != null && realPlacementId != null && String(rowId) !== String(realPlacementId)) return rowId;
      if (rowId != null && realPlacementId == null) return rowId;
      return null;
    },
    [scheduleViewMode],
  );

  const commentCountByPlacement = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of placementComments) {
      const anchorKey = buildPlacementKey(
        c.published_schedule,
        c.source_cell_id,
        c.bundle,
        Number(c.day_index),
        Number(c.start_slot),
        c.published_placement,
      );
      map[anchorKey] = (map[anchorKey] || 0) + 1;
      if (c.schedule_placement != null) {
        const placementKey = buildPlacementKey(
          c.published_schedule,
          c.source_cell_id,
          c.bundle,
          Number(c.day_index),
          Number(c.start_slot),
          c.published_placement,
        );
        if (placementKey !== anchorKey) {
          map[placementKey] = (map[placementKey] || 0) + 1;
        }
      }
    }
    return map;
  }, [placementComments]);

  const commentPlacementOptions = useMemo<CommentPlacementOption[]>(() => {
    if (!canCommentCards || currentSchedule?.id == null || activePublishedScheduleId == null) return [];
    const deduped = new Map<string, CommentPlacementOption>();
    for (const s of filteredSchedule) {
      const sourceCellId = String(s.source_cell_id ?? s.cell_id);
      const placementId = String(s.cell_id ?? "");
      const publishedPlacementId = getPublishedPlacementIdForCard(s);
      const resolvedBundleId = resolveBundleIdForCard(s);
      const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
      const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
      const key = buildPlacementKey(
        activePublishedScheduleId,
        sourceCellId,
        resolvedBundleId,
        s.day_index,
        s.start_slot,
        publishedPlacementId,
      );
      if (deduped.has(key)) continue;
      deduped.set(key, {
        key,
        label: `${cellName} - ${timeLabel}`,
        count: commentCountByPlacement[key] || 0,
        anchor: {
          placementId: placementId || null,
          publishedPlacementId,
          scheduleId: currentSchedule.id,
          publishedScheduleId: activePublishedScheduleId,
          sourceCellId,
          bundleId: resolvedBundleId,
          dayIndex: s.day_index,
          startSlot: s.start_slot,
          endSlot: s.end_slot,
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
    activePublishedScheduleId,
    canCommentCards,
    cellNameById,
    commentCountByPlacement,
    currentSchedule?.id,
    dayStartMin,
    filteredSchedule,
    getPublishedPlacementIdForCard,
    resolveBundleIdForCard,
    slotMin,
  ]);

  useEffect(() => {
    if (!commentsPanelOpen) {
      commentManuallyDeselectedRef.current = false;
      return;
    }
    if (commentPlacementOptions.length === 0) {
      setCommentAnchor(null);
      return;
    }
    if (!commentAnchor) {
      if (commentManuallyDeselectedRef.current) return;
      setCommentAnchor(commentPlacementOptions[0].anchor);
      return;
    }
    const hasCurrent = commentPlacementOptions.some(
      (option) =>
        String(option.anchor.publishedScheduleId) === String(commentAnchor.publishedScheduleId) &&
        String(option.anchor.publishedPlacementId ?? "") === String(commentAnchor.publishedPlacementId ?? "") &&
        String(option.anchor.placementId ?? "") === String(commentAnchor.placementId ?? "") &&
        String(option.anchor.sourceCellId) === String(commentAnchor.sourceCellId) &&
        String(option.anchor.bundleId) === String(commentAnchor.bundleId) &&
        Number(option.anchor.dayIndex) === Number(commentAnchor.dayIndex) &&
        Number(option.anchor.startSlot) === Number(commentAnchor.startSlot) &&
        Number(option.anchor.endSlot) === Number(commentAnchor.endSlot),
    );
    if (!hasCurrent) {
      commentManuallyDeselectedRef.current = false;
      setCommentAnchor(commentPlacementOptions[0].anchor);
    }
  }, [commentAnchor, commentPlacementOptions, commentsPanelOpen]);

  useEffect(() => {
    if (commentsPanelOpen) return;
    commentManuallyDeselectedRef.current = false;
    setCommentError(null);
    setCommentBusy(false);
    setHoveredCommentPlacementKey(null);
  }, [commentsPanelOpen]);

  useEffect(() => {
    if (!commentsPanelOpen || canCommentCards) return;
    onCommentsPanelOpenChange?.(false);
  }, [canCommentCards, commentsPanelOpen, onCommentsPanelOpenChange]);

  useEffect(() => {
    if (!commentsPanelOpen) return;
    commentManuallyDeselectedRef.current = true;
    setCommentAnchor(null);
    setHoveredCommentPlacementKey(null);
  }, [commentsPanelOpen, overlapCarouselPage]);

  useEffect(() => {
    if (!commentsPanelOpen) return;
    commentManuallyDeselectedRef.current = true;
    setCommentAnchor(null);
    setHoveredCommentPlacementKey(null);
  }, [commentsPanelOpen, selectedUnitId]);

  const activePlacementComments = useMemo(() => {
    if (!commentAnchor) return [];
    return placementComments.filter((c) => {
      const placementMatches =
        commentAnchor.publishedPlacementId != null &&
        c.published_placement != null &&
        String(c.published_placement) === String(commentAnchor.publishedPlacementId);
      const anchorMatches =
        String(c.published_schedule) === String(commentAnchor.publishedScheduleId) &&
        String(c.source_cell_id) === String(commentAnchor.sourceCellId) &&
        String(c.bundle) === String(commentAnchor.bundleId) &&
        Number(c.day_index) === Number(commentAnchor.dayIndex) &&
        Number(c.start_slot) === Number(commentAnchor.startSlot);
      return placementMatches || anchorMatches;
    });
  }, [commentAnchor, placementComments]);

  const selectedCommentPlacementKey = commentAnchor
    ? buildPlacementKey(
        commentAnchor.publishedScheduleId,
        commentAnchor.sourceCellId,
        commentAnchor.bundleId,
        commentAnchor.dayIndex,
        commentAnchor.startSlot,
        commentAnchor.publishedPlacementId,
      )
    : "";

  const selectedCommentPlacementIndex = useMemo(
    () => commentPlacementOptions.findIndex((option) => option.key === selectedCommentPlacementKey),
    [commentPlacementOptions, selectedCommentPlacementKey],
  );

  const moveCommentPlacementSelection = useCallback(
    (direction: -1 | 1) => {
      if (commentPlacementOptions.length === 0) return;
      const currentIndex = selectedCommentPlacementIndex >= 0 ? selectedCommentPlacementIndex : 0;
      const nextIndex =
        (currentIndex + direction + commentPlacementOptions.length) % commentPlacementOptions.length;
      const next = commentPlacementOptions[nextIndex];
      if (!next) return;
      commentManuallyDeselectedRef.current = false;
      setCommentAnchor(next.anchor);
      setCommentError(null);
    },
    [commentPlacementOptions, selectedCommentPlacementIndex],
  );
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
    if (!activePublishedScheduleId || scheduleViewMode !== "published") {
      setCommentError(t("solve_overlay.comments_unavailable"));
      return;
    }
    setCommentBusy(true);
    setCommentError(null);
    try {
      const payload: Record<string, unknown> = {
        published_schedule_id: commentAnchor.publishedScheduleId,
        source_cell_id: commentAnchor.sourceCellId,
        bundle: commentAnchor.bundleId,
        day_index: commentAnchor.dayIndex,
        start_slot: commentAnchor.startSlot,
        end_slot: commentAnchor.endSlot,
        text: commentDraft.trim(),
      };
      if (commentAnchor.publishedPlacementId != null && String(commentAnchor.publishedPlacementId).trim()) {
        payload.published_placement_id = commentAnchor.publishedPlacementId;
      }
      if (commentAnchor.placementId != null && String(commentAnchor.placementId).trim()) {
        payload.placement_id = commentAnchor.placementId;
      }
      const res = await authFetch("/api/placement-comments/", {
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
        published_schedule:
          raw.published_schedule_id ??
          raw.published_schedule ??
          raw.publishedScheduleId ??
          commentAnchor.publishedScheduleId,
        schedule: raw.schedule ?? raw.schedule_id ?? commentAnchor.scheduleId,
        published_placement:
          raw.published_placement_id ??
          raw.published_placement ??
          raw.publishedPlacementId ??
          commentAnchor.publishedPlacementId ??
          null,
        schedule_placement:
          raw.schedule_placement ??
          raw.schedule_placement_id ??
          raw.placement_id ??
          raw.placementId ??
          commentAnchor.placementId ??
          null,
        source_cell_id: raw.source_cell_id ?? commentAnchor.sourceCellId,
        bundle: bundleRaw ?? commentAnchor.bundleId,
        day_index: Number(raw.day_index ?? commentAnchor.dayIndex),
        start_slot: Number(raw.start_slot ?? commentAnchor.startSlot),
        end_slot: raw.end_slot == null ? commentAnchor.endSlot : Number(raw.end_slot),
        text: String(raw.text ?? raw.message ?? commentDraft.trim()),
        created_at: raw.created_at,
        author_id: raw.author_id ?? extractAuthorId(raw.author) ?? currentUserId ?? undefined,
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
      const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locked: nextLocked }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to update lock (${res.status})`);
      }
      notifyDraftMutation();
      setPrecheckRefreshTick((prev) => prev + 1);
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

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  const saveBreakDialog = async () => {
    if (!breakDialogState.placementId) return;
    setBreakDialogBusy(true);
    setBreakDialogError(null);
    try {
      const normalized = [...breakDialogState.breaks]
        .map((entry) => ({
          offset_min: Math.round(Number(entry.offset_min)),
          duration_min: Math.round(Number(entry.duration_min)),
        }))
        .filter((entry) => Number.isFinite(entry.offset_min) && Number.isFinite(entry.duration_min))
        .sort((a, b) => a.offset_min - b.offset_min);
      await applyPlacementBreaks(breakDialogState.placementId, normalized);
      setBreakDialogState((prev) => ({ ...prev, open: false }));
    } catch (error: unknown) {
      setBreakDialogError(error instanceof Error ? error.message : "Could not update breaks.");
    } finally {
      setBreakDialogBusy(false);
    }
  };

  const applyPlacementBreaks = useCallback(
    async (placementId: string, nextBreaks: BreakEntry[]) => {
      if (!currentSchedule?.placements) return;
      const previousPlacements = currentSchedule.placements;
      const optimisticPlacements = previousPlacements.map((placement) =>
        String(placement.id) === placementId ? { ...placement, breaks: nextBreaks } : placement,
      );
      setCurrentSchedule((prev) =>
        prev
          ? {
              ...prev,
              placements: optimisticPlacements,
            }
          : prev,
      );
      try {
        const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ breaks: nextBreaks }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(parseApiErrorMessage(txt, `Failed to update breaks (${res.status})`));
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
        throw error;
      }
    },
    [currentSchedule, notifyDraftMutation],
  );

  const upsertBlockage = useCallback(
    async (id: string, dayIndex: number, startSlot: number, endSlot: number, unitScopeIds: string[] = []) => {
      const { startSlot: safeStart, endSlot: safeEnd } = clampSlotRange(startSlot, endSlot);
      const res = await authFetch(`/api/schedule-blockages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          day_index: dayIndex,
          start_slot: safeStart,
          end_slot: safeEnd,
          unit_ids: unitScopeIds.map(toApiId),
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(txt, `Failed to update blockage (${res.status})`));
      }
      notifyDraftMutation();
      setBlockagesRefreshTick((prev) => prev + 1);
      setPrecheckRefreshTick((prev) => prev + 1);
    },
    [clampSlotRange, notifyDraftMutation],
  );

  const createBlockage = useCallback(
    async (dayIndex: number, startSlot: number, endSlot: number) => {
      const scheduleForBlockage =
        currentSchedule?.id ? currentSchedule : await ensureDraftSchedule();
      if (!scheduleForBlockage?.id) {
        setPinError(t("grid_schedule.no_draft_schedule_error"));
        return;
      }
      const { startSlot: safeStart, endSlot: safeEnd } = clampSlotRange(startSlot, endSlot);
      const scopeIds = selectedBlockageUnitScopeIds.map(toApiId);
      const res = await authFetch("/api/schedule-blockages/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schedule: scheduleForBlockage.id,
          day_index: dayIndex,
          start_slot: safeStart,
          end_slot: safeEnd,
          note: "",
          unit_ids: scopeIds,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(parseApiErrorMessage(txt, `Failed to create blockage (${res.status})`));
      }
      await res.json().catch(() => ({}));
      notifyDraftMutation();
      setBlockagesRefreshTick((prev) => prev + 1);
      setPrecheckRefreshTick((prev) => prev + 1);
    },
    [clampSlotRange, currentSchedule, ensureDraftSchedule, notifyDraftMutation, selectedBlockageUnitScopeIds, t],
  );

  const executeDeleteBlockage = useCallback(
    async (blockage: ScheduleBlockage, deleteScope: BlockageDeleteScope, unitId: string | null) => {
      const previous = scheduleBlockages;
      setScheduleBlockages((prev) => prev.filter((entry) => entry.id !== blockage.id));
      try {
        const apiUnitId = toApiEntityId(unitId);
        const params = new URLSearchParams({ delete_scope: deleteScope });
        if (apiUnitId != null) params.set("unit_id", String(apiUnitId));
        const res = await authFetch(`/api/schedule-blockages/${encodeURIComponent(blockage.id)}/?${params.toString()}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 204) {
          const txt = await res.text().catch(() => "");
          throw new Error(parseApiErrorMessage(txt, `Failed to delete blockage (${res.status})`));
        }
        const rawText = await res.text().catch(() => "");
        if (rawText.trim() && currentSchedule?.id != null) {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(rawText) as Record<string, unknown>;
          } catch {
            data = {};
          }
          const revision = typeof data.schedule_revision === "string" ? data.schedule_revision : "";
          if (revision) {
            lastKnownScheduleRevisionBySchedule.set(
              getScheduleRevisionCacheId(gridId, currentSchedule.id),
              revision,
            );
          }
          invalidatePlacementPreviewCacheForSchedule(gridId, currentSchedule.id);
        } else if (currentSchedule?.id != null) {
          invalidatePlacementPreviewCacheForSchedule(gridId, currentSchedule.id);
        }
        notifyDraftMutation();
        setBlockagesRefreshTick((prev) => prev + 1);
        setPrecheckRefreshTick((prev) => prev + 1);
      } catch (error: unknown) {
        setScheduleBlockages(previous);
        throw error;
      }
    },
    [currentSchedule?.id, gridId, notifyDraftMutation, scheduleBlockages],
  );

  const deleteBlockage = useCallback(
    async (input: string | ScheduleBlockage) => {
      const blockage =
        typeof input === "string"
          ? scheduleBlockages.find((entry) => entry.id === input) ?? null
          : input;
      if (!blockage) return;
      const scopeIds = Array.isArray(blockage.unit_ids) ? blockage.unit_ids.map(String) : [];
      const isGlobalBlockage = scopeIds.length === 0;
      if (isGlobalBlockage && scopedUnitId) {
        setPendingBlockageDelete({ blockage, unitId: scopedUnitId });
        return;
      }
      await executeDeleteBlockage(
        blockage,
        scopedUnitId ? "CURRENT_UNIT_ONLY" : "GLOBAL",
        scopedUnitId,
      );
    },
    [executeDeleteBlockage, scheduleBlockages, scopedUnitId],
  );

  const isInsideDeleteDropTarget = useCallback((clientX: number, clientY: number) => {
    const el = document.querySelector<HTMLElement>("[data-left-delete-drop]");
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
            const deleteRes = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
              method: "DELETE",
            });
            if (!deleteRes.ok) {
              const txt = await deleteRes.text().catch(() => "");
              throw new Error(txt || `${t("solve_overlay.could_not_remove_placement")} (${deleteRes.status})`);
            }
          } else {
            const patchRes = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
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
        const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(placementId)}`, {
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

  const requestUnassignedPlacement = useCallback(
    async (
      sourceCellId: string,
      bundleId: string | number | null,
      dayIndex: number,
      startSlot: number,
      durationSlots: number,
    ) => {
      const endSlot = startSlot + durationSlots;
      lastPlacementAttemptRef.current = {
        sourceCellId,
        dayIndex,
        startSlot,
        endSlot,
      };

      if (hasPendingCandidateResolution) {
        setPinError(t("solve_overlay.resolve_pending_candidates"));
        return;
      }

      const dropValidation = getDropValidation(dayIndex, startSlot, durationSlots, placementPreviewBySlot);
      const previewItem = dropValidation.canDrop ? dropValidation.startItem : dropValidation.reasonItem;
      const hasUsableSlotMap = Object.keys(placementPreviewBySlot).length > 0;
      if (!dropValidation.canDrop) {
        setPinError(
          formatPlacementPreviewMessage(
            previewItem,
            placementPreviewBusy && !hasUsableSlotMap
              ? t("solve_overlay.placement_preview_wait")
              : t("solve_overlay.placement_preview_missing_or_blocked"),
          ),
        );
        clearPlacementPreviewState();
        return;
      }

      let rollbackPlacements: NonNullable<ScheduleResource["placements"]> | null = null;
      try {
        const scheduleForPlacement = await ensureDraftSchedule();
        if (!scheduleForPlacement?.id) {
          setPinError(t("grid_schedule.no_draft_schedule_error"));
          clearPlacementPreviewState();
          return;
        }
        const assignmentPreview = previewItem?.assignment_preview;
        const recommendedParticipantIds = (assignmentPreview?.recommended_participant_ids || []).map(String);
        if (assignmentPreview?.requires_user_selection) {
          const recommendedOptions: PlacementAssignmentOption[] =
            recommendedParticipantIds.length > 0
              ? [
                  {
                    id: "backend:recommended",
                    source: "pool",
                    participantIds: recommendedParticipantIds,
                    label: t("solve_overlay.backend_recommended_assignment"),
                    recommended: true,
                  },
                ]
              : [];
          setAssignmentOptions(recommendedOptions);
          setSelectedAssignmentOptionId(recommendedOptions[0]?.id ?? null);
          setPendingPlacementRequest({
            sourceCellId,
            bundleId,
            dayIndex,
            startSlot,
            durationSlots,
            previewItem,
          });
          setAssignmentDialogOpen(true);
          clearPlacementPreviewState();
          return;
        }

        const payload: ConfirmPlacementRequest = {
          mode: "PLACE_UNASSIGNED_CELL",
          schedule_id: scheduleForPlacement.id,
          day_index: dayIndex,
          start_slot: startSlot,
        };
        const bundleApiId = toApiEntityId(bundleId);
        if (bundleApiId != null) payload.bundle_id = bundleApiId;
        if (recommendedParticipantIds.length > 0) {
          payload.selected_participant_ids = recommendedParticipantIds.map((id) => toApiEntityId(id) ?? id);
        } else {
          payload.auto_select_participants = true;
        }
        const previousPlacements = Array.isArray(scheduleForPlacement.placements) ? scheduleForPlacement.placements : [];
        rollbackPlacements = previousPlacements;
        const optimisticPlacement = buildOptimisticPlacement({
          sourceCellId,
          bundleId,
          dayIndex,
          startSlot,
          durationSlots,
          assignedParticipants: recommendedParticipantIds,
        });
        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: [...(Array.isArray(prev.placements) ? prev.placements : previousPlacements), optimisticPlacement],
              }
            : {
                ...scheduleForPlacement,
                placements: [...previousPlacements, optimisticPlacement],
              },
        );
        clearPlacementPreviewState();
        const result = await confirmCellPlacement(sourceCellId, payload);
        applyConfirmedPlacementResponse(result, scheduleForPlacement.id, {
          replacementPlacementId: optimisticPlacement.id,
        });
        notifyDraftMutation();
      } catch (error: unknown) {
        clearPlacementPreviewState();
        if (rollbackPlacements) {
          const rollback = rollbackPlacements;
          setCurrentSchedule((prev) =>
            prev
              ? {
                  ...prev,
                  placements: rollback,
                }
              : prev,
          );
        }
        setPinError(error instanceof Error ? error.message : t("grid_schedule.could_not_place_cell"));
      }
    },
    [
      applyConfirmedPlacementResponse,
      buildOptimisticPlacement,
      clearPlacementPreviewState,
      confirmCellPlacement,
      ensureDraftSchedule,
      formatPlacementPreviewMessage,
      hasPendingCandidateResolution,
      notifyDraftMutation,
      placementPreviewBusy,
      placementPreviewBySlot,
      t,
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
    void (async () => {
      try {
        const scheduleForPlacement = await ensureDraftSchedule();
        if (!scheduleForPlacement?.id) {
          setPinError(t("grid_schedule.no_draft_schedule_error"));
          return;
        }
        const payload: ConfirmPlacementRequest = {
          mode: "PLACE_UNASSIGNED_CELL",
          schedule_id: scheduleForPlacement.id,
          day_index: pendingPlacementRequest.dayIndex,
          start_slot: pendingPlacementRequest.startSlot,
          selected_participant_ids: chosenOption.participantIds.map((id) => toApiEntityId(id) ?? id),
        };
        const bundleApiId = toApiEntityId(pendingPlacementRequest.bundleId);
        if (bundleApiId != null) payload.bundle_id = bundleApiId;
        const result = await confirmCellPlacement(pendingPlacementRequest.sourceCellId, payload);
        applyConfirmedPlacementResponse(result, scheduleForPlacement.id);
        notifyDraftMutation();
      } catch (error: unknown) {
        setPinError(error instanceof Error ? error.message : t("grid_schedule.could_not_place_cell"));
      }
    })();
  }, [
    applyConfirmedPlacementResponse,
    assignmentOptions,
    confirmCellPlacement,
    ensureDraftSchedule,
    notifyDraftMutation,
    pendingPlacementRequest,
    selectedAssignmentOptionId,
    t,
  ]);

  const confirmPendingPlacementWithAutoSelection = useCallback(() => {
    if (!pendingPlacementRequest) return;
    const request = pendingPlacementRequest;
    setAssignmentDialogOpen(false);
    setPendingPlacementRequest(null);
    setAssignmentOptions([]);
    setSelectedAssignmentOptionId(null);
    void (async () => {
      try {
        const scheduleForPlacement = await ensureDraftSchedule();
        if (!scheduleForPlacement?.id) {
          setPinError(t("grid_schedule.no_draft_schedule_error"));
          return;
        }
        const payload: ConfirmPlacementRequest = {
          mode: "PLACE_UNASSIGNED_CELL",
          schedule_id: scheduleForPlacement.id,
          day_index: request.dayIndex,
          start_slot: request.startSlot,
          auto_select_participants: true,
        };
        const bundleApiId = toApiEntityId(request.bundleId);
        if (bundleApiId != null) payload.bundle_id = bundleApiId;
        const result = await confirmCellPlacement(request.sourceCellId, payload);
        applyConfirmedPlacementResponse(result, scheduleForPlacement.id);
        notifyDraftMutation();
      } catch (error: unknown) {
        setPinError(error instanceof Error ? error.message : t("grid_schedule.could_not_place_cell"));
      }
    })();
  }, [applyConfirmedPlacementResponse, confirmCellPlacement, ensureDraftSchedule, notifyDraftMutation, pendingPlacementRequest, t]);

  const patchPlacementPosition = useCallback(
    async (placementId: string, nextDayIndex: number, nextStartSlot: number, durationSlots: number) => {
      if (!currentSchedule?.placements) return;
      const targetPlacement = currentSchedule.placements.find(
        (placement) => getPlacementIdentity(placement) === String(placementId),
      );
      if (!targetPlacement) return;
      if (targetPlacement.locked) {
        setPinError(t("solve_overlay.locked_placements_cannot_be_moved"));
        return;
      }
      const nextEndSlot = nextStartSlot + durationSlots;
      const targetSourceCellId = String(
        readEntityId((targetPlacement as { source_cell?: unknown }).source_cell) ??
          readEntityId((targetPlacement as { source_cell_id?: unknown }).source_cell_id) ??
          placementId,
      );
      const targetParticipants = normalizeIdArray(
        (targetPlacement as { assigned_participants?: unknown }).assigned_participants,
      );
      lastPlacementAttemptRef.current = {
        sourceCellId: targetSourceCellId,
        dayIndex: nextDayIndex,
        startSlot: nextStartSlot,
        endSlot: nextEndSlot,
        participantIds: targetParticipants,
      };

      const dropValidation = getDropValidation(nextDayIndex, nextStartSlot, durationSlots, placementPreviewBySlot);
      const previewItem = dropValidation.canDrop ? dropValidation.startItem : dropValidation.reasonItem;
      const hasUsableSlotMap = Object.keys(placementPreviewBySlot).length > 0;
      if (!dropValidation.canDrop) {
        setPinError(
          formatPlacementPreviewMessage(
            previewItem,
            placementPreviewBusy && !hasUsableSlotMap
              ? t("solve_overlay.placement_preview_wait")
              : t("solve_overlay.placement_preview_missing_or_blocked"),
          ),
        );
        clearPlacementPreviewState();
        return;
      }

      const normalizedBundleId =
        readEntityId((targetPlacement as { bundle_id?: unknown }).bundle_id) ??
        readEntityId((targetPlacement as { bundle?: unknown }).bundle);
      const scheduleId = currentSchedule.id;
      const previousPlacements = currentSchedule.placements;
      const optimisticPlacement = buildOptimisticPlacement({
        sourceCellId: targetSourceCellId,
        bundleId: normalizedBundleId,
        dayIndex: nextDayIndex,
        startSlot: nextStartSlot,
        durationSlots,
        replacement: targetPlacement,
      });
      setCurrentSchedule((prev) =>
        prev
          ? {
              ...prev,
              placements: (Array.isArray(prev.placements) ? prev.placements : previousPlacements).map((placement) =>
                getPlacementIdentity(placement) === String(placementId) ? optimisticPlacement : placement,
              ),
            }
          : prev,
      );
      clearPlacementPreviewState();
      try {
        const payload: ConfirmPlacementRequest = {
          mode: "MOVE_ASSIGNED_CELL",
          schedule_id: scheduleId,
          placement_id: toApiEntityId(placementId) ?? placementId,
          day_index: nextDayIndex,
          start_slot: nextStartSlot,
        };
        const bundleApiId = toApiEntityId(normalizedBundleId);
        if (bundleApiId != null) payload.bundle_id = bundleApiId;
        const result = await confirmCellPlacement(targetSourceCellId, payload);
        applyConfirmedPlacementResponse(result, scheduleId, { replacementPlacementId: optimisticPlacement.id });
        notifyDraftMutation();
      } catch (error: unknown) {
        clearPlacementPreviewState();
        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: previousPlacements,
              }
            : prev,
        );
        setPinError(
          error instanceof Error
            ? error.message
            : formatPlacementPreviewMessage(previewItem, t("grid_schedule.could_not_move_placement")),
        );
      }
    },
    [
      applyConfirmedPlacementResponse,
      buildOptimisticPlacement,
      clearPlacementPreviewState,
      confirmCellPlacement,
      currentSchedule,
      formatPlacementPreviewMessage,
      normalizeIdArray,
      notifyDraftMutation,
      placementPreviewBusy,
      placementPreviewBySlot,
      t,
    ],
  );

  useEffect(() => {
    if (!pendingDropWhilePreviewLoading) return;
    if (placementPreviewBusy || !hasUsablePlacementPreviewMap) return;
    const pending = pendingDropWhilePreviewLoading;
    setPendingDropWhilePreviewLoading(null);

    if (pending.dragType === "placement" && pending.placementId) {
      if (pending.dayIndex === pending.originalDayIndex && pending.startSlot === pending.originalStartSlot) {
        clearPlacementPreviewState();
        return;
      }
      void patchPlacementPosition(pending.placementId, pending.dayIndex, pending.startSlot, pending.durationSlots);
      return;
    }

    if (pending.dragType === "unassigned") {
      if (pending.sourceBundleId == null && !isNoUnitScopeSelected) {
        clearPlacementPreviewState();
        setPinError(t("solve_overlay.select_matching_unit_tab_before_placing"));
        return;
      }
      void requestUnassignedPlacement(
        pending.sourceCellId,
        pending.sourceBundleId ?? null,
        pending.dayIndex,
        pending.startSlot,
        pending.durationSlots,
      );
    }
  }, [
    clearPlacementPreviewState,
    hasUsablePlacementPreviewMap,
    isNoUnitScopeSelected,
    patchPlacementPosition,
    pendingDropWhilePreviewLoading,
    placementPreviewBusy,
    requestUnassignedPlacement,
    t,
  ]);

  useEffect(() => {
    if (!blockageDraft) return;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== blockageDraft.pointerId) return;
      const point = getGridPointFromClient(event.clientX, event.clientY);
      if (!point) return;
      if (point.dayIndex !== blockageDraft.dayIndex || point.slot !== blockageDraft.endSlot - 1) {
        const startSlot = Math.min(blockageDraft.anchorSlot, point.slot);
        const endSlot = Math.max(blockageDraft.anchorSlot, point.slot) + 1;
        setBlockageDraft((prev) =>
          prev && prev.pointerId === event.pointerId
            ? { ...prev, dayIndex: point.dayIndex, startSlot, endSlot }
            : prev,
        );
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== blockageDraft.pointerId) return;
      const finalized = blockageDraft;
      setBlockageDraft(null);
      void createBlockage(finalized.dayIndex, finalized.startSlot, finalized.endSlot).catch((error: unknown) => {
        setPinError(error instanceof Error ? error.message : "Could not create blockage.");
      });
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== blockageDraft.pointerId) return;
      setBlockageDraft(null);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [blockageDraft, createBlockage, getGridPointFromClient]);

  useEffect(() => {
    if (!blockageDragState) return;
    const findCurrent = () => scheduleBlockages.find((entry) => entry.id === blockageDragState.blockageId) ?? null;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== blockageDragState.pointerId) return;
      const isInsideDelete = isInsideDeleteDropTarget(event.clientX, event.clientY);
      setIsDeleteDropActive((prev) => (prev === isInsideDelete ? prev : isInsideDelete));
      const current = findCurrent();
      if (!current) return;
      const point = getGridPointFromClient(event.clientX, event.clientY);
      if (!point) return;

      if (blockageDragState.mode === "move") {
        const nextStart = Math.max(0, Math.min(slotCount - blockageDragState.durationSlots, Math.round((event.clientY - (overlayRef.current?.getBoundingClientRect().top ?? 0) - blockageDragState.grabOffsetY) / rowPx)));
        const nextEnd = nextStart + blockageDragState.durationSlots;
        setScheduleBlockages((prev) =>
          prev.map((entry) =>
            entry.id === blockageDragState.blockageId
              ? { ...entry, day_index: point.dayIndex, start_slot: nextStart, end_slot: nextEnd }
              : entry,
          ),
        );
        return;
      }

      if (blockageDragState.mode === "resize-start") {
        const nextStart = Math.max(0, Math.min(current.end_slot - 1, point.slot));
        setScheduleBlockages((prev) =>
          prev.map((entry) =>
            entry.id === blockageDragState.blockageId ? { ...entry, start_slot: nextStart } : entry,
          ),
        );
        return;
      }

      const nextEnd = Math.max(current.start_slot + 1, Math.min(slotCount, point.slot + 1));
      setScheduleBlockages((prev) =>
        prev.map((entry) =>
          entry.id === blockageDragState.blockageId ? { ...entry, end_slot: nextEnd } : entry,
        ),
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== blockageDragState.pointerId) return;
      const current = findCurrent();
      const droppedOnDelete = isInsideDeleteDropTarget(event.clientX, event.clientY);
      setBlockageDragState(null);
      setIsDeleteDropActive(false);
      if (!current) return;
      if (droppedOnDelete) {
        const original = blockageDragState.originalBlockage;
        setScheduleBlockages((prev) =>
          prev.map((entry) => (entry.id === original.id ? original : entry)),
        );
        void deleteBlockage(original).catch((error: unknown) => {
          setPinError(error instanceof Error ? error.message : "Could not delete blockage.");
        });
        return;
      }
      const original = blockageDragState.originalBlockage;
      const next = current;
      setScheduleBlockages((prev) =>
        prev.map((entry) => (entry.id === original.id ? original : entry)),
      );
      setBlockageMutationBusy(true);
      void upsertBlockage(next.id, next.day_index, next.start_slot, next.end_slot, next.unit_ids ?? [])
        .then(() => {
          setScheduleBlockages((prev) =>
            prev.map((entry) => (entry.id === next.id ? next : entry)),
          );
        })
        .catch((error: unknown) => {
          setPinError(error instanceof Error ? error.message : "Could not update blockage.");
        })
        .finally(() => {
          setBlockageMutationBusy(false);
        });
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== blockageDragState.pointerId) return;
      const original = blockageDragState.originalBlockage;
      setScheduleBlockages((prev) =>
        prev.map((entry) => (entry.id === original.id ? original : entry)),
      );
      setBlockageDragState(null);
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
  }, [blockageDragState, deleteBlockage, getGridPointFromClient, isInsideDeleteDropTarget, rowPx, scheduleBlockages, slotCount, upsertBlockage]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  // Unmount-only cleanup for drop ghost timers and RAF physics loop.
  useEffect(() => {
    return () => {
      clearParticipantDropGhostTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dragState) return;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      if (placementPreviewLoadingWithoutCache) return;
      const isInsideDelete = isInsideDeleteDropTarget(event.clientX, event.clientY);
      setIsDeleteDropActive((prev) => (prev === isInsideDelete ? prev : isInsideDelete));
      if (dragState.dragType === "participant-tool") {
        const target = evaluateParticipantDropTarget(event.clientX, event.clientY, String(dragState.participantId));
        const hoverValid = Boolean(target.canDrop && target.placementId);
        setParticipantDragHoverPlacementId(hoverValid && target.placementId ? String(target.placementId) : null);
      } else {
        setParticipantDragHoverPlacementId(null);
      }
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
        clearPlacementPreviewState();
        void deleteSchedulePlacement(activeDrag.placementId);
        return;
      }
      if (activeDrag.dragType === "participant-tool") {
        const participantId = String(activeDrag.participantId);
        const target = evaluateParticipantDropTarget(event.clientX, event.clientY, participantId);
        setParticipantDragHoverPlacementId(null);
        if (!target.canDrop || !target.placementId || !target.placement) {
          triggerParticipantDropGhost("invalid", {
            x: event.clientX,
            y: event.clientY,
            participantId,
            participantName: activeDrag.participantName,
          });
          const safetyGhostCleanupTimer = window.setTimeout(() => {
            setParticipantDropGhost(null);
          }, 600);
          participantDropGhostTimersRef.current.push(safetyGhostCleanupTimer);
          if (target.reason === "already_assigned") {
            setPinError("Participant already assigned");
          } else if (target.reason === "capacity") {
            setPinError("This placement is already at capacity.");
          } else if (target.reason === "ineligible") {
            setPinError(`${activeDrag.participantName} is not eligible for this cell.`);
          }
          return;
        }

        triggerParticipantDropGhost("valid", {
          x: event.clientX,
          y: event.clientY,
          participantId,
          participantName: activeDrag.participantName,
        });
        const safetyGhostCleanupTimer = window.setTimeout(() => {
          setParticipantDropGhost(null);
        }, 600);
        participantDropGhostTimersRef.current.push(safetyGhostCleanupTimer);

        const placementId = String(target.placementId);
        const targetPlacement = target.placement;
        const existingAssigned = target.existingAssigned;
        const mergedAssigned = Array.from(new Set([...existingAssigned, participantId]));
        const mergedAssignedApi = mergedAssigned.map((id) => (/^\d+$/.test(id) ? Number(id) : id));
        const previousPlacements = currentSchedule?.placements ?? [];
        if (!Array.isArray(previousPlacements) || previousPlacements.length === 0) return;
        const optimisticPlacements = previousPlacements.map((placement) =>
          String(placement.id) === String(placementId)
            ? {
                ...placement,
                assigned_participants: mergedAssigned,
                participants: mergedAssigned,
              }
            : placement,
        );
        setCurrentSchedule((prev) =>
          prev
            ? {
                ...prev,
                placements: optimisticPlacements,
              }
            : prev,
        );
        void (async () => {
          try {
            const res = await authFetch(`/api/schedule-placements/${encodeURIComponent(String(placementId))}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ assigned_participants: mergedAssignedApi }),
            });
            if (!res.ok) {
              throw new Error("Could not assign participant");
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
            setPinError(error instanceof Error ? error.message : "Could not assign participant");
          }
        })();
        return;
      }

      const overlay = overlayRef.current;
      if (!overlay) {
        clearPlacementPreviewState();
        return;
      }

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
        clearPlacementPreviewState();
        return;
      }

      const droppedDay = Math.max(0, Math.min(daysCount - 1, Math.floor(cardCenterX / dayWidth)));
      const slotCount = Math.max(0, Math.round(bodyHeight / rowPx));
      const rawStartSlot = Math.round(cardTop / rowPx);
      const effectiveDurationSlots = Math.max(1, placementPreviewDurationSlots ?? activeDrag.durationSlots);
      const maxStartSlot = Math.max(0, slotCount - effectiveDurationSlots);
      const droppedStart = Math.max(0, Math.min(maxStartSlot, rawStartSlot));
      if (placementPreviewLoadingWithoutCache) {
        setPendingDropWhilePreviewLoading({
          dragType: activeDrag.dragType,
          placementId: activeDrag.dragType === "placement" ? activeDrag.placementId : undefined,
          sourceCellId: activeDrag.sourceCellId,
          sourceBundleId: activeDrag.sourceBundleId ?? null,
          originalDayIndex: activeDrag.originalDayIndex,
          originalStartSlot: activeDrag.originalStartSlot,
          dayIndex: droppedDay,
          startSlot: droppedStart,
          durationSlots: effectiveDurationSlots,
        });
        return;
      }
      if (activeDrag.dragType === "placement" && activeDrag.placementId) {
        if (droppedDay === activeDrag.originalDayIndex && droppedStart === activeDrag.originalStartSlot) {
          clearPlacementPreviewState();
          return;
        }
        void patchPlacementPosition(activeDrag.placementId, droppedDay, droppedStart, effectiveDurationSlots);
        return;
      }
      if (activeDrag.dragType === "unassigned") {
        if (activeDrag.sourceBundleId == null && !isNoUnitScopeSelected) {
          clearPlacementPreviewState();
          setPinError(t("solve_overlay.select_matching_unit_tab_before_placing"));
          return;
        }
        void requestUnassignedPlacement(
          activeDrag.sourceCellId,
          activeDrag.sourceBundleId ?? null,
          droppedDay,
          droppedStart,
          effectiveDurationSlots,
        );
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      setDragState(null);
      setParticipantDragHoverPlacementId(null);
      setIsDeleteDropActive(false);
      clearPlacementPreviewState();
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
    clearPlacementPreviewState,
    currentSchedule,
    daysCount,
    deleteSchedulePlacement,
    dragState,
    evaluateParticipantDropTarget,
    isInsideDeleteDropTarget,
    notifyDraftMutation,
    placementPreviewDurationSlots,
    placementPreviewLoadingWithoutCache,
    patchPlacementPosition,
    requestUnassignedPlacement,
    rowPx,
    isNoUnitScopeSelected,
    t,
    timeColPx,
    triggerParticipantDropGhost,
  ]);

  useEffect(() => {
    if (dragState) return;
    setParticipantDragHoverPlacementId(null);
    setIsDeleteDropActive(false);
  }, [dragState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("shift:left-delete-state", {
        detail: {
          visible: isJiggleMode,
          active: isDeleteDropActive,
        },
      }),
    );
  }, [isDeleteDropActive, isJiggleMode]);

  useEffect(() => {
    if (!isJiggleMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditModes();
      setBreakDialogState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeEditModes, isJiggleMode]);

  useEffect(() => {
    if (canManualEditCards) return;
    closeEditModes();
  }, [canManualEditCards, closeEditModes]);

  useEffect(() => {
    if (!isJiggleMode) {
      setEditToolMode("none");
      setBlockageDraft(null);
      setBlockageDragState(null);
      setHoveredJiggleCardKey(null);
    }
  }, [isJiggleMode]);

  useEffect(() => {
    if (!isJiggleMode) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-onboarding-overlay]")) return;
      if (target.closest("[data-schedule-scroll]")) return;
      if (target.closest("[data-unit-tabs]")) return;
      if (target.closest("[data-left-delete-drop]")) return;
      if (target.closest("[data-jiggle-unassigned]")) return;
      if (target.closest("[data-jiggle-participants]")) return;
      if (target.closest("[data-jiggle-tools]")) return;
      if (target.closest("[data-break-dialog]")) return;
      closeEditModes();
      setBreakDialogState((prev) => ({ ...prev, open: false }));
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [closeEditModes, isJiggleMode]);

  const solveDisabledReason = !canSolve
    ? t("solve_overlay.solve_unavailable")
    : !hasCells
    ? t("solve_overlay.create_cells_to_enable_solve")
    : precheckBusy
    ? t("solve_overlay.precheck_running")
    : precheckError
    ? t("solve_overlay.precheck_could_not_run")
    : hasBlockingPrecheckErrors
    ? t("solve_overlay.precheck_blocking_fix_before_solve")
    : hasPendingCandidateResolution
    ? t("solve_overlay.resolve_pending_candidates")
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
      const fromBundle = bundleUnitsById[String(directBundle)] || [];
      if (fromBundle.length > 0) return fromBundle;
      if (unitNameById[String(directBundle)]) return [String(directBundle)];
    }
    const sourceCellId = String(row.source_cell_id ?? row.cell_id);
    const cellBundles = (cellPinMetaById[sourceCellId]?.bundles || []).map(String);
    const directUnitIdsFromCell = cellBundles.filter((id) => Boolean(unitNameById[String(id)]));
    if (directUnitIdsFromCell.length > 0) return directUnitIdsFromCell.sort();
    if (cellBundles.length === 1) {
      return bundleUnitsById[cellBundles[0]] || [];
    }
    return [];
  }, [bundleUnitsById, cellPinMetaById, unitNameById]);

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

  const previewOverlapGroupMeta = useMemo<Record<string, OverlapGroupMeta>>(() => {
    type PlacementEntry = {
      placementId: string;
      dayIndex: number;
      startSlot: number;
      endSlot: number;
    };

    const rowsByDay = new Map<number, PlacementEntry[]>();
    for (const row of previewScheduleForCards) {
      const placementId = String(row.cell_id ?? "");
      const dayIndex = Number(row.day_index);
      const startSlot = Number(row.start_slot);
      const endSlot = Number(row.end_slot);
      if (!placementId) continue;
      if (!Number.isFinite(dayIndex) || !Number.isFinite(startSlot) || !Number.isFinite(endSlot)) continue;
      if (endSlot <= startSlot) continue;
      const dayRows = rowsByDay.get(dayIndex) ?? [];
      dayRows.push({ placementId, dayIndex, startSlot, endSlot });
      rowsByDay.set(dayIndex, dayRows);
    }

    const nextMeta: Record<string, OverlapGroupMeta> = {};

    for (const [dayIndex, dayRows] of rowsByDay.entries()) {
      const orderedRows = [...dayRows].sort(
        (a, b) =>
          a.startSlot - b.startSlot ||
          a.endSlot - b.endSlot ||
          a.placementId.localeCompare(b.placementId),
      );
      const laneEndByIndex: number[] = [];
      const placementLaneAssignments: Array<{ placementId: string; laneIndex: number }> = [];

      for (const row of orderedRows) {
        let laneIndex = -1;
        for (let idx = 0; idx < laneEndByIndex.length; idx += 1) {
          if (laneEndByIndex[idx] <= row.startSlot) {
            laneIndex = idx;
            break;
          }
        }
        if (laneIndex < 0) {
          laneIndex = laneEndByIndex.length;
          laneEndByIndex.push(row.endSlot);
        } else {
          laneEndByIndex[laneIndex] = row.endSlot;
        }
        placementLaneAssignments.push({ placementId: row.placementId, laneIndex });
      }

      const laneCount = Math.max(1, laneEndByIndex.length);
      for (const assignment of placementLaneAssignments) {
        nextMeta[assignment.placementId] = {
          dayIndex,
          groupSize: laneCount,
          groupPosition: assignment.laneIndex,
        };
      }
    }

    return nextMeta;
  }, [previewScheduleForCards]);

  const previewOverlapCarouselTotalPages = useMemo(() => {
    let maxGroupSize = 1;
    for (const meta of Object.values(previewOverlapGroupMeta)) {
      maxGroupSize = Math.max(maxGroupSize, meta.groupSize);
    }
    return Math.max(1, maxGroupSize);
  }, [previewOverlapGroupMeta]);

  useEffect(() => {
    setPreviewOverlapCarouselPage((prev) => {
      if (previewOverlapCarouselTotalPages <= 1) return 0;
      return (
        ((prev % previewOverlapCarouselTotalPages) + previewOverlapCarouselTotalPages) %
        previewOverlapCarouselTotalPages
      );
    });
  }, [previewOverlapCarouselTotalPages]);

  useEffect(() => {
    if (
      previewOverlapCarouselTotalPages <= 1 ||
      dragState ||
      isJiggleMode ||
      previewOverlapCarouselPaused
    ) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setPreviewOverlapCarouselPage((prev) => (prev + 1) % previewOverlapCarouselTotalPages);
    }, OVERLAP_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [dragState, isJiggleMode, previewOverlapCarouselPaused, previewOverlapCarouselTotalPages]);

  const previewOverlapDisplayByPlacementId = useMemo(() => {
    const next: Record<string, { isVisible: boolean }> = {};
    const normalizedPage =
      previewOverlapCarouselTotalPages <= 1
        ? 0
        : ((previewOverlapCarouselPage % previewOverlapCarouselTotalPages) +
            previewOverlapCarouselTotalPages) %
          previewOverlapCarouselTotalPages;
    for (const [placementId, meta] of Object.entries(previewOverlapGroupMeta)) {
      const size = Math.max(1, Number(meta.groupSize) || 1);
      next[placementId] = {
        isVisible:
          previewOverlapCarouselTotalPages <= 1
            ? true
            : normalizedPage < size && normalizedPage === meta.groupPosition,
      };
    }
    return next;
  }, [previewOverlapCarouselPage, previewOverlapCarouselTotalPages, previewOverlapGroupMeta]);

  const previewContextLockedPlacements = useMemo(() => {
    if (!candidatePreviewContext) return [];
    return Array.isArray(candidatePreviewContext.locked_placements)
      ? candidatePreviewContext.locked_placements
      : [];
  }, [candidatePreviewContext]);

  const previewContextBlockages = useMemo(() => {
    if (!candidatePreviewContext) return [];
    return Array.isArray(candidatePreviewContext.blockages)
      ? candidatePreviewContext.blockages
      : [];
  }, [candidatePreviewContext]);

  const previewLockedPlacementsForOverlay = useMemo(() => {
    if (previewContextLockedPlacements.length === 0) return [];
    if (previewIsParticipantMode) return previewContextLockedPlacements;
    if (!previewSelectedUnitId) return previewContextLockedPlacements;
    return previewContextLockedPlacements.filter((row) =>
      getPreviewScheduleUnitIds(row).includes(previewSelectedUnitId),
    );
  }, [
    getPreviewScheduleUnitIds,
    previewContextLockedPlacements,
    previewIsParticipantMode,
    previewSelectedUnitId,
  ]);

  const previewBlockagesForOverlay = useMemo(() => {
    if (previewContextBlockages.length === 0) return [];
    if (previewIsParticipantMode || !previewSelectedUnitId) return previewContextBlockages;
    return previewContextBlockages.filter((blockage) => {
      const scope = Array.isArray(blockage.unit_ids) ? blockage.unit_ids.map(String) : [];
      if (scope.length === 0) return true;
      return scope.includes(previewSelectedUnitId);
    });
  }, [previewContextBlockages, previewIsParticipantMode, previewSelectedUnitId]);

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
          const res = await authFetch(endpoint, { cache: "no-store" });
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

  const openPendingCandidatePreview = useCallback(() => {
    if (orderedCandidates.length === 0) return;
    const fallbackIndex = Number(orderedCandidates[0].index);
    const targetIndex =
      previewCandidateIndex != null && Number.isFinite(Number(previewCandidateIndex))
        ? Number(previewCandidateIndex)
        : fallbackIndex;
    setPreviewMode("candidate");
    setPreviewParticipantId(null);
    setPreviewSelectedUnitId(null);
    setPreviewParticipantsOpen(false);
    setPreviewParticipantsQuery("");
    setPreviewCandidateIndex(targetIndex);
  }, [orderedCandidates, previewCandidateIndex]);

  const openCandidatePreview = (candidateIndex: number) => {
    setPreviewMode("candidate");
    setPreviewParticipantId(null);
    setPreviewSelectedUnitId(null);
    setPreviewParticipantsOpen(false);
    setPreviewParticipantsQuery("");
    setPreviewCandidateIndex(candidateIndex);
    setCandidateDialogOpen(false);
  };

  useEffect(() => {
    if (!previewCandidate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewParticipantsOpen) {
        setPreviewParticipantsOpen(false);
        return;
      }
      setPreviewParticipantsOpen(false);
      setPreviewParticipantsQuery("");
      setPreviewParticipantId(null);
      setPreviewMode("candidate");
      setPreviewCandidateIndex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewCandidate, previewParticipantsOpen]);

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
      const res = await authFetch(`/api/grids/${gridId}/schedule/publish/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to publish schedule (${res.status})`);
      }

      writeGridScheduleViewMode(gridId, "published");

      const latestPublished = await authFetch(`/api/grids/${gridId}/published-schedule/`, {
        cache: "no-store",
      });
      if (latestPublished.ok) {
        const raw = await latestPublished.json().catch(() => ({}));
        const normalizedPublished = normalizeScheduleResource(raw);
        if (normalizedPublished?.id != null) setCurrentSchedule(normalizedPublished);
      }

      refreshGridView();
    } catch (e: any) {
      setError(e?.message || t("solve_overlay.could_not_publish_schedule"));
    } finally {
      setIsPublishing(false);
    }
  };

  const shouldHideScheduleOverlay = hideScheduleOverlay && !historyMode;

  return (
    <>
      {pinErrorCard && pinErrorCardAnchor && (
        <ScheduleErrorCard
          message={pinErrorCard.message}
          left={pinErrorCardAnchor.left}
          top={pinErrorCardAnchor.top}
          onClose={() => {
            setPinError(null);
            setPinErrorCard(null);
            setPinErrorCardAnchor(null);
            setCollisionBeatingPlacementId(null);
          }}
        />
      )}
      {isClientReady &&
        blockagesBusy &&
        blockagesBusyAnchor &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[160] rounded border border-gray-200 bg-white/95 px-2.5 py-1 text-xs text-gray-600 shadow-sm backdrop-blur-sm"
            style={{ left: blockagesBusyAnchor.left, top: blockagesBusyAnchor.top }}
          >
            {t("solve_overlay.loading_blockages")}
          </div>,
          document.body,
        )}
      {isClientReady &&
        scheduleValidationMaskActive &&
        placementPreviewMaskRect &&
        placementPreviewMaskRect.width > 0 &&
        placementPreviewMaskRect.height > 0 &&
        createPortal(
          <div
            className="pointer-events-auto fixed z-[170] flex cursor-wait items-center justify-center bg-white/45 backdrop-blur-[1px]"
            style={{
              left: placementPreviewMaskRect.left,
              top: placementPreviewMaskRect.top,
              width: placementPreviewMaskRect.width,
              height: placementPreviewMaskRect.height,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerMove={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="rounded-md border border-gray-200 bg-white/95 px-4 py-2 text-xs font-medium text-gray-700 shadow-sm">
              {t("solve_overlay.placement_preview_validating_positions")}
            </div>
          </div>,
          document.body,
        )}

      {/* Schedule overlay */}
      {(!shouldHideScheduleOverlay || isBlockageToolActive || isUnassignedToolActive) &&
        (filteredSchedule.length > 0 ||
          visibleScheduleBlockages.length > 0 ||
          isJiggleMode ||
          isBlockageToolActive ||
          isUnassignedToolActive ||
          blockageDraft != null) && (
        <div
          ref={overlayRef}
          className={`absolute inset-x-0 z-[5] ${
            (canManualEditCards && isBlockageToolActive) || scheduleValidationMaskActive
              ? "pointer-events-auto"
              : "pointer-events-none"
          }`}
          style={{ top: topOffset, height: bodyHeight }}
          onPointerDown={(event) => {
            if (!canManualEditCards || !isBlockageToolActive) return;
            if (dragState || blockageDragState || blockageDraft) return;
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (target.closest("[data-placement-card]")) return;
            if (target.closest("[data-schedule-blockage]")) return;
            const point = getGridPointFromClient(event.clientX, event.clientY);
            if (!point) return;
            setBlockageDraft({
              pointerId: event.pointerId,
              anchorDayIndex: point.dayIndex,
              anchorSlot: point.slot,
              dayIndex: point.dayIndex,
              startSlot: point.slot,
              endSlot: point.slot + 1,
            });
          }}
        >
          {backendPreviewActive &&
            dragState?.dragType !== "participant-tool" &&
            backendPreviewRegions.map((region) => {
              const top = region.start_slot * rowPx + 3;
              const height = Math.max(8, (region.end_slot - region.start_slot) * rowPx - 6);
              const left = `calc(${timeColPx}px + ${region.day_index} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
              const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
              const visual = getPlacementRegionStyle(region);
              const isBlocked = region.status === "INVALID" && region.visual_kind === "BLOCKED";
              return (
                <div
                  key={`backend-preview-${region.day_index}-${region.start_slot}-${region.end_slot}-${region.status}-${region.quality}-${region.visual_kind}-${region.time_range_kind}`}
                  className={[
                    "absolute pointer-events-none z-[8] overflow-hidden rounded-md border border-dashed transition-colors",
                    visual.outer,
                  ].join(" ")}
                  style={{ top, left, width, height, ...visual.style }}
                >
                  {isBlocked && (
                    <>
                      <GlassSurface
                        width="100%"
                        height="100%"
                        borderRadius={6}
                        backgroundOpacity={0.14}
                        brightness={50}
                        opacity={0.95}
                        blur={11}
                        displace={0.5}
                        distortionScale={-180}
                        saturation={1.35}
                        className="h-full w-full"
                        style={{ background: "rgba(255, 255, 255, 0.18)" }}
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-md border border-red-200/75 bg-red-500/10" />
                    </>
                  )}
                </div>
              );
            })}
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
              <div
                className={[
                  "relative h-full w-full rounded-md border border-dashed transition-colors",
                  activeDragPreviewStyle.outer,
                ].join(" ")}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={[
                      "max-w-full truncate px-2 text-center text-[10px] font-semibold whitespace-nowrap",
                      activeDragPreviewStyle.text,
                    ].join(" ")}
                  >
                    {placementPreviewBusy
                      ? t("solve_overlay.placement_preview_loading")
                      : dragPreview.cellName}
                  </span>
                </div>
              </div>
            </div>
          )}
          {visibleScheduleBlockages.map((blockage) => {
            if (blockage.day_index < 0 || blockage.day_index >= daysCount) return null;
            const top = blockage.start_slot * rowPx + 2;
            const height = Math.max(8, (blockage.end_slot - blockage.start_slot) * rowPx - 4);
            const left = `calc(${timeColPx}px + ${blockage.day_index} * ((100% - ${timeColPx}px) / ${daysCount}) + 4px)`;
            const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 8px)`;
            const canInteractBlockage = canManualEditCards && scheduleViewMode === "draft";
            const canEditBlockage = canInteractBlockage && isJiggleMode;
            const movingThis = blockageDragState?.blockageId === blockage.id;
            return (
              <div
                key={`schedule-blockage-${blockage.id}`}
                data-schedule-blockage
                className={`absolute z-[47] rounded-2xl border border-gray-300/90 bg-transparent transition-[left,top,height] duration-150 ease-out ${
                  canInteractBlockage ? "pointer-events-auto" : "pointer-events-none"
                }`}
                style={{ top, left, width, height }}
                title={blockage.note || "Blocked window"}
                onPointerDown={(event) => {
                  if (!canInteractBlockage) return;
                  if (!isJiggleMode) {
                    clearLongPressTimer();
                    longPressTimerRef.current = window.setTimeout(() => {
                      setIsJiggleMode(true);
                      closeRightDockFan();
                      setEditToolMode("none");
                      longPressTimerRef.current = null;
                    }, 360);
                    return;
                  }
                  if (!canEditBlockage) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const cardRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                  setBlockageDragState({
                    pointerId: event.pointerId,
                    blockageId: blockage.id,
                    mode: "move",
                    durationSlots: Math.max(1, blockage.end_slot - blockage.start_slot),
                    grabOffsetY: event.clientY - cardRect.top,
                    originalBlockage: { ...blockage, unit_ids: [...(blockage.unit_ids ?? [])] },
                  });
                }}
                onPointerUp={() => clearLongPressTimer()}
                onPointerCancel={() => clearLongPressTimer()}
                onPointerLeave={() => clearLongPressTimer()}
                onDoubleClick={() => {
                  if (!canEditBlockage) return;
                  void deleteBlockage(blockage.id).catch((error: unknown) => {
                    setPinError(error instanceof Error ? error.message : "Could not delete blockage.");
                  });
                }}
              >
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                  <GlassSurface
                    width="100%"
                    height="100%"
                    borderRadius={16}
                    backgroundOpacity={0.14}
                    brightness={50}
                    opacity={0.95}
                    blur={11}
                    displace={0.5}
                    distortionScale={-180}
                    saturation={1.35}
                    className="h-full w-full"
                    style={{ background: "rgba(255, 255, 255, 0.26)" }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400/60">
                      Blocked
                    </span>
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/60" />
                {canEditBlockage && (
                  <>
                    <div
                      className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setBlockageDragState({
                          pointerId: event.pointerId,
                          blockageId: blockage.id,
                          mode: "resize-start",
                          durationSlots: Math.max(1, blockage.end_slot - blockage.start_slot),
                          grabOffsetY: 0,
                          originalBlockage: { ...blockage, unit_ids: [...(blockage.unit_ids ?? [])] },
                        });
                      }}
                    />
                    <div
                      className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setBlockageDragState({
                          pointerId: event.pointerId,
                          blockageId: blockage.id,
                          mode: "resize-end",
                          durationSlots: Math.max(1, blockage.end_slot - blockage.start_slot),
                          grabOffsetY: 0,
                          originalBlockage: { ...blockage, unit_ids: [...(blockage.unit_ids ?? [])] },
                        });
                      }}
                    />
                  </>
                )}
                {movingThis && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-sky-500/70" />
                )}
              </div>
            );
          })}
          {blockageDraft && (
            <div
              className="absolute pointer-events-none z-[46] rounded-2xl border border-dashed border-gray-400 bg-white/25"
              style={{
                top: blockageDraft.startSlot * rowPx + 2,
                left: `calc(${timeColPx}px + ${blockageDraft.dayIndex} * ((100% - ${timeColPx}px) / ${daysCount}) + 4px)`,
                width: `calc(((100% - ${timeColPx}px) / ${daysCount}) - 8px)`,
                height: Math.max(8, (blockageDraft.endSlot - blockageDraft.startSlot) * rowPx - 4),
              }}
            />
          )}
          {filteredSchedule.map((s, idx) => {
            const col = s.day_index;
            if (col < 0 || col >= daysCount) return null;
            const sourceCellId = String(s.source_cell_id ?? s.cell_id);
            const cardKey = `${sourceCellId}-${s.day_index}-${s.start_slot}-${idx}`;
            const placementId = String(s.cell_id ?? "");
            const overlapCarouselMeta = placementId
              ? overlapCarouselDisplayByPlacementId[placementId]
              : undefined;
            if (overlapCarouselMeta && !overlapCarouselMeta.isVisible) return null;
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
            const publishedPlacementId = getPublishedPlacementIdForCard(s);
            const commentAnchorForCard =
              canCommentCards && currentSchedule?.id != null && activePublishedScheduleId != null
                ? {
                    placementId: placementId || null,
                    publishedPlacementId,
                    scheduleId: currentSchedule.id,
                    publishedScheduleId: activePublishedScheduleId,
                    sourceCellId,
                    bundleId: resolvedBundleId,
                    dayIndex: s.day_index,
                    startSlot: s.start_slot,
                    endSlot: s.end_slot,
                    cellName,
                    timeLabel,
                  }
                : null;
            const cardCommentPlacementKey = commentAnchorForCard
              ? buildPlacementKey(
                  commentAnchorForCard.publishedScheduleId,
                  commentAnchorForCard.sourceCellId,
                  commentAnchorForCard.bundleId,
                  commentAnchorForCard.dayIndex,
                  commentAnchorForCard.startSlot,
                  commentAnchorForCard.publishedPlacementId,
                )
              : null;
            const isCommentFocusedCard =
              commentsPanelOpen &&
              Boolean(cardCommentPlacementKey) &&
              cardCommentPlacementKey === selectedCommentPlacementKey;
            const isCollisionBeatingCard =
              collisionBeatingPlacementId != null && placementId === collisionBeatingPlacementId;
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
            const placementDurationMin = Math.max(slotMin, durationSlots * slotMin);
            const placementBreaks = Array.isArray(s.breaks) ? s.breaks : [];
            const isOverstaffCell = Boolean(cellAllowOverstaffById[sourceCellId]);
            const activeDraggedParticipantId =
              dragState?.dragType === "participant-tool" ? String(dragState.participantId) : null;
            const dimForParticipantsTool =
              isParticipantsToolActive && !activeDraggedParticipantId && !isOverstaffCell;
            const participantEligibleForCell = activeDraggedParticipantId
              ? isParticipantEligibleByTierPools(sourceCellId, activeDraggedParticipantId)
              : false;
            const participantAlreadyAssigned = activeDraggedParticipantId
              ? assignedParticipantIds.includes(activeDraggedParticipantId)
              : false;
            const hasCapacityForDraggedParticipant =
              Boolean(cellAllowOverstaffById[sourceCellId]) ||
              assignedParticipantIds.length < getCellHeadcount(sourceCellId);
            const canDropDraggedParticipant =
              Boolean(activeDraggedParticipantId) &&
              hasCapacityForDraggedParticipant &&
              participantEligibleForCell &&
              !participantAlreadyAssigned;
            const dimForDraggedParticipant = Boolean(activeDraggedParticipantId) && !canDropDraggedParticipant;
            const cursorClass =
              commentsPanelOpen && commentAnchorForCard
                ? "cursor-pointer"
                : isBlockageToolActive
                ? "cursor-default"
                : isBreakToolActive
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
                data-placement-card
                data-placement-id={placementId || undefined}
                className={`absolute ${dimForDraggedParticipant ? "pointer-events-none" : "pointer-events-auto"} ${cursorClass} ${
                  isDraggingCard ? "transition-none" : "transition-transform duration-150 ease-out"
                }`}
                style={{
                  top,
                  left,
                  width,
                  height,
                  transform: composedTransform,
                  zIndex: cardZIndex ?? 30,
                  transformOrigin: "center",
                }}
                onClick={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("[data-card-lock-toggle]")) return;
                  if (isBreakToolActive && canManualEditCards && placementId) {
                    event.preventDefault();
                    event.stopPropagation();
                    setBreakDialogError(null);
                    const sortedBreaks = [...placementBreaks]
                      .filter((entry) => Number.isFinite(entry.offset_min) && Number.isFinite(entry.duration_min))
                      .sort((a, b) => a.offset_min - b.offset_min);
                    setBreakDraftDurationMin(Math.max(5, Math.min(Math.floor(placementDurationMin / 2), 30)));
                    setBreakDialogState({
                      open: true,
                      placementId,
                      sourceCellId,
                      startSlot: s.start_slot,
                      endSlot: s.end_slot,
                      breaks: sortedBreaks,
                    });
                    return;
                  }
                  if (!commentsPanelOpen || !commentAnchorForCard) return;
                  const clickedKey = buildPlacementKey(
                    commentAnchorForCard.publishedScheduleId,
                    commentAnchorForCard.sourceCellId,
                    commentAnchorForCard.bundleId,
                    commentAnchorForCard.dayIndex,
                    commentAnchorForCard.startSlot,
                    commentAnchorForCard.publishedPlacementId,
                  );
                  if (clickedKey === selectedCommentPlacementKey) {
                    commentManuallyDeselectedRef.current = true;
                    setCommentAnchor(null);
                  } else {
                    commentManuallyDeselectedRef.current = false;
                    setCommentAnchor(commentAnchorForCard);
                  }
                  setCommentError(null);
                }}
                onPointerDown={(event) => {
                  if (commentsPanelOpen) return;
                  if (isBreakToolActive || isBlockageToolActive) return;
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
                    void loadPlacementPreviewForDrag({
                      mode: "MOVE_ASSIGNED_CELL",
                      sourceCellId,
                      bundleId: resolvedBundleId ?? null,
                      placementId,
                      durationSlots,
                    });
                  };
                  if (!isJiggleMode) {
                    longPressTimerRef.current = window.setTimeout(() => {
                      setIsJiggleMode(true);
                      closeRightDockFan();
                      setEditToolMode("none");
                      longPressTimerRef.current = null;
                    }, 360);
                    return;
                  }
                  startDrag();
                }}
                onPointerUp={() => clearLongPressTimer()}
                onPointerCancel={() => clearLongPressTimer()}
                onPointerEnter={() => {
                  if (isJiggleMode) setHoveredJiggleCardKey(cardKey);
                  if (!commentsPanelOpen || !cardCommentPlacementKey) return;
                  setHoveredCommentPlacementKey(cardCommentPlacementKey);
                }}
                onPointerLeave={() => {
                  clearLongPressTimer();
                  setHoveredJiggleCardKey((prev) => (prev === cardKey ? null : prev));
                  if (!cardCommentPlacementKey) return;
                  setHoveredCommentPlacementKey((prev) =>
                    prev === cardCommentPlacementKey ? null : prev,
                  );
                }}
              >
                <div
                  className={`group relative w-full h-full rounded-md border px-2 py-2 text-[11px] ${
                    isJiggleMode && !isPlacementLocked && hoveredJiggleCardKey !== cardKey ? "shift-jiggle" : ""
                  } ${
                    activeDraggedParticipantId &&
                    canDropDraggedParticipant &&
                    participantDragHoverPlacementId != null &&
                    String(participantDragHoverPlacementId) === String(placementId)
                      ? "ring-2 ring-amber-400/70"
                      : ""
                  }`}
                  style={{
                    backgroundColor: bg || "#f3f4f6",
                    borderColor: border,
                    color: textDark,
                    animationDelay: `${(idx % 6) * 35}ms`,
                    opacity: dimForParticipantsTool || dimForDraggedParticipant ? 0.35 : 1,
                    filter: dimForParticipantsTool || dimForDraggedParticipant ? "grayscale(0.65)" : "none",
                  }}
                >
                  {(isCommentFocusedCard || isCollisionBeatingCard) && (
                    <>
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md border-2 schedule-comment-ring"
                        style={{ borderColor: isCollisionBeatingCard ? "#ef4444" : bg || border }}
                      />
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md border-2 schedule-comment-ring schedule-comment-ring-delay"
                        style={{ borderColor: isCollisionBeatingCard ? "#ef4444" : bg || border }}
                      />
                    </>
                  )}
                  {canPinCards && (isJiggleMode || isPinnedVisual) && (
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
                  {placementBreaks.map((entry, breakIndex) => {
                    const breakStartRatio = placementDurationMin > 0 ? entry.offset_min / placementDurationMin : 0;
                    const breakHeightRatio = placementDurationMin > 0 ? entry.duration_min / placementDurationMin : 0;
                    return (
                      <div
                        key={`${cardKey}-break-${breakIndex}-${entry.offset_min}-${entry.duration_min}`}
                        className="absolute left-0 right-0 rounded-sm bg-black/20"
                        style={{
                          top: `${Math.max(0, Math.min(100, breakStartRatio * 100))}%`,
                          height: `${Math.max(2, Math.min(100, breakHeightRatio * 100))}%`,
                        }}
                      />
                    );
                  })}
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

      {!shouldHideScheduleOverlay && overlapCarouselTotalPages > 1 && (
        <div
          className="fixed z-[121] pointer-events-none"
          style={{
            bottom: selectedUnitId ? "2.6rem" : "0.9rem",
            left: mainCarouselCenterX ?? "50vw",
            transform: "translateX(-50%)",
          }}
          aria-hidden
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-2 py-1 shadow-sm pointer-events-auto">
            {Array.from({ length: overlapCarouselTotalPages }).map((_, idx) => (
              <button
                type="button"
                key={`carousel-dot-${idx}`}
                className="inline-flex h-3 w-3 items-center justify-center rounded-full transition-all duration-200"
                onClick={() => {
                  setOverlapCarouselPage(idx);
                  if (overlapCarouselPaused) setOverlapCarouselPaused(false);
                }}
                onDoubleClick={() => {
                  setOverlapCarouselPage(idx);
                  setOverlapCarouselPaused(true);
                }}
                aria-label={`${t("solve_overlay.carousel_view")} ${idx + 1}`}
              >
                {idx === overlapCarouselPage ? (
                  <span className="relative inline-flex h-3 w-3 items-center justify-center">
                    <span
                      className={`absolute h-2.5 w-2.5 rounded-full bg-gray-700 transition-all duration-200 ${
                        overlapCarouselPaused ? "opacity-0 scale-75" : "opacity-100 scale-100"
                      }`}
                    />
                    <span
                      className={`absolute inline-flex items-center gap-[1px] transition-all duration-200 ${
                        overlapCarouselPaused ? "opacity-100 scale-100" : "opacity-0 scale-75"
                      }`}
                    >
                      <span className="h-[8px] w-[2px] rounded-[2px] bg-gray-700" />
                      <span className="h-[8px] w-[2px] rounded-[2px] bg-gray-700" />
                    </span>
                  </span>
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <BreakDialog
        open={breakDialogState.open}
        sourceCellId={breakDialogState.sourceCellId}
        startSlot={breakDialogState.startSlot}
        endSlot={breakDialogState.endSlot}
        breaks={breakDialogState.breaks}
        breakDraftDurationMin={breakDraftDurationMin}
        breakDialogBusy={breakDialogBusy}
        breakDialogError={breakDialogError}
        dayStartMin={dayStartMin}
        slotMin={slotMin}
        cellNameById={cellNameById}
        cellColorById={cellColorById}
        t={t}
        onOpenChange={(open) => {
          setBreakDialogState((prev) => ({ ...prev, open }));
          if (!open) setBreakDialogError(null);
        }}
        setBreakDraftDurationMin={setBreakDraftDurationMin}
        setBreakDialogError={setBreakDialogError}
        setBreaks={(updater) =>
          setBreakDialogState((prev) => ({
            ...prev,
            breaks: updater(prev.breaks),
          }))
        }
        onSave={() => {
          void saveBreakDialog();
        }}
      />

      <Dialog
        open={Boolean(pendingBlockageDelete)}
        onOpenChange={(open) => {
          if (!open && !blockageDeleteBusy) setPendingBlockageDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px] z-[170]">
          <DialogHeader>
            <DialogTitle>{t("solve_overlay.delete_blockage_title")}</DialogTitle>
            <DialogDescription>
              {t("solve_overlay.delete_global_blockage_from_unit_message")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              disabled={blockageDeleteBusy}
              onClick={() => setPendingBlockageDelete(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              disabled={blockageDeleteBusy || !pendingBlockageDelete}
              onClick={() => {
                if (!pendingBlockageDelete) return;
                const pending = pendingBlockageDelete;
                setBlockageDeleteBusy(true);
                void executeDeleteBlockage(pending.blockage, "CURRENT_UNIT_ONLY", pending.unitId)
                  .then(() => setPendingBlockageDelete(null))
                  .catch((error: unknown) => {
                    setPinError(error instanceof Error ? error.message : "Could not delete blockage.");
                  })
                  .finally(() => setBlockageDeleteBusy(false));
              }}
            >
              {t("solve_overlay.remove_blockage_from_unit")}
            </button>
            <button
              type="button"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              disabled={blockageDeleteBusy || !pendingBlockageDelete}
              onClick={() => {
                if (!pendingBlockageDelete) return;
                const pending = pendingBlockageDelete;
                setBlockageDeleteBusy(true);
                void executeDeleteBlockage(pending.blockage, "GLOBAL", pending.unitId)
                  .then(() => setPendingBlockageDelete(null))
                  .catch((error: unknown) => {
                    setPinError(error instanceof Error ? error.message : "Could not delete blockage.");
                  })
                  .finally(() => setBlockageDeleteBusy(false));
              }}
            >
              {t("solve_overlay.delete_blockage_globally")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

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

          {pendingPlacementRequest?.previewItem?.assignment_preview && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <div className="font-medium text-gray-900">{t("solve_overlay.assignment_preview_summary")}</div>
              <div className="mt-1">
                {t("solve_overlay.assignment_preview_counts", {
                  assignable: pendingPlacementRequest.previewItem.assignment_preview.assignable_count,
                  headcount: pendingPlacementRequest.previewItem.assignment_preview.headcount,
                })}
              </div>
              {pendingPlacementRequest.previewItem.assignment_preview.reason && (
                <div className="mt-1">{pendingPlacementRequest.previewItem.assignment_preview.reason}</div>
              )}
            </div>
          )}

          <div className="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
            {assignmentOptions.length === 0 && (
              <div className="rounded border border-gray-200 bg-white px-3 py-3 text-sm text-gray-600">
                {t("solve_overlay.no_backend_recommendation_use_auto")}
              </div>
            )}
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
                      {option.source === "staff"
                        ? t("solve_overlay.staff_option")
                        : option.source === "open"
                        ? t("solve_overlay.participant_option")
                        : t("solve_overlay.tier_pools_option")}
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 px-3 rounded border text-sm text-gray-700 hover:bg-gray-50"
                onClick={confirmPendingPlacementWithAutoSelection}
                disabled={!pendingPlacementRequest}
              >
                {t("solve_overlay.use_backend_auto_selection")}
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={precheckDialogState.open}
        onOpenChange={(open) =>
          setPrecheckDialogState((prev) => ({
            ...prev,
            open,
          }))
        }
      >
        <DialogContent className="sm:max-w-[620px] z-[170]">
          <DialogHeader>
            <DialogTitle>
              {precheckDialogState.blocking
                ? t("solve_overlay.precheck_dialog_alert_title")
                : t("solve_overlay.precheck_dialog_warning_title")}
            </DialogTitle>
            <DialogDescription>
              {precheckDialogState.blocking
                ? t("solve_overlay.precheck_dialog_alert_description")
                : t("solve_overlay.precheck_dialog_warning_description")}
            </DialogDescription>
          </DialogHeader>

          {precheckDialogState.lines.length > 0 && (
            <div className="max-h-[42vh] overflow-y-auto rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <ul className="space-y-1 text-sm text-gray-800">
                {precheckDialogState.lines.map((line, idx) => (
                  <li key={`precheck-dialog-line-${idx}`} className="leading-snug">
                    - {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded border text-sm"
              onClick={() =>
                setPrecheckDialogState((prev) => ({
                  ...prev,
                  open: false,
                }))
              }
            >
              {t("common.close")}
            </button>
            {!precheckDialogState.blocking && (
              <button
                type="button"
                className="h-9 px-3 rounded bg-black text-white text-sm disabled:opacity-60"
                onClick={() => {
                  setPrecheckDialogState((prev) => ({
                    ...prev,
                    open: false,
                  }));
                  void runSolve();
                }}
                disabled={isSolving || precheckBusy}
              >
                {t("solve_overlay.run_anyways")}
              </button>
            )}
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
                            setCurrentSchedule(normalizeScheduleResource(entry.schedule));
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

              {false && (
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
              )}
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

            {canCommentCards && (
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("solve_overlay.placement")}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title={t("solve_overlay.previous_placement")}
                    onClick={() => moveCommentPlacementSelection(-1)}
                    disabled={commentPlacementOptions.length <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <select
                    className="h-9 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 text-sm"
                    value={selectedCommentPlacementKey}
                    onChange={(event) => {
                      const selected = commentPlacementOptions.find((option) => option.key === event.target.value);
                      if (!selected) return;
                      commentManuallyDeselectedRef.current = false;
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
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title={t("solve_overlay.next_placement")}
                    onClick={() => moveCommentPlacementSelection(1)}
                    disabled={commentPlacementOptions.length <= 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {!canCommentCards ? (
                <div className="text-sm text-gray-500">{t("solve_overlay.comments_unavailable")}</div>
              ) : (
                <>
                  {commentsLoading ? (
                    <div className="text-sm text-gray-500">{t("solve_overlay.loading_comments")}</div>
                  ) : orderedActivePlacementComments.length === 0 ? (
                    <div className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                      {t("solve_overlay.no_comments_for_placement")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orderedActivePlacementComments.map((c) => (
                        <PlacementCommentBubble
                          key={String(c.id)}
                          text={c.text}
                          createdAt={c.created_at}
                          authorId={c.author_id}
                          authorName={c.author_name}
                          currentUserId={currentUserId}
                          locale={locale}
                          youLabel={t("solve_overlay.comment_you")}
                          justNowLabel={t("solve_overlay.comment_just_now")}
                          fallbackAuthorLabel={t("solve_overlay.default_comment_author")}
                        />
                      ))}
                    </div>
                  )}

                </>
              )}
            </div>

            {canCommentCards && role === "supervisor" && (
              <div className="border-t border-gray-200 px-4 py-3">
                <textarea
                  className="min-h-[100px] w-full rounded border bg-white px-3 py-2 text-sm"
                  placeholder={t("solve_overlay.write_comment_selected")}
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  disabled={commentBusy}
                />
                {commentError && <div className="mt-2 text-xs text-red-600">{commentError}</div>}
                <button
                  type="button"
                  className="mt-2 h-9 w-full rounded bg-black px-3 text-sm text-white disabled:opacity-60"
                  onClick={() => void submitPlacementComment()}
                  disabled={commentBusy || !commentDraft.trim() || !commentAnchor}
                >
                  {commentBusy ? t("solve_overlay.saving") : t("solve_overlay.add_comment")}
                </button>
              </div>
            )}
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
        <div data-candidate-preview-view className="fixed inset-0 z-[175] bg-[#f3f4f6]">
          <style jsx global>{`
            body:has([data-candidate-preview-view]) [data-grid-topbar] {
              display: none !important;
            }
          `}</style>
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
                <div className="grid select-none" style={{ gridTemplateColumns: `100px repeat(${daysCount}, 1fr)` }}>
                  <div className="bg-gray-50 border-b h-12" />
                  {Array.from({ length: daysCount }).map((_, index) => (
                    <div key={`preview-day-${index}`} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
                      {dayLabels?.[index] || t("solve_overlay.day_with_index", { index: index + 1 })}
                    </div>
                  ))}
                </div>

                <div
                  ref={previewScheduleScrollRef}
                  data-schedule-scroll
                  className="relative max-h-[70vh] overflow-y-auto hide-scrollbar select-none"
                >
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
                      const placementId = String(s.cell_id ?? "");
                      const overlapMeta = placementId
                        ? previewOverlapDisplayByPlacementId[placementId]
                        : undefined;
                      if (overlapMeta && !overlapMeta.isVisible) return null;
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

                    {previewBlockagesForOverlay.map((blockage) => {
                      const col = Number(blockage.day_index);
                      if (col < 0 || col >= daysCount) return null;
                      const top = blockage.start_slot * rowPx + 2;
                      const height = Math.max(8, (blockage.end_slot - blockage.start_slot) * rowPx - 4);
                      const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 4px)`;
                      const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 8px)`;
                      return (
                        <div
                          key={`preview-blockage-${blockage.id}`}
                          className="absolute z-[7] rounded-2xl border border-gray-300/90 bg-transparent"
                          style={{ top, left, width, height }}
                        >
                          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                            <GlassSurface
                              width="100%"
                              height="100%"
                              borderRadius={16}
                              backgroundOpacity={0.14}
                              brightness={50}
                              opacity={0.95}
                              blur={11}
                              displace={0.5}
                              distortionScale={-180}
                              saturation={1.35}
                              className="h-full w-full"
                              style={{ background: "rgba(255, 255, 255, 0.26)" }}
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <span className="select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400/60">
                                {t("solve_overlay.blocked_overlay_label")}
                              </span>
                            </div>
                          </div>
                          <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/60" />
                        </div>
                      );
                    })}

                    {previewLockedPlacementsForOverlay.map((lockedPlacement, idx) => {
                      const col = Number(lockedPlacement.day_index);
                      if (col < 0 || col >= daysCount) return null;
                      const sourceCellId = String(lockedPlacement.source_cell_id ?? lockedPlacement.cell_id);
                      const rawTop = lockedPlacement.start_slot * rowPx;
                      const rawHeight = Math.max(6, (lockedPlacement.end_slot - lockedPlacement.start_slot) * rowPx);
                      const top = previewIsParticipantMode ? rawTop + rawHeight * 0.05 : rawTop;
                      const height = previewIsParticipantMode ? Math.max(6, rawHeight * 0.9) : rawHeight;
                      const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
                      const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
                      const cellName =
                        cellNameById[sourceCellId] || t("format.cell_with_id", { id: sourceCellId });
                      const timeLabel = formatSlotRange(
                        dayStartMin,
                        slotMin,
                        lockedPlacement.start_slot,
                        lockedPlacement.end_slot,
                      );
                      const staffIds = cellStaffsById[sourceCellId] || [];
                      const bg = cellColorById[sourceCellId] || "";
                      const colorIdx = CELL_COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
                      const useColor = Boolean(bg && colorIdx >= 0);
                      const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "#1f2937";
                      const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "#111827";
                      const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
                      const pinTrackBg = useColor ? shadeHex(bg, 0.28) : "#cfd4dc";
                      const pinTrackBorder = useColor ? shadeHex(bg, -0.12) : "#8f96a3";
                      const pinKnobBg = useColor ? shadeHex(bg, 0.42) : "#e7ebf1";
                      const pinTrackInsetDark = useColor ? shadeHex(bg, -0.24) : "#aeb4c0";
                      const pinTrackInsetLight = useColor ? shadeHex(bg, 0.1) : "#edf1f6";
                      const pinKnobBorder = useColor ? shadeHex(bg, -0.08) : "#b8bfc9";
                      const pinColor = textDark;
                      const pinKnobTranslatePx = 16;
                      const bundleLabel = getPreviewBundleLabel(lockedPlacement);
                      const assignedParticipantIds = Array.isArray(lockedPlacement.assigned_participants)
                        ? lockedPlacement.assigned_participants.map(String).sort()
                        : Array.isArray(lockedPlacement.participants)
                        ? lockedPlacement.participants.map(String).sort()
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
                      const placementDurationMin = Math.max(
                        slotMin,
                        Math.max(1, lockedPlacement.end_slot - lockedPlacement.start_slot) * slotMin,
                      );
                      const placementBreaks = Array.isArray(lockedPlacement.breaks) ? lockedPlacement.breaks : [];
                      return (
                        <div
                          key={`preview-locked-${lockedPlacement.cell_id}-${lockedPlacement.day_index}-${lockedPlacement.start_slot}-${idx}`}
                          className="absolute z-[8] pointer-events-none"
                          style={{ top, left, width, height }}
                        >
                          <div
                            className="group relative w-full h-full rounded-md border px-2 py-2 text-[11px]"
                            style={{
                              backgroundColor: bg || "#f3f4f6",
                              borderColor: border,
                              color: textDark,
                            }}
                          >
                            <div
                              className="absolute left-2 bottom-2 z-10 h-6 w-10 rounded-full border p-0"
                              style={{
                                color: pinColor,
                                backgroundColor: pinTrackBg,
                                borderColor: pinTrackBorder,
                                boxShadow: `inset 1.5px 1.5px 3px ${pinTrackInsetDark}, inset -1.5px -1.5px 3px ${pinTrackInsetLight}, 0 1px 3px rgba(0,0,0,0.16)`,
                              }}
                              title={t("solve_overlay.locked_overlay_label")}
                            >
                              <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-1.5">
                                <Lock className="h-3 w-3" style={{ opacity: 0.85 }} />
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
                            </div>
                            {placementBreaks.map((entry, breakIndex) => {
                              const breakStartRatio = placementDurationMin > 0 ? entry.offset_min / placementDurationMin : 0;
                              const breakHeightRatio = placementDurationMin > 0 ? entry.duration_min / placementDurationMin : 0;
                              return (
                                <div
                                  key={`preview-locked-break-${idx}-${breakIndex}-${entry.offset_min}-${entry.duration_min}`}
                                  className="absolute left-0 right-0 rounded-sm bg-black/20"
                                  style={{
                                    top: `${Math.max(0, Math.min(100, breakStartRatio * 100))}%`,
                                    height: `${Math.max(2, Math.min(100, breakHeightRatio * 100))}%`,
                                  }}
                                />
                              );
                            })}
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
                {previewOverlapCarouselTotalPages > 1 && (
                  <div
                    className="fixed z-[181] pointer-events-none"
                    style={{
                      bottom: previewIsParticipantMode ? "1rem" : "2.8rem",
                      left: previewCarouselCenterX ?? "50vw",
                      transform: "translateX(-50%)",
                    }}
                    aria-hidden
                  >
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-2 py-1 shadow-sm pointer-events-auto">
                      {Array.from({ length: previewOverlapCarouselTotalPages }).map((_, idx) => (
                        <button
                          type="button"
                          key={`preview-carousel-dot-${idx}`}
                          className="inline-flex h-3 w-3 items-center justify-center rounded-full transition-all duration-200"
                          onClick={() => {
                            setPreviewOverlapCarouselPage(idx);
                            if (previewOverlapCarouselPaused) setPreviewOverlapCarouselPaused(false);
                          }}
                          onDoubleClick={() => {
                            setPreviewOverlapCarouselPage(idx);
                            setPreviewOverlapCarouselPaused(true);
                          }}
                          aria-label={`${t("solve_overlay.carousel_view")} ${idx + 1}`}
                        >
                          {idx === previewOverlapCarouselPage ? (
                            <span className="relative inline-flex h-3 w-3 items-center justify-center">
                              <span
                                className={`absolute h-2.5 w-2.5 rounded-full bg-gray-700 transition-all duration-200 ${
                                  previewOverlapCarouselPaused ? "opacity-0 scale-75" : "opacity-100 scale-100"
                                }`}
                              />
                              <span
                                className={`absolute inline-flex items-center gap-[1px] transition-all duration-200 ${
                                  previewOverlapCarouselPaused ? "opacity-100 scale-100" : "opacity-0 scale-75"
                                }`}
                              >
                                <span className="h-[8px] w-[2px] rounded-[2px] bg-gray-700" />
                                <span className="h-[8px] w-[2px] rounded-[2px] bg-gray-700" />
                              </span>
                            </span>
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
        !(isNarrowMobile && leftPanelOpen) &&
        canCommentCards && (
        <RightSideDock
          visible={true}
          publishedCommentOnly={true}
          commentTitle={t("solve_overlay.comments")}
          onCommentsPressed={() => onCommentsPanelOpenChange?.(true)}
          error={null}
          labels={{
            add: "",
            participants: "",
            breaks: "",
            blockages: "",
            cells: "",
            publishDraft: "",
            nothingToPublish: "",
            solving: "",
          }}
        />
      )}

      {/* Right-side solve dock */}
      {canSolve &&
        scheduleViewMode === "draft" &&
        !suppressRightDock &&
        !commentsPanelOpen &&
        !(isNarrowMobile && leftPanelOpen) && (
        <RightSideDock
          visible={true}
          closeSignal={rightDockCloseSignal}
          pendingCandidateReview={hasPendingCandidateResolution}
          pendingCandidateTitle={t("solve_overlay.review_pending_candidates")}
          showSolveNotification={hasPendingCandidateResolution}
          canUseSolve={canUseSolve}
          solveDisabledReason={solveDisabledReason}
          canManualEditCards={canManualEditCards}
          hasOverstaffableCells={hasOverstaffableCells}
          hasUnassignedCells={hasUnassignedCells}
          hasPlacedCells={hasPlacedCells}
          isParticipantsToolActive={isParticipantsToolActive}
          isBreakToolActive={isBreakToolActive}
          isBlockageToolActive={isBlockageToolActive}
          isUnassignedToolActive={isUnassignedToolActive}
          canPublishDraft={canPublishDraft}
          isPublishing={isPublishing}
          isSolving={isSolving}
          solveElapsedMs={solveElapsedMs}
          error={error}
          labels={{
            add: t("common.add"),
            participants: t("solve_overlay.participants"),
            breaks: "Breaks",
            blockages: "Blockages",
            cells: "Cells",
            publishDraft: t("solve_overlay.publish_draft_schedule"),
            nothingToPublish: t("solve_overlay.nothing_to_publish"),
            solving: t("solve_overlay.solving"),
          }}
          participantScrollerItems={participantScrollerItems}
          unassignedCellItems={unassignedCells.map((cell) => ({
            id: String(cell.id),
            name: cell.name,
            color: cell.color || "",
            timeLabel: cell.timeLabel,
            durationSlots: Math.max(1, Number(cell.durationSlots) || 1),
            remainingPlacements: Math.max(0, Number(cell.remainingPlacements) || 0),
            totalPlacements: Math.max(1, Number(cell.totalPlacements) || 1),
            canGrab: Boolean(
              canManualEditCards &&
                isJiggleMode &&
                cell.canGrabForCurrentTab,
            ),
            selectedBundleId: cell.selectedBundleId != null ? String(cell.selectedBundleId) : null,
          }))}
          onUnassignedGrabStart={handleUnassignedScrollerGrabStart}
          onUnassignedGrabBlocked={() => {
            setPinError(t("solve_overlay.select_matching_unit_tab_before_placing"));
          }}
          onSolvePressed={onSolvePressed}
          onPendingReviewPressed={openPendingCandidatePreview}
          onActivateTool={activateEditTool}
          onParticipantGrabStart={handleParticipantScrollerGrabStart}
          showParticipantTier={gridTierEnabled}
          participantDragVisual={
            dragState?.dragType === "participant-tool"
              ? {
                  cardKey: dragState.cardKey,
                  clientX: dragState.clientX,
                  clientY: dragState.clientY,
                  offsetX: dragState.offsetX,
                  offsetY: dragState.offsetY,
                }
              : null
          }
          onPublishDraft={() => {
            void publishDraftSchedule();
          }}
        />
      )}
      {dragState?.dragType === "participant-tool" && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{
            left: dragState.clientX,
            top: dragState.clientY,
            transform: "translate(-50%, -10px)",
          }}
        >
          <div className="relative select-none">
            <div className="whitespace-nowrap rounded-lg bg-white border border-gray-300 px-2.5 py-1 text-[12px] font-bold text-gray-900 shadow-md max-w-[220px] truncate">
              {dragState.participantName}
            </div>
          </div>
        </div>
      )}
      {participantDropGhost && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{
            left: participantDropGhost.x,
            top: participantDropGhost.y,
            transform:
              participantDropGhost.mode === "valid"
                ? participantDropGhost.phase === "start"
                  ? "translate(-50%, -10px) scaleX(1.04) scaleY(0.96)"
                  : participantDropGhost.phase === "rebound"
                  ? "translate(-50%, -12px) scaleX(0.98) scaleY(1.02)"
                  : "translate(-50%, -16px) scale(0.92)"
                : participantDropGhost.phase === "start"
                ? "translate(-50%, -10px) scale(1)"
                : "translate(-50%, 28px) scale(0.95)",
            opacity:
              participantDropGhost.mode === "valid"
                ? participantDropGhost.phase === "end"
                  ? 0
                  : 1
                : participantDropGhost.phase === "start"
                ? 1
                : 0,
            transition:
              participantDropGhost.mode === "valid"
                ? participantDropGhost.phase === "rebound"
                  ? "transform 170ms cubic-bezier(0.22,1,0.36,1), opacity 160ms ease-out"
                  : "transform 140ms ease-out, opacity 150ms ease-out"
                : "transform 200ms ease-in, opacity 200ms ease-in",
          }}
        >
          <div className="relative select-none">
            <div className="whitespace-nowrap rounded-lg bg-white border border-gray-300 px-2.5 py-1 text-[12px] font-bold text-gray-900 shadow-md max-w-[220px] truncate">
              {participantDropGhost.participantName}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
