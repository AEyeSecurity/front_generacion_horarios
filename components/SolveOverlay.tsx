"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Eye,
  Lightbulb,
  LightbulbOff,
  Lock,
  Loader2,
  MessageSquarePlus,
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
import { isSolvedSolution, pickDisplaySolution } from "@/lib/solution-utils";

const COLOR_OPTIONS = [
  "#E7180B",
  "#FF692A",
  "#FE9A37",
  "#FDC745",
  "#7CCF35",
  "#31C950",
  "#37BC7D",
  "#36BBA7",
  "#3BB8DB",
  "#34A6F4",
  "#2B7FFF",
  "#615FFF",
  "#8E51FF",
  "#AD46FF",
  "#E12AFB",
  "#F6339A",
  "#FF2056",
];

const COLOR_TEXT_DARK = [
  "#460809",
  "#441306",
  "#461901",
  "#432004",
  "#192E03",
  "#032E15",
  "#012C22",
  "#022F2E",
  "#053345",
  "#052F4A",
  "#162456",
  "#1E1A4D",
  "#2F0D68",
  "#3C0366",
  "#4B004F",
  "#510424",
  "#4D0218",
];

const COLOR_TEXT_LIGHT = [
  "#FFE2E2",
  "#FFEDD4",
  "#FEF3C6",
  "#FEFCE8",
  "#F7FEE7",
  "#DCFCE7",
  "#D0FAE5",
  "#CBFBF1",
  "#CEFAFE",
  "#DFF2FE",
  "#DBEAFE",
  "#E0E7FF",
  "#EDE9FE",
  "#F3E8FF",
  "#FAE8FF",
  "#FCE7F3",
  "#FFE4E6",
];

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

type Solution = {
  id: number;
  status?: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR";
  error_message?: string;
  runtime_ms?: number;
  created_at?: string;
  updated_at?: string;
  schedule?: Array<{
    cell_id: string;
    source_cell_id?: string | number;
    bundle_id?: string | number;
    bundle?: string | number;
    day_index: number;
    start_slot: number;
    end_slot: number;
    assigned_participants?: Array<string | number>;
    participants?: string[];
    units?: Array<string | number>;
  }>;
};

type ScheduleRow = NonNullable<Solution["schedule"]>[number];

type CandidateStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR";

type SolveCandidate = {
  index: number;
  label?: string;
  status?: CandidateStatus;
  objective_value?: number | null;
  runtime_ms?: number | null;
  schedule?: Solution["schedule"];
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
  pin_day_index: number | null;
  pin_start_slot: number | null;
  bundles: Array<number | string>;
};

type PlacementComment = {
  id: number | string;
  solution: number | string;
  source_cell_id: number | string;
  bundle: number | string;
  day_index: number;
  start_slot: number;
  message: string;
  created_at?: string;
  author_name?: string;
};

type CommentAnchor = {
  solutionId: number;
  sourceCellId: string;
  bundleId: number | string;
  dayIndex: number;
  startSlot: number;
  cellName: string;
  timeLabel: string;
};

