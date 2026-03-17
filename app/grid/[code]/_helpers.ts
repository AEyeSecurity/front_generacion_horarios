import { backendFetchJSON } from "@/lib/backend";
import type { Grid } from "@/lib/types";

export async function resolveGridByCode(code: string): Promise<Grid> {
  const encoded = encodeURIComponent(code);
  try {
    return await backendFetchJSON<Grid>(`/api/grids/code/${encoded}/`);
  } catch {
    return await backendFetchJSON<Grid>(`/api/grids/code/${encoded}`);
  }
}
