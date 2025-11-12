"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { List as ListIcon, Grid as GridIcon, ArrowDownAZ, Clock4, Search, User } from "lucide-react";
import type { Grid } from "@/lib/types";

const EN_DAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

type View = "grid" | "list";
type Sort = "chrono" | "alpha";

export default function RecentProjects({ meId, initialItems }: { meId: number; initialItems: Grid[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>("chrono");
  const [mineOnly, setMineOnly] = useState(false);
  const [ownerByGrid, setOwnerByGrid] = useState<Record<number, string>>({});

  const items = useMemo(() => {
    let list = [...initialItems];
    if (mineOnly) {
      list = list.filter((g) => g.creator === meId);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((g) => g.name?.toLowerCase().includes(q));
    }
    if (sort === "alpha") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [initialItems, query, sort, mineOnly]);

  useEffect(() => {
    // Resolve creators' names for the items shown
    const abort = new AbortController();
    (async () => {
      const toFetch = items.map((g) => g.id).filter((id) => !(id in ownerByGrid));
      if (toFetch.length === 0) return;
      const updates: Record<number, string> = {};
      await Promise.all(
        toFetch.map(async (gridId) => {
          try {
            const r = await fetch(`/api/grid_memberships/?grid=${gridId}`, { cache: "no-store", signal: abort.signal });
            if (!r.ok) return;
            const data = await r.json();
            const list = Array.isArray(data) ? data : data.results ?? [];
            // Try to find explicit creator fields, or the membership whose user matches grid.creator, or supervisor
            let name = "";
            const m0 = list.find((m: any) => m.owner === true);
            if (m0) {
              const fn = m0.grid_creator_first_name ?? m0.user_first_name ?? m0.user?.first_name ?? "";
              const ln = m0.grid_creator_last_name ?? m0.user_last_name ?? m0.user?.last_name ?? "";
              name = [fn, ln].filter(Boolean).join(" ");
            }
            if (!name) {
              const sup = list.find((m: any) => m.role === "supervisor");
              if (sup) {
                const fn = sup.user_first_name ?? sup.user?.first_name ?? "";
                const ln = sup.user_last_name ?? sup.user?.last_name ?? "";
                name = [fn, ln].filter(Boolean).join(" ");
              }
            }
            updates[gridId] = name;
          } catch {}
        })
      );
      if (!abort.signal.aborted && Object.keys(updates).length) {
        setOwnerByGrid((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => abort.abort();
  }, [items, ownerByGrid]);

  const DayBadges = ({ days }: { days: number[] }) => (
    <div className="flex items-center justify-center gap-1 mt-1">
      {days.map((i) => (
        <span
          key={i}
          className="text-[10px] font-semibold uppercase border border-gray-300 rounded-sm px-1.5 py-[1px] tracking-wider"
        >
          {EN_DAY[i] ?? String(i)}
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-base font-semibold whitespace-nowrap">Recent Projects</div>
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-full max-w-md">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-white text-sm rounded-md border px-9 py-2 shadow-sm"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            title={mineOnly ? "Show all projects" : "Show my projects only"}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
          >
            <User className={`w-4 h-4 ${mineOnly ? "text-black" : "text-gray-600"}`} />
          </button>
          <button
            type="button"
            onClick={() => setSort((s) => (s === "chrono" ? "alpha" : "chrono"))}
            title={sort === "chrono" ? "Sort A–Z" : "Sort by recent"}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
          >
            {sort === "chrono" ? <ArrowDownAZ className="w-4 h-4" /> : <Clock4 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
            title={view === "grid" ? "List view" : "Grid view"}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
          >
            {view === "grid" ? <ListIcon className="w-4 h-4" /> : <GridIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((g) => (
            <Link
              key={g.id}
              href={`/grids/${g.id}`}
              className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-3 flex flex-col justify-between min-h-[120px]"
            >
              <div className="text-sm font-medium truncate" title={g.name}>{g.name}</div>
              <DayBadges days={g.days_enabled || []} />
              <div className="mt-2 text-xs text-gray-600 flex items-center justify-between">
                <span>
                  {g.creator === meId
                    ? "By you"
                    : (ownerByGrid[g.id] || "")}
                </span>
                <span>{new Date(g.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="grid grid-cols-12 text-xs font-medium text-gray-600 px-3 py-2 border-b bg-gray-50">
            <div className="col-span-6">Title</div>
            <div className="col-span-3">Owner</div>
            <div className="col-span-3 text-right">Created</div>
          </div>
          <div className="divide-y">
            {items.map((g) => (
              <Link key={g.id} href={`/grids/${g.id}`} className="grid grid-cols-12 items-center px-3 py-2 hover:bg-gray-50 text-sm">
                <div className="col-span-6 truncate" title={g.name}>{g.name}</div>
                <div className="col-span-3 truncate">
                  {g.creator === meId ? "You" : (ownerByGrid[g.id] || "")}
                </div>
                <div className="col-span-3 text-right text-gray-600 text-xs">{new Date(g.created_at).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
