// components/GridActions.tsx
"use client";

import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Clock4, FileDown, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Props = { gridId: number | string; gridCode?: string | null; canDelete?: boolean; canConfigureSolve?: boolean };

export default function GridActions({ gridId, gridCode, canDelete = false, canConfigureSolve = false }: Props) {
  const router = useRouter();

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
    const codeOrId = gridCode || String(gridId);
    router.push(`/grid/${encodeURIComponent(codeOrId)}/time-ranges`);
  };
  const goSettings = () => {
    const codeOrId = gridCode || String(gridId);
    router.push(`/grid/${encodeURIComponent(codeOrId)}/settings`);
  };
  if (!canDelete && !canConfigureSolve) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded hover:bg-gray-100 text-gray-600" aria-label="More actions">
          <MoreVertical className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {canConfigureSolve && (
          <DropdownMenuItem onClick={goSettings}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={goTimeRanges}>
          <Clock4 className="w-4 h-4 mr-2" />
          Time Ranges
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <FileDown className="w-4 h-4 mr-2" />
          Export Schedule (.xlsx) - unavailable
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
