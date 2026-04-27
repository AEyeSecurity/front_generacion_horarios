"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AllTierLabel, TierBadge, TierFilterChip, type Tier } from "@/components/badges/TierBadge";
import { readGridTierEnabled } from "@/lib/grid-tier";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PanelShell from "@/components/panels/PanelShell";
import PanelScrollArea from "@/components/panels/PanelScrollArea";

type Participant = {
  id: number;
  name: string;
  surname?: string;
  tier?: Tier;
  hours_week_mode?: "default" | "custom" | "not_available" | null;
  min_hours_week_override?: number | null;
  max_hours_week_override?: number | null;
};

export default function ParticipantsPanel({
  gridId,
  gridCode,
  refreshKey = 0,
}: {
  gridId: number;
  gridCode?: string | null;
  refreshKey?: number;
}) {
  const [list, setList] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | Tier>("ALL");
  const [tierEnabled, setTierEnabled] = useState(true);
  const router = useRouter();

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [participantsRes, gridRes] = await Promise.all([
        fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
        fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).catch(() => null),
      ]);
      if (!participantsRes.ok) throw new Error(`Failed (${participantsRes.status})`);
      const data = await participantsRes.json();
      const items = Array.isArray(data) ? data : data.results ?? [];
      if (gridRes?.ok) {
        const gridData = await gridRes.json().catch(() => null);
        setTierEnabled(readGridTierEnabled(gridData, true));
      }
      setList(items);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [gridId, refreshKey]);

  const filtered = useMemo(
    () =>
      list.filter(
        (p) =>
          `${p.name} ${p.surname ?? ""}`.toLowerCase().includes(q.toLowerCase()) &&
          (!tierEnabled || tierFilter === "ALL" || p.tier === tierFilter),
      ),
    [list, q, tierEnabled, tierFilter],
  );
  const gridBase = `/grid/${encodeURIComponent(gridCode || String(gridId))}`;

  return (
    <PanelShell title="Participants" error={err}>
      <div className={`grid w-full ${tierEnabled ? "grid-cols-[minmax(0,1fr)_80px]" : "grid-cols-1"} gap-2`}>
        <input
          className="w-full min-w-0 border rounded px-3 py-2 text-sm"
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tierEnabled ? (
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
        ) : null}
      </div>

      <PanelScrollArea loading={loading} empty={filtered.length === 0} emptyLabel="No participants found">
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
                  {tierEnabled ? (
                    <div className="flex items-center justify-end">
                      <TierBadge tier={p.tier} />
                    </div>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PanelScrollArea>
    </PanelShell>
  );
}
