"use client";

import { useEffect, useMemo, useState } from "react";
import { Lightbulb, LightbulbOff, Loader2, Pin, PinOff } from "lucide-react";
import { formatSlotRange } from "@/lib/schedule";
import {
  buildSolverParamsPayload,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";
import { pickDisplaySolution } from "@/lib/solution-utils";

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

const hexToRgba = (hex: string, alpha: number) => {
  if (!/^#([0-9a-f]{6})$/i.test(hex)) return `rgba(31, 41, 55, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

type CellPinMeta = {
  pin_day_index: number | null;
  pin_start_slot: number | null;
  bundles: Array<number | string>;
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
  hideScheduleOverlay?: boolean;
  enablePinning?: boolean;
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
  hideScheduleOverlay = false,
  enablePinning = false,
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
  const [cellPinMetaById, setCellPinMetaById] = useState<Record<string, CellPinMeta>>({});
  const [bundleUnitsById, setBundleUnitsById] = useState<Record<string, string[]>>({});
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAnimatingKey, setPinAnimatingKey] = useState<string | null>(null);
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
        const latest = pickDisplaySolution(list) as Solution | null;
        if (!latest) return;
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
        const [rc, rb, rsm, rs, rp] = await Promise.all([
          fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/bundles?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/staff-members?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/staffs?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
        ]);

        const cdata = await rc.json().catch(() => ([]));
        const bdata = await rb.json().catch(() => ([]));
        const smdata = await rsm.json().catch(() => ([]));
        const sdata = await rs.json().catch(() => ([]));
        const pdata = await rp.json().catch(() => ([]));

        const clist = Array.isArray(cdata) ? cdata : cdata.results ?? [];
        const blist = Array.isArray(bdata) ? bdata : bdata.results ?? [];
        const smlist = Array.isArray(smdata) ? smdata : smdata.results ?? [];
        const slist = Array.isArray(sdata) ? sdata : sdata.results ?? [];
        const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];

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
        if (active) {
          setCellNameById(cmap);
          setCellStaffsById(cstaffs);
          setCellColorById(ccolors);
          setCellPinMetaById(cpins);
          setBundleUnitsById(bundleUnitsMap);
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
      if (data.state === "DONE" && data.status === "INFEASIBLE") {
        const lres = await fetch(`/api/grids/${gridId}/solutions/`, { cache: "no-store" });
        if (lres.ok) {
          const ljson = await lres.json().catch(() => ([]));
          const llist = Array.isArray(ljson) ? ljson : ljson.results ?? [];
          const display = pickDisplaySolution(llist) as Solution | null;
          if (display) setSolution(display);
        }
        setError("No feasible solution. Showing the last optimal solution.");
      } else if (data.state === "FAILED" || data.status === "ERROR") {
        setSolution(data);
        setError(data.error_message || "Solver error");
      } else {
        setSolution(data);
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
  const canPinCards = enablePinning && role === "supervisor";

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
    const isPinAction = !isPinnedHere;

    if (isPinAction) setPinAnimatingKey(cardKey);

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
      setPinAnimatingKey((prev) => (prev === cardKey ? null : prev));
    } finally {
      if (isPinnedHere) {
        setPinAnimatingKey((prev) => (prev === cardKey ? null : prev));
      } else {
        window.setTimeout(() => {
          setPinAnimatingKey((prev) => (prev === cardKey ? null : prev));
        }, 700);
      }
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
            const pinBase = textDark;
            const pinMid = shadeHex(textDark, 0.18);
            const pinLight = shadeHex(textDark, 0.52);
            const pinShadow = hexToRgba(textDark, 0.22);
            const pinLineLight = textLight;
            const pinLineDark = shadeHex(textLight, -0.3);
            const isPinnedHere =
              (cellPinMetaById[sourceCellId]?.pin_day_index ?? null) === s.day_index &&
              (cellPinMetaById[sourceCellId]?.pin_start_slot ?? null) === s.start_slot;
            const shouldShowPinnedMarker =
              isPinnedHere || (pinAnimatingKey === cardKey && pinBusyKey === cardKey);
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
                  {canPinCards && (
                    <>
                      {!isPinnedHere && pinBusyKey !== cardKey && (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1.5 z-10 p-1 opacity-0 transition-[opacity,transform] hover:scale-110 group-hover:opacity-100 focus-visible:opacity-100"
                          style={{ color: pinBase }}
                          title="Pin placement"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void togglePin(sourceCellId, s.day_index, s.start_slot, scheduleUnitIds, cardKey);
                          }}
                          disabled={Boolean(pinBusyKey)}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {isPinnedHere && (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1.5 z-10 p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          style={{ color: pinBase }}
                          title="Unpin placement"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void togglePin(sourceCellId, s.day_index, s.start_slot, scheduleUnitIds, cardKey);
                          }}
                          disabled={Boolean(pinBusyKey)}
                        >
                          <PinOff className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {pinBusyKey === cardKey && !shouldShowPinnedMarker && (
                        <div className="absolute right-2 top-2 z-10">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: pinBase }} />
                        </div>
                      )}

                      {shouldShowPinnedMarker && (
                        <div
                          className={`pin-3d ${pinAnimatingKey === cardKey ? "pin-3d--drop" : ""}`}
                          style={{ filter: `drop-shadow(0 2px 3px ${pinShadow})` }}
                        >
                          <span
                            className="pin-3d-head"
                            style={{
                              background: `radial-gradient(circle at 34% 28%, ${pinLight} 0%, ${pinMid} 46%, ${pinBase} 100%)`,
                            }}
                          />
                          <span
                            className="pin-3d-stem"
                            style={{
                              background: `linear-gradient(150deg, ${pinLineLight} 0%, ${pinLineDark} 100%)`,
                            }}
                          />
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

      <style jsx>{`
        .pin-3d {
          position: absolute;
          top: -5px;
          left: 50%;
          z-index: 9;
          width: 18px;
          height: 22px;
          transform: translateX(-50%);
          transform-style: preserve-3d;
          pointer-events: none;
        }

        .pin-3d-head {
          position: absolute;
          left: 50%;
          top: 0;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          transform: translateX(-50%);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.22);
        }

        .pin-3d-stem {
          position: absolute;
          left: 50%;
          top: 12px;
          width: 3px;
          height: 10px;
          border-radius: 999px;
          transform: translateX(-50%);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18);
        }

        .pin-3d-stem::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 0;
          width: 6px;
          height: 4px;
          border-radius: 999px;
          transform: translate(-50%, -38%);
          background: radial-gradient(
            circle at 50% 50%,
            rgba(0, 0, 0, 0.2) 0%,
            rgba(0, 0, 0, 0.08) 65%,
            rgba(0, 0, 0, 0) 100%
          );
          pointer-events: none;
        }

        .pin-3d--drop {
          animation: pinDrop3d 700ms cubic-bezier(0.2, 0.9, 0.2, 1);
        }

        @keyframes pinDrop3d {
          0% {
            transform: translateX(-50%) translateY(-85px) scale(2.1) rotate(-28deg) rotateX(70deg);
            opacity: 0;
            filter: blur(2px);
          }
          40% {
            opacity: 1;
          }
          72% {
            transform: translateX(-50%) translateY(-2px) scale(1.08) rotate(4deg) rotateX(18deg);
            filter: blur(0);
          }
          100% {
            transform: translateX(-50%) translateY(0) scale(1) rotate(0deg) rotateX(0deg);
            opacity: 1;
          }
        }
      `}</style>

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
