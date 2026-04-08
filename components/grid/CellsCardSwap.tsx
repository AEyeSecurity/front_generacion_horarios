"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CardSwap, { Card } from "@/components/animations/CardSwap";
import EditCellDialog from "@/components/dialogs/EditCellDialog";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK, CELL_TEXT_LIGHT } from "@/lib/cell-colors";

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
  division_days?: number;
  time_range?: number | string;
  units?: Array<number | string>;
  bundles?: Array<number | string>;
  staffs?: Array<number | string>;
  headcount?: number | null;
  tier_counts?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", number>> | null;
  tier_pools?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", Array<number | string>>> | null;
  staff_options_resolved?: Array<{ staff?: string | number; members?: Array<string | number> }> | null;
  colorHex?: string | null;
  color_hex?: string | null;
  series_id?: string | null;
  seriesCells?: Cell[];
};

type Bundle = { id: number | string; name?: string };
type Staff = { id: number | string; name?: string };
type CellCardGroup = {
  key: string;
  cell: Cell;
  cells: Cell[];
  displayName: string;
  bundleNames: string[];
};
type TierKey = "PRIMARY" | "SECONDARY" | "TERTIARY";
const TIERS: TierKey[] = ["PRIMARY", "SECONDARY", "TERTIARY"];

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
  const groupedCells = useMemo(() => {
    const ordered: CellCardGroup[] = [];
    const seriesMap = new Map<string, CellCardGroup>();

    for (const cell of cells) {
      const seriesId = cell.series_id ? String(cell.series_id) : null;
      if (!seriesId) {
        const bundleIds = Array.isArray(cell.bundles) ? cell.bundles : [];
        const bundleLabel = bundleIds.map((b) => bundleNameById[String(b)] || `Bundle ${b}`).join("; ") || "-";
        ordered.push({
          key: `single:${cell.id}`,
          cell,
          cells: [cell],
          displayName: cell.name || `Cell ${cell.id}`,
          bundleNames: bundleLabel === "-" ? [] : bundleLabel.split("; "),
        });
        continue;
      }

      if (!seriesMap.has(seriesId)) {
        const baseName = (cell.name || "").replace(/\s*\[[^\]]+\]\s*$/, "").trim() || cell.name || `Series ${seriesId}`;
        const group: CellCardGroup = {
          key: `series:${seriesId}`,
          cell,
          cells: [cell],
          displayName: baseName,
          bundleNames: [],
        };
        seriesMap.set(seriesId, group);
        ordered.push(group);
      } else {
        seriesMap.get(seriesId)!.cells.push(cell);
      }
    }

    for (const group of ordered) {
      const bundleNames = [...new Set(
        group.cells.flatMap((cell) =>
          (Array.isArray(cell.bundles) ? cell.bundles : []).map((bundleId) => bundleNameById[String(bundleId)] || `Bundle ${bundleId}`)
        )
      )];
      group.bundleNames = bundleNames;
    }

    return ordered;
  }, [bundleNameById, cells]);

  const router = useRouter();
  const [editCell, setEditCell] = useState<Cell | null>(null);
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [participantNameById, setParticipantNameById] = useState<Record<string, string>>({});

  const perStack = 5;
  const pages = useMemo(() => {
    const out: CellCardGroup[][] = [];
    for (let i = 0; i < groupedCells.length; i += perStack) out.push(groupedCells.slice(i, i + perStack));
    return out.length > 0 ? out : [[]];
  }, [groupedCells]);
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
        const rs = await fetch(`/api/staffs?grid=${gridId}`, { cache: "no-store" });
        const sdata = await rs.json().catch(() => ([]));
        const slist = Array.isArray(sdata) ? sdata : sdata.results ?? [];
        const smap: Record<string, string> = {};
        for (const s of slist) {
          if (s?.id != null) smap[String(s.id)] = s.name || `Staff ${s.id}`;
        }
        const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
        const pdata = await rp.json().catch(() => ([]));
        const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
        const pmap: Record<string, string> = {};
        for (const p of plist) {
          if (p?.id != null) pmap[String(p.id)] = `${p.name}${p.surname ? " " + p.surname : ""}`;
        }
        if (active) {
          setStaffNameById(smap);
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
            {currentCells.map((group) => {
              const cell = group.cell;
              const color = (cell.colorHex || cell.color_hex || "") as string;
              const colorIdx = CELL_COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === color.toLowerCase());
              const useColor = Boolean(color && colorIdx >= 0);
              const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "";
              const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "";
              const border = useColor ? shadeHex(color, -0.35) : "";
              const staffIds = [...new Set(
                group.cells.flatMap((entry) => (Array.isArray(entry.staffs) ? entry.staffs.map((s) => String(s)) : []))
              )];
              const staffNames = staffIds.length > 0
                ? staffIds.map((sid) => staffNameById[sid] || `Staff ${sid}`)
                : [];
              const tierPools = (cell.tier_pools ?? {}) as Partial<Record<TierKey, Array<number | string>>>;
              return (
                <Card
                  key={group.key}
                  customClass="shadow-lg p-4 border"
                  onDoubleClick={() =>
                    setEditCell({
                      ...cell,
                      name: group.displayName,
                      seriesCells: group.cells,
                    })
                  }
                  style={{ backgroundColor: color || "#ffffff", borderColor: border || "#e5e7eb", color: textDark || undefined }}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="min-w-0 text-lg font-semibold leading-tight" style={{ color: textLight || undefined }}>
                        {group.displayName}
                      </h3>
                      <div className="relative shrink-0 overflow-hidden px-3 py-1 text-xs font-bold" style={{ color: textLight || undefined }}>
                        <Clock3
                          className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 opacity-25"
                          style={{ color: textDark || "#374151" }}
                        />
                        <span className="relative z-10 whitespace-nowrap">{cell.duration_min ?? 0} min</span>
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-4 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-medium" style={{ color: textLight || undefined }}>Bundles:</span>
                          {group.bundleNames.length > 0 ? group.bundleNames.map((bundleName) => (
                            <span
                              key={bundleName}
                              className="rounded-md border px-2 py-1"
                              style={{ borderColor: border || "#d1d5db", color: textDark || undefined }}
                            >
                              {bundleName}
                            </span>
                          )) : (
                            <span>-</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium" style={{ color: textLight || undefined }}>Staffs:</span>
                        {staffNames.length > 0 ? staffNames.map((staffName) => (
                          <span
                            key={staffName}
                            className="rounded-md border px-2 py-1"
                            style={{ borderColor: border || "#d1d5db", color: textDark || undefined }}
                          >
                            {staffName}
                          </span>
                        )) : (
                          <span>-</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-medium" style={{ color: textLight || undefined }}>
                        Eligible Participants
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {TIERS.map((tier) => {
                          const ids = Array.isArray(tierPools[tier]) ? tierPools[tier]! : [];
                          const names = ids.map((id) => participantNameById[String(id)] || `#${id}`).join(", ");
                          return (
                            <div key={tier} className="min-w-0">
                              <div className="break-words leading-relaxed">{names || "-"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
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
