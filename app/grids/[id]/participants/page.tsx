import { backendFetchJSON } from "@/lib/backend";
import type { Grid, Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import ParticipantsHeader from "@/components/ParticipantsHeader";
import Link from "next/link";

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let role: Role = "viewer";
  try {
    const me = await getCurrentUser();
    if (me) {
      const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
      const list = Array.isArray(data) ? data : data.results ?? [];
      const mine = list.find(
        (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
      );
      role = (mine?.role ?? "viewer") as Role;
    }
  } catch {}

  let gridName = "Grid";
  try {
    const g = await backendFetchJSON<Grid>(`/api/grids/${id}/`);
    gridName = g.name;
  } catch {}

  let participants: any[] = [];
  try {
    const pdata = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
    participants = Array.isArray(pdata) ? pdata : pdata.results ?? [];
  } catch {}

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto space-y-4">
        <ParticipantsHeader gridId={Number(id)} backHref={`/grids/${id}`} canCreate={role === "supervisor"} />
        <p className="text-sm text-gray-500">{gridName}</p>

        {participants.length === 0 ? (
          <div className="text-sm text-gray-600 border rounded-lg p-6 bg-white">
            No participants yet. Create one with the Create button above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {participants.map((p) => (
              <Link
                key={p.id}
                href={`/grids/${id}/participants/${p.id}`}
                className="border rounded-lg p-4 bg-white hover:shadow-md transition"
              >
                <div className="font-semibold">
                  {p.name}{p.surname ? ` ${p.surname}` : ""}
                </div>
                {p.user && (
                  <div className="text-xs text-gray-500 mt-1">Linked user</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
