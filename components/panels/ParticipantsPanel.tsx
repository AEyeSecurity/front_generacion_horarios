"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AllTierLabel, TierBadge, TierFilterChip, type Tier } from "@/components/TierBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Participant = { id: number; name: string; surname?: string; tier?: Tier };

export default function ParticipantsPanel({ gridId, gridCode, refreshKey = 0 }: { gridId: number; gridCode?: string | null; refreshKey?: number }) {
  const [list, setList] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | Tier>("ALL");
  const router = useRouter();

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

  useEffect(() => { load(); }, [gridId, refreshKey]);

  const filtered = useMemo(
    () =>
      list.filter((p) =>
        `${p.name} ${p.surname ?? ""}`.toLowerCase().includes(q.toLowerCase()) &&
        (tierFilter === "ALL" || p.tier === tierFilter)
      ),
    [list, q, tierFilter]
  );
  const gridBase = `/grid/${encodeURIComponent(gridCode || String(gridId))}`;

  return (
    <div className="flex flex-col h-full space-y-3">
      <h2 className="text-lg font-semibold">Participants</h2>

      <div className="grid w-full grid-cols-[minmax(0,1fr)_80px] gap-2">
        <input
          className="w-full min-w-0 border rounded px-3 py-2 text-sm"
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-[42px] w-full min-w-0 items-center justify-center gap-1 overflow-hidden rounded border bg-white px-2 py-2"
              aria-label="Filter by tier"
            >
              <span className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
                {tierFilter === "ALL" ? <AllTierLabel compact /> : <TierFilterChip tier={tierFilter} />}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="z-[190] min-w-[8rem]">
            <DropdownMenuItem onClick={() => setTierFilter("ALL")} className="justify-center">
              <AllTierLabel />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTierFilter("PRIMARY")} className="justify-center">
              <TierBadge tier="PRIMARY" compact />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTierFilter("SECONDARY")} className="justify-center">
              <TierBadge tier="SECONDARY" compact />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTierFilter("TERTIARY")} className="justify-center">
              <TierBadge tier="TERTIARY" compact />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Lista que ocupa todo el panel; scroll si se llena */}
      <div className="flex-1 border rounded bg-white p-2 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-gray-500 p-3">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-500 p-3">No participants found</div>
        ) : (
          <ul className="grid gap-2">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => router.push(`${gridBase}/participants/${p.id}`)}
                  className="w-full overflow-hidden rounded border p-3 text-left text-sm hover:bg-gray-50"
                >
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {p.name} {p.surname ?? ""}
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <TierBadge tier={p.tier} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
