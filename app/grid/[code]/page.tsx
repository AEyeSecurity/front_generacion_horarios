// app/grid/[code]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";
import SideDock from "@/components/layout/SideDock";
import GridSchedulePanel from "@/components/grid/GridSchedulePanel";
import { resolveGridByCode } from "./_helpers";
import { t as translate } from "@/lib/i18n";

const DAY_KEYS = [
  "day.mon_short",
  "day.tue_short",
  "day.wed_short",
  "day.thu_short",
  "day.fri_short",
  "day.sat_short",
  "day.sun_short",
] as const;

// Next 15: params es Promise
export default async function GridOverview({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  let grid: Grid;
  try {
    grid = await resolveGridByCode(code);
  } catch (e: any) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{translate("en-US", "grid_overview.not_found")}</h1>
        <pre className="text-xs p-3 bg-red-50 border rounded text-red-700 overflow-auto">
          {String(e?.message ?? e)}
        </pre>
        <p className="text-sm text-gray-600">
          {translate("en-US", "grid_overview.not_found_help", { code })}
        </p>
      </div>
    );
  }
  const id = String(grid.id);
  const me = await getCurrentUser();
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(me?.preferred_language, key, params);

  const toMin = (hhmmss: string) => {
    const [h, m] = hhmmss.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const days = (grid.days_enabled || []).map((i) => t(DAY_KEYS[i] ?? "day.mon_short"));
  const ROW_PX = 64;
  const TIME_COL_PX = 100;
  let units: { id: number | string; name: string }[] = [];
  try {
    const udata = await backendFetchJSON<any>(`/api/units/?grid=${id}`);
    const list = Array.isArray(udata) ? udata : udata.results ?? [];
    units = list.map((u: any) => ({ id: u.id, name: u.name || t("format.unit_with_id", { id: u.id }) }));
  } catch {}

  // Resolve my role and (if editor) my participant id in this grid
  let role: Role = "viewer";
  let selfPid: number | null = null;
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

  return (
    <div className="relative">
      <SideDock
        gridId={Number(grid.id)}
        gridCode={grid.grid_code || code}
        role={role}
        selfParticipantId={selfPid ?? undefined}
      />

      <div className="p-4">
        <div className="w-[80%] mx-auto space-y-4">
          <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
            <GridSchedulePanel
              gridId={Number(grid.id)}
              role={role}
              selfParticipantId={selfPid}
              units={units}
              days={days}
              dayStartMin={start}
              dayEndMin={end}
              slotMin={grid.cell_size_min}
              rowPx={ROW_PX}
              timeColPx={TIME_COL_PX}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
