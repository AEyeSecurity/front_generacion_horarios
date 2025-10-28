"use client";

import { useEffect, useMemo, useState } from "react";

type Category = { id: number; name: string; parent: number | null };

export default function CategoriesPanel({
  gridId,
  onParents,
}: {
  gridId: number;
  onParents?: (parents: { id: number; name: string }[]) => void;
}) {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/categories?grid=${gridId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.results ?? [];
      setList(items);
      onParents?.(items.map((c: Category) => ({ id: c.id, name: c.name })));
    } catch (e: any) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [gridId]);

  const filtered = useMemo(
    () => list.filter(c => c.name.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );

  return (
    <div className="flex flex-col h-full space-y-3">
      <h2 className="text-lg font-semibold">Categories</h2>

      <input
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder="Search..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Box principal igual que en Participants */}
      <div className="flex-1 border rounded bg-white p-2 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-gray-500 p-3">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-500 p-3">No categories found</div>
        ) : (
          <ul className="grid gap-2">
            {filtered.map((c) => (
              <li key={c.id} className="border rounded p-2 text-sm hover:bg-gray-50">
                <div className="font-medium">{c.name}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
