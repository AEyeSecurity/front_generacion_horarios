// app/grid/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Grid = {
  id: number;
  grid_code?: string | null;
  name: string;
  description?: string;
  day_start: string; // "HH:MM"
  day_end: string; // "HH:MM"
  days_enabled: number[]; // [0..6]
  cell_size_min: number;
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

function normalizeTime(t: string) {
  const [hRaw, mRaw] = t.split(":");
  const h = Math.max(0, Math.min(23, Number(hRaw || 0)));
  const m = Math.max(0, Math.min(59, Number(mRaw || 0)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMin(t: string) {
  const [h, m] = normalizeTime(t).split(":").map(Number);
  return h * 60 + m;
}

export default function NewGridPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [cellMinutes, setCellMinutes] = useState(60);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
    );
  }

  const isFormValid = (() => {
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
    router.push(`/grid/${encodeURIComponent(g.grid_code || String(g.id))}`);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
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
            disabled={!isFormValid}
          >
            {loading ? "Creating..." : "Create Grid"}
          </button>
        </form>
      </div>
    </div>
  );
}
