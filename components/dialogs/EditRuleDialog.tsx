"use client";

import * as React from "react";
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

const PREFS = [
  { value: "preferred", label: "Preferred" },
  { value: "impossible", label: "Impossible" },
] as const;

const DAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

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
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [preference, setPreference] = React.useState<typeof PREFS[number]["value"]>("preferred");
  const [day, setDay] = React.useState<number>(0);
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("09:00");

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
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
      } catch (e: any) {
        setErr(e?.message || "Failed to load rule");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, ruleId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
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
      if (!res.ok) throw new Error(await res.text());
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to update rule");
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
            <DialogTitle>Edit Availability Rule</DialogTitle>
            <DialogDescription>Update the rule details.</DialogDescription>
          </DialogHeader>

          {err && <div className="text-sm text-red-600 mb-2 whitespace-pre-wrap">{err}</div>}

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Availability type</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={preference}
                  onChange={(e) => setPreference(e.target.value as any)}
                  disabled={loading}
                >
                  {PREFS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Day of week</label>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  disabled={loading}
                >
                  {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Start time</label>
                <input type="time" className="border rounded px-3 py-2 w-full" value={start} onChange={(e) => setStart(e.target.value)} disabled={loading} />
              </div>
              <div>
                <label className="text-sm font-medium">End time</label>
                <input type="time" className="border rounded px-3 py-2 w-full" value={end} onChange={(e) => setEnd(e.target.value)} disabled={loading} />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm" disabled={saving}>
                  Cancel
                </button>
              </DialogClose>
              <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || loading}>
                {saving ? "Saving…" : "Save"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

