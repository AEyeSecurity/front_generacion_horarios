// app/grid/[code]/time-ranges/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import type { Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import TimeRangesEditor from "@/components/grid/TimeRangesEditor";
import { resolveGridByCode } from "../_helpers";
import { getTranslation } from "@/lib/i18n";

export default async function TimeRangesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  const me = await getCurrentUser();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me?.preferred_language, key);

  // optional: guard by supervisor role; otherwise backend will enforce
  let role: Role = "viewer";
  try {
    if (me) {
      const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
      const list = Array.isArray(data) ? data : data.results ?? [];
      const mine = list.find((m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id);
      role = (mine?.role ?? "viewer") as Role;
    }
  } catch {}

  return (
    <div className="p-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold mb-4">{t("grid_time_ranges.configure")}</h1>
        <TimeRangesEditor gridId={Number(grid.id)} canEdit={role === "supervisor"} />
      </div>
    </div>
  );
}
