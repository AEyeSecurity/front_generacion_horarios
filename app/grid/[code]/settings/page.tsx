import GridSettingsTabs from "@/components/grid/GridSettingsTabs";
import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import { resolveGridByCode } from "../_helpers";
import { getTranslation } from "@/lib/i18n";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type GridMembershipEntry = {
  role?: string | null;
  user_id?: number | null;
  user?: number | { id?: number | null } | null;
};

type GridMembershipResponse = GridMembershipEntry[] | { results?: GridMembershipEntry[] };

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
      const data = await backendFetchJSON<GridMembershipResponse>(`/api/grid-memberships/?grid=${id}`);
      const list = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
      const mine = list.find(
        (m) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id,
      );
      canConfigure = mine?.role === "supervisor";
    }
  } catch {}

  if (!canConfigure) {
    return (
      <div className="p-4" data-grid-settings-view>
        <style>{`
          body:has([data-grid-settings-view]) [data-grid-topbar] { display: none; }
        `}</style>
        <div className="mx-auto max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <Link
              href={`/grid/${encodeURIComponent(grid.grid_code || code)}`}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">{t("grid_settings.title")}</h1>
          <p className="mt-4 text-sm text-gray-600">{t("grid_settings.only_supervisors")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4" data-grid-settings-view>
      <style>{`
        body:has([data-grid-settings-view]) [data-grid-topbar] { display: none; }
      `}</style>
      <div className="w-full">
        <GridSettingsTabs
          gridId={Number(grid.id)}
          backHref={`/grid/${encodeURIComponent(grid.grid_code || code)}`}
        />
      </div>
    </div>
  );
}
