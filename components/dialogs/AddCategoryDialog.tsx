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
  const [createdId, setCreatedId] = React.useState<number | null>(null);
  const [values, setValues] = React.useState<{ id: number; name: string; category: number }[]>([]);
  const [newValue, setNewValue] = React.useState("");
  const [addingValue, setAddingValue] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

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
      const created = await res.json().catch(() => ({}));
      const id = Number(created?.id);
      if (!id) throw new Error("Could not resolve new category id");
      setCreatedId(id);
      setValues([]);
      setNewValue("");
    } catch (e: any) {
      setErr(e.message || "Failed to create category");
    } finally {
      setSaving(false);
    }
  }

  async function loadValues(catId: number) {
    try {
      const res = await fetch(`/api/category_values?category=${catId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data) ? data : data.results ?? [];
      setValues(items.filter((v: any) => Number(v.category) === Number(catId)));
    } catch (e: any) {
      setErr(e?.message || "Failed to load values");
    }
  }

  React.useEffect(() => {
    if (createdId) loadValues(createdId);
  }, [createdId]);

  async function addValue(e: React.FormEvent) {
    e.preventDefault();
    if (!createdId || !newValue.trim()) return;
    setAddingValue(true);
    setErr(null);
    try {
      const res = await fetch(`/api/category_values`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: createdId, name: newValue.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewValue("");
      await loadValues(createdId);
    } catch (e: any) {
      setErr(e?.message || "Failed to add value");
    } finally {
      setAddingValue(false);
    }
  }

  async function deleteCategory(catId: number) {
    const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed (${res.status})`);
    }
  }

  async function handleOpenChange(v: boolean) {
    if (v) {
      onOpenChange(true);
      return;
    }
    if (closing) return;
    if (createdId && values.length === 0) {
      try {
        setClosing(true);
        await deleteCategory(createdId);
      } catch (e: any) {
        setErr(e?.message || "Failed to delete empty category");
      } finally {
        setClosing(false);
      }
    }
    if (!createdId || values.length > 0) {
      setName("");
      setParent("");
      setCreatedId(null);
      setValues([]);
      setNewValue("");
      onCreated?.();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95]" />
        <DialogContent className="sm:max-w-[720px] z-[96]">
          <DialogHeader>
            <DialogTitle>{createdId ? "Add Category Values" : "Add Category"}</DialogTitle>
          </DialogHeader>

          {!createdId ? (
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
                  {saving ? "Adding…" : "Next"}
                </button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">Add at least 1 value to finish creating this category.</div>

              <form onSubmit={addValue} className="flex items-center gap-2">
                <input
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  placeholder="New value name"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={addingValue || !newValue.trim()}
                >
                  Add
                </button>
              </form>

              {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

              <div className="border rounded divide-y bg-white max-h-40 overflow-y-auto">
                {values.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No values yet</div>
                ) : (
                  values.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-2 text-sm">
                      <div>{v.name}</div>
                    </div>
                  ))
                )}
              </div>

              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <button type="button" className="px-3 py-2 rounded border text-sm" disabled={closing}>
                    Cancel
                  </button>
                </DialogClose>
                <button
                  type="button"
                  className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={values.length === 0 || closing}
                  onClick={() => handleOpenChange(false)}
                >
                  Finish
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

