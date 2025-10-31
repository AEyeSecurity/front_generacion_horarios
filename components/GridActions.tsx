// components/GridActions.tsx
"use client";

import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Props = { gridId: number | string }; // ← obligatorio

export default function GridActions({ gridId }: Props) {
  const router = useRouter();

  async function onDelete() {
    const id = String(gridId);
    if (!id || id === "undefined") {
      console.error("[GridActions] Missing gridId prop:", gridId);
      alert("Could not resolve grid id — delete aborted.");
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded hover:bg-gray-100 text-gray-600" aria-label="More actions">
          <MoreVertical className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete grid
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
