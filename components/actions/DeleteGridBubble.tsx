"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

function friendlyDeleteError(raw: string, status: number) {
  const text = raw.trim();
  if (/^<!doctype/i.test(text) || /^<html[\s>]/i.test(text)) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Grid delete returned HTML:", text);
    }
    return "Could not delete grid.";
  }
  try {
    const parsed = JSON.parse(text) as { code?: string; detail?: unknown };
    if (parsed.code === "GRID_DELETE_PROTECTED") {
      return "The grid could not be deleted because it still has related data.";
    }
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
  } catch {}
  return `Failed to delete grid (${status}).`;
}

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
      alert(friendlyDeleteError(txt, res.status));
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
