"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/use-i18n";

type TimeRange = { id: number; name: string; start_time: string; end_time: string };

function norm(t: string) {
  const [h, m] = String(t || "").split(":");
  return `${String(h ?? "00").padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
}

export default function EditTimeRangeDialog({
  open,
  onOpenChange,
  value,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: TimeRange | null;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState("");
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("17:00");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (value) {
      setName(value.name || "");
      setStart(norm(value.start_time));
      setEnd(norm(value.end_time));
    }
  }, [value]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/time_ranges/${value.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, start_time: norm(start), end_time: norm(end) }),
      });
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      setErr(e?.message || t("edit_time_range.failed_update"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[560px] p-0">
          <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>{t("edit_time_range.title")}</DialogTitle>
            <DialogDescription>{t("edit_time_range.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="contents">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <input className="col-span-6 border rounded px-3 py-2 text-sm" placeholder={t("common.name")} value={name} onChange={(e)=>setName(e.target.value)} />
              <input className="col-span-3 border rounded px-3 py-2 text-sm" type="time" value={start} onChange={(e)=>setStart(e.target.value)} />
              <input className="col-span-3 border rounded px-3 py-2 text-sm" type="time" value={end} onChange={(e)=>setEnd(e.target.value)} />
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            </div>
            <DialogFooter className="shrink-0 items-center justify-between gap-3 border-t px-6 py-4 sm:justify-between">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm hover:bg-gray-50">{t("common.cancel")}</button>
              </DialogClose>
              <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </DialogFooter>
          </form>
          </div>
        </DialogContent>
    </Dialog>
  );
}
