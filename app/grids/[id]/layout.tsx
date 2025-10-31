// app/grids/[id]/layout.tsx
import GridTopBar from "@/components/GridTopBar";
import { backendFetchJSON } from "@/lib/backend";
import type { Grid } from "@/lib/types";

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
  try {
    const grid = await fetchGridSmart(id);
    name = grid.name;
  } catch {}

  return (
    <>
      <GridTopBar id={Number(id)} name={name} />
      {children}
    </>
  );
}
