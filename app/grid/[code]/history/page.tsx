import Link from "next/link";
import SideDock from "@/components/layout/SideDock";
import GridSchedulePanel from "@/components/grid/GridSchedulePanel";
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { resolveGridByCode, resolveScheduleByGridCode } from "../_helpers";

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function GridHistoryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const grid = await resolveGridByCode(code);
  const gridId = String(grid.id);
  const gridCode = grid.grid_code || code;
  const me = await getCurrentUser();

  const toMin = (hhmmss: string) => {
    const [h, m] = hhmmss.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const days = (grid.days_enabled || []).map((i) => EN_DAY[i] ?? String(i));
  const ROW_PX = 64;
  const TIME_COL_PX = 100;

  let units: { id: number | string; name: string }[] = [];
  try {
    const udata = await backendFetchJSON<Record<string, unknown> | Record<string, unknown>[]>(
      `/api/units/?grid=${gridId}`,
    );
    const list = Array.isArray(udata)
      ? udata
      : Array.isArray((udata as { results?: unknown[] }).results)
      ? ((udata as { results?: unknown[] }).results as Record<string, unknown>[])
      : [];
    units = list.map((u) => ({
      id: u.id as number | string,
      name: (u.name as string | undefined) || `Unit ${String(u.id)}`,
    }));
  } catch {}

  let role: Role = "viewer";
  let selfPid: number | null = null;
  if (me) {
    try {
      const data = await backendFetchJSON<Record<string, unknown> | Record<string, unknown>[]>(
        `/api/grid-memberships/?grid=${gridId}`,
      );
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { results?: unknown[] }).results)
        ? ((data as { results?: unknown[] }).results as Record<string, unknown>[])
        : [];
      const mine = list.find((membership) => Number(membership.user_id) === Number(me.id));
      role = ((mine?.role as Role | undefined) ?? "viewer") as Role;
    } catch {}

    try {
      const pdata = await backendFetchJSON<Record<string, unknown> | Record<string, unknown>[]>(
        `/api/participants/?grid=${gridId}`,
      );
      const participants = Array.isArray(pdata)
        ? pdata
        : Array.isArray((pdata as { results?: unknown[] }).results)
        ? ((pdata as { results?: unknown[] }).results as Record<string, unknown>[])
        : [];
      const mine = participants.find((participant) => Number(participant.user_id) === Number(me.id));
      if (mine?.id != null) selfPid = Number(mine.id);
    } catch {}
  }

  let hasSolved = false;
  try {
    const schedule = await resolveScheduleByGridCode(gridCode);
    hasSolved = Array.isArray(schedule?.placements) && schedule.placements.length > 0;
  } catch {}

  if (!hasSolved) {
    return (
      <div className="p-4">
        <div className="w-[80%] mx-auto">
          <div className="rounded-lg border bg-white p-6 text-sm text-gray-700">
            No published schedule versions are available yet.
            <div className="mt-3">
              <Link
                href={`/grid/${encodeURIComponent(gridCode)}`}
                className="inline-flex rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Back to schedule
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <SideDock
        gridId={Number(grid.id)}
        gridCode={gridCode}
        role={role}
        selfParticipantId={selfPid ?? undefined}
      />
      <div className="p-4">
        <div className="w-[80%] mx-auto">
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
              historyMode
              historyGridCode={gridCode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
