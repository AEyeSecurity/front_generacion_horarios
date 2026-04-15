"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/use-i18n";
import type { I18nKey } from "@/lib/i18n";

const PREFS = ["preferred", "impossible"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const collectErrorMessages = (value: unknown): string[] => {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectErrorMessages(item));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectErrorMessages(item));
  }
  return [String(value)];
};

const getFriendlyRuleError = (error: unknown, fallback: string, translateFn?: (key: I18nKey) => string) => {
  const raw = error instanceof Error ? error.message : "";
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return fallback;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  const message = collectErrorMessages(parsed)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  if (!message) return fallback;
  const normalized = message.toLowerCase();
  if (normalized.includes("overlapping availability rule already exists")) {
    return translateFn?.("availability_rule.overlap_message") ?? fallback;
  }
  if (normalized.includes("end") && normalized.includes("start")) {
    return translateFn?.("availability_rule.end_must_be_later_than_start") ?? fallback;
  }
  if (normalized.includes("grid bounds") || normalized.includes("within grid bounds")) {
    return translateFn?.("availability_rule.within_grid_range_message") ?? fallback;
  }
  if (normalized.includes("required")) {
    return translateFn?.("availability_rule.required_fields_message") ?? fallback;
  }
  return message;
};

export default function EditRuleDialog({
  ruleId,
  open,
  onOpenChange,
  onSaved,
}: {
  ruleId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [preference, setPreference] = React.useState<(typeof PREFS)[number]>("preferred");
  const [day, setDay] = React.useState<number>(0);
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("09:00");

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/availability_rules/${ruleId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        const data = await r.json();
        setPreference(data.preference);
        setDay(Number(data.day_of_week));
        setStart(String(data.start_time).slice(0, 5));
        setEnd(String(data.end_time).slice(0, 5));
      } catch (e: unknown) {
        toast.error(getFriendlyRuleError(e, t("edit_rule.failed_load_rule"), t));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, ruleId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/availability_rules/${ruleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preference,
          day_of_week: day,
          start_time: start,
          end_time: end,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to update rule (${res.status})`);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(getFriendlyRuleError(e, t("edit_rule.failed_update_rule"), t));
    } finally {
      setSaving(false);
    }
  }

  async function removeRule() {
    if (saving) return;
    if (!window.confirm(t("edit_rule.confirm_delete_rule"))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/availability_rules/${ruleId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to delete rule (${res.status})`);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(getFriendlyRuleError(e, t("edit_rule.failed_delete_rule"), t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95]" />
        <DialogContent className="sm:max-w-[560px] z-[96]">
          <DialogHeader>
            <DialogTitle>{t("edit_rule.title")}</DialogTitle>
            <DialogDescription>{t("edit_rule.description")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{t("add_rule.availability_type")}</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={preference}
                  onChange={(e) => setPreference(e.target.value as (typeof PREFS)[number])}
                  disabled={loading}
                >
                  {PREFS.map((pref) => (
                    <option key={pref} value={pref}>
                      {pref === "preferred" ? t("availability_rule.preferred") : t("availability_rule.impossible")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">{t("add_rule.day_of_week")}</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  disabled={loading}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0
                        ? t("day.mon_short")
                        : d === 1
                          ? t("day.tue_short")
                          : d === 2
                            ? t("day.wed_short")
                            : d === 3
                              ? t("day.thu_short")
                              : d === 4
                                ? t("day.fri_short")
                                : d === 5
                                  ? t("day.sat_short")
                                  : t("day.sun_short")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">{t("add_rule.start_time")}</label>
                <input type="time" className="border rounded px-3 py-2 w-full" value={start} onChange={(e) => setStart(e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("add_rule.end_time")}</label>
                <input type="time" className="border rounded px-3 py-2 w-full" value={end} onChange={(e) => setEnd(e.target.value)} disabled={loading} />
              </div>
            </div>

            <DialogFooter className="mt-2 !flex-row items-center !justify-between">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => void removeRule()}
                aria-label={t("edit_rule.delete_rule")}
                title={t("edit_rule.delete_rule")}
                disabled={saving || loading}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <DialogClose asChild>
                  <button type="button" className="px-3 py-2 rounded border text-sm" disabled={saving}>
                    {t("common.cancel")}
                  </button>
                </DialogClose>
                <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || loading}>
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
