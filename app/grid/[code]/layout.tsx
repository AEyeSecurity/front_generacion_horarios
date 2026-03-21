import GridTopBar from "@/components/GridTopBar";
import { getCurrentUser } from "@/lib/auth";
import { backendFetchJSON } from "@/lib/backend";
import type { Role } from "@/lib/types";
import { isSolvedSolution, pickDisplaySolution } from "@/lib/solution-utils";
import { resolveGridByCode } from "./_helpers";

export default async function GridByCodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const me = await getCurrentUser();

  let gridId = 0;
  let gridName = "Grid";
  let gridCode: string | null = null;
  let role: Role = "viewer";
  let hasSolved = false;

  try {
    const grid = await resolveGridByCode(code);
    gridId = Number(grid.id);
    gridName = grid.name;
    gridCode = grid.grid_code ?? code;
  } catch {}

  if (gridId && me) {
    try {
      const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${gridId}`);
      const list = Array.isArray(data) ? data : data.results ?? [];
      const mine = list.find(
        (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
      );
      role = (mine?.role ?? "viewer") as Role;
    } catch {}

    try {
      const sdata = await backendFetchJSON<any>(`/api/grids/${gridId}/solutions/`);
      const list = Array.isArray(sdata) ? sdata : sdata.results ?? [];
      const displaySolution = pickDisplaySolution(list);
      hasSolved = isSolvedSolution(displaySolution);
    } catch {}
  }

  return (
    <>
      <GridTopBar
        id={gridId}
        gridCode={gridCode}
        name={gridName}
        canDelete={role === "supervisor"}
        canInvite={role === "supervisor"}
        hasSolution={hasSolved}
        canConfigureSolve={role === "supervisor"}
      />
      {children}
    </>
  );
}
