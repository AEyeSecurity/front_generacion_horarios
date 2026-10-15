/* eslint-disable @typescript-eslint/no-explicit-any */
import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import type { Role } from "@/lib/types";
import CellsCardSwap from "@/components/grid/CellsCardSwap";
import { CellsHeader } from "@/components/grid/headers";
import EmptyState from "@/components/ui/EmptyState";
import { getTranslation } from "@/lib/i18n";
import { gridCellCardsPath } from "@/lib/cell-api";
import { resolveGridByCode } from "../_helpers";
import { redirect } from "next/navigation";

const readBundleLabel = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["label", "name", "display_name"] as const) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (Array.isArray(record.units)) {
    const labels = record.units
      .map((unit) => {
        if (!unit || typeof unit !== "object" || Array.isArray(unit)) return null;
        const entry = unit as Record<string, unknown>;
        const label = entry.label ?? entry.name ?? entry.display_name;
        return typeof label === "string" && label.trim() ? label.trim() : null;
      })
      .filter((label): label is string => Boolean(label));
    if (labels.length > 0) return labels.join(" + ");
  }
  return null;
};

const readCells = (payload: any): any[] =>
  Array.isArray(payload) ? payload : payload?.cards ?? payload?.cells ?? payload?.results ?? [];

export default async function GridCellsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  const nextPath = `/grid/${encodeURIComponent(grid.grid_code || code)}/cells`;
  const me = await requireUserOrRedirect(nextPath);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me.preferred_language, key);
  const gridBase = `/grid/${encodeURIComponent(grid.grid_code || code)}`;

  const payload = await backendFetchJSON<any>(gridCellCardsPath(id));
  const cells = readCells(payload);
  const bundleList = Array.isArray(payload?.bundles) ? payload.bundles : [];
  const bundles: { id: number | string; name?: string; units?: unknown[] }[] = bundleList
    .filter((bundle: any) => bundle?.id != null)
    .map((bundle: any) => ({
      id: bundle.id,
      name: readBundleLabel(bundle) || `Bundle ${bundle.id}`,
      units: Array.isArray(bundle.units) ? bundle.units : [],
    }));

  // Resolve my role and (if editor) my participant id in this grid
  let role: Role = "viewer";
  let participants: any[] = [];
  try {
    const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
    const list = Array.isArray(data) ? data : data.results ?? [];
    const mine = list.find(
      (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
    );
    role = (mine?.role ?? "viewer") as Role;
  } catch {}
  try {
    const pdata = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
    participants = Array.isArray(pdata) ? pdata : pdata.results ?? [];
  } catch {}

  if (participants.length === 0) {
    redirect(`${gridBase}?dock=participants&dock_feedback=participants_before_cells`);
  }

  return (
    <div className="relative">
      <div className="p-4">
        <div className="w-[80%] mx-auto space-y-4">
          <CellsHeader
            gridId={Number(grid.id)}
            backHref={gridBase}
            canCreate={role === "supervisor"}
            hasCells={cells.length > 0}
          />

          {cells.length === 0 ? (
            <div className="flex min-h-[520px] items-center justify-center">
              <EmptyState mode="plain" size="lg" message={t("cells_page.no_cells")} />
            </div>
          ) : (
            <div className="relative h-[640px] overflow-hidden">
              <CellsCardSwap
                cells={cells}
                bundles={bundles}
                gridId={Number(grid.id)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
