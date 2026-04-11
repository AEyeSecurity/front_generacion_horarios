"use client";

import { useEffect, useState } from "react";
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
  initialDay?: number;
  initialStart?: string;
  initialEnd?: string;
  initialPreference?: "preferred" | "impossible";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
};

const PREFS = [
  { value: "preferred", label: "Preferred" },
  { value: "impossible", label: "Impossible" },
] as const;
type PreferenceValue = (typeof PREFS)[number]["value"];

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

function toHHMM(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function overlapsOrTouches(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart <= bEnd && bStart <= aEnd;
}

type ExistingRule = {
  id: number;
  day: number;
  preference: PreferenceValue;
  startMin: number;
  endMin: number;
  startHHMM: string;
  endHHMM: string;
};

type AvailabilityRuleRecord = {
  id: number;
  day_of_week: number;
  preference: string;
  start_time: string;
  end_time: string;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeAvailabilityRuleRecord = (value: unknown): AvailabilityRuleRecord | null => {
  const raw = asObject(value);
  if (!raw) return null;
  const id = Number(raw.id);
  const dayOfWeek = Number(raw.day_of_week);
  const preference = String(raw.preference ?? "");
  const startTime = String(raw.start_time ?? "");
  const endTime = String(raw.end_time ?? "");
  if (!Number.isFinite(id) || !Number.isFinite(dayOfWeek)) return null;
  if (!startTime || !endTime) return null;
  return {
    id,
    day_of_week: dayOfWeek,
    preference,
    start_time: startTime,
    end_time: endTime,
  };
};

const normalizeAvailabilityRulesResponse = (value: unknown): AvailabilityRuleRecord[] => {
  const raw = asObject(value);
  const list = Array.isArray(value)
    ? value
    : raw && Array.isArray(raw.results)
      ? raw.results
      : [];
  return list
    .map((item) => normalizeAvailabilityRuleRecord(item))
    .filter((rule): rule is AvailabilityRuleRecord => Boolean(rule));
};

const collectErrorMessages = (value: unknown): string[] => {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectErrorMessages(item));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectErrorMessages(item));
  }
  return [String(value)];
};

const toFriendlyRuleError = (raw: unknown, fallback: string): string => {
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
    return "This rule overlaps another rule on the same day. Try moving or resizing it.";
  }
  if (normalized.includes("end") && normalized.includes("start")) {
    return "End time must be later than start time.";
  }
  if (normalized.includes("grid bounds") || normalized.includes("within grid bounds")) {
    return "The rule must stay inside the grid time range.";
  }
  if (normalized.includes("required")) {
    return "Please complete all required rule fields.";
  }
  return message;
};

