"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

type Category = { id: number; name: string; parent: number | null };

export default function CategoriesPanel({
  gridId,
  onParents,
  refreshKey = 0,
}: {
  gridId: number;
  onParents?: (parents: { id: number; name: string }[]) => void;
  refreshKey?: number;
}) {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Category | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const CategoryDialog = dynamic(() => import("../dialogs/CategoryDialog"), { ssr: false });

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

  useEffect(() => { load(); }, [gridId, refreshKey]);

  const filtered = useMemo(
    () => list.filter(c => c.name.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );
  const parentNameById = useMemo(
    () =>
      list.reduce<Record<number, string>>((acc, item) => {
        acc[item.id] = item.name;
        return acc;
      }, {}),
    [list]
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
              <li key={c.id}>
                <button
                  className="w-full text-left border rounded p-2 text-sm hover:bg-gray-50"
                  onClick={() => { setSelected(c); setShowDialog(true); }}
                >
                  <div className="font-medium">{c.name}</div>
                  {c.parent !== null && (
                    <div className="text-xs text-gray-500">Parent: {parentNameById[c.parent] ?? c.parent}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Category details dialog */}
      <CategoryDialog
        category={selected}
        open={showDialog}
        onOpenChange={setShowDialog}
        onDeleted={() => { setShowDialog(false); setSelected(null); /* refresh */ (async () => await load())(); }}
      />
    </div>
  );
}
