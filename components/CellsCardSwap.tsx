"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CardSwap, { Card } from "@/components/CardSwap";
import EditCellDialog from "@/components/dialogs/EditCellDialog";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

type Cell = {
  id: number | string;
  name?: string;
  description?: string;
  duration_min?: number;
  units?: Array<number | string>;
  bundles?: Array<number | string>;
  staffs?: Array<number | string>;
  colorHex?: string | null;
  color_hex?: string | null;
};

type Bundle = { id: number | string; name?: string };

export default function CellsCardSwap({
  cells,
  bundles,
  gridId,
}: {
  cells: Cell[];
  bundles: Bundle[];
  gridId: number;
}) {
  const bundleNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of bundles) {
      if (b?.id != null) map[String(b.id)] = b.name || `Bundle ${b.id}`;
    }
    return map;
  }, [bundles]);

  const router = useRouter();
  const [editCell, setEditCell] = useState<Cell | null>(null);
  const [staffMembersByStaffId, setStaffMembersByStaffId] = useState<Record<string, string[]>>({});
  const [participantNameById, setParticipantNameById] = useState<Record<string, string>>({});

  const perStack = 5;
  const pages = useMemo(() => {
    const out: Cell[][] = [];
    for (let i = 0; i < cells.length; i += perStack) out.push(cells.slice(i, i + perStack));
    return out.length > 0 ? out : [[]];
  }, [cells]);
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    if (pageIdx >= pages.length) setPageIdx(0);
  }, [pages.length, pageIdx]);

  const currentCells = pages[pageIdx] ?? [];
  const canPrev = pages.length > 1;
  const canNext = pages.length > 1;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
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
        const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
        const pdata = await rp.json().catch(() => ([]));
        const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
        const pmap: Record<string, string> = {};
        for (const p of plist) {
          if (p?.id != null) pmap[String(p.id)] = `${p.name}${p.surname ? " " + p.surname : ""}`;
        }
        if (active) {
          setStaffMembersByStaffId(smm);
          setParticipantNameById(pmap);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [gridId]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[360px] max-w-[92vw] max-h-[80vh]">
        <div className="relative w-full h-full">
          {pages.length > 1 && (
            <>
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => {
                  if (!canPrev) return;
                  setPageIdx((p) => (p - 1 + pages.length) % pages.length);
                }}
                className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full border bg-white shadow ${canPrev ? "opacity-100" : "opacity-40 cursor-not-allowed"}`}
                aria-label="Previous stack"
              >
                <ChevronLeft className="w-5 h-5 mx-auto text-gray-700" />
              </button>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => {
                  if (!canNext) return;
                  setPageIdx((p) => (p + 1) % pages.length);
                }}
                className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full border bg-white shadow ${canNext ? "opacity-100" : "opacity-40 cursor-not-allowed"}`}
                aria-label="Next stack"
              >
                <ChevronRight className="w-5 h-5 mx-auto text-gray-700" />
              </button>
            </>
          )}

          <CardSwap
            key={`stack-${pageIdx}-${pages.length}`}
            width={350}
            height={200}
            cardDistance={45}
            verticalDistance={70}
            skewAmount={2}
            delay={5000}
            pauseOnHover={false}
            auto={false}
            hoverEffect
            containerClassName="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center perspective-[900px] overflow-visible"
          >
            {currentCells.map((cell) => {
              const color = (cell.colorHex || cell.color_hex || "") as string;
              const colorIdx = COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === color.toLowerCase());
              const useColor = Boolean(color && colorIdx >= 0);
              const textDark = useColor ? COLOR_TEXT_DARK[colorIdx] : "";
              const textLight = useColor ? COLOR_TEXT_LIGHT[colorIdx] : "";
              const border = useColor ? shadeHex(color, -0.35) : "";
              const bundleIds = Array.isArray(cell.bundles) ? cell.bundles : [];
              const bundleNames = bundleIds.map((b) => bundleNameById[String(b)] || `Bundle ${b}`);
              const bundleLabel = bundleNames.join(" + ");
              const staffIds = Array.isArray(cell.staffs) ? cell.staffs.map((s) => String(s)) : [];
              const pSet = new Set<string>();
              for (const sid of staffIds) {
                const pids = staffMembersByStaffId[sid] || [];
                for (const pid of pids) pSet.add(pid);
              }
              const pNames = Array.from(pSet).map((pid) => participantNameById[pid] || `#${pid}`);
              const participantsLabel = pNames.join(", ");
              return (
                <Card
                  key={cell.id}
                  customClass="shadow-lg p-4 border"
                  onDoubleClick={() => setEditCell(cell)}
                  style={{ backgroundColor: color || "#ffffff", borderColor: border || "#e5e7eb", color: textDark || undefined }}
                >
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold" style={{ color: textLight || undefined }}>
                      {cell.name || `Cell ${cell.id}`}
                    </h3>
                    {bundleLabel && <p className="text-sm">{bundleLabel}</p>}
                    {participantsLabel && <p className="text-sm">{participantsLabel}</p>}
                    {cell.description && <p className="text-sm">{cell.description}</p>}
                    {cell.duration_min != null && (
                      <p className="text-xs">Duration: {cell.duration_min} min</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </CardSwap>
        </div>
      </div>

      <EditCellDialog
        gridId={gridId}
        cell={editCell}
        open={Boolean(editCell)}
        onOpenChange={(v) => {
          if (!v) setEditCell(null);
        }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
