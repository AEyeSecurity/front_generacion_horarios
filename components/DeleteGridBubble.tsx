"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DeleteGridBubble({ gridId }: { gridId: number | string }) {
  const router = useRouter();

  async function onDelete() {
    const id = String(gridId);
    if (!id || id === "undefined") {
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
    <div className="pointer-events-none">
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[150] pointer-events-auto">
        <button
          type="button"
          title="Delete grid"
          onClick={onDelete}
          className="w-12 h-12 rounded-full bg-red-600 shadow-md border border-red-700 flex items-center justify-center"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
