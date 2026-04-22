import GridSolverSettingsForm from "@/components/grid/GridSolverSettingsForm";
import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import { resolveGridByCode } from "../_helpers";
import { getTranslation } from "@/lib/i18n";

export default async function GridSettingsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  const me = await requireUserOrRedirect(`/grid/${encodeURIComponent(grid.grid_code || code)}/settings`);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me?.preferred_language, key);
  let canConfigure = false;

  try {
    if (me) {
      const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
      const list = Array.isArray(data) ? data : data.results ?? [];
      const mine = list.find(
        (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
      );
      canConfigure = mine?.role === "supervisor";
    }
  } catch {}

  if (!canConfigure) {
    return (
      <div className="p-4">
        <div className="w-[80%] mx-auto rounded-lg border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">{t("grid_solver_settings.title")}</h1>
          <p className="mt-4 text-sm text-gray-600">{t("grid_settings.only_supervisors")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto">
        <GridSolverSettingsForm
          gridId={Number(grid.id)}
          daysEnabled={Array.isArray(grid.days_enabled) ? grid.days_enabled : []}
          horizonStart={grid.day_start}
          horizonEnd={grid.day_end}
          initialDayHeatmap={grid.day_heatmap ?? null}
          cellSizeMin={grid.cell_size_min}
        />
      </div>
    </div>
  );
}
