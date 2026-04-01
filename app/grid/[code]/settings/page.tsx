import GridSolverSettingsForm from "@/components/grid/GridSolverSettingsForm";
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import { resolveGridByCode } from "../_helpers";

export default async function GridSettingsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  let canConfigure = false;

  try {
    const me = await getCurrentUser();
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
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-4 text-sm text-gray-600">Only supervisors can configure solver settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto">
        <GridSolverSettingsForm gridId={Number(grid.id)} />
      </div>
    </div>
  );
}