function buildPlacementKey(
  solutionId: number | string,
  sourceCellId: number | string,
  bundleId: number | string,
  dayIndex: number,
  startSlot: number,
) {
  return `${solutionId}|${sourceCellId}|${bundleId}|${dayIndex}|${startSlot}`;
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
  enablePinning?: boolean;
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
  enablePinning = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [hasCells, setHasCells] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solveStartedAt, setSolveStartedAt] = useState<number | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellStaffsById, setCellStaffsById] = useState<Record<string, string[]>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [staffMembersByStaffId, setStaffMembersByStaffId] = useState<Record<string, string[]>>({});
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [participantNameById, setParticipantNameById] = useState<Record<string, string>>({});
  const [cellPinMetaById, setCellPinMetaById] = useState<Record<string, CellPinMeta>>({});
  const [bundleUnitsById, setBundleUnitsById] = useState<Record<string, string[]>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [unitNameById, setUnitNameById] = useState<Record<string, string>>({});
  const [previewParticipantRules, setPreviewParticipantRules] = useState<AvailabilityRule[]>([]);
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [placementComments, setPlacementComments] = useState<PlacementComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentDialogMode, setCommentDialogMode] = useState<"view" | "add">("view");
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
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

  const canSolve = role === "supervisor";
  const solveSignatureStorageKey = `grid:${gridId}:last-solve-signature`;

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

  const getList = (raw: any): any[] => (Array.isArray(raw) ? raw : raw?.results ?? []);

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

    const urls = [
      `/api/cells?grid=${gridId}`,
      `/api/participants?grid=${gridId}`,
      `/api/time_ranges?grid=${gridId}`,
      `/api/bundles?grid=${gridId}`,
      `/api/staffs?grid=${gridId}`,
      `/api/staff-members?grid=${gridId}`,
      `/api/availability_rules?grid=${gridId}`,
    ];

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) return [];
          const json = await res.json().catch(() => ([]));
          return getList(json);
        } catch {
          return [];
        }
      }),
    );

    const [cells, participants, timeRanges, bundles, staffs, staffMembers, availabilityRules] = results;
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        if (active) setHasCells(list.length > 0);
      } catch {}
    })();
    return () => { active = false; };
  }, [gridId]);

  useEffect(() => {
    const solutionId = solution?.id;
    if (role !== "supervisor" || !solutionId) {
      setPlacementComments([]);
      return;
    }
    let active = true;
    (async () => {
      setCommentsLoading(true);
      try {
        const r = await fetch(
          `/api/placement-comments/?solution=${encodeURIComponent(String(solutionId))}&grid=${encodeURIComponent(String(gridId))}`,
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
              raw?.solution == null ||
              raw?.source_cell_id == null ||
              bundleRaw == null ||
              raw?.day_index == null ||
              raw?.start_slot == null
            ) {
              return null;
            }
            return {
              id: raw.id,
              solution: raw.solution,
              source_cell_id: raw.source_cell_id,
              bundle: bundleRaw,
              day_index: Number(raw.day_index),
              start_slot: Number(raw.start_slot),
              message: String(message),
              created_at: raw.created_at,
              author_name:
                raw.author_name ??
                raw.author?.full_name ??
                raw.author?.name ??
                raw.author?.email ??
                undefined,
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
  }, [gridId, role, solution?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/grids/${gridId}/solutions/`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        if (list.length === 0) return;
        const latest = pickDisplaySolution(list) as Solution | null;
        if (!latest) return;
        if (active) {
          setSolution(latest);
          if (latest.status === "INFEASIBLE") {
            setError("No feasible solution");
          } else if (latest.status === "ERROR") {
            setError(latest.error_message || "Solver error");
          } else {
            setError(null);
          }
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [gridId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rc, rb, rsm, rs, rp, ru] = await Promise.all([
          fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/bundles?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/staff-members?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/staffs?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/units?grid=${gridId}`, { cache: "no-store" }),
        ]);

        const cdata = await rc.json().catch(() => ([]));
        const bdata = await rb.json().catch(() => ([]));
        const smdata = await rsm.json().catch(() => ([]));
        const sdata = await rs.json().catch(() => ([]));
        const pdata = await rp.json().catch(() => ([]));
        const udata = await ru.json().catch(() => ([]));

        const clist = Array.isArray(cdata) ? cdata : cdata.results ?? [];
        const blist = Array.isArray(bdata) ? bdata : bdata.results ?? [];
        const smlist = Array.isArray(smdata) ? smdata : smdata.results ?? [];
        const slist = Array.isArray(sdata) ? sdata : sdata.results ?? [];
        const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
        const ulist = Array.isArray(udata) ? udata : udata.results ?? [];

        const cmap: Record<string, string> = {};
        const cstaffs: Record<string, string[]> = {};
        const ccolors: Record<string, string> = {};
        const cpins: Record<string, CellPinMeta> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            if (c?.colorHex) ccolors[cid] = c.colorHex;
            else if (c?.color_hex) ccolors[cid] = c.color_hex;
            if (Array.isArray(c.staffs)) {
              cstaffs[cid] = c.staffs.map((s: any) => String(s));
            }
            cpins[cid] = {
              pin_day_index:
                typeof c.pin_day_index === "number" ? c.pin_day_index : null,
              pin_start_slot:
                typeof c.pin_start_slot === "number" ? c.pin_start_slot : null,
              bundles: Array.isArray(c.bundles) ? c.bundles : [],
            };
          }
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
                .filter((v): v is string => Boolean(v))
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
        for (const p of plist) {
          if (p?.id != null) pmap[String(p.id)] = `${p.name}${p.surname ? " " + p.surname : ""}`;
        }
        const umap: Record<string, string> = {};
        for (const u of ulist) {
          if (u?.id != null) umap[String(u.id)] = u.name || `Unit ${u.id}`;
        }
        if (active) {
          setCellNameById(cmap);
          setCellStaffsById(cstaffs);
          setCellColorById(ccolors);
          setCellPinMetaById(cpins);
          setBundleUnitsById(bundleUnitsMap);
          setBundleNameById(bundleNamesMap);
          setUnitNameById(umap);
          setStaffMembersByStaffId(smm);
          setStaffNameById(snames);
          setParticipantNameById(pmap);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [gridId]);

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
        if (!baseline && isSolvedSolution(solution)) {
          const solutionUpdatedAt = Math.max(parseTimestamp(solution.updated_at), parseTimestamp(solution.created_at));
          if (solutionUpdatedAt > 0 && maxUpdatedAt <= solutionUpdatedAt) {
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
  }, [canSolve, gridId, hasCells, solution?.id, solution?.status, solution?.updated_at, solution?.created_at]);

  const solveElapsedMs = useMemo(() => {
    if (!solveStartedAt) return 0;
    return Date.now() - solveStartedAt;
  }, [solveStartedAt, tick]);

  async function runSolve() {
    try {
      const { signature, solverParams } = await computeCurrentSolveInputSignature();
      const saved = window.localStorage.getItem(solveSignatureStorageKey);
      if (saved && saved === signature) {
        setError("Input is unchanged from the latest solved solution.");
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
        setError("All 3 candidates failed. Edit constraints and try again.");
      }
    } catch (e: any) {
      setError(e?.message || "Solver error");
    } finally {
      setIsSolving(false);
    }
  }

  const refreshGridView = useCallback(() => {
    if (pathname?.startsWith("/grid/")) {
      router.replace(pathname);
    }
    router.refresh();
  }, [pathname, router]);

  const chooseCandidate = async (candidateIndex: number) => {
    if (!candidateRunId) {
      setCandidateError("Missing candidate run id.");
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
      const chosen = (await res.json()) as Solution;
      setSolution(chosen);
      setCandidateDialogOpen(false);
      setPreviewCandidateIndex(null);
      setPreviewParticipantsOpen(false);
      setPreviewParticipantId(null);
      setPreviewSelectedUnitId(null);
      setError(
        chosen.status === "ERROR"
          ? chosen.error_message || "Solver error"
          : chosen.status === "INFEASIBLE"
          ? "Selected candidate is infeasible."
          : null,
      );
      if (isSolvedSolution(chosen) && pendingSolveSignature) {
        window.localStorage.setItem(solveSignatureStorageKey, pendingSolveSignature);
        setInputSignature(pendingSolveSignature);
      }
      refreshGridView();
    } catch (e: any) {
      setCandidateError(e?.message || "Could not choose candidate.");
    } finally {
      setCandidateBusy(false);
    }
  };

  const rejectCandidates = async () => {
    if (!candidateRunId) {
      setCandidateError("Missing candidate run id.");
      return;
    }
    const reason = rejectReasonCode || rejectReasonOptions[0]?.code;
    if (!reason) {
      setCandidateError("Select a reject reason.");
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
      setError("Candidates rejected. Adjust constraints/settings and run solve again.");
      refreshGridView();
    } catch (e: any) {
      setCandidateError(e?.message || "Could not reject candidates.");
    } finally {
      setCandidateBusy(false);
    }
  };

  const selectableCandidateSet = useMemo(
    () => new Set(selectableCandidateIndexes),
    [selectableCandidateIndexes],
  );

  const schedule =
    isSolvedSolution(solution)
      ? (solution.schedule || [])
      : [];

  const filteredSchedule = selectedUnitId
    ? schedule.filter((s: any) => Array.isArray(s.units) && s.units.map(String).includes(String(selectedUnitId)))
    : schedule;

  const isInputUnchanged = Boolean(inputSignature);
  const canUseSolve = canSolve && hasCells && !isSolving && !isInputUnchanged && !isInputSignatureLoading;
  const canPinCards = enablePinning && role === "supervisor";
  const canCommentCards = role === "supervisor" && Boolean(solution?.id);

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
        c.solution,
        c.source_cell_id,
        c.bundle,
        Number(c.day_index),
        Number(c.start_slot),
      );
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [placementComments]);

  const openCommentDialog = (
    mode: "view" | "add",
    anchor: CommentAnchor,
  ) => {
    setCommentDialogMode(mode);
    setCommentAnchor(anchor);
    setCommentError(null);
    setCommentDraft("");
    setCommentDialogOpen(true);
  };

  const activePlacementComments = useMemo(() => {
    if (!commentAnchor) return [];
    return placementComments.filter((c) => {
      return (
        Number(c.solution) === Number(commentAnchor.solutionId) &&
        String(c.source_cell_id) === String(commentAnchor.sourceCellId) &&
        String(c.bundle) === String(commentAnchor.bundleId) &&
        Number(c.day_index) === Number(commentAnchor.dayIndex) &&
        Number(c.start_slot) === Number(commentAnchor.startSlot)
      );
    });
  }, [commentAnchor, placementComments]);

  const submitPlacementComment = async () => {
    if (!commentAnchor || !commentDraft.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const payload = {
        solution: commentAnchor.solutionId,
        source_cell_id: commentAnchor.sourceCellId,
        bundle: commentAnchor.bundleId,
        day_index: commentAnchor.dayIndex,
        start_slot: commentAnchor.startSlot,
        message: commentDraft.trim(),
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
        solution: raw.solution ?? commentAnchor.solutionId,
        source_cell_id: raw.source_cell_id ?? commentAnchor.sourceCellId,
        bundle: bundleRaw ?? commentAnchor.bundleId,
        day_index: Number(raw.day_index ?? commentAnchor.dayIndex),
        start_slot: Number(raw.start_slot ?? commentAnchor.startSlot),
        message: String(raw.message ?? commentDraft.trim()),
        created_at: raw.created_at,
        author_name:
          raw.author_name ??
          raw.author?.full_name ??
          raw.author?.name ??
          raw.author?.email ??
          undefined,
      };
      setPlacementComments((prev) => [next, ...prev]);
      setCommentDraft("");
      setCommentDialogMode("view");
    } catch (e: unknown) {
      setCommentError(e instanceof Error ? e.message : "Could not add comment.");
    } finally {
      setCommentBusy(false);
    }
  };

  const togglePin = async (
    sourceCellId: string,
    dayIndex: number,
    startSlot: number,
    scheduleUnitIds: string[],
    cardKey: string,
  ) => {
    if (!canPinCards || pinBusyKey) return;
    const pinMeta = cellPinMetaById[sourceCellId];
    const currentDay = pinMeta?.pin_day_index ?? null;
    const currentStart = pinMeta?.pin_start_slot ?? null;
    const isPinnedHere = currentDay === dayIndex && currentStart === startSlot;
    const nextDay = isPinnedHere ? null : dayIndex;
    const nextStart = isPinnedHere ? null : startSlot;
    const bundleIds = resolveBundleIdsForPatch(sourceCellId, scheduleUnitIds).map((bundleId) =>
      /^\d+$/.test(bundleId) ? Number(bundleId) : bundleId,
    );

    const payload: Record<string, unknown> = {
      pin_day_index: nextDay,
      pin_start_slot: nextStart,
    };
    if (bundleIds.length > 0) payload.bundles = bundleIds;

    setPinError(null);
    setPinBusyKey(cardKey);
    try {
      const res = await fetch(`/api/cells/${encodeURIComponent(sourceCellId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to update pin (${res.status})`);
      }
      setCellPinMetaById((prev) => ({
        ...prev,
        [sourceCellId]: {
          pin_day_index: nextDay,
          pin_start_slot: nextStart,
          bundles: bundleIds.length > 0 ? bundleIds : prev[sourceCellId]?.bundles || [],
        },
      }));
    } catch (e: unknown) {
      setPinError(e instanceof Error ? e.message : "Could not update pin.");
    } finally {
      setPinBusyKey(null);
    }
  };

  const solveDisabledReason = !canSolve
    ? "Solve unavailable"
    : !hasCells
    ? "Create cells to enable solve"
    : isInputUnchanged
    ? "Input is unchanged from the latest solved solution"
    : isInputSignatureLoading
    ? "Checking if changes were made..."
    : isSolving
    ? "Solving..."
    : "Solve";

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
        return unitIds.map((uid) => unitNameById[uid] || `Unit ${uid}`).join(" + ");
      }
      return `Bundle ${key}`;
    },
    [bundleNameById, bundleUnitsById, unitNameById],
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
      .map((id) => ({ id, name: unitNameById[id] || `Unit ${id}` }));
  }, [previewSchedule, unitNameById, getPreviewScheduleUnitIds]);

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
    const confirmed = window.confirm("Reject all candidates for this run?");
    if (!confirmed) return;
    void rejectCandidates();
  };

  return (
    <>
      {/* Schedule overlay */}
      {!hideScheduleOverlay && filteredSchedule.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: topOffset, height: bodyHeight }}>
          {pinError && (
            <div className="absolute left-3 top-3 z-[20] rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-600">
              {pinError}
            </div>
          )}
          {filteredSchedule.map((s, idx) => {
            const col = s.day_index;
            if (col < 0 || col >= daysCount) return null;
            const sourceCellId = String(s.source_cell_id ?? s.cell_id);
            const cardKey = `${sourceCellId}-${s.day_index}-${s.start_slot}-${idx}`;
            const top = s.start_slot * rowPx;
            const height = Math.max(6, (s.end_slot - s.start_slot) * rowPx);
            const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
            const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
            const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
            const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
            const scheduleUnitIds = Array.isArray(s.units) ? s.units.map(String).sort() : [];
            const staffIds = cellStaffsById[sourceCellId] || [];
            const bg = cellColorById[sourceCellId] || "";
            const colorIdx = COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
            const useColor = Boolean(bg && colorIdx >= 0);
            const textDark = useColor ? COLOR_TEXT_DARK[colorIdx] : "#1f2937";
            const textLight = useColor ? COLOR_TEXT_LIGHT[colorIdx] : "#111827";
            const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
            const isPinnedHere =
              (cellPinMetaById[sourceCellId]?.pin_day_index ?? null) === s.day_index &&
              (cellPinMetaById[sourceCellId]?.pin_start_slot ?? null) === s.start_slot;
            const pinColor = textDark;
            const pinTrackBg = isPinnedHere
              ? useColor
                ? shadeHex(bg, 0.58)
                : "#d1d5db"
              : useColor
              ? shadeHex(bg, 0.78)
              : "#e5e7eb";
            const pinTrackBorder = useColor ? shadeHex(bg, -0.18) : "#9ca3af";
            const pinKnobBg = useColor ? shadeHex(bg, 0.96) : "#f9fafb";
            const pinTrackInsetDark = useColor ? shadeHex(bg, -0.22) : "#b8b9c0";
            const pinTrackInsetLight = useColor ? shadeHex(bg, 0.22) : "#ffffff";
            const pinKnobBorder = useColor ? shadeHex(bg, 0.3) : "#d1d5db";
            const pinKnobTranslatePx = isPinnedHere ? 16 : 0;
            const resolvedBundleId = resolveBundleIdForCard(s);
            const canAnchorComment =
              canCommentCards &&
              solution?.id != null &&
              resolvedBundleId != null;
            const placementKey = canAnchorComment
              ? buildPlacementKey(solution!.id, sourceCellId, resolvedBundleId!, s.day_index, s.start_slot)
              : null;
            const placementCommentCount =
              placementKey != null ? commentCountByPlacement[placementKey] || 0 : 0;
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
            return (
              <div key={cardKey} className="absolute pointer-events-auto" style={{ top, left, width, height }}>
                <div
                  className="group relative w-full h-full rounded-md border px-2 py-2 text-[11px]"
                  style={{ backgroundColor: bg || "#f3f4f6", borderColor: border, color: textDark }}
                >
                  {canAnchorComment && (
                    <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        className="relative rounded p-1"
                        style={{ color: textDark }}
                        title="View comments"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openCommentDialog("view", {
                            solutionId: solution!.id,
                            sourceCellId,
                            bundleId: resolvedBundleId!,
                            dayIndex: s.day_index,
                            startSlot: s.start_slot,
                            cellName,
                            timeLabel,
                          });
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {placementCommentCount > 0 && (
                          <span className="absolute -right-1 -top-1 rounded-full bg-black px-1 text-[10px] leading-4 text-white">
                            {placementCommentCount}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="rounded p-1"
                        style={{ color: textDark }}
                        title="Add comment"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openCommentDialog("add", {
                            solutionId: solution!.id,
                            sourceCellId,
                            bundleId: resolvedBundleId!,
                            dayIndex: s.day_index,
                            startSlot: s.start_slot,
                            cellName,
                            timeLabel,
                          });
                        }}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {canPinCards && (
                    <>
                      {pinBusyKey !== cardKey && (
                        <button
                          type="button"
                          className="absolute left-2 bottom-2 z-10 h-6 w-10 rounded-full border p-0 opacity-0 transition-[opacity,transform] duration-200 hover:scale-[1.02] group-hover:opacity-100 focus-visible:opacity-100"
                          style={{
                            color: pinColor,
                            backgroundColor: pinTrackBg,
                            borderColor: pinTrackBorder,
                            boxShadow: `inset 2px 2px 4px ${pinTrackInsetDark}, inset -2px -2px 4px ${pinTrackInsetLight}, 0 1px 2px rgba(0,0,0,0.14)`,
                          }}
                          title={isPinnedHere ? "Unlock placement" : "Lock placement"}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void togglePin(sourceCellId, s.day_index, s.start_slot, scheduleUnitIds, cardKey);
                          }}
                          disabled={Boolean(pinBusyKey)}
                        >
                          <span
                            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 transition-all duration-200 ${
                              isPinnedHere ? "left-1.5" : "right-1.5"
                            }`}
                          >
                            {isPinnedHere ? (
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
                              boxShadow: "0 1px 3px rgba(0,0,0,0.24), inset 0 1px 1px rgba(255,255,255,0.72)",
                              transform: `translateX(${pinKnobTranslatePx}px)`,
                            }}
                          />
                        </button>
                      )}

                      {pinBusyKey === cardKey && (
                        <div className="absolute left-4 bottom-[11px] z-10">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: pinColor }} />
                        </div>
                      )}
                    </>
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
        </div>
      )}

      <Dialog
        open={commentDialogOpen}
        onOpenChange={(open) => {
          setCommentDialogOpen(open);
          if (!open) {
            setCommentAnchor(null);
            setCommentDraft("");
            setCommentError(null);
            setCommentBusy(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] z-[170]">
          <DialogHeader>
            <DialogTitle>
              {commentDialogMode === "add" ? "Add placement comment" : "Placement comments"}
            </DialogTitle>
            <DialogDescription>
              {commentAnchor
                ? `${commentAnchor.cellName} • ${commentAnchor.timeLabel}`
                : "Placement details"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {commentsLoading ? (
              <div className="text-sm text-gray-500">Loading comments...</div>
            ) : activePlacementComments.length === 0 ? (
              <div className="text-sm text-gray-500">No comments for this placement.</div>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {activePlacementComments.map((c) => (
                  <div key={String(c.id)} className="rounded border p-2">
                    <div className="text-xs text-gray-500 mb-1">
                      {c.author_name || "Supervisor"}
                      {c.created_at ? ` • ${new Date(c.created_at).toLocaleString()}` : ""}
                    </div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">
                      {c.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {commentDialogMode === "add" && (
              <div className="space-y-2">
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm min-h-[96px]"
                  placeholder="Write a comment for this specific placement..."
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  disabled={commentBusy}
                />
                {commentError && <div className="text-xs text-red-600">{commentError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded border text-sm"
                    onClick={() => setCommentDialogMode("view")}
                    disabled={commentBusy}
                  >
                    View comments
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded bg-black text-white text-sm disabled:opacity-60"
                    onClick={() => void submitPlacementComment()}
                    disabled={commentBusy || !commentDraft.trim() || !commentAnchor}
                  >
                    {commentBusy ? "Saving..." : "Add comment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
            <DialogTitle>Choose a Solver Candidate</DialogTitle>
            <DialogDescription>
              The solver generated 3 candidates. Select one to create the final solution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {candidatePreference && (
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Candidate preference metadata loaded for this run.
              </div>
            )}

            {orderedCandidates.length === 0 && (
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                No candidates were returned by backend.
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
                          Candidate {idx + 1}
                        </button>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${candidateStatusClass(candidate.status)}`}>
                          {candidate.status || "UNKNOWN"}
                        </span>
                      </div>
                      {candidate.label && (
                        <div className="mt-1 text-xs text-gray-600">{candidate.label}</div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                          Placements: {scheduleCount}
                        </span>
                        <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                          Violations: {violationCount}
                        </span>
                        {runtimeMs != null && (
                          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                            Runtime: {Math.round(runtimeMs)} ms
                          </span>
                        )}
                        {objectiveValue != null && (
                          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
                            Objective: {objectiveValue.toFixed(2)}
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
                      {candidateBusy ? "Choosing..." : "Choose"}
                    </button>
                  </div>
                </div>
              );
            })}

            {allCandidatesFailed && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                All candidates failed. Edit constraints/settings and run solve again.
              </div>
            )}

            <div className="rounded border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium text-gray-900">Reject all candidates</div>
              <div className="text-xs text-gray-600">
                Reject this run if none of the candidates should become the final solution.
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <select
                  className="h-9 rounded border px-2 text-sm"
                  value={rejectReasonCode}
                  onChange={(e) => setRejectReasonCode(e.target.value)}
                  disabled={candidateBusy || rejectReasonOptions.length === 0}
                >
                  {rejectReasonOptions.length === 0 ? (
                    <option value="">No reasons available</option>
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
                  placeholder="Optional note"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  disabled={candidateBusy}
                />
              </div>
              <div className="flex items-center justify-between">
                {candidateError ? (
                  <div className="text-xs text-red-600">{candidateError}</div>
                ) : (
                  <div className="text-xs text-gray-500">Only selectable candidates can be chosen.</div>
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
                  {candidateBusy ? "Submitting..." : "Reject all"}
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
                title={previewIsParticipantMode ? "Back to candidate" : "Previous candidate"}
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
                  Candidate {Number(previewCandidate.index) + 1}
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${candidateStatusClass(previewCandidate.status)}`}>
                  {previewCandidate.status || "UNKNOWN"}
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
                  title="Next candidate"
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
                  title="Participants"
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
                    aria-label="Close participants panel"
                    className="fixed inset-0 z-[177] pointer-events-auto cursor-default"
                    onClick={() => setPreviewParticipantsOpen(false)}
                  />

                  <div className="fixed left-[84px] top-[72px] bottom-[24px] z-[178] w-[360px] rounded-xl border bg-white shadow-lg p-4 pointer-events-auto">
                    <div className="flex items-center justify-between">
                      <div className="text-base font-semibold">Participants</div>
                      <button
                        type="button"
                        className="rounded p-1 text-gray-500 hover:text-black"
                        onClick={() => setPreviewParticipantsOpen(false)}
                        title="Close panel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">Select one to open candidate schedule view.</div>
                    <div className="mt-3">
                      <input
                        className="w-full border rounded px-3 py-2 text-sm"
                        placeholder="Search..."
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
                            ? "No assigned participants in this candidate."
                            : "No participants match this search."}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="fixed right-4 top-1/2 -translate-y-1/2 z-[178] pointer-events-auto flex flex-col gap-3">
                <button
                  type="button"
                  title={previewCanChoose ? "Choose this candidate" : "This candidate is not selectable"}
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
                  title={canRejectFromPreview ? "Reject all candidates" : "Reject unavailable"}
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
                      {dayLabels?.[index] || `Day ${index + 1}`}
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
                      const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
                      const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
                      const staffIds = cellStaffsById[sourceCellId] || [];
                      const bg = cellColorById[sourceCellId] || "";
                      const colorIdx = COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
                      const useColor = Boolean(bg && colorIdx >= 0);
                      const textDark = useColor ? COLOR_TEXT_DARK[colorIdx] : "#1f2937";
                      const textLight = useColor ? COLOR_TEXT_LIGHT[colorIdx] : "#111827";
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
                          assignmentLabel = staffNameById[matchedStaffId] || `Staff ${matchedStaffId}`;
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
                        "transition-[background-color,box-shadow,color,transform] duration-150 ease-out",
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

      {/* Right-side solve dock */}
      {canSolve && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-[140] pointer-events-none">
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
          {error && <div className="mt-2 w-48 text-xs text-red-600 text-right">{error}</div>}
          {isSolving && (
            <div className="mt-1 w-48 text-xs text-gray-600 text-right">
              Solving... {Math.round(solveElapsedMs / 100) / 10}s
            </div>
          )}
        </div>
      )}
    </>
  );
}