export default function AddAvailabilityRuleDialog({
  participantId,
  gridStart,
  gridEnd,
  allowedDays,
  minMinutes,
  initialDay,
  initialStart,
  initialEnd,
  initialPreference,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const initialAllowedDay = allowedDays?.[0] ?? 0;
  const [preference, setPreference] = useState<PreferenceValue>(initialPreference ?? "preferred");
  const [day, setDay] = useState<number>(typeof initialDay === "number" ? initialDay : initialAllowedDay);
  const [start, setStart] = useState(initialStart ?? gridStart);
  const [end, setEnd] = useState(initialEnd ?? gridEnd);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(false);
    setPreference(initialPreference ?? "preferred");
    setDay(typeof initialDay === "number" ? initialDay : initialAllowedDay);
    setStart(initialStart ?? gridStart);
    setEnd(initialEnd ?? gridEnd);
  }, [
    open,
    initialPreference,
    initialDay,
    initialAllowedDay,
    initialStart,
    initialEnd,
    gridStart,
    gridEnd,
  ]);

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
    if (v) {
      toast.error(v);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        participant: participantId,
        day_of_week: day,
        start_time: start, // HH:MM
        end_time: end,
        preference,
      };
      const res = await fetch("/api/availability_rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const rawError = await res.text().catch(() => "");
        if (res.status !== 400) {
          throw new Error(toFriendlyRuleError(rawError || `Error creating rule (${res.status})`, "Could not create rule."));
        }

        const rulesRes = await fetch(`/api/availability_rules?participant=${participantId}`, { cache: "no-store" });
        if (!rulesRes.ok) throw new Error(rawError || `Error creating rule (${res.status})`);
        const rulesData = await rulesRes.json().catch(() => null);
        const rulesList = normalizeAvailabilityRulesResponse(rulesData);

        const existingRules: ExistingRule[] = rulesList
          .map((rule): ExistingRule | null => {
            const id = rule.id;
            const ruleDay = rule.day_of_week;
            const rulePreference = rule.preference.toLowerCase();
            const startHHMM = rule.start_time.slice(0, 5);
            const endHHMM = rule.end_time.slice(0, 5);
            const startMin = toMin(startHHMM);
            const endMin = toMin(endHHMM);
            if (!Number.isFinite(id) || !Number.isFinite(ruleDay)) return null;
            if (rulePreference !== "preferred" && rulePreference !== "impossible") return null;
            if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return null;
            return {
              id,
              day: ruleDay,
              preference: rulePreference,
              startMin,
              endMin,
              startHHMM,
              endHHMM,
            } satisfies ExistingRule;
          })
          .filter((rule: ExistingRule | null): rule is ExistingRule => Boolean(rule))
          .filter((rule: ExistingRule) => rule.day === day && rule.preference === preference);

        let mergedStart = toMin(start);
        let mergedEnd = toMin(end);
        const toMerge = new Map<number, ExistingRule>();
        let changed = true;
        while (changed) {
          changed = false;
          for (const rule of existingRules) {
            if (toMerge.has(rule.id)) continue;
            if (!overlapsOrTouches(mergedStart, mergedEnd, rule.startMin, rule.endMin)) continue;
            toMerge.set(rule.id, rule);
            mergedStart = Math.min(mergedStart, rule.startMin);
            mergedEnd = Math.max(mergedEnd, rule.endMin);
            changed = true;
          }
        }

        if (toMerge.size === 0) {
          throw new Error(toFriendlyRuleError(rawError || "Could not create rule.", "Could not create rule."));
        }

        const sortedToMerge = [...toMerge.values()].sort(
          (a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.id - b.id,
        );
        const keep = sortedToMerge[0];
        const redundant = sortedToMerge.slice(1);
        const targetStart = toHHMM(mergedStart);
        const targetEnd = toHHMM(mergedEnd);

        const deleteRule = async (id: number) => {
          const deleteRes = await fetch(`/api/availability_rules/${id}`, { method: "DELETE" });
          return deleteRes.ok || deleteRes.status === 204;
        };
        const recreateRule = async (rule: ExistingRule) => {
          await fetch("/api/availability_rules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              participant: participantId,
              day_of_week: rule.day,
              start_time: rule.startHHMM,
              end_time: rule.endHHMM,
              preference: rule.preference,
            }),
          });
        };

        const requiresPatch = keep.startHHMM !== targetStart || keep.endHHMM !== targetEnd;
        let mergedOk = false;

        if (requiresPatch) {
          const patchBeforeDelete = await fetch(`/api/availability_rules/${keep.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              start_time: targetStart,
              end_time: targetEnd,
            }),
          });
          if (patchBeforeDelete.ok) {
            for (const rule of redundant) await deleteRule(rule.id);
            mergedOk = true;
          }
        }

        if (!mergedOk) {
          const deletedRules: ExistingRule[] = [];
          let deletedAll = true;
          for (const rule of redundant) {
            const deleted = await deleteRule(rule.id);
            if (deleted) {
              deletedRules.push(rule);
            } else {
              deletedAll = false;
              break;
            }
          }

          if (!deletedAll) {
            for (const deletedRule of deletedRules) await recreateRule(deletedRule);
            throw new Error(toFriendlyRuleError(rawError || "Could not merge with adjacent rule.", "Could not merge with adjacent rule."));
          }

          if (requiresPatch) {
            const patchAfterDelete = await fetch(`/api/availability_rules/${keep.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                start_time: targetStart,
                end_time: targetEnd,
              }),
            });
            if (!patchAfterDelete.ok) {
              for (const deletedRule of deletedRules) await recreateRule(deletedRule);
              throw new Error(toFriendlyRuleError(rawError || "Could not merge with adjacent rule.", "Could not merge with adjacent rule."));
            }
          }

          mergedOk = true;
        }

        if (!mergedOk) {
          throw new Error(toFriendlyRuleError(rawError || "Could not create rule.", "Could not create rule."));
        }
      }
      toast("Availability rule created");
      onOpenChange(false);
      onCreated?.();
    } catch (e: unknown) {
      toast.error(toFriendlyRuleError(e instanceof Error ? e.message : "", "Error creating rule"));
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
              onChange={(e) => setPreference(e.target.value as PreferenceValue)}
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
