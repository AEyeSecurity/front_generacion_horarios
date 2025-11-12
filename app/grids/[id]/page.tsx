// app/grids/[id]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";
import SideDock from "@/components/SideDock";
import GridTopBar from "@/components/GridTopBar";

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
        <h1 className="text-xl font-semibold">Grid not found</h1>
        <pre className="text-xs p-3 bg-red-50 border rounded text-red-700 overflow-auto">
          {String(e?.message ?? e)}
        </pre>
        <p className="text-sm text-gray-600">
          Check <code>/api/grids/{id}/</code> or <code>/api/grids/{id}</code>, and that the ID exists for your user.
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
  const days = (grid.days_enabled || []).map((i) => EN_DAY[i] ?? String(i));

  // Resolve my role and (if editor) my participant id in this grid
  let role: Role = "viewer";
  let selfPid: number | null = null;
  try {
    const me = await getCurrentUser();
    if (me) {
      // Role
      try {
        const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
        const list = Array.isArray(data) ? data : data.results ?? [];
        const mine = list.find(
          (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
        );
        role = (mine?.role ?? "viewer") as Role;
      } catch {}
      // Self participant id
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
    }
  } catch {}

  return (
    <div className="relative">
      {/* Side dock varies by role: supervisor full, editor self icon, viewer none */}
      <SideDock gridId={Number(grid.id)} role={role} selfParticipantId={selfPid ?? undefined} />

      {/* Main calendar centered and 80% width */}
      <div className="p-4">
        <div className="w-[80%] mx-auto space-y-4">
          <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
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
                    <div
                      key={`${t}-${d}`}
                      className={`border-b ${j < days.length - 1 ? "border-r" : ""} h-16 hover:bg-gray-50`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
