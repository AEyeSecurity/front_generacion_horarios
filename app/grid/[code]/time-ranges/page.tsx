// app/grid/[code]/time-ranges/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import type { Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import TimeRangesEditor from "@/components/TimeRangesEditor";
import { resolveGridByCode } from "../_helpers";

export default async function TimeRangesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);

  // optional: guard by supervisor role; otherwise backend will enforce
  let role: Role = "viewer";
  try {
    const me = await getCurrentUser();
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
        <h1 className="text-xl font-semibold mb-4">Configure Time Ranges</h1>
        <TimeRangesEditor gridId={Number(grid.id)} canEdit={role === "supervisor"} />
      </div>
    </div>
  );
}
