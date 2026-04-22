import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import type { Role } from "@/lib/types";
import CellsCardSwap from "@/components/grid/CellsCardSwap";
import { CellsHeader } from "@/components/grid/headers";
import { resolveGridByCode } from "../_helpers";

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const gridBase = `/grid/${encodeURIComponent(grid.grid_code || code)}`;

  let bundles: { id: number | string; name?: string }[] = [];
  try {
    const bdata = await backendFetchJSON<any>(`/api/bundles/?grid=${id}`);
    const list = Array.isArray(bdata) ? bdata : bdata.results ?? [];
    bundles = list.map((b: any) => ({ id: b.id, name: b.name || `Bundle ${b.id}` }));
  } catch {}

  let cells: any[] = [];
  try {
    const cdata = await backendFetchJSON<any>(`/api/cells?grid=${id}`);
    cells = Array.isArray(cdata) ? cdata : cdata.results ?? [];
  } catch {}

  // Resolve my role and (if editor) my participant id in this grid
  let role: Role = "viewer";
  let selfPid: number | null = null;
  try {
    const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
    const list = Array.isArray(data) ? data : data.results ?? [];
    const mine = list.find(
      (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
    );
    role = (mine?.role ?? "viewer") as Role;
  } catch {}
  try {
    let plist: any[] = [];
    try {
      const pdata = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
      plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
    } catch {
      const pdata = await backendFetchJSON<any>(`/api/participants?grid=${id}`);
      plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
    }
    const myp = plist.find(
      (p: any) => (p.user_id ?? (typeof p.user === "number" ? p.user : p.user?.id)) === me.id
    );
    if (myp?.id != null) selfPid = Number(myp.id);
  } catch {}

  const days = (grid.days_enabled || []).map((i) => EN_DAY[i] ?? String(i));

  return (
    <div className="relative">

      <div className="p-4">
        <div className="w-[80%] mx-auto space-y-4">
          <CellsHeader gridId={Number(grid.id)} backHref={gridBase} canCreate={role === "supervisor"} />

          {cells.length === 0 ? (
            <div className="text-sm text-gray-600 border rounded-lg p-6 bg-white">
              No cells yet. Create one with the Create button above.
            </div>
          ) : (
            <div className="relative h-[640px] overflow-hidden">
              <CellsCardSwap cells={cells} bundles={bundles} gridId={Number(grid.id)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
