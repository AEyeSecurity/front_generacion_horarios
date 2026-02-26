"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Props = {
  participantId: number;
  gridStart: string; // "HH:MM"
  gridEnd: string;   // "HH:MM"
  allowedDays?: number[]; // restrict selectable days (0..6)
  minMinutes?: number;    // minimum block length (>= grid.cell_size_min)
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
};

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

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export default function AddAvailabilityRuleDialog({
  participantId,
  gridStart,
  gridEnd,
  allowedDays,
  minMinutes,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [preference, setPreference] = useState<(typeof PREFS)[number]["value"]>("preferred");
  const [day, setDay] = useState<number>(0);
  const [start, setStart] = useState(gridStart);
  const [end, setEnd] = useState(gridEnd);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validate = () => {
    const gs = toMin(gridStart);
    const ge = toMin(gridEnd);
    const s = toMin(start);
    const e = toMin(end);
    if (s >= e) return "End time must be greater than start time.";
    if (typeof minMinutes === "number" && e - s < minMinutes) {
      return `Duration must be at least ${minMinutes} minutes.`;
    }
    if (s < gs || e > ge) return `Rule must be within grid bounds (${gridStart}–${gridEnd}).`;
    if (allowedDays && !allowedDays.includes(day)) return "Selected day is not enabled in this grid.";
    return null;
  };

  async function submit() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null); setLoading(true);
    try {
      const res = await fetch("/api/availability_rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          participant: participantId,
          day_of_week: day,
          start_time: start, // HH:MM
          end_time: end,
          preference,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast("Availability rule created");
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      setErr(e?.message || "Error creating rule");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Availability Rule</DialogTitle>
          <DialogDescription>Use Preferred or Impossible. Unspecified slots are treated as Flexible.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Availability type</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={preference}
              onChange={(e) => setPreference(e.target.value as any)}
            >
              {PREFS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Day of week</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {(allowedDays ? DAYS.filter(d => allowedDays.includes(d.value)) : DAYS)
                .map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Start time</label>
            <input type="time" className="border rounded px-3 py-2 w-full" step={(minMinutes ?? 5) * 60}
                   value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">End time</label>
            <input type="time" className="border rounded px-3 py-2 w-full" step={(minMinutes ?? 5) * 60}
                   value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

        <DialogFooter className="gap-2">
          <button type="button" className="px-3 py-2 rounded border text-sm"
                  onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="px-3 py-2 rounded bg-black text-white text-sm"
                  onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Add"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
