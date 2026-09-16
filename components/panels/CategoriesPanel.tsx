"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import PanelShell from "@/components/panels/PanelShell";
import PanelScrollArea from "@/components/panels/PanelScrollArea";
import { useI18n } from "@/lib/use-i18n";

const CATEGORY_VALUES_UPDATED_EVENT = "shift:category-values-updated";

type Category = { id: number; name: string; parent: number | null; hidden?: boolean };

export default function CategoriesPanel({
  gridId,
  onParents,
  refreshKey = 0,
}: {
  gridId: number;
  onParents?: (parents: { id: number; name: string }[]) => void;
  refreshKey?: number;
}) {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Category | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<number | null>(null);
  const { t } = useI18n();

  const CategoryDialog = dynamic(() => import("../dialogs/CategoryDialog"), { ssr: false });

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/categories?grid=${gridId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.results ?? [];
      setList(items);
      onParents?.(items.map((c: Category) => ({ id: c.id, name: c.name })));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [gridId, refreshKey]);

  const filtered = useMemo(
    () => list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
    [list, q],
  );
  const parentNameById = useMemo(
    () =>
      list.reduce<Record<number, string>>((acc, item) => {
        acc[item.id] = item.name;
        return acc;
      }, {}),
    [list],
  );
  const latestCategoryId = useMemo(() => {
    if (list.length === 0) return null;
    return Math.max(...list.map((item) => Number(item.id) || 0));
  }, [list]);

  async function toggleHidden(category: Category) {
    const nextHidden = !Boolean(category.hidden);
    setBusyCategoryId(category.id);
    setErr(null);
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = t("category_panel.failed_toggle_visibility");
        try {
          const payload = JSON.parse(text) as {
            code?: string;
            detail?: string;
            affected_blockages?: Array<{
              unit_name?: string;
              day_index?: number;
              start_slot?: number;
              end_slot?: number;
            }>;
          };
          if (payload.code === "CATEGORY_HIDE_BLOCKAGES_EXIST") {
            const affected = Array.isArray(payload.affected_blockages) ? payload.affected_blockages : [];
            const lines = affected
              .map((item) => item.unit_name || t("format.unit_with_id", { id: "?" }))
              .filter((unit, index, all) => unit && all.indexOf(unit) === index)
              .slice(0, 6)
              .map((unit) => `- ${unit}`);
            message = [
              payload.detail || t("category_panel.hide_blocked_by_blockages"),
              lines.length > 0 ? `${t("category_panel.affected_blockages")}\n${lines.join("\n")}` : "",
            ]
              .filter(Boolean)
              .join("\n\n");
          } else if (payload.detail) {
            message = payload.detail;
          }
        } catch {
          if (text.trim() && !/^<!doctype/i.test(text.trim()) && !/^<html/i.test(text.trim())) {
            message = text.trim();
          }
        }
        throw new Error(message);
      }
      await load();
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("category_panel.failed_toggle_visibility"));
    } finally {
      setBusyCategoryId(null);
    }
  }

  return (
    <div className="h-full" data-onboarding-target="categories-panel">
      <PanelShell title={t("category_panel.title")} error={err}>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder={t("common.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <PanelScrollArea loading={loading}
        empty={filtered.length === 0}
        loadingLabel={t("common.loading")}
        emptyLabel={t("category_panel.no_categories_found")}
      >
          <ul className="grid gap-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <div
                  data-onboarding-target={Number(c.id) === latestCategoryId ? "categories-latest-row" : undefined}
                  className="flex items-center gap-2 rounded border p-2 text-sm hover:bg-gray-50"
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setSelected(c);
                      setShowDialog(true);
                    }}
                  >
                    <div className="font-medium">{c.name}</div>
                    {c.parent !== null && (
                      <div className="text-xs text-gray-500">{t("category_panel.parent")} {parentNameById[c.parent] ?? c.parent}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      {c.hidden ? t("category_panel.hidden_from_tabs") : t("category_panel.visible_in_tabs")}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    disabled={busyCategoryId === c.id}
                    title={c.hidden ? t("category_panel.show_in_tabs") : t("category_panel.hide_from_tabs")}
                    aria-label={c.hidden ? t("category_panel.show_in_tabs") : t("category_panel.hide_from_tabs")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleHidden(c);
                    }}
                  >
                    {c.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PanelScrollArea>

        <CategoryDialog
          category={selected}
          open={showDialog}
          onOpenChange={setShowDialog}
          onDeleted={() => {
            setShowDialog(false);
            setSelected(null);
            void load();
          }}
        />
      </PanelShell>
    </div>
  );
}
