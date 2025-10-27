"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Category = { id: number; name: string };

export default function AddCategoryDialog({
  gridId, open, onOpenChange, onCreated, parents,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  parents: Category[]; // pass current categories from Sidebar
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const payload: any = { grid: gridId, name: name.trim() };
    if (parent !== "") payload.parent = Number(parent);

    const r = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(r.status === 403 ? (j?.detail || "Supervisor role required.") : JSON.stringify(j));
      return;
    }

    const created = await r.json(); // { id, ... }

    setName(""); setParent("");
    onOpenChange(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Name *</label>
            <input className="border rounded w-full p-2 text-sm" value={name} onChange={e=>setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Parent (optional)</label>
            <select className="border rounded w-full p-2 text-sm" value={parent} onChange={e=>setParent(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">(no parent)</option>
              {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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
