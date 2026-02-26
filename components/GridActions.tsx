// components/GridActions.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Clock4, FileDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Props = { gridId: number | string; canDelete?: boolean };

export default function GridActions({ gridId, canDelete = false }: Props) {
  const router = useRouter();
  const [latestSolutionId, setLatestSolutionId] = useState<string | null>(null);
  const [loadingSolutions, setLoadingSolutions] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = String(gridId);
        const res = await fetch(`/api/grids/${encodeURIComponent(id)}/solutions/`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        if (!active) return;
        if (!list.length) {
          setLatestSolutionId(null);
          return;
        }
        const sorted = list.slice().sort((a: any, b: any) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });
        const latest = sorted[0] || list[list.length - 1];
        setLatestSolutionId(latest?.id != null ? String(latest.id) : null);
      } catch {
      } finally {
        if (active) setLoadingSolutions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [gridId]);

  async function onDelete() {
    const id = String(gridId);
    if (!id || id === "undefined") {
      console.error("[GridActions] Missing gridId prop:", gridId);
      alert("Could not resolve grid id – delete aborted.");
      return;
    }
    if (!window.confirm("Delete this grid? This action cannot be undone.")) return;

    const res = await fetch(`/api/grids/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Failed to delete grid (${res.status}). ${txt || ""}`);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const goTimeRanges = () => {
    const id = String(gridId);
    router.push(`/grids/${encodeURIComponent(id)}/time-ranges`);
  };
  const exportSchedule = () => {
    if (!latestSolutionId) return;
    window.location.assign(`/api/solutions/${encodeURIComponent(latestSolutionId)}/export/`);
  };

  if (!canDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded hover:bg-gray-100 text-gray-600" aria-label="More actions">
          <MoreVertical className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem onClick={exportSchedule} disabled={!latestSolutionId || loadingSolutions}>
          <FileDown className="w-4 h-4 mr-2" />
          Export Schedule (XLSX)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={goTimeRanges}>
          <Clock4 className="w-4 h-4 mr-2" />
          Configure Time Ranges
        </DropdownMenuItem>
        {canDelete && (
        <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete grid
        </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
