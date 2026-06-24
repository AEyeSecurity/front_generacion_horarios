"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import CardSwap, { Card } from "@/components/animations/CardSwap";
import EditCellDialog from "@/components/dialogs/EditCellDialog";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK, CELL_TEXT_LIGHT } from "@/lib/cell-colors";
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

type Cell = {
  id: number | string;
  name?: string;
  description?: string;
  duration_min?: number;
  duration_minutes?: number;
  quantity?: number;
  division_days?: number;
  allow_overstaffing?: boolean | null;
  time_range?: number | string;
  units?: Array<number | string>;
  bundles?: Array<number | string>;
  staffs?: Array<number | string>;
  staff_groups?: unknown[] | null;
  headcount?: number | null;
  tier_counts?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", number>> | null;
  tier_pools?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", Array<number | string>>> | null;
  eligible_participants?: Array<number | string> | null;
  staff_options_resolved?: Array<{ staff?: string | number; members?: Array<string | number> }> | null;
  bundle_names?: unknown[] | null;
  bundle_labels?: unknown[] | null;
  bundle_name?: unknown;
  unit_names?: unknown[] | null;
  staff_names?: string[] | null;
  participant_names?: string[] | null;
  eligible_participant_names?: unknown[] | null;
  participants?: unknown[] | null;
  resolved_participants?: unknown[] | null;
  card_ready?: boolean;
  is_ready?: boolean;
  colorHex?: string | null;
  color_hex?: string | null;
  series_id?: string | null;
  seriesCells?: Cell[];
};

type Bundle = {
  id: number | string;
  label?: string;
  name?: string;
  display_name?: string;
  units?: unknown[];
};
type CellCardGroup = {
  key: string;
  cell: Cell;
  cells: Cell[];
  displayName: string;
  bundleNames: string[];
};
const clampTextStyle = (lines: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: lines,
  overflow: "hidden",
});

const readResolvedLabel = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["label", "name", "display_name"] as const) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (Array.isArray(record.units)) {
    const unitLabels = record.units.map(readResolvedLabel).filter((label): label is string => Boolean(label));
    if (unitLabels.length > 0) return unitLabels.join(" + ");
  }
  return null;
};

const readResolvedLabels = (values: unknown[] | null | undefined): string[] =>
  Array.isArray(values)
    ? values.map(readResolvedLabel).filter((label): label is string => Boolean(label))
    : [];

const readParticipantLabel = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const participant = value as Record<string, unknown>;
  const displayName = participant.display_name;
  if (typeof displayName === "string" && displayName.trim()) return displayName.trim();
  const name = participant.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return null;
};

const readParticipantLabels = (values: unknown[] | null | undefined): string[] =>
  Array.isArray(values)
    ? values.map(readParticipantLabel).filter((label): label is string => Boolean(label))
    : [];

