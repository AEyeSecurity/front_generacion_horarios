import LeftSideDock from "@/components/layout/LeftSideDock";
import GridSchedulePanel from "@/components/grid/GridSchedulePanel";
import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import { readGridTierEnabled } from "@/lib/grid-tier";
import type { Role } from "@/lib/types";
import { resolveGridByCode } from "../_helpers";
import { getTranslation } from "@/lib/i18n";
import { redirect } from "next/navigation";

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
  const me = await requireUserOrRedirect(`/grid/${encodeURIComponent(gridCode)}/history`);
  const t = (key: Parameters<typeof getTranslation>[1], values?: Record<string, string | number>) =>
    getTranslation(me.preferred_language, key).replace(/\{(\w+)\}/g, (_, token: string) =>
      Object.prototype.hasOwnProperty.call(values ?? {}, token) ? String(values?.[token]) : `{${token}}`,
    );

  let hasPublishedSchedule = false;
  try {
    const published = await backendFetchJSON<{ id?: number | string | null }>(
      `/api/grids/${encodeURIComponent(gridId)}/published-schedule/`,
    );
    hasPublishedSchedule = published?.id != null;
  } catch {}

  if (!hasPublishedSchedule) {
    redirect(`/grid/${encodeURIComponent(gridCode)}`);
  }

  const toMin = (hhmmss: string) => {
    const [h, m] = hhmmss.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const tiersEnabled = readGridTierEnabled(grid, false);
  const days = (grid.days_enabled || []).map((i) => EN_DAY[i] ?? String(i));
  const ROW_PX = 64;
  const TIME_COL_PX = 100;

  let initialScreenContext: Record<string, unknown> | null = null;
  let units: { id: number | string; name: string }[] = [];
  let contextParticipants: Record<string, unknown>[] = [];
  try {
    initialScreenContext = await backendFetchJSON<Record<string, unknown>>(
      `/api/grids/${encodeURIComponent(gridId)}/screen-context/?view=published`,
    );
    const contextList = (value: unknown): Record<string, unknown>[] =>
      Array.isArray(value)
        ? (value as Record<string, unknown>[])
        : value && typeof value === "object" && Array.isArray((value as { results?: unknown[] }).results)
        ? ((value as { results: Record<string, unknown>[] }).results ?? [])
        : [];
    const list = contextList(initialScreenContext.units);
    contextParticipants = contextList(initialScreenContext.participants);
    units = list.map((u) => ({
      id: u.id as number | string,
      name: (u.name as string | undefined) || t("format.unit_with_id", { id: String(u.id) }),
    }));
  } catch {}

  let role: Role = "viewer";
  let selfPid: number | null = null;
  let selfRoutePid: string | number | null = null;
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

    const mine = contextParticipants.find((participant) => Number(participant.user_id) === Number(me.id));
    if (mine?.id != null) selfPid = Number(mine.id);
    if (mine?.grid_participant_id != null) selfRoutePid = mine.grid_participant_id as string | number;
  }

  return (
    <div className="relative">
      <LeftSideDock
        gridId={Number(grid.id)}
        gridCode={gridCode}
        role={role}
        selfParticipantId={selfPid ?? undefined}
        selfParticipantRouteId={selfRoutePid ?? undefined}
        horizonStart={grid.day_start}
        horizonEnd={grid.day_end}
        cellSizeMin={grid.cell_size_min}
        dayStartMin={start}
        dayEndMin={end}
        tiersEnabled={tiersEnabled}
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
              initialScreenContext={initialScreenContext}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
