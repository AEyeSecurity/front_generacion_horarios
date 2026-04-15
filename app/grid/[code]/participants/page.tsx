import { backendFetchJSON } from "@/lib/backend";
import type { Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { ParticipantsHeader } from "@/components/grid/headers";
import Link from "next/link";
import { resolveGridByCode } from "../_helpers";
import { getTranslation } from "@/lib/i18n";

export default async function ParticipantsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  const me = await getCurrentUser();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me?.preferred_language, key);

  let role: Role = "viewer";
  try {
    if (me) {
      const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
      const list = Array.isArray(data) ? data : data.results ?? [];
      const mine = list.find(
        (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
      );
      role = (mine?.role ?? "viewer") as Role;
    }
  } catch {}

  const gridName = grid.name;
  const gridBase = `/grid/${encodeURIComponent(grid.grid_code || code)}`;

  let participants: any[] = [];
  try {
    const pdata = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
    participants = Array.isArray(pdata) ? pdata : pdata.results ?? [];
  } catch {}

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto space-y-4">
        <ParticipantsHeader gridId={Number(id)} backHref={gridBase} canCreate={role === "supervisor"} />
        <p className="text-sm text-gray-500">{gridName}</p>

        {participants.length === 0 ? (
          <div className="text-sm text-gray-600 border rounded-lg p-6 bg-white">
            {t("participants_page.no_participants")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {participants.map((p) => (
              <Link
                key={p.id}
                href={`${gridBase}/participants/${p.id}`}
                className="border rounded-lg p-4 bg-white hover:shadow-md transition"
              >
                <div className="font-semibold">
                  {p.name}{p.surname ? ` ${p.surname}` : ""}
                </div>
                {p.user && (
                  <div className="text-xs text-gray-500 mt-1">{t("participants_page.linked_user")}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
