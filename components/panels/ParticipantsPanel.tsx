"use client";

import { useEffect, useMemo, useState } from "react";

type Participant = { id: number; name: string; surname: string };

export default function ParticipantsPanel({ gridId }: { gridId: number }) {
  const [list, setList] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.results ?? [];
      setList(items);
    } catch (e: any) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [gridId]);

  const filtered = useMemo(
    () => list.filter(p => `${p.name} ${p.surname ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );

  return (
    <div className="flex flex-col h-full space-y-3">
      <h2 className="text-lg font-semibold">Participants</h2>

      <input
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder="Search..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Box principal que ocupa todo el espacio libre */}
      <div className="flex-1 border rounded bg-white p-2 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-gray-500 p-3">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-500 p-3">No participants found</div>
        ) : (
          <ul className="grid gap-2">
            {filtered.map((p) => (
              <li key={p.id} className="border rounded p-2 text-sm hover:bg-gray-50">
                <div className="font-medium">{p.name} {p.surname}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
