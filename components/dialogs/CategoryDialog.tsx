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
import { useI18n } from "@/lib/use-i18n";

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
  const { t } = useI18n();
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
      setErr(e.message || t("category_dialog.error_loading_values"));
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
      setErr(e.message || t("category_dialog.failed_add_value"));
    } finally {
      setAdding(false);
    }
  }

  async function removeValue(id: number) {
    if (!window.confirm(t("category_dialog.confirm_delete_value"))) return;
    const res = await fetch(`/api/category_values/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(t("category_dialog.failed_delete_value", { status: res.status, details: txt }));
      return;
    }
    await load();
  }

  async function deleteCategory() {
    if (!catId) return;
    if (!window.confirm(t("category_dialog.confirm_delete_category"))) return;
    const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(t("category_dialog.failed_delete_category", { status: res.status, details: txt }));
      return;
    }
    onOpenChange(false);
    onDeleted?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[180]" />
        <DialogContent className="sm:max-w-[720px] z-[181]">
          <DialogHeader>
            <DialogTitle>{t("category_dialog.title_with_name", { name: category?.name ?? "" })}</DialogTitle>
          </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">{t("category_dialog.description")}</p>
          <button
            type="button"
            onClick={deleteCategory}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs text-red-600 hover:bg-red-50"
            title={t("category_dialog.delete_category_title")}
          >
            <Trash2 className="w-4 h-4" /> {t("category_dialog.delete_category")}
          </button>
        </div>

        <form onSubmit={addValue} className="mt-4 flex items-center gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder={t("category_dialog.new_value_name")}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            disabled={adding || !newValue.trim()}
          >
            <Plus className="w-4 h-4" /> {t("category_dialog.add")}
          </button>
        </form>

        {err && <div className="text-sm text-red-600 mt-2 whitespace-pre-wrap">{err}</div>}

        <div className="mt-4 border rounded divide-y bg-white max-h-40 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-gray-500">{t("category_dialog.loading")}</div>
          ) : values.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">{t("category_dialog.no_values_yet")}</div>
          ) : (
            values.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-2 text-sm">
                <div>{v.name}</div>
                <button
                  className="px-2 py-1 rounded border text-xs text-red-600 hover:bg-red-50"
                  onClick={() => removeValue(v.id)}
                >
                  {t("category_dialog.delete_value")}
                </button>
              </div>
            ))
          )}
        </div>

          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="px-3 py-2 rounded border text-sm">{t("common.close")}</button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}


