"use client";

import * as React from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { TierBadge, type Tier } from "@/components/badges/TierBadge";
import { readGridTierEnabled } from "@/lib/grid-tier";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/use-i18n";
import type { Role } from "@/lib/types";

type Participant = {
  id: number;
  name: string;
  surname?: string | null;
  tier?: Tier | null;
  min_hours_week_override?: number | null;
  max_hours_week_override?: number | null;
};

function parseNullableNumber(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  return parsed;
}

function parseLinkedPlacements(raw: unknown, participantId: string): number {
  const source = (raw ?? {}) as Record<string, unknown>;
  const scheduleCandidate =
    source?.schedule ?? source?.published_schedule ?? source?.latest ?? source;
  const placements = Array.isArray((scheduleCandidate as any)?.placements)
    ? (scheduleCandidate as any).placements
    : Array.isArray((scheduleCandidate as any)?.schedule)
    ? (scheduleCandidate as any).schedule
    : [];
  return placements.filter((placement: any) =>
    (Array.isArray(placement?.assigned_participants) ? placement.assigned_participants : [])
      .map(String)
      .includes(participantId),
  ).length;
}

export default function EditParticipantDialog({
  gridId,
  role,
  participant,
  open,
  onOpenChange,
  onUpdated,
}: {
  gridId: number;
  role: Role;
  participant: Participant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const isSupervisor = role === "supervisor";
  const [tierEnabled, setTierEnabled] = React.useState(true);
  const [name, setName] = React.useState("");
  const [surname, setSurname] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("PRIMARY");
  const [minHours, setMinHours] = React.useState("");
  const [maxHours, setMaxHours] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [loadingLinks, setLoadingLinks] = React.useState(false);
  const [linkedPlacementsCount, setLinkedPlacementsCount] = React.useState(0);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !participant) return;
    setErr(null);
    setName(participant.name ?? "");
    setSurname(participant.surname ?? "");
    setTier(participant.tier === "SECONDARY" || participant.tier === "TERTIARY" ? participant.tier : "PRIMARY");
    setMinHours(
      typeof participant.min_hours_week_override === "number" && Number.isFinite(participant.min_hours_week_override)
        ? String(participant.min_hours_week_override)
        : "",
    );
    setMaxHours(
      typeof participant.max_hours_week_override === "number" && Number.isFinite(participant.max_hours_week_override)
        ? String(participant.max_hours_week_override)
        : "",
    );
  }, [open, participant]);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/grids/${gridId}/`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json().catch(() => null);
        if (!active) return;
        setTierEnabled(readGridTierEnabled(data, true));
      } catch {
        if (active) setTierEnabled(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [gridId, open]);

  React.useEffect(() => {
    if (!open || !participant) return;
    let active = true;
    setLoadingLinks(true);
    setLinkedPlacementsCount(0);
    (async () => {
      try {
        const participantId = String(participant.id);
        const endpoints = [
          `/api/grids/${gridId}/schedule/`,
          `/api/grids/${gridId}/schedule`,
          `/api/grids/${gridId}/published-schedule/`,
          `/api/grids/${gridId}/published-schedule`,
        ];
        let total = 0;
        for (const endpoint of endpoints) {
          const res = await fetch(endpoint, { cache: "no-store" }).catch(() => null);
          if (!res || !res.ok) continue;
          const payload = await res.json().catch(() => null);
          total += parseLinkedPlacements(payload, participantId);
        }
        if (active) setLinkedPlacementsCount(total);
      } catch {
        if (active) setLinkedPlacementsCount(0);
      } finally {
        if (active) setLoadingLinks(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [gridId, open, participant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!participant) return;
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }

    const minParsed = parseNullableNumber(minHours);
    const maxParsed = parseNullableNumber(maxHours);
    if (minParsed === "invalid" || maxParsed === "invalid") {
      setErr("Min/Max hours must be valid non-negative numbers.");
      return;
    }
    if (minParsed != null && maxParsed != null && minParsed > maxParsed) {
      setErr("Min weekly override cannot be greater than max weekly override.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        surname: surname.trim(),
        min_hours_week_override: minParsed,
        max_hours_week_override: maxParsed,
      };
      if (tierEnabled && isSupervisor) {
        payload.tier = tier;
      }

      const res = await fetch(`/api/participants/${encodeURIComponent(String(participant.id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let parsed: unknown = txt;
        try {
          parsed = JSON.parse(txt);
        } catch {}
        throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
      }

      onUpdated?.();
      onOpenChange(false);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[180] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogContent className="sm:max-w-[720px] z-[181]">
          <DialogHeader>
            <DialogTitle>Edit participant</DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {linkedPlacementsCount > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">This participant is linked to schedule placements.</div>
                    <div>
                      {`Linked placements detected: ${linkedPlacementsCount}. Changes here can affect the same scheduling constraints shown when deleting participants.`}
                    </div>
                  </div>
                </div>
              </div>
            ) : loadingLinks ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {t("common.loading") || "Loading..."}
              </div>
            ) : null}

            <div className={`grid grid-cols-1 gap-3 ${tierEnabled && isSupervisor ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px]" : "sm:grid-cols-2"}`}>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.first_name_required")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.last_name")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                />
              </div>

              {tierEnabled && isSupervisor ? (
                <div>
                  <label className="block text-sm mb-1">{t("add_participant.tier_required")}</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-[42px] w-full min-w-0 items-center justify-center gap-1 overflow-hidden rounded border bg-white px-2 py-2"
                        aria-label={t("add_participant.select_tier")}
                      >
                        <span className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
                          <TierBadge tier={tier} compact />
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="z-[190] min-w-[8rem]">
                      <DropdownMenuItem onClick={() => setTier("PRIMARY")} className="justify-center">
                        <TierBadge tier="PRIMARY" compact />
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTier("SECONDARY")} className="justify-center">
                        <TierBadge tier="SECONDARY" compact />
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTier("TERTIARY")} className="justify-center">
                        <TierBadge tier="TERTIARY" compact />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm mb-1">{t("add_participant.min_hours_override") || "Min weekly (override)"}</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={minHours}
                  onChange={(e) => setMinHours(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.max_hours_override") || "Max weekly (override)"}</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={maxHours}
                  onChange={(e) => setMaxHours(e.target.value)}
                />
              </div>
            </div>

            {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm">
                  {t("common.cancel")}
                </button>
              </DialogClose>
              <button
                type="submit"
                className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? (t("common.saving") || "Saving...") : (t("common.save") || "Save")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
