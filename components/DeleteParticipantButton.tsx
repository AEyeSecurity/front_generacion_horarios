"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteParticipantButton({ gridId, participantId }: { gridId: number | string; participantId: number | string; }) {
  const router = useRouter();

  async function onDelete() {
    const id = String(participantId);
    if (!id || id === "undefined") {
      alert("Could not resolve participant id");
      return;
    }
    if (!window.confirm("Delete this participant? This cannot be undone.")) return;
    const res = await fetch(`/api/participants/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Failed to delete participant (${res.status}). ${txt}`);
      return;
    }
    router.push(`/grids/${gridId}`);
    router.refresh();
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 px-3 py-2 rounded border text-red-600 hover:bg-red-50"
      onClick={onDelete}
    >
      <Trash2 className="w-4 h-4" /> Delete Participant
    </button>
  );
}

