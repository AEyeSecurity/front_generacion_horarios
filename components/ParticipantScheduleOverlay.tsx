"use client";

import { useEffect, useState } from "react";
import { formatSlotRange } from "@/lib/schedule";
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
  schedule?: Array<{
    cell_id: string;
    source_cell_id?: string | number;
    day_index: number;
    start_slot: number;
    end_slot: number;
    assigned_participants?: Array<string | number>;
    participants?: Array<string | number>;
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
  dayStartMin: number;
  slotMin: number;
  topOffset?: number;
};

export default function ParticipantScheduleOverlay({
  gridId,
  participantId,
  daysCount,
  rowPx,
  timeColPx,
  bodyHeight,
  dayStartMin,
  slotMin,
  topOffset = 0,
}: Props) {
  const [solution, setSolution] = useState<Solution | null>(null);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellBundlesById, setCellBundlesById] = useState<Record<string, Array<string | number>>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});

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
        const cbundles: Record<string, Array<string | number>> = {};
        const ccolors: Record<string, string> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            cbundles[cid] = Array.isArray(c.bundles) ? c.bundles : [];
            if (c?.colorHex) ccolors[cid] = c.colorHex;
            else if (c?.color_hex) ccolors[cid] = c.color_hex;
          }
        }

        const rb = await fetch(`/api/bundles?grid=${gridId}`, { cache: "no-store" });
        const bdata = await rb.json().catch(() => ([]));
        const blist = Array.isArray(bdata) ? bdata : bdata.results ?? [];
        const bmap: Record<string, string> = {};
        for (const b of blist) {
          if (b?.id != null) bmap[String(b.id)] = b.name || `Bundle ${b.id}`;
        }

        if (active) {
          setCellNameById(cmap);
          setCellBundlesById(cbundles);
          setCellColorById(ccolors);
          setBundleNameById(bmap);
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [gridId]);

  const schedule =
    isSolvedSolution(solution)
      ? solution.schedule || []
      : [];

  const filteredSchedule = schedule.filter((s) => {
    const assigned = Array.isArray(s.assigned_participants)
      ? s.assigned_participants
      : Array.isArray(s.participants)
      ? s.participants
      : [];
    return assigned.map(String).includes(String(participantId));
  });

  if (filteredSchedule.length === 0) return null;

  return (
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
        const bundleIds = cellBundlesById[sourceCellId] || [];
        const bundleNames = bundleIds.map((b) => bundleNameById[String(b)] || `Bundle ${b}`);
        const bundlesLabel = bundleNames.join(" + ");
        const bg = cellColorById[sourceCellId] || "";
        const colorIdx = COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
        const useColor = Boolean(bg && colorIdx >= 0);
        const textDark = useColor ? COLOR_TEXT_DARK[colorIdx] : "#1f2937";
        const textLight = useColor ? COLOR_TEXT_LIGHT[colorIdx] : "#111827";
        const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
        return (
          <div key={`${s.cell_id}-${idx}`} className="absolute" style={{ top, left, width, height }}>
            <div
              className="w-full h-full rounded-md border px-2 py-2 text-[11px]"
              style={{ backgroundColor: bg || "#f3f4f6", borderColor: border, color: textDark }}
            >
              <div className="flex h-full flex-col items-center justify-center text-center leading-tight">
                <div className="font-semibold" style={{ color: textLight }}>{cellName}</div>
                {bundlesLabel && <div className="px-1">{bundlesLabel}</div>}
                <div className="h-2" />
                <div className="text-[10px] font-medium" style={{ color: textDark }}>{timeLabel}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
