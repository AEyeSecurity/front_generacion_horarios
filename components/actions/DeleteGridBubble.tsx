"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/use-i18n";
import type { I18nKey } from "@/lib/i18n";

function friendlyDeleteError(raw: string, status: number, t: (key: I18nKey, params?: Record<string, string | number>) => string) {
  const text = raw.trim();
  if (/^<!doctype/i.test(text) || /^<html[\s>]/i.test(text)) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Grid delete returned HTML:", text);
    }
    return t("grid_actions.could_not_delete_grid");
  }
  try {
    const parsed = JSON.parse(text) as { code?: string; detail?: unknown };
    if (parsed.code === "GRID_DELETE_PROTECTED") {
      return t("grid_actions.delete_protected");
    }
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
  } catch {}
  return t("grid_actions.delete_failed_status", { status });
}

export default function DeleteGridBubble({ gridId }: { gridId: number | string }) {
  const router = useRouter();
  const { t } = useI18n();

  async function onDelete() {
    const id = String(gridId);
    if (!id || id === "undefined") {
      alert(t("grid_actions.missing_grid_id_delete"));
      return;
    }
    if (!window.confirm(t("grid_actions.delete_grid_confirm"))) return;
    const res = await fetch(`/api/grids/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(friendlyDeleteError(txt, res.status, t));
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
          title={t("grid_actions.delete_grid")}
          onClick={onDelete}
          className="w-12 h-12 rounded-full bg-red-600 shadow-md border border-red-700 flex items-center justify-center"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
