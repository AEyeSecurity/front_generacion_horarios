"use client";

import { useEffect, useMemo, useState } from "react";
import SolveOverlay from "@/components/grid/SolveOverlay";
import type { ScheduleViewMode } from "@/lib/schedule-view";

type Unit = { id: number | string; name: string };
const UNIT_TAB_SELECT_EVENT = "shift:unit-tab:select";

export default function UnitTabs({
  gridId,
  role,
  units,
  daysCount,
  dayLabels,
  rowPx,
  timeColPx,
  bodyHeight,
  dayStartMin,
  slotMin,
  topOffset = 0,
  enablePinning = false,
  scheduleViewMode = "draft",
  externalRefreshTick = 0,
  onDraftMutated,
  commentsPanelOpen = false,
  onCommentsPanelOpenChange,
  historyMode = false,
  historyGridCode = null,
}: {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  units: Unit[];
  daysCount: number;
  dayLabels?: string[];
  rowPx: number;
  timeColPx: number;
  bodyHeight: number;
  dayStartMin: number;
  slotMin: number;
  topOffset?: number;
  enablePinning?: boolean;
  scheduleViewMode?: ScheduleViewMode;
  externalRefreshTick?: number;
  onDraftMutated?: () => void;
  commentsPanelOpen?: boolean;
  onCommentsPanelOpenChange?: (open: boolean) => void;
  historyMode?: boolean;
  historyGridCode?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const tabs = useMemo(() => {
    const unitTabs = units
      .filter((u) => {
        const id = String(u.id).toLowerCase();
        const name = (u.name || "").toLowerCase();
        return id !== "all" && name !== "all";
      })
      .map((u) => ({ id: String(u.id), name: u.name }));
    return [{ id: "*", name: "*" }, ...unitTabs];
  }, [units]);
  const effectiveSelected = selected ?? (tabs.find((tab) => tab.id !== "*")?.id ?? tabs[0]?.id ?? null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSelectRequested = (event: Event) => {
      const customEvent = event as CustomEvent<{ unitId?: string | null }>;
      const requested = customEvent.detail?.unitId != null ? String(customEvent.detail.unitId) : null;
      if (!requested) return;
      if (!tabs.some((tab) => tab.id === requested)) return;
      setSelected(requested);
    };
    window.addEventListener(UNIT_TAB_SELECT_EVENT, onSelectRequested as EventListener);
    return () => window.removeEventListener(UNIT_TAB_SELECT_EVENT, onSelectRequested as EventListener);
  }, [tabs]);

  return (
    <>
      <SolveOverlay
        gridId={gridId}
        role={role}
        daysCount={daysCount}
        dayLabels={dayLabels}
        rowPx={rowPx}
        timeColPx={timeColPx}
        bodyHeight={bodyHeight}
        dayStartMin={dayStartMin}
        slotMin={slotMin}
        selectedUnitId={effectiveSelected}
        topOffset={topOffset}
        enablePinning={enablePinning}
        scheduleViewMode={scheduleViewMode}
        externalRefreshTick={externalRefreshTick}
        onDraftMutated={onDraftMutated}
        commentsPanelOpen={commentsPanelOpen}
        onCommentsPanelOpenChange={onCommentsPanelOpenChange}
        historyMode={historyMode}
        historyGridCode={historyGridCode}
      />

      {tabs.length > 0 && (
        <div data-unit-tabs className="fixed bottom-0 left-0 right-0 z-[40] pointer-events-none">
          <div className="max-w-5xl mx-auto flex items-end gap-2 px-4 pt-2 pb-0 overflow-x-auto overflow-y-hidden pointer-events-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={[
                  "px-4 py-2 text-sm border rounded-t-xl rounded-b-none origin-bottom",
                  "transition-colors transition-shadow transition-transform duration-150 ease-out",
                  effectiveSelected === t.id
                    ? "bg-white text-black shadow-lg border-gray-300"
                    : "bg-gray-100 text-gray-700 shadow-md hover:shadow-lg hover:bg-white hover:scale-[1.02]",
                ].join(" ")}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
