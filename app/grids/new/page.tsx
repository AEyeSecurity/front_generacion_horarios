// app/grids/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAY_OPTS = [
  { idx: 0, label: "Lun" },
  { idx: 1, label: "Mar" },
  { idx: 2, label: "Mié" },
  { idx: 3, label: "Jue" },
  { idx: 4, label: "Vie" },
  { idx: 5, label: "Sáb" },
  { idx: 6, label: "Dom" },
];

export default function NewGridPage() {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]); // Lun-Vie
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [cellMinutes, setCellMinutes] = useState(60);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function toggleDay(idx: number) {
    setDays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()));
  }
  const toHHMMSS = (s: string) => (s.length === 5 ? `${s}:00` : s);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const payload = {
      name,
      description: desc || "",
      day_start: toHHMMSS(start),
      day_end: toHHMMSS(end),
      days_enabled: days,          // ⬅️ números 0..6
      cell_size_min: Number(cellMinutes),
      // timezone opcional: envíalo si lo recolectás en el form
    };

    const res = await fetch("/api/grids", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.detail ? JSON.stringify(j.detail) : j?.error || `Failed (${res.status})`);
      return;
    }

    const created = await res.json(); // { id, ... }
    router.replace(`/grids/${created.id}`);
  }

  return (
    <div className="max-w-2xl bg-white border rounded p-6 space-y-5 mx-auto">
      <h1 className="text-xl font-semibold">Crear nueva cuadrícula</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Nombre</label>
          <input className="border rounded w-full p-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className="block text-sm mb-1">Descripción</label>
          <input className="border rounded w-full p-2" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm mb-1">Días de la semana</label>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTS.map((d) => (
              <label
                key={d.idx}
                className={`cursor-pointer border rounded px-3 py-1 text-sm ${
                  days.includes(d.idx) ? "bg-black text-white border-black" : "bg-white text-gray-700"
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
            <span className="text-sm">Desde</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded p-1" />
            <span className="text-sm">Hasta</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded p-1" />
          </div>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <label className="text-sm">Tamaño de celda (min)</label>
            <input
              type="number"
              min={5}
              step={5}
              className="border rounded w-28 p-2"
              value={cellMinutes}
              onChange={(e) => setCellMinutes(Number(e.target.value))}
            />
          </div>
        </div>

        {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

        <button className="px-4 py-2 rounded bg-black text-white" disabled={loading}>
          {loading ? "Creando..." : "Crear cuadrícula"}
        </button>
      </form>
    </div>
  );
}
