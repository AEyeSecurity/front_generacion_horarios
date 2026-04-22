import { backendFetchJSON } from "@/lib/backend";
import { requireUserOrRedirect } from "@/lib/auth";
import type { Role } from "@/lib/types";
import ParticipantDetailContent from "@/components/participants/ParticipantDetailContent";
import { resolveGridByCode } from "../../_helpers";

type Rule = {
  id: number;
  participant: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preference: "preferred" | "flexible" | "impossible";
};

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const me = await requireUserOrRedirect(
    `/grid/${encodeURIComponent(grid.grid_code || code)}/participants/${encodeURIComponent(pid)}${sp?.view === "schedule" ? "?view=schedule" : ""}`,
  );
  const initialView = sp?.view === "schedule" ? "schedule" : "rules";

  const fetchParticipant = async (participantId: string) => {
    try {
      const p = await backendFetchJSON<{ id: number; name: string; surname?: string; user?: any; user_id?: number }>(
        `/api/participants/${participantId}/`,
      );
      return p;
    } catch {
      return { id: Number(participantId), name: `#${participantId}` } as any;
    }
  };

  const fetchRules = async (participantId: string): Promise<Rule[]> => {
    try {
      const data = await backendFetchJSON<any>(`/api/availability-rules/?participant=${participantId}`);
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
  const participantName = `${(participant as any).name}${(participant as any).surname ? " " + (participant as any).surname : ""}`;
  const participantLinked = Boolean((participant as any).user_id ?? (participant as any).user);

  let role: Role = "viewer";
  let meId: number | null = me.id ?? null;
  try {
    const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${id}`);
    const list = Array.isArray(data) ? data : data.results ?? [];
    const mine = list.find(
      (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id,
    );
    role = (mine?.role ?? "viewer") as Role;
  } catch {}

  const participantUserId =
    (participant as any).user_id ??
    (typeof (participant as any).user === "number" ? (participant as any).user : (participant as any).user?.id);
  const canManageRules = role === "supervisor" || (meId != null && participantUserId === meId);

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const daysIdx = (grid.days_enabled || []) as number[];
  const days = daysIdx.map((i) => EN_DAY[i] ?? String(i));

  return (
    <div className="p-4">
      <ParticipantDetailContent
        gridId={Number(grid.id)}
        gridCode={String(grid.grid_code || code)}
        participantId={Number(pid)}
        participantName={participantName}
        participantLinked={participantLinked}
        role={role}
        canManageRules={canManageRules}
        daysIdx={daysIdx}
        days={days}
        dayStartMin={start}
        dayEndMin={end}
        cellSizeMin={grid.cell_size_min}
        dayStartHHMM={norm(grid.day_start)}
        dayEndHHMM={norm(grid.day_end)}
        rules={rules}
        initialView={initialView}
      />
    </div>
  );
}
