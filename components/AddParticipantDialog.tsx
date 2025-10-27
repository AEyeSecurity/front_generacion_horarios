"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function AddParticipantDialog({
  gridId, open, onOpenChange, onCreated,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);

    const res = await fetch("/api/participants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grid: gridId, name: first.trim(), surname: last.trim() }),
    });

    setBusy(false);

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(res.status === 403 ? (j?.detail || "Supervisor role required.") : JSON.stringify(j));
      return;
    }
    setFirst(""); setLast("");
    onOpenChange(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">First name *</label>
              <input className="border rounded w-full p-2 text-sm" value={first} onChange={e=>setFirst(e.target.value)} required />
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1">Last name</label>
              <input className="border rounded w-full p-2 text-sm" value={last} onChange={e=>setLast(e.target.value)} />
            </div>
          </div>

          {error && <div className="text-xs text-red-600 whitespace-pre-wrap">{error}</div>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
