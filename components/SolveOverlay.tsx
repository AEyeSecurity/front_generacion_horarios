"use client";

import { useEffect, useMemo, useState } from "react";
import { Lightbulb, LightbulbOff } from "lucide-react";
import { formatSlotRange } from "@/lib/schedule";
import {
  buildSolverParamsPayload,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";

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
  state: "RUNNING" | "DONE" | "FAILED";
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR";
  error_message?: string;
  runtime_ms?: number;
  created_at?: string;
  updated_at?: string;
  schedule?: Array<{
    cell_id: string;
    source_cell_id?: string | number;
    day_index: number;
    start_slot: number;
    end_slot: number;
    assigned_participants?: Array<string | number>;
    participants?: string[];
    units?: Array<string | number>;
  }>;
};

type Props = {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  daysCount: number;
  rowPx: number;
  timeColPx: number;
  bodyHeight: number;
  dayStartMin: number;
  slotMin: number;
  selectedUnitId?: string | null;
  topOffset?: number;
};

export default function SolveOverlay({
  gridId,
  role,
  daysCount,
  rowPx,
  timeColPx,
  bodyHeight,
  dayStartMin,
  slotMin,
  selectedUnitId,
  topOffset = 0,
}: Props) {
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
  const [inputSignature, setInputSignature] = useState<string | null>(null);
  const [isInputSignatureLoading, setIsInputSignatureLoading] = useState(false);

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
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/grids/${gridId}/solutions/`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        if (list.length === 0) return;
        const sorted = list.slice().sort((a: any, b: any) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });
        const latest = sorted[0] || list[list.length - 1];
        if (active) {
          setSolution(latest);
          if (latest.state === "DONE" && latest.status === "INFEASIBLE") {
            setError("No feasible solution");
          } else if (latest.state === "FAILED" || latest.status === "ERROR") {
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
        const rc = await fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" });
        const cdata = await rc.json().catch(() => ([]));
        const clist = Array.isArray(cdata) ? cdata : cdata.results ?? [];
        const cmap: Record<string, string> = {};
        const cstaffs: Record<string, string[]> = {};
        const ccolors: Record<string, string> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            if (c?.colorHex) ccolors[cid] = c.colorHex;
            else if (c?.color_hex) ccolors[cid] = c.color_hex;
            if (Array.isArray(c.staffs)) {
              cstaffs[cid] = c.staffs.map((s: any) => String(s));
            }
          }
        }
        const rsm = await fetch(`/api/staff-members?grid=${gridId}`, { cache: "no-store" });
        const smdata = await rsm.json().catch(() => ([]));
        const smlist = Array.isArray(smdata) ? smdata : smdata.results ?? [];
        const smm: Record<string, string[]> = {};
        for (const m of smlist) {
          const sid = String(m.staff);
          const pid = String(m.participant);
          if (!smm[sid]) smm[sid] = [];
          smm[sid].push(pid);
        }
        const rs = await fetch(`/api/staffs?grid=${gridId}`, { cache: "no-store" });
        const sdata = await rs.json().catch(() => ([]));
        const slist = Array.isArray(sdata) ? sdata : sdata.results ?? [];
        const snames: Record<string, string> = {};
        for (const s of slist) {
          if (s?.id != null) snames[String(s.id)] = s.name || `Staff ${s.id}`;
        }
        const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
        const pdata = await rp.json().catch(() => ([]));
        const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
        const pmap: Record<string, string> = {};
        for (const p of plist) {
          if (p?.id != null) pmap[String(p.id)] = `${p.name}${p.surname ? " " + p.surname : ""}`;
        }
        if (active) {
          setCellNameById(cmap);
          setCellStaffsById(cstaffs);
          setCellColorById(ccolors);
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
        if (!baseline && solution?.state === "DONE" && (solution.status === "OPTIMAL" || solution.status === "FEASIBLE")) {
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
  }, [canSolve, gridId, hasCells, solution?.id, solution?.state, solution?.status, solution?.updated_at, solution?.created_at]);

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
      setSolution(null);

      const r = await fetch(`/api/grids/${gridId}/solve/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ solver_params: solverParams }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `Solve failed (${r.status})`);
      }
      const data = (await r.json()) as Solution;
      setSolution(data);
      if (data.state === "DONE" && data.status === "INFEASIBLE") {
        setError("No feasible solution");
      } else if (data.state === "FAILED" || data.status === "ERROR") {
        setError(data.error_message || "Solver error");
      } else {
        window.localStorage.setItem(solveSignatureStorageKey, signature);
        setInputSignature(signature);
      }
    } catch (e: any) {
      setError(e?.message || "Solver error");
    } finally {
      setIsSolving(false);
    }
  }

  const schedule =
    solution && solution.state === "DONE" && (solution.status === "OPTIMAL" || solution.status === "FEASIBLE")
      ? (solution.schedule || [])
      : [];

  const filteredSchedule = selectedUnitId
    ? schedule.filter((s: any) => Array.isArray(s.units) && s.units.map(String).includes(String(selectedUnitId)))
    : schedule;

  const isInputUnchanged = Boolean(inputSignature);
  const canUseSolve = canSolve && hasCells && !isSolving && !isInputUnchanged && !isInputSignatureLoading;
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

  return (
    <>
      {/* Schedule overlay */}
      {filteredSchedule.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: topOffset, height: bodyHeight }}>
          {filteredSchedule.map((s, idx) => {
            const col = s.day_index;
            if (col < 0 || col >= daysCount) return null;
            const sourceCellId = String(s.source_cell_id ?? s.cell_id);
            const top = s.start_slot * rowPx;
            const height = Math.max(6, (s.end_slot - s.start_slot) * rowPx);
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
              <div key={`${s.cell_id}-${idx}`} className="absolute" style={{ top, left, width, height }}>
                <div
                  className="w-full h-full rounded-md border px-2 py-2 text-[11px]"
                  style={{ backgroundColor: bg || "#f3f4f6", borderColor: border, color: textDark }}
                >
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
