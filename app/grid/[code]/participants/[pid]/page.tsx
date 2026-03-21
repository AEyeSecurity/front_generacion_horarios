// app/grid/[code]/participants/[pid]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import { getCurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RuleBubble from "@/components/RuleBubble";
import AddRuleButton from "@/components/AddRuleButton";
import DeleteParticipantButton from "@/components/DeleteParticipantButton";
import EditorInviteInline from "@/components/EditorInviteInline";
import ParticipantScheduleOverlay from "@/components/ParticipantScheduleOverlay";
import ParticipantViewTabs from "@/components/ParticipantViewTabs";
import GradualBlur from "@/components/GradualBlur";
import { resolveGridByCode } from "../../_helpers";

type Rule = {
  id: number;
  participant: number;
  day_of_week: number; // 0=Mon .. 6=Sun
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  preference: "preferred" | "flexible" | "impossible";
};

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Normaliza "HH:MM[:SS]" -> "HH:MM"
const norm = (t: string) => {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
};

export default async function ParticipantAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; pid: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { code, pid } = await params;
  const grid = await resolveGridByCode(code);
  const id = String(grid.id);
  const sp = await searchParams;
  const view = sp?.view === "schedule" ? "schedule" : "rules";

  // --- helpers ---
  const fetchParticipant = async (participantId: string) => {
    try {
      const p = await backendFetchJSON<{ id: number; name: string; surname?: string; user?: any; user_id?: number }>(
        `/api/participants/${participantId}/`
      );
      return p;
    } catch {
      return { id: Number(participantId), name: `#${participantId}` } as any;
    }
  };

  const fetchRules = async (participantId: string): Promise<Rule[]> => {
    // Usa el proxy con underscore y filtra por participante
    try {
      const data = await backendFetchJSON<any>(
        `/api/availability-rules/?participant=${participantId}`
      );
      const items = Array.isArray(data) ? data : data.results ?? [];
      return items.map((r: any) => ({
        id: r.id,
        participant: r.participant,
        day_of_week: r.day_of_week,
        start_time: norm(r.start_time),
        end_time: norm(r.end_time),
        preference: r.preference,
      })) as Rule[];
    } catch {
      return [];
    }
  };

  const [participant, rules] = await Promise.all([fetchParticipant(pid), fetchRules(pid)]);
  const gridBase = `/grid/${encodeURIComponent(grid.grid_code || code)}`;
  const participantName = `${(participant as any).name}${(participant as any).surname ? " " + (participant as any).surname : ""}`;
  const participantLinked = Boolean((participant as any).user_id ?? (participant as any).user);

  // Resolve my role in this grid for gating rule controls
  let role: Role = "viewer";
  let meId: number | null = null;
  try {
    const me = await getCurrentUser();
    meId = me?.id ?? null;
    if (me) {
      const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
      const list = Array.isArray(data) ? data : data.results ?? [];
      const mine = list.find(
        (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id
      );
      role = (mine?.role ?? "viewer") as Role;
    }
  } catch {}
  const participantUserId =
    (participant as any).user_id ??
    (typeof (participant as any).user === "number" ? (participant as any).user : (participant as any).user?.id);
  const canManageRules = role === "supervisor" || (meId != null && participantUserId === meId);

  // --- time/grid helpers ---
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
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
  const total = end - start;
  const rows = steps(start, end, grid.cell_size_min);
  const daysIdx = (grid.days_enabled || []) as number[]; // 0..6
  const days = daysIdx.map((i) => EN_DAY[i] ?? String(i));
  const DAY_COUNT = days.length;

  // Canvas sizes
  const ROW_PX = 64;
  const BODY_H = rows.length * ROW_PX;
  const TIME_COL_PX = 100;

  // Colores por preferencia
  const colorFor = (pref: Rule["preference"]) => {
    switch (pref) {
      case "preferred":
        return { bg: "bg-green-50", text: "text-green-800", bar: "bg-green-400", topBorder: "border-t-green-400" };
      case "flexible":
        return { bg: "bg-yellow-50", text: "text-yellow-800", bar: "bg-yellow-400", topBorder: "border-t-yellow-400" };
      default:
        return { bg: "bg-red-50", text: "text-red-800", bar: "bg-red-400", topBorder: "border-t-red-400" };
    }
  };

  const visibleRules = rules.filter((r) => daysIdx.includes(r.day_of_week));

  // Para el dialog: pasar límites del grid como "HH:MM"
  const gridStartHHMM = norm(grid.day_start);
  const gridEndHHMM = norm(grid.day_end);

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={gridBase}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            title="Back to grid"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{participantName}</h1>
            <p className="text-sm text-gray-500">Availability Rules</p>
          </div>
        </div>

        <div className="flex flex-row-reverse items-center gap-3">
          {view === "rules" && (
            <AddRuleButton
              participantId={Number(pid)}
              gridStart={gridStartHHMM}
              gridEnd={gridEndHHMM}
              allowedDays={daysIdx}
              minMinutes={grid.cell_size_min}
              disabled={!canManageRules}
            />
          )}
          {!participantLinked && view === "rules" && (
            <EditorInviteInline gridId={id} participantId={pid} />
          )}
          <ParticipantViewTabs
            gridId={Number(id)}
            gridBase={gridBase}
            participantId={pid}
            view={view}
          />
        </div>
      </div>
      
      {view === "rules" && (
        <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
          <div className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
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
                  key={`rules-time-axis-${t}`}
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
              <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
                <div className="h-16 border-r" />
                {days.map((d, j) => (
                  <div key={`${t}-${d}`} className={`border-b ${j < DAY_COUNT - 1 ? "border-r" : ""} h-16`} />
                ))}
              </div>
            ))}

            <div className="pointer-events-none absolute inset-0" style={{ height: BODY_H }}>
              {visibleRules.map((r) => {
                const cIdx = daysIdx.indexOf(r.day_of_week);
                if (cIdx < 0) return null;
                const s = toMin(r.start_time);
                const e = toMin(r.end_time);
                const GUTTER_X = 14;
                const GUTTER_Y = 16;
                const TOP_BAR = 4;
                const ROW_BORDER = 1;

                const slot = grid.cell_size_min;
                const startSlot = (s - start) / slot;
                const endSlot = (e - start) / slot;
                const slotHeight = ROW_PX;

                const baseTop = startSlot * slotHeight;
                const rawHeight = (endSlot - startSlot) * slotHeight;

                const borderBefore = Math.max(0, Math.floor(startSlot)) * ROW_BORDER;
                const borderWithin = Math.max(0, Math.floor(endSlot - startSlot)) * ROW_BORDER;

                const top = baseTop + borderBefore + (GUTTER_Y / 2) - (TOP_BAR / 2);
                const height = Math.max(6, rawHeight + borderWithin - GUTTER_Y - TOP_BAR);
                const left = `calc(var(--time-col) + ${cIdx} * ((100% - var(--time-col)) / ${DAY_COUNT}) + ${(GUTTER_X / 2) + 1}px)`;
                const width = `calc(((100% - var(--time-col)) / ${DAY_COUNT}) - ${GUTTER_X + 2}px)`;
                const c = colorFor(r.preference);

                return (
                  <div key={r.id} className="absolute overflow-hidden pointer-events-auto" style={{ top, left, width, height }}>
                    <RuleBubble
                      id={r.id}
                      title={r.preference === "preferred" ? "Preferred" : r.preference === "flexible" ? "Flexible" : "Impossible"}
                      subtitle={`${norm(r.start_time)} - ${norm(r.end_time)}`}
                      colors={c}
                      canEdit={canManageRules}
                    />
                  </div>
                );
              })}
            </div>
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
        </div>
      )}

      {view === "schedule" && (
        <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
          <div className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
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
                  key={`schedule-time-axis-${t}`}
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
              <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
                <div className="h-16 border-r" />
                {days.map((d, j) => (
                  <div key={`${t}-${d}`} className={`border-b ${j < DAY_COUNT - 1 ? "border-r" : ""} h-16`} />
                ))}
              </div>
            ))}

            <ParticipantScheduleOverlay
              gridId={Number(id)}
              participantId={Number(pid)}
              daysCount={DAY_COUNT}
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
        </div>
      )}
      
      {/* Danger zone: delete participant (supervisors only) */}
      {role === "supervisor" && (
        <div className="mt-8 p-4 border rounded bg-white flex items-center justify-between">
          <div>
            <div className="font-medium">Danger zone</div>
            <div className="text-sm text-gray-600">Delete this participant and all their availability rules.</div>
          </div>
          <DeleteParticipantButton gridId={id} gridCode={grid.grid_code ?? null} participantId={pid} />
        </div>
      )}
    </div>
    </div>
  );
}

