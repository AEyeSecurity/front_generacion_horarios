"use client";

import * as React from "react";
import { type Tier } from "@/components/badges/TierBadge";
import { readGridTierEnabled } from "@/lib/grid-tier";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/use-i18n";

export default function AddParticipantDialog({
  gridId,
  open,
  onOpenChange,
  onCreated,
  tiersEnabled,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  tiersEnabled?: boolean;
}) {
  const { t } = useI18n();
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("PRIMARY");
  const [tierEnabled, setTierEnabled] = React.useState(Boolean(tiersEnabled));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (tiersEnabled != null) {
      setTierEnabled(Boolean(tiersEnabled));
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/grids/${gridId}/`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!active) return;
        setTierEnabled(readGridTierEnabled(data, false));
      } catch {
        if (active) setTierEnabled(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [gridId, open, tiersEnabled]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/participants/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: first.trim(),
          surname: last.trim(),
          ...(tierEnabled ? { tier } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      setFirst("");
      setLast("");
      setTier("PRIMARY");
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      setErr(e.message || t("add_participant.failed_create"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[720px] p-0" data-onboarding-target="participant-dialog">
          <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>{t("add_participant.title")}</DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="contents">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className={`grid grid-cols-1 gap-3 ${tierEnabled ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px]" : "sm:grid-cols-2"}`}>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.first_name_required")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.last_name")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                />
              </div>
              {tierEnabled ? (
                <div>
                  <label className="block text-sm mb-1">{t("add_participant.tier_required")}</label>
                  <select
                    className="h-[42px] w-full rounded border bg-white px-2 py-2 text-sm"
                    value={tier}
                    onChange={(event) => setTier(event.target.value as Tier)}
                    aria-label={t("add_participant.select_tier")}
                  >
                    <option value="PRIMARY">{t("tier.primary")}</option>
                    <option value="SECONDARY">{t("tier.secondary")}</option>
                    <option value="TERTIARY">{t("tier.tertiary")}</option>
                  </select>
                </div>
              ) : null}
            </div>

            {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}
            </div>

            <DialogFooter className="shrink-0 items-center justify-between gap-3 border-t px-6 py-4 sm:justify-between">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
                  {t("common.cancel")}
                </button>
              </DialogClose>
              <button
                type="submit"
                className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? t("add_participant.adding") : t("common.add")}
              </button>
            </DialogFooter>
          </form>
          </div>
        </DialogContent>
    </Dialog>
  );
}
