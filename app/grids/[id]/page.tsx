// app/grids/[id]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";
import SideDock from "@/components/SideDock";
import GridTopBar from "@/components/GridTopBar";
import UnitTabs from "@/components/UnitTabs";
import { Users, Tags, LayoutGrid, Clock4 } from "lucide-react";
import GlassIcons from "@/components/GlassIcons";
import SolveOverlay from "@/components/SolveOverlay";
import DeleteGridBubble from "@/components/DeleteGridBubble";
import GradualBlur from "@/components/GradualBlur";

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
    for (let t = a; t < b; t += s) out.push(t);
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
  const ROW_PX = 64;
  const TIME_COL_PX = 100;
  const BODY_H = rows.length * ROW_PX;
  let units: { id: number | string; name: string }[] = [];
  try {
    const udata = await backendFetchJSON<any>(`/api/units/?grid=${id}`);
    const list = Array.isArray(udata) ? udata : udata.results ?? [];
    units = list.map((u: any) => ({ id: u.id, name: u.name || `Unit ${u.id}` }));
  } catch {}

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

  // Minimal onboarding: require at least one participant, category, and cell
  let participantsCount = 0;
  let categoriesCount = 0;
  let cellsCount = 0;
  try {
    const pdata = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
    const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
    participantsCount = plist.length;
  } catch {}
  try {
    const cdata = await backendFetchJSON<any>(`/api/categories/?grid=${id}`);
    const clist = Array.isArray(cdata) ? cdata : cdata.results ?? [];
    categoriesCount = clist.length;
  } catch {}
  try {
    const celldata = await backendFetchJSON<any>(`/api/cells/?grid=${id}`);
    const celllist = Array.isArray(celldata) ? celldata : celldata.results ?? [];
    cellsCount = celllist.length;
  } catch {}

  const ready = participantsCount > 0 && categoriesCount > 0 && cellsCount > 0;

  // Determine if there is a solved solution to show schedule view
  let hasSolved = false;
  try {
    const sdata = await backendFetchJSON<any>(`/api/grids/${id}/solutions/`);
    const list = Array.isArray(sdata) ? sdata : sdata.results ?? [];
    if (list.length > 0) {
      const sorted = list.slice().sort((a: any, b: any) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return tb - ta;
      });
      const latest = sorted[0] || list[list.length - 1];
      hasSolved = latest?.state === "DONE" && (latest?.status === "OPTIMAL" || latest?.status === "FEASIBLE");
    }
  } catch {}

  return (
    <div className="relative">
      {hasSolved && (
        <SideDock gridId={Number(grid.id)} role={role} selfParticipantId={selfPid ?? undefined} />
      )}
      {!hasSolved && role === "supervisor" && <DeleteGridBubble gridId={Number(grid.id)} />}

      <div className="p-4">
        <div className="w-[80%] mx-auto space-y-4">
          {!ready || (ready && !hasSolved) ? (
            <div className="min-h-[70vh] flex items-center justify-center">
              <div className="w-full max-w-3xl relative" style={{ height: "600px" }}>
                <GlassIcons
                  items={[
                    {
                      icon: <Users className="w-5 h-5 text-white" />,
                      color: "gray",
                      label: "Participants",
                      href: `/grids/${id}/participants`,
                    },
                    {
                      icon: <LayoutGrid className="w-5 h-5 text-white" />,
                      color: "gray",
                      label: "Cells",
                      href: `/grids/${id}/cells`,
                    },
                    {
                      icon: <Tags className="w-5 h-5 text-white" />,
                      color: "gray",
                      label: "Categories",
                      href: `/grids/${id}/categories`,
                    },
                    {
                      icon: <Clock4 className="w-5 h-5 text-white" />,
                      color: "gray",
                      label: "Time Ranges",
                      href: `/grids/${id}/time-ranges`,
                    },
                  ]}
                  className="py-0 h-full place-items-center grid-cols-2 md:grid-cols-2"
                />
              </div>
              {ready && (
                <SolveOverlay
                  gridId={Number(grid.id)}
                  role={role}
                  daysCount={days.length}
                  rowPx={ROW_PX}
                  timeColPx={TIME_COL_PX}
                  bodyHeight={BODY_H}
                  dayStartMin={start}
                  slotMin={grid.cell_size_min}
                  selectedUnitId={null}
                />
              )}
            </div>
          ) : (
            <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
              <>
                  <div className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
                    <div className="bg-gray-50 border-b h-12" />
                    {days.map((d) => (
                      <div key={d} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div
                    data-schedule-scroll
                    className="relative max-h-[70vh] overflow-y-auto hide-scrollbar"
                    style={{ ["--time-col" as any]: `${TIME_COL_PX}px` }}
                  >
                    <div className="pointer-events-none absolute left-0 top-0 z-[2]" style={{ width: TIME_COL_PX, height: BODY_H }}>
                      <div className="absolute inset-x-0 top-1 text-center text-xs text-gray-500">{fmt(start)}</div>
                      {rows.slice(1).map((t, index) => (
                        <div
                          key={`time-axis-${t}`}
                          className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-gray-500"
                          style={{ top: (index + 1) * ROW_PX }}
                        >
                          {fmt(t)}
                        </div>
                      ))}
                      <div className="absolute inset-x-0 bottom-1 text-center text-xs text-gray-500">
                        {fmt(end)}
                      </div>
                    </div>
                    {rows.map((t) => (
                      <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
                        <div className="h-16 border-r" />
                        {days.map((d, j) => (
                          <div
                            key={`${t}-${d}`}
                            className={`border-b ${j < days.length - 1 ? "border-r" : ""} h-16 hover:bg-gray-50`}
                          />
                        ))}
                      </div>
                    ))}

                    <UnitTabs
                      gridId={Number(grid.id)}
                      role={role}
                      units={units}
                      daysCount={days.length}
                      rowPx={ROW_PX}
                      timeColPx={TIME_COL_PX}
                      bodyHeight={BODY_H}
                      dayStartMin={start}
                      slotMin={grid.cell_size_min}
                    />
                  </div>
                  <GradualBlur
                    target="parent"
                    position="top"
                    height="2.1rem"
                    strength={2}
                    divCount={5}
                    curve="bezier"
                    exponential
                    opacity={1}
                    showWhen="not-at-start"
                    style={{ top: "3rem" }}
                  />
                  <GradualBlur
                    target="parent"
                    position="bottom"
                    height="2.1rem"
                    strength={2}
                    divCount={5}
                    curve="bezier"
                    exponential
                    opacity={1}
                    showWhen="not-at-end"
                  />
              </>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
