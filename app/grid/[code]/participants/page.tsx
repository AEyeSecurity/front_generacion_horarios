import { redirect } from "next/navigation";
import { backendFetchJSON } from "@/lib/backend";
import { isAuthApiError, requireUserOrRedirect } from "@/lib/auth";
import type { Grid, Role } from "@/lib/types";
import ParticipantDetailContent from "@/components/participants/ParticipantDetailContent";
import { ParticipantsHeader } from "@/components/grid/headers";
import { resolveGridByCode } from "../_helpers";
import { t as translate, getTranslation } from "@/lib/i18n";

type ParticipantTabEntry = {
  id: string | number;
  routeId: string | number;
  name: string;
  tier: "PRIMARY" | "SECONDARY" | "TERTIARY" | null;
};

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const norm = (time: string) => {
  const [h, m] = String(time ?? "").split(":");
  return `${(h || "0").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function normalizeParticipantTab(p: any): ParticipantTabEntry | null {
  if (p?.id == null) return null;
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
}

async function fetchParticipantTabs(gridId: string): Promise<ParticipantTabEntry[]> {
  const read = async (path: string) => {
    const data = await backendFetchJSON<any>(path);
    const items = Array.isArray(data) ? data : data.results ?? [];
    return items.map(normalizeParticipantTab).filter(Boolean) as ParticipantTabEntry[];
  };

  try {
    return await read(`/api/participants/?grid=${gridId}`);
  } catch {
    try {
      return await read(`/api/participants?grid=${gridId}`);
    } catch {
      return [];
    }
  }
}

async function fetchParticipants(gridId: string): Promise<any[]> {
  try {
    const data = await backendFetchJSON<any>(`/api/participants/?grid=${gridId}`);
    return Array.isArray(data) ? data : data.results ?? [];
  } catch {
    try {
      const data = await backendFetchJSON<any>(`/api/participants?grid=${gridId}`);
      return Array.isArray(data) ? data : data.results ?? [];
    } catch {
      return [];
    }
  }
}

async function fetchParticipant(gridId: string, routeParticipantId: string, participants: any[]) {
  try {
    return await backendFetchJSON<any>(
      `/api/grids/${gridId}/participants/${encodeURIComponent(routeParticipantId)}/`,
    );
  } catch {
    const match = participants.find(
      (p) =>
        String(p?.grid_participant_id ?? "") === String(routeParticipantId) ||
        String(p?.id ?? "") === String(routeParticipantId),
    );
    return match ?? { id: Number(routeParticipantId), name: `#${routeParticipantId}` };
  }
}

function getParticipantUserId(participant: any): number | string | null {
  return (
    participant?.user_id ??
    (typeof participant?.user === "number" || typeof participant?.user === "string"
      ? participant.user
      : participant?.user?.id) ??
    null
  );
}

function buildParticipantsHref(code: string, pid: string | number, view: "schedule" | "rules", onboarding?: string) {
  const params = new URLSearchParams();
  params.set("pid", String(pid));
  params.set("view", view);
  if (onboarding) params.set("onboarding", onboarding);
  return `/grid/${encodeURIComponent(code)}/participants?${params.toString()}`;
}

export default async function ParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<{ pid?: string | string[]; view?: string | string[]; onboarding?: string | string[] }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const rawPid = Array.isArray(sp?.pid) ? sp?.pid[0] : sp?.pid;
  const rawView = Array.isArray(sp?.view) ? sp?.view[0] : sp?.view;
  const onboarding = Array.isArray(sp?.onboarding) ? sp?.onboarding[0] : sp?.onboarding;
  const initialView = rawView === "rules" ? "rules" : "schedule";
  const nextPath = rawPid
    ? buildParticipantsHref(code, rawPid, initialView, onboarding)
    : `/grid/${encodeURIComponent(code)}/participants`;

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

  const gridId = String(grid.id);
  const gridCode = String(grid.grid_code || code);
  const resolvedNextPath = rawPid
    ? buildParticipantsHref(gridCode, rawPid, initialView, onboarding)
    : `/grid/${encodeURIComponent(gridCode)}/participants`;
  const me = await requireUserOrRedirect(resolvedNextPath);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me?.preferred_language, key);

  const participants = await fetchParticipants(gridId);
  const participantTabs = await fetchParticipantTabs(gridId);

  if (!rawPid) {
    const mine =
      participants.find((p) => String(getParticipantUserId(p) ?? "") === String(me.id)) ??
      participants[0] ??
      null;
    if (mine) {
      redirect(buildParticipantsHref(gridCode, mine.grid_participant_id ?? mine.id, "schedule", onboarding));
    }
  }

  let role: Role = "viewer";
  try {
    const data = await backendFetchJSON<any>(`/api/grid-memberships/?grid=${gridId}`);
    const list = Array.isArray(data) ? data : data.results ?? [];
    const mine = list.find(
      (m: any) => (m.user_id ?? (typeof m.user === "number" ? m.user : m.user?.id)) === me.id,
    );
    role = (mine?.role ?? "viewer") as Role;
  } catch {}

  if (!rawPid || participants.length === 0) {
    const gridBase = `/grid/${encodeURIComponent(gridCode)}`;
    return (
      <div className="p-4">
        <div className="mx-auto w-[80%] space-y-4">
          <ParticipantsHeader gridId={Number(gridId)} backHref={gridBase} canCreate={role === "supervisor"} />
          <p className="text-sm text-gray-500">{grid.name}</p>
          <div className="rounded-lg border bg-white p-6 text-sm text-gray-600">
            {t("participants_page.no_participants")}
          </div>
        </div>
      </div>
    );
  }

  const participant = await fetchParticipant(gridId, rawPid, participants);
  const resolvedParticipantId = String(participant?.id ?? rawPid);
  const participantName = `${participant?.name ?? ""}${participant?.surname ? ` ${participant.surname}` : ""}`.trim();
  const participantLinked = Boolean(getParticipantUserId(participant));
  const participantUserId = getParticipantUserId(participant);
  const canManageRules = role === "supervisor" || (me.id != null && String(participantUserId ?? "") === String(me.id));
  const effectiveInitialView = canManageRules ? initialView : "schedule";
  const daysIdx = (grid.days_enabled || []) as number[];
  const days = daysIdx.map((i) => EN_DAY[i] ?? String(i));

  return (
    <div className="px-4 pb-4">
      <ParticipantDetailContent
        gridId={Number(grid.id)}
        gridCode={gridCode}
        participantId={Number(resolvedParticipantId)}
        participantName={participantName || `#${resolvedParticipantId}`}
        participantLinked={participantLinked}
        role={role}
        canManageRules={canManageRules}
        daysIdx={daysIdx}
        days={days}
        dayStartMin={toMin(grid.day_start)}
        dayEndMin={toMin(grid.day_end)}
        cellSizeMin={grid.cell_size_min}
        dayStartHHMM={norm(grid.day_start)}
        dayEndHHMM={norm(grid.day_end)}
        rules={[]}
        initialView={effectiveInitialView}
        initialParticipantTabs={participantTabs}
        lazyLoadRules
      />
    </div>
  );
}
