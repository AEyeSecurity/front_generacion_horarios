import { normalizeApiError } from "@/lib/api-errors";
// app/grid/[code]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect, isAuthApiError } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";
import LeftSideDock from "@/components/layout/LeftSideDock";
import GridSchedulePanel from "@/components/grid/GridSchedulePanel";
import { readGridTierEnabled } from "@/lib/grid-tier";
import { resolveGridByCode } from "./_helpers";
import { t as translate } from "@/lib/i18n";
import { redirect } from "next/navigation";

const DAY_KEYS = [
  "day.mon_short",
  "day.tue_short",
  "day.wed_short",
  "day.thu_short",
  "day.fri_short",
  "day.sat_short",
  "day.sun_short",
] as const;

type GridMembership = {
  role?: Role;
  user_id?: number;
  user?: number | { id?: number };
};

type ContextParticipant = {
  id?: number | string;
  grid_participant_id?: number | string;
  user_id?: number;
  user?: number | { id?: number };
};

type ContextUnit = { id?: number | string; name?: string };

// Next 15: params es Promise
export default async function GridOverview({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const nextPath = `/grid/${encodeURIComponent(code)}`;

  const me = await requireUserOrRedirect(nextPath);
  let grid: Grid;
  try {
    grid = await resolveGridByCode(code);
  } catch (e: unknown) {
    if (isAuthApiError(e)) {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{translate(me.preferred_language, "grid_overview.not_found")}</h1>
        <pre className="text-xs p-3 bg-red-50 border rounded text-red-700 overflow-auto">
          {normalizeApiError(e, "", { locale: me.preferred_language })}
        </pre>
        <p className="text-sm text-gray-600">
          {translate(me.preferred_language, "grid_overview.not_found_help", { code })}
        </p>
      </div>
    );
  }
  const id = String(grid.id);
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(me?.preferred_language, key, params);

  const toMin = (hhmmss: string) => {
    const [h, m] = hhmmss.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const tiersEnabled = readGridTierEnabled(grid, false);
  const days = (grid.days_enabled || []).map((i) => t(DAY_KEYS[i] ?? "day.mon_short"));
  const ROW_PX = 64;
  const TIME_COL_PX = 100;

  const [screenContextResult, membershipsResult] = await Promise.allSettled([
    (async () => {
      return await backendFetchJSON<Record<string, unknown>>(
        `/api/grids/${encodeURIComponent(id)}/screen-context/?view=draft`,
      );
    })(),
    (async () => {
      const data = await backendFetchJSON<GridMembership[] | { results?: GridMembership[] }>(
        `/api/grid-memberships/?grid=${id}`,
      );
      return Array.isArray(data) ? data : data.results ?? [];
    })(),
  ]);

  const initialScreenContext =
    screenContextResult.status === "fulfilled" ? screenContextResult.value : null;
  const contextList = <T extends Record<string, unknown>>(value: unknown): T[] =>
    Array.isArray(value)
      ? (value as T[])
      : value && typeof value === "object" && Array.isArray((value as { results?: unknown[] }).results)
      ? ((value as { results: T[] }).results)
      : [];
  const units: { id: number | string; name: string }[] =
    contextList<ContextUnit>(initialScreenContext?.units)
      .filter((unit): unit is ContextUnit & { id: number | string } => unit.id != null)
      .map((unit) => ({
        id: unit.id,
        name: unit.name || t("format.unit_with_id", { id: unit.id }),
      }));
  const memberships = membershipsResult.status === "fulfilled" ? membershipsResult.value : [];
  const participants = contextList<ContextParticipant>(initialScreenContext?.participants);

  // Resolve my role and participant id in this grid without waiting on schedule data.
  let role: Role = "viewer";
  let selfPid: number | null = null;
  let selfRoutePid: string | number | null = null;
  {
    try {
      const mine = memberships.find(
        (membership) =>
          (membership.user_id ??
            (typeof membership.user === "number" ? membership.user : membership.user?.id)) === me.id,
      );
      role = (mine?.role ?? "viewer") as Role;
    } catch {}
    try {
      const myp = participants.find(
        (participant) =>
          (participant.user_id ??
            (typeof participant.user === "number" ? participant.user : participant.user?.id)) === me.id,
      );
      if (myp?.id != null) selfPid = Number(myp.id);
      if (myp?.grid_participant_id != null) selfRoutePid = myp.grid_participant_id;
    } catch {}
  }

  return (
    <div className="relative">
      <LeftSideDock
        gridId={Number(grid.id)}
        gridCode={grid.grid_code || code}
        role={role}
        selfParticipantId={selfPid ?? undefined}
        selfParticipantRouteId={selfRoutePid ?? undefined}
        horizonStart={grid.day_start}
        horizonEnd={grid.day_end}
        cellSizeMin={grid.cell_size_min}
        dayStartMin={start}
        dayEndMin={end}
        tiersEnabled={tiersEnabled}
        participantCount={participants.length}
      />
      <div className="p-4">
        <div className="w-[80%] mx-auto space-y-4">
          <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
            <GridSchedulePanel
              gridId={Number(grid.id)}
              role={role}
              selfParticipantId={selfPid}
              initialScreenContext={initialScreenContext}
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
