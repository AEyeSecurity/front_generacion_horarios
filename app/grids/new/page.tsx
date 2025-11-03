// app/grids/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Grid = {
  id: number;
  name: string;
  description?: string;
  day_start: string; // "HH:MM"
  day_end: string; // "HH:MM"
  days_enabled: number[]; // [0..6]
  cell_size_min: number;
};

type TimeRange = {
  id: number;
  name: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
};

const DAY_OPTS = [
  { idx: 0, label: "Mon" },
  { idx: 1, label: "Tue" },
  { idx: 2, label: "Wed" },
  { idx: 3, label: "Thu" },
  { idx: 4, label: "Fri" },
  { idx: 5, label: "Sat" },
  { idx: 6, label: "Sun" },
];

// --- Helpers: time normalization and operations ---
function normalizeTime(t: string) {
  // "08:00:00" -> "08:00"; "8:5" -> "08:05"
  const [hRaw, mRaw] = t.split(":");
  const h = Math.max(0, Math.min(23, Number(hRaw || 0)));
  const m = Math.max(0, Math.min(59, Number(mRaw || 0)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function toMin(t: string) {
  const [h, m] = normalizeTime(t).split(":").map(Number);
  return h * 60 + m;
}
function fromMin(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function clamp(mins: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, mins));
}

export default function NewGridPage() {
  const router = useRouter();

  // Wizard step
  const [step, setStep] = useState<1 | 2>(1);

  // --- Step 1: Create Grid ---
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]); // Mon-Fri by default
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [cellMinutes, setCellMinutes] = useState(60); // default 60
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
    );
  }

  const isStep1Valid = (() => {
    const s = normalizeTime(start);
    const e = normalizeTime(end);
    const validTime = toMin(e) > toMin(s);
    const validCell = cellMinutes >= 30 && cellMinutes % 5 === 0;
    const hasName = name.trim().length > 0;
    const hasDays = days.length > 0;
    return validTime && validCell && hasName && hasDays && !loading;
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const s = normalizeTime(start);
    const e_ = normalizeTime(end);

    if (toMin(e_) <= toMin(s)) {
      setErr("End time must be after start time.");
      return;
    }
    if (cellMinutes < 30 || cellMinutes % 5 !== 0) {
      setErr("Cell size must be at least 30 and a multiple of 5.");
      return;
    }

    setLoading(true);
    const payload = {
      name,
      description: desc,
      day_start: s,
      day_end: e_,
      days_enabled: days,
      cell_size_min: cellMinutes,
    };

    const r = await fetch("/api/grids/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(typeof j === "object" ? JSON.stringify(j) : String(j));
      return;
    }

    const g: Grid = await r.json();
    // Normalize to HH:MM before storing
    g.day_start = normalizeTime(g.day_start);
    g.day_end = normalizeTime(g.day_end);
    setCreatedGrid(g);

    // Initialize step 2 inputs aligned to grid
    const startMin = toMin(g.day_start);
    const endMin = toMin(g.day_end);
    const firstEnd = clamp(startMin + 60, startMin + 5, endMin); // default 1h or what fits
    setTrName("");
    setTrStart(fromMin(startMin));
    setTrEnd(fromMin(firstEnd));

    setStep(2);
  }

  // --- Step 2: Time Ranges ---
  const [createdGrid, setCreatedGrid] = useState<Grid | null>(null);
  const [trs, setTrs] = useState<TimeRange[]>([]);
  const [trName, setTrName] = useState("");
  const [trStart, setTrStart] = useState("08:00");
  const [trEnd, setTrEnd] = useState("10:00");
  const [trBusy, setTrBusy] = useState(false);
  const [trErr, setTrErr] = useState<string | null>(null);

  const boundsHint = useMemo(() => {
    if (!createdGrid) return "";
    return `(${createdGrid.day_start} - ${createdGrid.day_end})`;
  }, [createdGrid]);

  function withinBounds(s: string, e: string) {
    if (!createdGrid) return false;
    const sMin = toMin(s);
    const eMin = toMin(e);
    const gSMin = toMin(createdGrid.day_start);
    const gEMin = toMin(createdGrid.day_end);
    // Inclusive bounds (may start at grid start and end at grid end)
    return sMin >= gSMin && eMin <= gEMin && eMin > sMin;
  }

  async function addTimeRange(e: React.FormEvent) {
    e.preventDefault();
    if (!createdGrid) return;
    setTrErr(null);

    const s = normalizeTime(trStart);
    const e_ = normalizeTime(trEnd);

    if (!withinBounds(s, e_)) {
      setTrErr(
        `The range must be within the grid schedule ${boundsHint} and End > Start.`
      );
      return;
    }

    setTrBusy(true);
    const r = await fetch("/api/time_ranges/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grid: createdGrid.id,
        name: trName.trim(),
        start_time: s,
        end_time: e_,
      }),
    });
    setTrBusy(false);

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setTrErr(typeof j === "object" ? JSON.stringify(j) : String(j));
      return;
    }

    const t: TimeRange = await r.json();
    // normalize just in case
    t.start_time = normalizeTime(t.start_time);
    t.end_time = normalizeTime(t.end_time);
    setTrs((prev) => [...prev, t]);

    // Smart reset: next 1h block from previous end, clamped to grid
    const gSMin = toMin(createdGrid.day_start);
    const gEMin = toMin(createdGrid.day_end);
    const nextStart = clamp(toMin(t.end_time), gSMin, gEMin);
    const nextEnd = clamp(nextStart + 60, gSMin + 5, gEMin);

    setTrName("");
    setTrStart(fromMin(nextStart));
    setTrEnd(fromMin(nextEnd));
  }

  function finishWizard() {
    if (!createdGrid) return;
    router.push(`/grids/${createdGrid.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 select-none">
        <div
          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
            step === 1 ? "bg-black text-white border-black" : "bg-white text-black"
          }`}
        >
          1
        </div>
        <div className="h-0.5 w-10 bg-gray-300" />
        <div
          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
            step === 2 ? "bg-black text-white border-black" : "bg-white text-black"
          }`}
        >
          2
        </div>
      </div>

      {step === 1 && (
        <div className="max-w-2xl bg-white border rounded p-6 space-y-5 mx-auto">
          <h1 className="text-xl font-semibold">Create New Grid</h1>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Name</label>
              <input
                className="border rounded w-full p-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Description</label>
              <input
                className="border rounded w-full p-2"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Days of the week</label>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTS.map((d) => (
                  <label
                    key={d.idx}
                    className={`cursor-pointer border rounded px-3 py-1 text-sm ${
                      days.includes(d.idx)
                        ? "bg-black text-white border-black"
                        : "bg-white text-gray-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={days.includes(d.idx)}
                      onChange={() => toggleDay(d.idx)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm">From</span>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(normalizeTime(e.target.value))}
                  className="border rounded p-1"
                />
                <span className="text-sm">To</span>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(normalizeTime(e.target.value))}
                  className="border rounded p-1"
                />
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <label className="text-sm">Cell size (min)</label>
                <input
                  type="number"
                  min={30}
                  step={5}
                  className="border rounded w-28 p-2"
                  value={cellMinutes}
                  onChange={(e) => setCellMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            {err && (
              <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>
            )}

            <button
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
              disabled={!isStep1Valid}
            >
              {loading ? "Saving..." : "Continue to Step 2"}
            </button>
          </form>
        </div>
      )}

      {step === 2 && createdGrid && (
        <div className="bg-white border rounded p-6 space-y-6">
          <h2 className="text-lg font-semibold">
            Step 2 — Add Time Ranges for “{createdGrid.name}”
          </h2>
          <p className="text-sm text-gray-600">
            Grid bounds: <b>{createdGrid.day_start}</b> to <b>{createdGrid.day_end}</b>
          </p>

          <form onSubmit={addTimeRange} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Name</label>
              <input
                className="border rounded w-full p-2"
                value={trName}
                onChange={(e) => setTrName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">From</label>
                <input
                  type="time"
                  className="border rounded w-full p-2 text-sm"
                  value={trStart}
                  onChange={(e) => setTrStart(normalizeTime(e.target.value))}
                  min={createdGrid.day_start}
                  max={createdGrid.day_end}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">To</label>
                <input
                  type="time"
                  className="border rounded w-full p-2 text-sm"
                  value={trEnd}
                  onChange={(e) => setTrEnd(normalizeTime(e.target.value))}
                  min={createdGrid.day_start}
                  max={createdGrid.day_end}
                  required
                />
              </div>
            </div>

            {trErr && (
              <div className="text-sm text-red-600 whitespace-pre-wrap">{trErr}</div>
            )}

            <Button type="submit" disabled={trBusy}>
              {trBusy ? "Adding..." : "Add Time Range"}
            </Button>
          </form>

          <div className="space-y-2">
            {trs.length === 0 ? (
              <p className="text-sm text-gray-500">No time ranges added yet.</p>
            ) : (
              <ul className="space-y-2">
                {trs.map((t) => (
                  <li key={t.id} className="border rounded p-2 text-sm">
                    {t.name} — {t.start_time} → {t.end_time}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={finishWizard}>Finish</Button>
          </div>
        </div>
      )}
    </div>
  );
}

