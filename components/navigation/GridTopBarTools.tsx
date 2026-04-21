"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileCheck2, History, PencilLine } from "lucide-react";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
  writeGridScheduleViewMode,
} from "@/lib/schedule-view";
import { useI18n } from "@/lib/use-i18n";

export default function GridTopBarTools({ gridId, gridCode }: { gridId: number; gridCode?: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const codeOrId = gridCode || String(gridId);
  const basePath = `/grid/${encodeURIComponent(codeOrId)}`;
  const historyPath = `${basePath}/history`;
  const isHistoryPage = pathname === historyPath;
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("draft");
  const isPublishedView = scheduleViewMode === "published";

  useEffect(() => {
    const syncFromStorage = () => {
      setScheduleViewMode(readGridScheduleViewMode(gridId));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== getGridScheduleViewModeKey(gridId)) return;
      syncFromStorage();
    };

    const onModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ gridId?: string; mode?: ScheduleViewMode }>;
      if (customEvent.detail?.gridId !== String(gridId)) return;
      setScheduleViewMode(customEvent.detail?.mode === "published" ? "published" : "draft");
    };

    syncFromStorage();
    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("storage", onStorage);
    window.addEventListener(SCHEDULE_VIEW_MODE_EVENT, onModeChanged as EventListener);
    return () => {
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SCHEDULE_VIEW_MODE_EVENT, onModeChanged as EventListener);
    };
  }, [gridId]);

  const toggleScheduleView = () => {
    const next: ScheduleViewMode = isPublishedView ? "draft" : "published";
    const written = writeGridScheduleViewMode(gridId, next);
    setScheduleViewMode(written);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        title={isPublishedView ? t("grid_topbar.switch_to_draft_view") : t("grid_topbar.switch_to_published_view")}
        aria-label={isPublishedView ? t("grid_topbar.switch_to_draft_view") : t("grid_topbar.switch_to_published_view")}
        onClick={toggleScheduleView}
        className="relative h-8 w-[128px] rounded-full border p-0 transition-all duration-200 hover:scale-[1.01] max-[700px]:w-[74px]"
        style={{
          color: "#334155",
          backgroundColor: "#d8dee8",
          borderColor: "#9aa3b2",
          boxShadow:
            "inset 1.5px 1.5px 3px #8f98a7, inset -1.5px -1.5px 3px #e8edf4, 0 1px 3px rgba(0,0,0,0.14)",
        }}
      >
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-wide text-slate-700 max-[700px]:hidden">
          {isPublishedView ? t("entity.published") : t("entity.draft")}
        </span>
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 hidden h-6 w-6 items-center justify-center max-[700px]:inline-flex">
          {isPublishedView ? <FileCheck2 className="h-3.5 w-3.5 text-slate-700" /> : <PencilLine className="h-3.5 w-3.5 text-slate-700" />}
        </span>
        <span
          className="pointer-events-none absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border transition-transform duration-200 ease-out max-[700px]:hidden"
          style={{
            backgroundColor: "#edf2f8",
            borderColor: "#b6bfcc",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.34)",
            transform: `translateX(${isPublishedView ? 96 : 0}px)`,
          }}
        >
          {isPublishedView ? <PencilLine className="h-3.5 w-3.5 text-slate-700" /> : <FileCheck2 className="h-3.5 w-3.5 text-slate-700" />}
        </span>
        <span
          className="pointer-events-none absolute left-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full border transition-transform duration-200 ease-out max-[700px]:inline-flex"
          style={{
            backgroundColor: "#edf2f8",
            borderColor: "#b6bfcc",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.34)",
            transform: `translateX(${isPublishedView ? 42 : 0}px)`,
          }}
        >
          {isPublishedView ? <PencilLine className="h-3.5 w-3.5 text-slate-700" /> : <FileCheck2 className="h-3.5 w-3.5 text-slate-700" />}
        </span>
      </button>
      <button
        type="button"
        title={isHistoryPage ? t("grid_topbar.back_to_schedule") : t("grid_topbar.version_history")}
        aria-label={isHistoryPage ? t("grid_topbar.back_to_schedule") : t("grid_topbar.version_history")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
          isHistoryPage
            ? "text-black bg-gray-100"
            : "text-gray-700 hover:text-black hover:bg-gray-100"
        }`}
        onClick={() => {
          router.push(isHistoryPage ? basePath : historyPath);
        }}
      >
        <History className="h-5 w-5" />
      </button>
    </div>
  );
}