export default function CellsCardSwap({
  cells,
  bundles,
  gridId,
}: {
  cells: Cell[];
  bundles: Bundle[];
  gridId: number;
}) {
  const { t } = useI18n();
  const bundleNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of bundles) {
      if (b?.id != null) map[String(b.id)] = readResolvedLabel(b) || `Bundle ${b.id}`;
    }
    return map;
  }, [bundles]);
  const groupedCells = useMemo(() => {
    const ordered: CellCardGroup[] = [];
    const seriesMap = new Map<string, CellCardGroup>();

    for (const cell of cells) {
      const seriesId = cell.series_id ? String(cell.series_id) : null;
      if (!seriesId) {
        const resolvedBundleNames = readResolvedLabels(cell.bundle_labels).length > 0
          ? readResolvedLabels(cell.bundle_labels)
          : readResolvedLabels(cell.bundle_names);
        const resolvedSingleBundleName = readResolvedLabel(cell.bundle_name);
        const resolvedUnitNames = readResolvedLabels(cell.unit_names);
        const preferredNames = resolvedBundleNames.length > 0
          ? resolvedBundleNames
          : resolvedSingleBundleName
          ? [resolvedSingleBundleName]
          : resolvedUnitNames;
        const bundleIds = Array.isArray(cell.bundles) ? (cell.bundles as unknown[]) : [];
        const fallbackNames = bundleIds.map((bundle) => {
          const objectLabel = readResolvedLabel(bundle);
          if (objectLabel) return objectLabel;
          if (typeof bundle === "string" || typeof bundle === "number") {
            return bundleNameById[String(bundle)] || `Bundle ${bundle}`;
          }
          return null;
        }).filter((label): label is string => Boolean(label));
        const bundleLabel = preferredNames.join("; ") || fallbackNames.join("; ") || "-";
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
      const bundleNames = [...new Set(group.cells.flatMap((cell) => {
        const bundleNames = readResolvedLabels(cell.bundle_labels).length > 0
          ? readResolvedLabels(cell.bundle_labels)
          : readResolvedLabels(cell.bundle_names);
        if (bundleNames.length > 0) return bundleNames;
        const bundleName = readResolvedLabel(cell.bundle_name);
        if (bundleName) return [bundleName];
        const unitNames = readResolvedLabels(cell.unit_names);
        if (unitNames.length > 0) return unitNames;
        return (Array.isArray(cell.bundles) ? (cell.bundles as unknown[]) : []).map((bundle) => {
          const objectLabel = readResolvedLabel(bundle);
          if (objectLabel) return objectLabel;
          return typeof bundle === "string" || typeof bundle === "number"
            ? bundleNameById[String(bundle)] || `Bundle ${bundle}`
            : null;
        }).filter((label): label is string => Boolean(label));
      }))];
      group.bundleNames = bundleNames;
    }

    return ordered;
  }, [bundleNameById, cells]);

  const router = useRouter();
  const [editCell, setEditCell] = useState<Cell | null>(null);

  const perStack = 5;
  const pages = useMemo(() => {
    const out: CellCardGroup[][] = [];
    for (let i = 0; i < groupedCells.length; i += perStack) out.push(groupedCells.slice(i, i + perStack));
    return out.length > 0 ? out : [[]];
  }, [groupedCells]);
  const [pageIdx, setPageIdx] = useState(0);

  const safePageIdx = pageIdx < pages.length ? pageIdx : 0;
  const currentCells = pages[safePageIdx] ?? [];
  const visibleCardsReady = currentCells.every(
    ({ cell }) => cell.card_ready !== false && cell.is_ready !== false,
  );
  const canPrev = pages.length > 1 && visibleCardsReady;
  const canNext = pages.length > 1 && visibleCardsReady;

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
            key={`stack-${safePageIdx}-${pages.length}`}
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
              const staffNames = [...new Set(group.cells.flatMap((entry) => {
                const resolvedGroups = readParticipantLabels(entry.staff_groups);
                if (resolvedGroups.length > 0) return resolvedGroups;
                const resolvedAlias = readParticipantLabels(entry.staffs as unknown[] | null | undefined);
                if (resolvedAlias.length > 0) return resolvedAlias;
                return readParticipantLabels(entry.staff_names);
              }))];
              const eligibleNames = [...new Set(group.cells.flatMap((entry) =>
                readParticipantLabels(entry.eligible_participant_names).length > 0
                  ? readParticipantLabels(entry.eligible_participant_names)
                  : readParticipantLabels(entry.participant_names).length > 0
                  ? readParticipantLabels(entry.participant_names)
                  : readParticipantLabels(entry.participants).length > 0
                  ? readParticipantLabels(entry.participants)
                  : readParticipantLabels(entry.resolved_participants).length > 0
                  ? readParticipantLabels(entry.resolved_participants)
                  : readParticipantLabels(entry.eligible_participants as unknown[] | null | undefined)
              ))];
              const hasBundles = group.bundleNames.length > 0;
              const hasStaffs = staffNames.length > 0;
              const hasEligible = eligibleNames.length > 0;
              const showBothStaffingSources = hasStaffs && hasEligible;
              return (
                <Card
                  key={group.key}
                  customClass="shadow-lg p-4 border overflow-hidden"
                  onDoubleClick={() =>
                    setEditCell({
                      ...cell,
                      name: group.displayName,
                      seriesCells: group.cells,
                    })
                  }
                  style={{ backgroundColor: color || "#ffffff", borderColor: border || "#e5e7eb", color: textDark || undefined }}
                >
                  <div className="flex h-full min-h-0 flex-col overflow-hidden">
                    <div className="flex min-h-0 items-start justify-between gap-4">
                      <h3
                        className="min-w-0 text-lg font-semibold leading-tight"
                        style={{ color: textLight || undefined, ...clampTextStyle(2) }}
                      >
                        {group.displayName}
                      </h3>
                      <div className="relative shrink-0 overflow-hidden px-3 py-1 text-xs font-bold" style={{ color: textLight || undefined }}>
                        <Clock3
                          className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 opacity-25"
                          style={{ color: textDark || "#374151" }}
                        />
                        <span className="relative z-10 whitespace-nowrap">
                          {cell.duration_minutes ?? cell.duration_min ?? 0} min
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 min-h-[30px] overflow-hidden text-xs">
                      {hasBundles && (
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="shrink-0 font-medium" style={{ color: textLight || undefined }}>
                            {t("cells_card_swap.bundles")}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap gap-1 overflow-hidden">
                            {group.bundleNames.map((bundleName) => (
                              <span
                                key={bundleName}
                                className="max-w-full truncate rounded-md border px-2 py-1"
                                style={{ borderColor: border || "#d1d5db", color: textDark || undefined }}
                                title={bundleName}
                              >
                                {bundleName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-1 min-h-0 flex-1 overflow-hidden text-xs">
                      {hasStaffs && (
                        <div className={showBothStaffingSources ? "mb-2" : ""}>
                          <div className="mb-1 font-medium" style={{ color: textLight || undefined }}>
                            {t("cells_card_swap.staffs")}
                          </div>
                          <div
                            className="leading-relaxed"
                            style={{ color: textDark || undefined, ...clampTextStyle(showBothStaffingSources ? 2 : 5) }}
                            title={staffNames.join(", ")}
                          >
                            {staffNames.join(", ")}
                          </div>
                        </div>
                      )}

                      {hasEligible && (
                        <div>
                          <div className="mb-1 text-xs font-medium" style={{ color: textLight || undefined }}>
                            Eligible Participants
                          </div>
                          <div
                            className="leading-relaxed"
                            style={{ color: textDark || undefined, ...clampTextStyle(showBothStaffingSources ? 2 : 5) }}
                            title={eligibleNames.join(", ")}
                          >
                            {eligibleNames.join(", ")}
                          </div>
                        </div>
                      )}
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
