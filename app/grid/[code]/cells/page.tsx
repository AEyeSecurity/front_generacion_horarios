/* eslint-disable @typescript-eslint/no-explicit-any */
import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import type { Role } from "@/lib/types";
import CellsCardSwap from "@/components/grid/CellsCardSwap";
import OnboardingGuide from "@/components/grid/OnboardingGuide";
import { CellsHeader } from "@/components/grid/headers";
import EmptyState from "@/components/ui/EmptyState";
import { getTranslation } from "@/lib/i18n";
import { gridCellCardsPath } from "@/lib/cell-api";
import { ApiError } from "@/lib/errors";
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

async function readCellsFallback(gridId: string): Promise<any[]> {
  const queries = [
    `/api/cells/?grid=${encodeURIComponent(gridId)}`,
    `/api/cells?grid=${encodeURIComponent(gridId)}`,
    `/api/cells/?grid_id=${encodeURIComponent(gridId)}`,
    `/api/cells?grid_id=${encodeURIComponent(gridId)}`,
  ];

  for (const query of queries) {
    try {
      const cells = readCells(await backendFetchJSON<any>(query));
      if (cells.length > 0) return cells;
    } catch {
      // Try the next legacy filter shape.
    }
  }
  return [];
}

const resolveFallbackParticipantNames = (cells: any[], participants: any[]): any[] => {
  const participantsById = new Map(
    participants
      .filter((participant) => participant?.id != null)
      .map((participant) => [String(participant.id), participant]),
  );

  return cells.map((cell) => {
    if (!Array.isArray(cell?.eligible_participants)) return cell;
    return {
      ...cell,
      eligible_participants: cell.eligible_participants.map((participant: unknown) =>
        typeof participant === "number" || typeof participant === "string"
          ? participantsById.get(String(participant)) ?? participant
          : participant,
      ),
    };
  });
};

export default async function GridCellsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<{ onboarding?: string | string[] }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const onboardingParam = Array.isArray(sp?.onboarding) ? sp?.onboarding[0] : sp?.onboarding;
  const showOnboarding = onboardingParam === "1" || onboardingParam === "true";
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  const nextPath = `/grid/${encodeURIComponent(grid.grid_code || code)}/cells`;
  const me = await requireUserOrRedirect(nextPath);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me.preferred_language, key);
  const gridBase = `/grid/${encodeURIComponent(grid.grid_code || code)}`;

  let cells: any[] = [];
  let bundles: { id: number | string; name?: string }[] = [];
  let usedCellsFallback = false;
  try {
    const payload = await backendFetchJSON<any>(gridCellCardsPath(id));
    cells = readCells(payload);
    const bundleList = Array.isArray(payload?.bundles) ? payload.bundles : [];
    bundles = bundleList
      .filter((bundle: any) => bundle?.id != null)
      .map((bundle: any) => ({
        id: bundle.id,
        name: readBundleLabel(bundle) || `Bundle ${bundle.id}`,
      }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      cells = await readCellsFallback(id);
      usedCellsFallback = true;
    }
  }

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
    try {
      const pdata = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
      participants = Array.isArray(pdata) ? pdata : pdata.results ?? [];
    } catch {
      const pdata = await backendFetchJSON<any>(`/api/participants?grid=${id}`);
      participants = Array.isArray(pdata) ? pdata : pdata.results ?? [];
    }
  } catch {}

  if (usedCellsFallback) {
    cells = resolveFallbackParticipantNames(cells, participants);
  }

  if (participants.length === 0) {
    redirect(`${gridBase}?dock=participants&dock_feedback=participants_before_cells`);
  }

  return (
    <div className="relative">
      <OnboardingGuide
        gridId={Number(grid.id)}
        gridCode={String(grid.grid_code || code)}
        show={showOnboarding}
      />

      <div className="p-4" data-onboarding-target="cells-page">
        <div className="w-[80%] mx-auto space-y-4">
          <CellsHeader gridId={Number(grid.id)} backHref={gridBase} canCreate={role === "supervisor"} />

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
