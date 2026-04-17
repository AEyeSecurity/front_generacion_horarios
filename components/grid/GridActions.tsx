// components/GridActions.tsx
"use client";

import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, FileDown, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/use-i18n";

type Props = { gridId: number | string; gridCode?: string | null; canDelete?: boolean; canConfigureSolve?: boolean };

export default function GridActions({ gridId, gridCode, canDelete = false, canConfigureSolve = false }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  async function onDelete() {
    const id = String(gridId);
    if (!id || id === "undefined") {
      console.error("[GridActions] Missing gridId prop:", gridId);
      alert(t("grid_actions.missing_grid_id_delete"));
      return;
    }
    if (!window.confirm(t("grid_actions.delete_grid_confirm"))) return;

    const res = await fetch(`/api/grids/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(t("grid_actions.delete_failed", { status: res.status, details: txt || "" }));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const goSettings = () => {
    const codeOrId = gridCode || String(gridId);
    router.push(`/grid/${encodeURIComponent(codeOrId)}/settings`);
  };

  const fileNameFromDisposition = (disposition: string | null, fallback: string) => {
    if (!disposition) return fallback;
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8?.[1]) return decodeURIComponent(utf8[1]).replace(/[/\\]/g, "_");
    const simple = disposition.match(/filename=\"?([^\";]+)\"?/i);
    if (simple?.[1]) return simple[1].replace(/[/\\]/g, "_");
    return fallback;
  };

  const downloadScheduleExport = async (view: "draft" | "published") => {
    const id = String(gridId);
    if (!id || id === "undefined") {
      alert(t("grid_actions.missing_grid_id_export"));
      return;
    }
    const res = await fetch(`/api/grids/${encodeURIComponent(id)}/schedule/export?view=${view}`, {
      method: "GET",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(t("grid_actions.export_failed", { view, status: res.status, details: txt || "" }));
      return;
    }

    const blob = await res.blob();
    const fallbackName = `grid-${id}-${view}-schedule.xlsx`;
    const filename = fileNameFromDisposition(res.headers.get("content-disposition"), fallbackName);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  if (!canDelete && !canConfigureSolve) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded hover:bg-gray-100 text-gray-600" aria-label={t("grid_actions.more_actions")}>
          <MoreVertical className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {canConfigureSolve && (
          <DropdownMenuItem onClick={goSettings}>
            <Settings className="w-4 h-4 mr-2" />
            {t("grid_actions.settings")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileDown className="w-4 h-4 mr-2" />
            {t("grid_actions.export_schedule_xlsx")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => void downloadScheduleExport("draft")}>
              {t("grid_actions.draft_schedule")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void downloadScheduleExport("published")}>
              {t("grid_actions.published_schedule")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {canDelete && (
        <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" />
          {t("grid_actions.delete_grid")}
        </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
