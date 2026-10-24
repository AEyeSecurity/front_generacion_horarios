"use client";
import { ApiError, LocalizedApiError, normalizeApiError } from "@/lib/api-errors";


import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import PanelShell from "@/components/panels/PanelShell";
import PanelScrollArea from "@/components/panels/PanelScrollArea";
import { useI18n } from "@/lib/use-i18n";
import {
  fetchGridResource,
  getCachedGridResource,
  invalidateGridResource,
  invalidateGridScreenContext,
  primeGridResource,
} from "@/lib/screen-context";
import { markPanelTiming, measurePanelRequest } from "@/lib/dev-panel-timing";

const CATEGORY_VALUES_UPDATED_EVENT = "shift:category-values-updated";
const CategoryDialog = dynamic(() => import("../dialogs/CategoryDialog"), { ssr: false });

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
  const cachedCategories = getCachedGridResource<Category[]>(gridId, "categories");
  const [list, setList] = useState<Category[]>(() => cachedCategories ?? []);
  const [loading, setLoading] = useState(cachedCategories === undefined);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Category | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<number | null>(null);
  const { t } = useI18n();

  const load = useCallback(async (force = false) => {
    const cached = force ? undefined : getCachedGridResource<Category[]>(gridId, "categories");
    if (cached !== undefined) {
      setList(cached);
      setLoading(false);
      markPanelTiming("categories", "data-ready");
      onParents?.(cached.map((category) => ({ id: category.id, name: category.name })));
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const items = await fetchGridResource<Category[]>(gridId, "categories", {
        force,
        preferFallback: true,
        fallback: async () => {
          const res = await measurePanelRequest("categories", () =>
            fetch(`/api/categories?grid=${gridId}`, { cache: "no-store" }),
          );
          if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ""));
          const data = await res.json();
          return Array.isArray(data) ? data : data.results ?? [];
        },
      });
      setList(items);
      markPanelTiming("categories", "data-ready");
      onParents?.(items.map((c: Category) => ({ id: c.id, name: c.name })));
    } catch (e: unknown) {
      setErr(normalizeApiError(e, "Error"));
    } finally {
      setLoading(false);
    }
  }, [gridId, onParents]);

  useEffect(() => {
    void load(refreshKey > 0);
  }, [load, refreshKey]);

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
              normalizeApiError(payload, t("category_panel.hide_blocked_by_blockages")),
              lines.length > 0 ? `${t("category_panel.affected_blockages")}\n${lines.join("\n")}` : "",
            ]
              .filter(Boolean)
              .join("\n\n");
          } else if (payload.detail) {
            message = normalizeApiError(payload);
          }
        } catch {
          if (text.trim() && !/^<!doctype/i.test(text.trim()) && !/^<html/i.test(text.trim())) {
            message = normalizeApiError(text, message);
          }
        }
        throw new LocalizedApiError(message);
      }
      const nextList = list.map((item) =>
        item.id === category.id ? { ...item, hidden: nextHidden } : item,
      );
      setList(nextList);
      primeGridResource(gridId, "categories", nextList);
      invalidateGridScreenContext(gridId, "draft");
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, t("category_panel.failed_toggle_visibility")));
    } finally {
      setBusyCategoryId(null);
    }
  }

  return (
    <div className="h-full">
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
          gridId={gridId}
          category={selected}
          open={showDialog}
          onOpenChange={setShowDialog}
          onDeleted={() => {
            setShowDialog(false);
            setSelected(null);
            invalidateGridResource(gridId, "categories");
            invalidateGridScreenContext(gridId, "draft");
            void load(true);
          }}
        />
      </PanelShell>
    </div>
  );
}
