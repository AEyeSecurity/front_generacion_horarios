import { GridTopBar } from "@/components/navigation";
import { requireUserOrRedirect, isAuthApiError } from "@/lib/auth";
import { backendFetchJSON } from "@/lib/backend";
import type { Role } from "@/lib/types";
import { redirect } from "next/navigation";
import { resolveGridByCode, resolveScheduleByGridId } from "./_helpers";

export default async function GridByCodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const me = await requireUserOrRedirect(`/grid/${encodeURIComponent(code)}`);

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
  } catch (error: unknown) {
    if (isAuthApiError(error)) {
      redirect(`/login?next=${encodeURIComponent(`/grid/${encodeURIComponent(code)}`)}`);
    }
  }

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
      const schedule = await resolveScheduleByGridId(gridId);
      hasSolved = Array.isArray(schedule?.placements) && schedule.placements.length > 0;
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
