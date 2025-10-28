"use client";

import * as React from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export default function AddCategoryDialog({
  gridId,
  open,
  onOpenChange,
  onCreated,
  parents,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  parents?: { id: number; name: string }[];
}) {
  const [name, setName] = React.useState("");
  const [parent, setParent] = React.useState<number | "">("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/categories/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: name.trim(),
          parent: parent === "" ? null : Number(parent),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      setName("");
      setParent("");
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      setErr(e.message || "Failed to create category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95]" />
        <DialogContent className="sm:max-w-[720px] z-[96]">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Name *</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Parent (optional)</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={parent === "" ? "" : String(parent)}
                onChange={(e) => setParent(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">(no parent)</option>
                {(parents ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm">
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
