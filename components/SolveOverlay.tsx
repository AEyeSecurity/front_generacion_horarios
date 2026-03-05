"use client";

import { useEffect, useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
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

  const canSolve = role === "supervisor";

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

  const solveElapsedMs = useMemo(() => {
    if (!solveStartedAt) return 0;
    return Date.now() - solveStartedAt;
  }, [solveStartedAt, tick]);

  async function runSolve() {
    setIsSolving(true);
    setSolveStartedAt(Date.now());
    setError(null);
    setSolution(null);
    try {
      const settingsKey = getGridSolverSettingsKey(gridId);
      const parsedSettings = parseGridSolverSettings(window.localStorage.getItem(settingsKey));
      const solverParams = buildSolverParamsPayload(parsedSettings);
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

  const canUseSolve = canSolve && hasCells && !isSolving;

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
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-[140] pointer-events-none">
        <button
          type="button"
          title={canSolve ? (hasCells ? "Solve" : "Create cells to enable solve") : "Solve unavailable"}
          onClick={() => {
            if (canUseSolve) runSolve();
          }}
          disabled={!canUseSolve}
          className="w-12 h-12 rounded-full bg-black shadow-md border border-gray-800 flex items-center justify-center pointer-events-auto disabled:cursor-not-allowed"
          aria-disabled={!canUseSolve}
        >
          <Lightbulb className={`w-5 h-5 ${canUseSolve ? "text-white" : "text-gray-500"}`} />
        </button>
        {error && <div className="mt-2 w-40 text-xs text-red-600 text-right">{error}</div>}
        {isSolving && (
          <div className="mt-1 w-40 text-xs text-gray-600 text-right">
            Solving... {Math.round(solveElapsedMs / 100) / 10}s
          </div>
        )}
      </div>
    </>
  );
}
