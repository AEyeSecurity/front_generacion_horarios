// app/grids/[id]/layout.tsx
import GridTopBar from "@/components/GridTopBar";
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";

async function fetchGridSmart(gridId: string): Promise<Grid> {
  try {
    return await backendFetchJSON<Grid>(`/api/grids/${gridId}/`);
  } catch {
    return await backendFetchJSON<Grid>(`/api/grids/${gridId}`);
  }
}

export default async function GridLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let name = "Grid";
  let role: Role = "viewer";
  try {
    const grid = await fetchGridSmart(id);
    name = grid.name;
  } catch {}

  // Resolve my role on this grid to gate actions
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

  return (
    <>
      <GridTopBar id={Number(id)} name={name} canDelete={role === "supervisor"} canInvite={role === "supervisor"} />
      {children}
    </>
  );
}
