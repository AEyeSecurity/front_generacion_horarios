import { backendFetchJSON } from "@/lib/backend";
import type { Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { CategoriesHeader } from "@/components/grid/headers";
import { resolveGridByCode } from "../_helpers";

export default async function CategoriesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);

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

  const gridName = grid.name;
  const gridBase = `/grid/${encodeURIComponent(grid.grid_code || code)}`;

  let categories: any[] = [];
  try {
    const cdata = await backendFetchJSON<any>(`/api/categories/?grid=${id}`);
    categories = Array.isArray(cdata) ? cdata : cdata.results ?? [];
  } catch {}

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto space-y-4">
        <CategoriesHeader gridId={Number(id)} backHref={gridBase} canCreate={role === "supervisor"} />
        <p className="text-sm text-gray-500">{gridName}</p>

        {categories.length === 0 ? (
          <div className="text-sm text-gray-600 border rounded-lg p-6 bg-white">
            No categories yet. Create one with the Create button above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((c) => (
              <div key={c.id} className="border rounded-lg p-4 bg-white">
                <div className="font-semibold">{c.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
