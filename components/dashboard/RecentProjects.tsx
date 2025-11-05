"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List, ArrowDownAZ } from "lucide-react";
import type { Grid } from "@/lib/types";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function RecentProjects({
  meId,
  initialItems,
}: {
  meId: number;
  initialItems: Grid[];
}) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [alpha, setAlpha] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let arr = [...initialItems];
    if (q.trim()) arr = arr.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));
    if (alpha)
      arr.sort((a, b) => a.name.localeCompare(b.name));
    else
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return arr;
  }, [initialItems, alpha, q]);

  return (
    <section className="space-y-4">
      {/* Header: title | centered search | controls */}
      <div className="flex items-center gap-4">
        {/* left: title */}
        <h2 className="text-lg font-semibold shrink-0">Recent Projects</h2>

        {/* center: search bar */}
        <div className="flex-1 flex justify-center">
          <input
            className="w-full max-w-2xl bg-white border rounded-full px-5 h-11 text-sm shadow-sm placeholder:text-gray-400"
            placeholder="Search projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* right: view + sort icons */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            className="p-2 inline-flex items-center justify-center text-gray-600 hover:text-black transition"
            onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
            title={view === "grid" ? "Switch to list view" : "Switch to grid view"}
          >
            {view === "grid" ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
          </button>

          <button
            className={`p-2 inline-flex items-center justify-center transition ${
              alpha ? "text-black" : "text-gray-600 hover:text-black"
            }`}
            onClick={() => setAlpha((v) => !v)}
            title="Sort A–Z"
          >
            <ArrowDownAZ className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {view === "grid" ? (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((g) => {
            const EN = ["MON","TUE","WED","THU","FRI","SAT","SUN"] as const;
            const days = (g.days_enabled || [])
              .slice()
              .sort((a, b) => a - b)
              .map((i) => EN[i] ?? String(i));
            return (
              <Link key={g.id} href={`/grids/${g.id}`} className="group block">
                <div className="h-32 bg-white rounded-xl border shadow-sm group-hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
                  <div className="px-3 pt-2 flex items-center justify-center">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {days.map((d) => (
                        <span key={d} className="inline-flex items-center justify-center px-2 py-0.5 border rounded-sm text-[10px] font-bold uppercase tracking-wide text-gray-800">{d}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="font-medium truncate" title={g.name}>{g.name}</div>
                    <div className="text-xs text-gray-500">{g.creator === meId ? "You" : (g.creator ?? "Unknown")} • {fmtDate(g.created_at)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-sm text-gray-500">No projects found.</div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-white divide-y">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No projects found.</div>
          ) : (
            filtered.map((g) => (
              <Link
                key={g.id}
                href={`/grids/${g.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate" title={g.name}>
                    {g.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {g.creator === meId ? "You" : g.creator ?? "Unknown"}
                  </div>
                </div>
                <div className="text-xs text-gray-500 shrink-0 ml-4">
                  {fmtDate(g.created_at)}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </section>
  );
}
