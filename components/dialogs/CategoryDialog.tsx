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
import { Trash2, Plus } from "lucide-react";

type Category = { id: number; name: string };
type CategoryValue = { id: number; name: string; category: number };

export default function CategoryDialog({
  category,
  open,
  onOpenChange,
  onDeleted,
}: {
  category: Category | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted?: () => void; // notify parent to refresh list
}) {
  const [values, setValues] = React.useState<CategoryValue[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newValue, setNewValue] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const catId = category?.id;

  async function load() {
    if (!catId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/category_values?category=${catId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.results ?? [];
      setValues(items.filter((v: any) => Number(v.category) === Number(catId)));
    } catch (e: any) {
      setErr(e.message || "Error loading values");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { if (open) load(); }, [open, catId]);

  async function addValue(e: React.FormEvent) {
    e.preventDefault();
    if (!catId || !newValue.trim()) return;
    setAdding(true);
    setErr(null);
    try {
      const res = await fetch(`/api/category_values`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: catId, name: newValue.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewValue("");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed to add value");
    } finally {
      setAdding(false);
    }
  }

  async function removeValue(id: number) {
    if (!window.confirm("Delete this value?")) return;
    const res = await fetch(`/api/category_values/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Failed to delete value (${res.status}). ${txt}`);
      return;
    }
    await load();
  }

  async function deleteCategory() {
    if (!catId) return;
    if (!window.confirm("Delete this category and all its values?")) return;
    const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Failed to delete category (${res.status}). ${txt}`);
      return;
    }
    onOpenChange(false);
    onDeleted?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Use custom z-index so it stacks above the SidePanel (z-[60]) */}
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95]" />
        <DialogContent className="sm:max-w-[720px] z-[96]">
          <DialogHeader>
            <DialogTitle>Category: {category?.name ?? ""}</DialogTitle>
          </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Add and manage values for this category.</p>
          <button
            type="button"
            onClick={deleteCategory}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs text-red-600 hover:bg-red-50"
            title="Delete category"
          >
            <Trash2 className="w-4 h-4" /> Delete Category
          </button>
        </div>

        <form onSubmit={addValue} className="mt-4 flex items-center gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="New value name"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            disabled={adding || !newValue.trim()}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>

        {err && <div className="text-sm text-red-600 mt-2 whitespace-pre-wrap">{err}</div>}

        <div className="mt-4 border rounded divide-y bg-white max-h-40 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-gray-500">Loading…</div>
          ) : values.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No values yet</div>
          ) : (
            values.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-2 text-sm">
                <div>{v.name}</div>
                <button
                  className="px-2 py-1 rounded border text-xs text-red-600 hover:bg-red-50"
                  onClick={() => removeValue(v.id)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>

          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="px-3 py-2 rounded border text-sm">Close</button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
