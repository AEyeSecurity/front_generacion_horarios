"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScheduleRenderModel, ScheduleTabScope } from "@/components/grid/GridSchedulePanel";
import SolveOverlay from "@/components/grid/SolveOverlay";
import type { ScheduleViewMode } from "@/lib/schedule-view";

type Unit = { id: number | string; name: string };
type UnitNature = "audience" | "space" | "internal" | "none";
type RenderTab = { id: string; name: string; unitIds: string[]; isVirtual: boolean };

const UNIT_TAB_SELECT_EVENT = "shift:unit-tab:select";
const UNIT_TABS_HIGHLIGHT_EVENT = "shift:unit-tabs-highlight";
const DOCK_FEEDBACK_HIGHLIGHT_EVENT = "shift:dock-feedback-highlight";
const NO_UNIT_TAB_ID = "__no_unit__";
const GLOBAL_BLOCKAGE_TAB_ID = "__global__";
const GLOBAL_BLOCKAGE_TAB_LABEL = "Global";

export default function UnitTabs({
  gridId,
  role,
  units,
  renderModel,
  daysCount,
  dayLabels,
  dayWidthFactors,
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
  onScheduleLoadingChange,
  onSelectedScopeChange,
  commentsPanelOpen = false,
  onCommentsPanelOpenChange,
  historyMode = false,
  historyGridCode = null,
  unitNature = null,
}: {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  units: Unit[];
  renderModel?: ScheduleRenderModel | null;
  daysCount: number;
  dayLabels?: string[];
  dayWidthFactors?: number[];
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
  onScheduleLoadingChange?: (loading: boolean, ready: boolean) => void;
  onSelectedScopeChange?: (unitIds: string[]) => void;
  commentsPanelOpen?: boolean;
  onCommentsPanelOpenChange?: (open: boolean) => void;
  historyMode?: boolean;
  historyGridCode?: string | null;
  unitNature?: UnitNature | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hasUnitlessPlacements, setHasUnitlessPlacements] = useState(false);
  const [hasNoUnitCells, setHasNoUnitCells] = useState(false);
  const [blockageGlobalModeActive, setBlockageGlobalModeActive] = useState(false);
  const [highlightedUnitTabs, setHighlightedUnitTabs] = useState<Set<string>>(new Set());
  const [dockFeedback, setDockFeedback] = useState<{ id: string; message: string } | null>(null);

  const unitTabs = useMemo<RenderTab[]>(() => {
    const scopes = Array.isArray(renderModel?.scheduleTabScopes)
      ? (renderModel.scheduleTabScopes as ScheduleTabScope[])
      : [];

    if (scopes.length > 0) {
      return scopes.map((scope) => ({
        id: String(scope.id),
        name: scope.label,
        unitIds: Array.isArray(scope.unit_ids) ? scope.unit_ids.map(String) : [],
        isVirtual: Boolean(scope.is_virtual),
      }));
    }

    return units
      .filter((u) => {
        const id = String(u.id).toLowerCase();
        const name = (u.name || "").toLowerCase();
        return id !== "all" && name !== "all";
      })
      .map((u) => ({
        id: String(u.id),
        name: u.name,
        unitIds: [String(u.id)],
        isVirtual: false,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "es", {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [renderModel?.scheduleTabScopes, units]);

  const tabs = useMemo<RenderTab[]>(() => {
    if (unitTabs.length === 0) {
      if (blockageGlobalModeActive) {
        return [{ id: GLOBAL_BLOCKAGE_TAB_ID, name: GLOBAL_BLOCKAGE_TAB_LABEL, unitIds: [], isVirtual: false }];
      }
      return [{ id: NO_UNIT_TAB_ID, name: "No-Unit", unitIds: [], isVirtual: false }];
    }

    const showGlobeGlobalTab = blockageGlobalModeActive;
    const showNoUnitTab = !blockageGlobalModeActive && (hasUnitlessPlacements || hasNoUnitCells);
    if (showGlobeGlobalTab) {
      return [{ id: GLOBAL_BLOCKAGE_TAB_ID, name: GLOBAL_BLOCKAGE_TAB_LABEL, unitIds: [], isVirtual: false }, ...unitTabs];
    }
    if (showNoUnitTab) {
      return [{ id: NO_UNIT_TAB_ID, name: "No-Unit", unitIds: [], isVirtual: false }, ...unitTabs];
    }
    return unitTabs;
  }, [blockageGlobalModeActive, hasNoUnitCells, hasUnitlessPlacements, unitTabs]);

  const firstSelectableTab =
    unitTabs.length === 0
      ? NO_UNIT_TAB_ID
      : blockageGlobalModeActive
      ? tabs.find((tab) => tab.id === GLOBAL_BLOCKAGE_TAB_ID)?.id ?? tabs[0]?.id ?? null
      : tabs.find((tab) => tab.id !== NO_UNIT_TAB_ID && tab.id !== GLOBAL_BLOCKAGE_TAB_ID)?.id ??
        tabs[0]?.id ??
        null;

  const effectiveSelected = selected ?? firstSelectableTab;
  const selectedTab = tabs.find((tab) => tab.id === effectiveSelected) ?? null;
  const hideTabBar = tabs.length === 1 && tabs[0].id === NO_UNIT_TAB_ID && !blockageGlobalModeActive;

  useEffect(() => {
    onSelectedScopeChange?.(selectedTab?.unitIds ?? []);
  }, [onSelectedScopeChange, selectedTab]);

  useEffect(() => {
    if (selected && !tabs.some((tab) => tab.id === selected)) {
      setSelected(firstSelectableTab);
    }
  }, [firstSelectableTab, selected, tabs]);

  useEffect(() => {
    if (!blockageGlobalModeActive) return;
    if (!tabs.some((tab) => tab.id === GLOBAL_BLOCKAGE_TAB_ID)) return;
    setSelected((prev) => (prev === GLOBAL_BLOCKAGE_TAB_ID ? prev : GLOBAL_BLOCKAGE_TAB_ID));
  }, [blockageGlobalModeActive, tabs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSelectRequested = (event: Event) => {
      const customEvent = event as CustomEvent<{ unitId?: string | null }>;
      const requested = customEvent.detail?.unitId != null ? String(customEvent.detail.unitId) : null;
      if (!requested) return;
      const exactTab = tabs.find((tab) => tab.id === requested);
      const unitTab = tabs.find((tab) => tab.unitIds.includes(requested));
      const nextTab = exactTab ?? unitTab;
      if (!nextTab) return;
      setSelected(nextTab.id);
    };
    window.addEventListener(UNIT_TAB_SELECT_EVENT, onSelectRequested as EventListener);
    return () => window.removeEventListener(UNIT_TAB_SELECT_EVENT, onSelectRequested as EventListener);
  }, [tabs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHighlight = (event: Event) => {
      const custom = event as CustomEvent<{ unitIds?: Array<string | number> }>;
      const unitIds = Array.isArray(custom.detail?.unitIds)
        ? custom.detail.unitIds.map((id) => String(id))
        : [];
      setHighlightedUnitTabs(new Set(unitIds));
      if (unitIds.length > 0) {
        window.setTimeout(() => setHighlightedUnitTabs(new Set()), 1800);
      }
    };
    window.addEventListener(UNIT_TABS_HIGHLIGHT_EVENT, onHighlight as EventListener);
    return () => window.removeEventListener(UNIT_TABS_HIGHLIGHT_EVENT, onHighlight as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let clearTimer: number | null = null;
    const onFeedback = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string }>;
      const message = typeof custom.detail?.message === "string" ? custom.detail.message.trim() : "";
      if (!message) return;
      if (clearTimer != null) window.clearTimeout(clearTimer);
      setDockFeedback({ id: `${Date.now()}`, message });
      clearTimer = window.setTimeout(() => setDockFeedback(null), 3200);
    };
    window.addEventListener(DOCK_FEEDBACK_HIGHLIGHT_EVENT, onFeedback as EventListener);
    return () => {
      window.removeEventListener(DOCK_FEEDBACK_HIGHLIGHT_EVENT, onFeedback as EventListener);
      if (clearTimer != null) window.clearTimeout(clearTimer);
    };
  }, []);

  return (
    <>
      <SolveOverlay
        gridId={gridId}
        role={role}
        renderModel={renderModel}
        daysCount={daysCount}
        dayLabels={dayLabels}
        dayWidthFactors={dayWidthFactors}
        rowPx={rowPx}
        timeColPx={timeColPx}
        bodyHeight={bodyHeight}
        dayStartMin={dayStartMin}
        slotMin={slotMin}
        selectedUnitId={effectiveSelected}
        selectedUnitIds={selectedTab?.unitIds ?? []}
        topOffset={topOffset}
        enablePinning={enablePinning}
        scheduleViewMode={scheduleViewMode}
        externalRefreshTick={externalRefreshTick}
        onDraftMutated={onDraftMutated}
        onScheduleLoadingChange={onScheduleLoadingChange}
        unitNature={unitNature}
        commentsPanelOpen={commentsPanelOpen}
        onCommentsPanelOpenChange={onCommentsPanelOpenChange}
        onGlobalScopeMetaChange={({ hasUnitlessPlacements, hasNoUnitCells, blockageGlobalModeActive }) => {
          setHasUnitlessPlacements(hasUnitlessPlacements);
          setHasNoUnitCells(hasNoUnitCells);
          setBlockageGlobalModeActive(blockageGlobalModeActive);
        }}
        historyMode={historyMode}
        historyGridCode={historyGridCode}
      />

      {!hideTabBar && tabs.length > 0 && (
        <div data-unit-tabs data-onboarding-target="unit-tabs" className="fixed bottom-0 left-0 right-0 z-[40] pointer-events-none">
          <div className="max-w-5xl mx-auto flex items-end gap-2 px-4 pt-2 pb-0 overflow-x-auto overflow-y-hidden pointer-events-auto">
            {tabs.map((t) => {
              const highlighted =
                highlightedUnitTabs.has(String(t.id)) ||
                t.unitIds.some((unitId) => highlightedUnitTabs.has(unitId));
              return (
                <button
                  key={t.id}
                  type="button"
                  data-onboarding-target={t.id === GLOBAL_BLOCKAGE_TAB_ID ? "global-blockage-tab" : undefined}
                  onClick={() => setSelected(t.id)}
                  className={[
                    "px-4 py-2 text-sm border rounded-t-xl rounded-b-none origin-bottom",
                    "transition-colors transition-shadow transition-transform duration-150 ease-out",
                    effectiveSelected === t.id
                      ? "bg-white text-black shadow-lg border-gray-300"
                      : "bg-gray-100 text-gray-700 shadow-md hover:shadow-lg hover:bg-white hover:scale-[1.02]",
                    highlighted ? "ring-4 ring-amber-300 ring-offset-2 animate-pulse" : "",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {dockFeedback && (
        <div className="fixed bottom-16 left-0 right-0 z-[170] flex justify-center pointer-events-none px-4">
          <div
            key={dockFeedback.id}
            className="max-w-[min(90vw,520px)] rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-lg"
          >
            {dockFeedback.message}
          </div>
        </div>
      )}
    </>
  );
}
