"use client";

import { useEffect, useMemo, useState } from "react";

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
  schedule?: Array<{
    cell_id: string;
    day_index: number;
    start_slot: number;
    end_slot: number;
    units?: Array<string | number>;
  }>;
  created_at?: string;
};

type Props = {
  gridId: number;
  participantId: number;
  daysCount: number;
  rowPx: number;
  timeColPx: number;
  bodyHeight: number;
};

export default function ParticipantScheduleOverlay({
  gridId,
  participantId,
  daysCount,
  rowPx,
  timeColPx,
  bodyHeight,
}: Props) {
  const [solution, setSolution] = useState<Solution | null>(null);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellUnitsById, setCellUnitsById] = useState<Record<string, Array<string | number>>>({});
  const [cellStaffsById, setCellStaffsById] = useState<Record<string, string[]>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [staffMembersByStaffId, setStaffMembersByStaffId] = useState<Record<string, string[]>>({});
  const [unitNameById, setUnitNameById] = useState<Record<string, string>>({});

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
        if (active) setSolution(latest);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [gridId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rc = await fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" });
        const cdata = await rc.json().catch(() => ([]));
        const clist = Array.isArray(cdata) ? cdata : cdata.results ?? [];
        const cmap: Record<string, string> = {};
        const cunits: Record<string, Array<string | number>> = {};
        const cstaffs: Record<string, string[]> = {};
        const ccolors: Record<string, string> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            cunits[cid] = Array.isArray(c.units) ? c.units : [];
            if (Array.isArray(c.staffs)) cstaffs[cid] = c.staffs.map((s: any) => String(s));
            if (c?.colorHex) ccolors[cid] = c.colorHex;
            else if (c?.color_hex) ccolors[cid] = c.color_hex;
          }
        }

        const rs = await fetch(`/api/staff-members?grid=${gridId}`, { cache: "no-store" });
        const smdata = await rs.json().catch(() => ([]));
        const smlist = Array.isArray(smdata) ? smdata : smdata.results ?? [];
        const smm: Record<string, string[]> = {};
        for (const m of smlist) {
          const sid = String(m.staff);
          const pid = String(m.participant);
          if (!smm[sid]) smm[sid] = [];
          smm[sid].push(pid);
        }

        const ru = await fetch(`/api/units?grid=${gridId}`, { cache: "no-store" });
        const udata = await ru.json().catch(() => ([]));
        const ulist = Array.isArray(udata) ? udata : udata.results ?? [];
        const umap: Record<string, string> = {};
        for (const u of ulist) {
          if (u?.id != null) umap[String(u.id)] = u.name || `Unit ${u.id}`;
        }

        if (active) {
          setCellNameById(cmap);
          setCellUnitsById(cunits);
          setCellStaffsById(cstaffs);
          setCellColorById(ccolors);
          setStaffMembersByStaffId(smm);
          setUnitNameById(umap);
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [gridId]);

  const allowedCellIds = useMemo(() => {
    const pid = String(participantId);
    const allowed = new Set<string>();
    for (const [cellId, staffIds] of Object.entries(cellStaffsById)) {
      for (const sid of staffIds) {
        const members = staffMembersByStaffId[sid] || [];
        if (members.includes(pid)) {
          allowed.add(cellId);
          break;
        }
      }
    }
    return allowed;
  }, [cellStaffsById, staffMembersByStaffId, participantId]);

  const schedule =
    solution &&
    solution.state === "DONE" &&
    (solution.status === "OPTIMAL" || solution.status === "FEASIBLE")
      ? solution.schedule || []
      : [];

  const filteredSchedule = schedule.filter((s) => allowedCellIds.has(String(s.cell_id)));

  if (filteredSchedule.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ height: bodyHeight }}>
      {filteredSchedule.map((s, idx) => {
        const col = s.day_index;
        if (col < 0 || col >= daysCount) return null;
        const top = s.start_slot * rowPx;
        const height = Math.max(6, (s.end_slot - s.start_slot) * rowPx);
        const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
        const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
        const cid = String(s.cell_id);
        const cellName = cellNameById[cid] || `Cell ${s.cell_id}`;
        const unitIds = Array.isArray(s.units) ? s.units : cellUnitsById[cid] || [];
        const unitNames = unitIds.map((u) => unitNameById[String(u)] || `Unit ${u}`);
        const unitsLabel = unitNames.join(" + ");
        const bg = cellColorById[cid] || "";
        const colorIdx = COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
        const useColor = Boolean(bg && colorIdx >= 0);
        const textDark = useColor ? COLOR_TEXT_DARK[colorIdx] : "#1f2937";
        const textLight = useColor ? COLOR_TEXT_LIGHT[colorIdx] : "#111827";
        const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
        return (
          <div key={`${s.cell_id}-${idx}`} className="absolute" style={{ top, left, width, height }}>
            <div
              className="w-full h-full rounded-md border text-[11px] flex flex-col items-center justify-center leading-tight"
              style={{ backgroundColor: bg || "#f3f4f6", borderColor: border, color: textDark }}
            >
              <div className="font-semibold" style={{ color: textLight }}>{cellName}</div>
              {unitsLabel && <div className="text-center px-1">{unitsLabel}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
