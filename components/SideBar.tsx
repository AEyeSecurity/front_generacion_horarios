"use client";

import { useEffect, useMemo, useState } from "react";
import AddParticipantDialog from "./AddParticipantDialog";
import AddCategoryDialog from "./AddCategoryDialog";

type Participant = { id: number; grid: number; name: string; surname: string };
type Category = { id: number; grid: number; name: string; parent: number | null };

export default function SideBar({ gridId }: { gridId: number }) {
  const [tab, setTab] = useState<"people" | "categories">("people");
  const [query, setQuery] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showPerson, setShowPerson] = useState(false);
  const [showCategory, setShowCategory] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
        fetch(`/api/categories?grid=${gridId}`, { cache: "no-store" }),
      ]);
      const p = pRes.ok ? await pRes.json() : [];
      const c = cRes.ok ? await cRes.json() : [];
      setParticipants(Array.isArray(p) ? p : p.results ?? []);
      setCategories(Array.isArray(c) ? c : c.results ?? []);
    } catch (e: any) {
      setError(e?.message || "Error loading data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [gridId]);

  const filteredParticipants = useMemo(
    () => participants.filter((p) => (`${p.name} ${p.surname ?? ""}`).toLowerCase().includes(query.toLowerCase())),
    [participants, query]
  );
  const filteredCategories = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [categories, query]
  );

  return (
    <aside className="w-full md:w-[320px] border-r bg-white flex flex-col">
      {/* Tabs */}
      <div className="p-3 border-b flex gap-2">
        <button onClick={() => setTab("people")} className={`px-3 py-1.5 rounded-full text-sm border ${tab === "people" ? "bg-black text-white border-black" : ""}`}>People</button>
        <button onClick={() => setTab("categories")} className={`px-3 py-1.5 rounded-full text-sm border ${tab === "categories" ? "bg-black text-white border-black" : ""}`}>Categories</button>
      </div>

      {/* Search */}
      <div className="p-3">
        <input placeholder="Search..." className="w-full border rounded px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {/* Lists */}
      <div className="px-3 pb-3 flex-1 overflow-y-auto">
        {error && <div className="text-sm text-red-600">{error}</div>}
        {loading ? (
          <div className="text-sm text-gray-500 p-4">Loading…</div>
        ) : tab === "people" ? (
          filteredParticipants.length === 0 ? (
            <div className="text-sm text-gray-500 p-4">No participants found</div>
          ) : (
            <ul className="space-y-2">
              {filteredParticipants.map((p) => (
                <li key={p.id} className="border rounded p-2 text-sm bg-white">
                  {p.name} {p.surname || ""}
                </li>
              ))}
            </ul>
          )
        ) : filteredCategories.length === 0 ? (
          <div className="text-sm text-gray-500 p-4">No categories found</div>
        ) : (
          <ul className="space-y-2">
            {filteredCategories.map((c) => (
              <li key={c.id} className="border rounded p-2 text-sm bg-white">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions: open large dialogs */}
      <div className="p-3 border-t space-y-2">
        {tab === "people" ? (
          <>
            <button className="w-full py-2 rounded bg-black text-white text-sm" onClick={()=>setShowPerson(true)}>
              + Add Person
            </button>
            <AddParticipantDialog gridId={gridId} open={showPerson} onOpenChange={setShowPerson} onCreated={loadData} />
          </>
        ) : (
          <>
            <button className="w-full py-2 rounded bg-black text-white text-sm" onClick={()=>setShowCategory(true)}>
              + Add Category
            </button>
            <AddCategoryDialog gridId={gridId} open={showCategory} onOpenChange={setShowCategory} onCreated={loadData} parents={categories.map(c=>({id:c.id,name:c.name}))} />
          </>
        )}
      </div>
    </aside>
  );
}
