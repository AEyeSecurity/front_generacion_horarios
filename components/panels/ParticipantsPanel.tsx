"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AllTierLabel, TierBadge, TierFilterChip, type Tier } from "@/components/badges/TierBadge";
import { readGridTierEnabled } from "@/lib/grid-tier";
import type { Role } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PanelShell from "@/components/panels/PanelShell";
import PanelScrollArea from "@/components/panels/PanelScrollArea";
import EditParticipantDialog from "@/components/dialogs/EditParticipantDialog";
import { useI18n } from "@/lib/use-i18n";

type Participant = {
  id: number;
  grid_participant_id?: number | string | null;
  name: string;
  surname?: string;
  tier?: Tier;
  hours_week_mode?: "default" | "custom" | "not_available" | null;
  min_hours_week_override?: number | null;
  max_hours_week_override?: number | null;
};

export default function ParticipantsPanel({
  gridId,
  gridCode,
  role,
  refreshKey = 0,
  tiersEnabled,
}: {
  gridId: number;
  gridCode?: string | null;
  role: Role;
  refreshKey?: number;
  tiersEnabled?: boolean;
}) {
  const [list, setList] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | Tier>("ALL");
  const [tierEnabled, setTierEnabled] = useState(Boolean(tiersEnabled));
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Participant | null>(null);
  const rowClickTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const { t } = useI18n();

  const clearRowClickTimer = () => {
    if (rowClickTimerRef.current != null) {
      window.clearTimeout(rowClickTimerRef.current);
      rowClickTimerRef.current = null;
    }
  };

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [participantsRes, gridRes] = await Promise.all([
        fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
        tiersEnabled == null ? fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).catch(() => null) : Promise.resolve(null),
      ]);
      if (!participantsRes.ok) throw new Error(`Failed (${participantsRes.status})`);
      const data = await participantsRes.json();
      const items = Array.isArray(data) ? data : data.results ?? [];
      if (tiersEnabled != null) {
        setTierEnabled(Boolean(tiersEnabled));
      } else if (gridRes?.ok) {
        const gridData = await gridRes.json().catch(() => null);
        setTierEnabled(readGridTierEnabled(gridData, false));
      }
      setList(items);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [gridId, refreshKey, tiersEnabled]);

  useEffect(() => () => clearRowClickTimer(), []);

  const filtered = useMemo(
    () =>
      list.filter(
        (p) =>
          `${p.name} ${p.surname ?? ""}`.toLowerCase().includes(q.toLowerCase()) &&
          (!tierEnabled || tierFilter === "ALL" || p.tier === tierFilter),
      ),
    [list, q, tierEnabled, tierFilter],
  );
  const latestParticipantId = useMemo(
    () => list.reduce<number | null>((latest, p) => (latest == null || p.id > latest ? p.id : latest), null),
    [list],
  );
  const gridBase = `/grid/${encodeURIComponent(gridCode || String(gridId))}`;

  return (
    <div className="h-full" data-onboarding-target="participants-panel">
    <PanelShell title={t("entity.participants")} error={err}>
      <div className={`grid w-full ${tierEnabled ? "grid-cols-[minmax(0,1fr)_80px]" : "grid-cols-1"} gap-2`}>
        <input
          className="w-full min-w-0 border rounded px-3 py-2 text-sm"
          placeholder={t("common.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tierEnabled ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-[42px] w-full min-w-0 items-center justify-center gap-1 overflow-hidden rounded border bg-white px-2 py-2"
                aria-label={t("participants_panel.filter_by_tier")}
              >
                <span className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
                  {tierFilter === "ALL" ? <AllTierLabel compact /> : <TierFilterChip tier={tierFilter} />}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="z-[190] min-w-[8rem]">
              <DropdownMenuItem onClick={() => setTierFilter("ALL")} className="justify-center">
                <AllTierLabel />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("PRIMARY")} className="justify-center">
                <TierBadge tier="PRIMARY" compact />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("SECONDARY")} className="justify-center">
                <TierBadge tier="SECONDARY" compact />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTierFilter("TERTIARY")} className="justify-center">
                <TierBadge tier="TERTIARY" compact />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <PanelScrollArea
        loading={loading}
        empty={filtered.length === 0}
        loadingLabel={t("common.loading")}
        emptyLabel={t("participants_panel.no_participants_found")}
      >
        <ul className="grid gap-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                data-onboarding-target={p.id === latestParticipantId ? "participants-latest-row" : undefined}
                onClick={() => {
                  clearRowClickTimer();
                  rowClickTimerRef.current = window.setTimeout(() => {
                    const routeId = p.grid_participant_id ?? p.id;
                    const onboardingActive =
                      typeof window !== "undefined" &&
                      window.localStorage.getItem(`onboarding-step-grid-${gridId}`) != null &&
                      window.localStorage.getItem(`onboarding-done-grid-${gridId}`) !== "1";
                    router.push(
                      `${gridBase}/participants/${encodeURIComponent(String(routeId))}${onboardingActive ? "?onboarding=1" : ""}`,
                    );
                    rowClickTimerRef.current = null;
                  }, 180);
                }}
                className="w-full overflow-hidden rounded border p-3 text-left text-sm hover:bg-gray-50"
              >
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <div
                      className="font-medium truncate"
                      title={t("participants_panel.double_click_edit")}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        clearRowClickTimer();
                        setEditTarget(p);
                        setEditOpen(true);
                      }}
                    >
                      {p.name} {p.surname ?? ""}
                    </div>
                  </div>
                  {tierEnabled ? (
                    <div className="flex items-center justify-end">
                      <TierBadge tier={p.tier} />
                    </div>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PanelScrollArea>
      <EditParticipantDialog
        gridId={gridId}
        role={role}
        participant={editTarget}
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (!nextOpen) setEditTarget(null);
        }}
        onUpdated={load}
      />
    </PanelShell>
    </div>
  );
}
