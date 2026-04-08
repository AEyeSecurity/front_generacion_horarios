// components/GridActions.tsx
"use client";

import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Clock4, FileDown, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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

  const fileNameFromDisposition = (disposition: string | null, fallback: string) => {
    if (!disposition) return fallback;
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8?.[1]) return decodeURIComponent(utf8[1]).replace(/[/\\]/g, "_");
    const simple = disposition.match(/filename=\"?([^\";]+)\"?/i);
    if (simple?.[1]) return simple[1].replace(/[/\\]/g, "_");
    return fallback;
  };

  const downloadScheduleExport = async (view: "draft" | "published") => {
    const id = String(gridId);
    if (!id || id === "undefined") {
      alert("Could not resolve grid id - export aborted.");
      return;
    }
    const res = await fetch(`/api/grids/${encodeURIComponent(id)}/schedule/export?view=${view}`, {
      method: "GET",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Failed to export ${view} schedule (${res.status}). ${txt || ""}`);
      return;
    }

    const blob = await res.blob();
    const fallbackName = `grid-${id}-${view}-schedule.xlsx`;
    const filename = fileNameFromDisposition(res.headers.get("content-disposition"), fallbackName);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileDown className="w-4 h-4 mr-2" />
            Export Schedule (.xlsx)
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => void downloadScheduleExport("draft")}>
              Draft schedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void downloadScheduleExport("published")}>
              Published schedule
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
