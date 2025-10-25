// app/grids/[id]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import type { Grid } from "@/lib/types";

const ES_DAY = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Next 15: params es Promise
export default async function GridOverview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  async function fetchGridSmart(gridId: string): Promise<Grid> {
    try {
      return await backendFetchJSON<Grid>(`/api/grids/${gridId}/`);
    } catch {
      return await backendFetchJSON<Grid>(`/api/grids/${gridId}`);
    }
  }

  let grid: Grid;
  try {
    grid = await fetchGridSmart(id);
  } catch (e: any) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Grid no encontrado</h1>
        <pre className="text-xs p-3 bg-red-50 border rounded text-red-700 overflow-auto">
          {String(e?.message ?? e)}
        </pre>
        <p className="text-sm text-gray-600">
          Verificá si el endpoint es <code>/api/grids/{id}/</code> o{" "}
          <code>/api/grids/{id}</code>, y que el ID exista para tu usuario.
        </p>
      </div>
    );
  }

  const toMin = (hhmmss: string) => {
    const [h, m] = hhmmss.split(":").map(Number);
    return h * 60 + m;
  };
  const steps = (a: number, b: number, s: number) => {
    const out: number[] = [];
    for (let t = a; t <= b; t += s) out.push(t);
    return out;
  };
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const rows = steps(start, end, grid.cell_size_min);
  const days = (grid.days_enabled || []).map((i) => ES_DAY[i] ?? String(i));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{grid.name}</h1>
          <p className="text-sm text-gray-500">
            Calendario Semanal · Arrastra personas y categorías al calendario
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button className="px-3 py-1.5 rounded border text-sm">Compartir</button>
          <button className="px-3 py-1.5 rounded bg-black text-white text-sm">Publicar</button>
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
          <div className="bg-gray-50 border-b h-12" />
          {days.map((d) => (
            <div key={d} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
              {d}
            </div>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {rows.map((t) => (
            <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
              <div className="border-r border-b h-16 flex items-center justify-center text-xs text-gray-600">
                {fmt(t)}
              </div>
              {days.map((d, j) => (
                <div key={`${t}-${d}`} className={`border-b ${j < days.length - 1 ? "border-r" : ""} h-16 hover:bg-gray-50`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
