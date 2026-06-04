import { backendFetchJSON } from "@/lib/backend";
import { isAuthApiError, requireUserOrRedirect } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";
import OnboardingGuide from "@/components/grid/OnboardingGuide";
import ParticipantDetailContent from "@/components/participants/ParticipantDetailContent";
import { resolveGridByCode } from "../../_helpers";
import { t as translate } from "@/lib/i18n";
import { redirect } from "next/navigation";

type Rule = {
  id: number;
  participant: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preference: "preferred" | "flexible" | "impossible";
};

type ParticipantTabEntry = {
  id: string | number;
  routeId: string | number;
  name: string;
  tier: "PRIMARY" | "SECONDARY" | "TERTIARY" | null;
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
  searchParams?: Promise<{ view?: string | string[]; onboarding?: string | string[] }>;
}) {
  const { code, pid } = await params;
  const nextPath = `/grid/${encodeURIComponent(code)}/participants/${encodeURIComponent(pid)}`;
  let grid: Grid;
  try {
    grid = await resolveGridByCode(code);
  } catch (error: any) {
    if (isAuthApiError(error)) {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    return (
      <div className="px-4 py-6">
        <div className="mx-auto max-w-xl space-y-3 rounded-lg border border-red-100 bg-red-50 p-4 text-red-800">
          <h1 className="text-lg font-semibold">{translate("en-US", "grid_overview.not_found")}</h1>
          <p className="text-sm text-red-700">
            {translate("en-US", "grid_overview.not_found_help", { code })}
          </p>
        </div>
      </div>
    );
  }
  const id = String(grid.id);
  const sp = await searchParams;
  const onboardingParam = Array.isArray(sp?.onboarding) ? sp?.onboarding[0] : sp?.onboarding;
  const showOnboarding = onboardingParam === "1" || onboardingParam === "true";
  const viewParam = sp?.view === "schedule" ? "?view=schedule" : "";
  const onboardingSuffix = showOnboarding ? `${viewParam ? "&" : "?"}onboarding=1` : "";
  const me = await requireUserOrRedirect(
    `/grid/${encodeURIComponent(grid.grid_code || code)}/participants/${encodeURIComponent(pid)}${viewParam}${onboardingSuffix}`,
  );
  const initialView = sp?.view === "schedule" ? "schedule" : "rules";

  const fetchParticipant = async (gridParticipantId: string) => {
    try {
      const p = await backendFetchJSON<{
        id: number;
        grid_participant_id?: number | string | null;
        name: string;
        surname?: string;
        user?: any;
        user_id?: number;
      }>(
        `/api/grids/${id}/participants/${encodeURIComponent(gridParticipantId)}/`,
      );
      return p;
    } catch {
      return { id: Number(gridParticipantId), name: `#${gridParticipantId}` } as any;
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

  const fetchParticipantTabs = async (): Promise<ParticipantTabEntry[]> => {
    try {
      const data = await backendFetchJSON<any>(`/api/participants/?grid=${id}`);
      const items = Array.isArray(data) ? data : data.results ?? [];
      return items
        .filter((p: any) => p?.id != null)
        .map((p: any) => {
          const rawTier = typeof p?.tier === "string" ? String(p.tier).toUpperCase() : null;
          const tier =
            rawTier === "PRIMARY" || rawTier === "SECONDARY" || rawTier === "TERTIARY"
              ? rawTier
              : null;
          const fullName = `${p?.name ?? ""}${p?.surname ? ` ${p.surname}` : ""}`.trim();
          return {
            id: String(p.id),
            routeId: p.grid_participant_id ?? p.id,
            name: fullName || `Participant ${p.id}`,
            tier,
          };
        });
    } catch {
      try {
        const data = await backendFetchJSON<any>(`/api/participants?grid=${id}`);
        const items = Array.isArray(data) ? data : data.results ?? [];
        return items
          .filter((p: any) => p?.id != null)
          .map((p: any) => {
            const rawTier = typeof p?.tier === "string" ? String(p.tier).toUpperCase() : null;
            const tier =
              rawTier === "PRIMARY" || rawTier === "SECONDARY" || rawTier === "TERTIARY"
                ? rawTier
                : null;
            const fullName = `${p?.name ?? ""}${p?.surname ? ` ${p.surname}` : ""}`.trim();
            return {
              id: String(p.id),
              routeId: p.grid_participant_id ?? p.id,
              name: fullName || `Participant ${p.id}`,
              tier,
            };
          });
      } catch {
        return [];
      }
    }
  };

  const participant = await fetchParticipant(pid);
  const resolvedParticipantId = String((participant as any)?.id ?? pid);
  const participantTabs = await fetchParticipantTabs();
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
  const rules = canManageRules ? await fetchRules(resolvedParticipantId) : [];
  const effectiveInitialView = canManageRules ? initialView : "schedule";

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const daysIdx = (grid.days_enabled || []) as number[];
  const days = daysIdx.map((i) => EN_DAY[i] ?? String(i));

  return (
    <div className="px-4 pb-4">
      <OnboardingGuide gridId={Number(grid.id)} gridCode={String(grid.grid_code || code)} show={showOnboarding} />
      <ParticipantDetailContent
        key={resolvedParticipantId}
        gridId={Number(grid.id)}
        gridCode={String(grid.grid_code || code)}
        participantId={Number(resolvedParticipantId)}
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
        initialView={effectiveInitialView}
        initialParticipantTabs={participantTabs}
      />
    </div>
  );
}
