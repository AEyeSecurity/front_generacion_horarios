"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { TierBadge, type Tier } from "@/components/badges/TierBadge";
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

type HoursWeekMode = "default" | "custom" | "not_available";

export default function AddParticipantDialog({
  gridId,
  open,
  onOpenChange,
  onCreated,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const { t } = useI18n();
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("PRIMARY");
  const [hoursWeekMode, setHoursWeekMode] = React.useState<HoursWeekMode>("default");
  const [minHoursOverride, setMinHoursOverride] = React.useState("");
  const [maxHoursOverride, setMaxHoursOverride] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const parseOptionalOverride = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
        return parsed;
      };

      const parsedMin = parseOptionalOverride(minHoursOverride);
      const parsedMax = parseOptionalOverride(maxHoursOverride);
      if (Number.isNaN(parsedMin) || Number.isNaN(parsedMax)) {
        throw new Error(t("add_participant.invalid_hours_override"));
      }
      if (hoursWeekMode === "custom" && parsedMin == null && parsedMax == null) {
        throw new Error(t("add_participant.custom_requires_override"));
      }
      if (
        hoursWeekMode === "custom" &&
        parsedMin != null &&
        parsedMax != null &&
        parsedMin > parsedMax
      ) {
        throw new Error(t("add_participant.min_cannot_exceed_max"));
      }

      let minHoursWeekOverride: number | null = null;
      let maxHoursWeekOverride: number | null = null;
      if (hoursWeekMode === "custom") {
        minHoursWeekOverride = parsedMin;
        maxHoursWeekOverride = parsedMax;
      } else if (hoursWeekMode === "not_available") {
        minHoursWeekOverride = 0;
        maxHoursWeekOverride = 0;
      }

      const res = await fetch(`/api/participants/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: first.trim(),
          surname: last.trim(),
          tier,
          hours_week_mode: hoursWeekMode,
          min_hours_week_override: minHoursWeekOverride,
          max_hours_week_override: maxHoursWeekOverride,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      setFirst("");
      setLast("");
      setTier("PRIMARY");
      setHoursWeekMode("default");
      setMinHoursOverride("");
      setMaxHoursOverride("");
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
      <DialogPortal>
        {/* Overlay por encima del panel lateral */}
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[180] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogContent className="sm:max-w-[720px] z-[181]">
          <DialogHeader>
            <DialogTitle>{t("add_participant.title")}</DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px] gap-3">
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">{t("add_participant.weekly_mode")}</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={hoursWeekMode}
                  onChange={(event) => setHoursWeekMode(event.target.value as HoursWeekMode)}
                >
                  <option value="default">{t("add_participant.weekly_mode_default")}</option>
                  <option value="custom">{t("add_participant.weekly_mode_custom")}</option>
                  <option value="not_available">{t("add_participant.weekly_mode_not_available")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.min_hours_override")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  type="number"
                  min={0}
                  step={1}
                  value={minHoursOverride}
                  disabled={hoursWeekMode !== "custom"}
                  onChange={(event) => setMinHoursOverride(event.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("add_participant.max_hours_override")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  type="number"
                  min={0}
                  step={1}
                  value={maxHoursOverride}
                  disabled={hoursWeekMode !== "custom"}
                  onChange={(event) => setMaxHoursOverride(event.target.value)}
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
                {saving ? t("add_participant.adding") : t("common.add")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

