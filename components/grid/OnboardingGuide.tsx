"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/lib/use-i18n";

type OnboardingGuideProps = {
  gridId: number;
  gridCode: string;
  show: boolean;
  unitNature?: string | null;
};

type GuideStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type LeftPanelTab = "participants" | "categories" | "time-ranges" | null;
type BlockageGuidePhase = "tool" | "tabs" | "schedule";

type Viewport = {
  width: number;
  height: number;
};

type SpotlightRect = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  passive?: boolean;
};

type LeftPanelState = {
  open: boolean;
  tab: LeftPanelTab;
};

type GuideEngagement = {
  participantsOpened: boolean;
  categoriesOpened: boolean;
  timeRangesOpened: boolean;
  blockageFanOpened: boolean;
};

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 12;
const OVERLAY_ALPHA = 0.45;
const TOTAL_STEPS = 7;
const TOOLTIP_CARD_HEIGHT = 164;
const TOOLTIP_GAP = 16;
const GRID_LEFT_PANEL_STATE_EVENT = "shift:grid-left-panel-state";
const GRID_ONBOARDING_LEFT_PANEL_REQUEST_EVENT = "shift:onboarding-left-panel-request";
const GRID_ONBOARDING_RIGHT_FAN_REQUEST_EVENT = "shift:onboarding-right-fan-request";
const GRID_ONBOARDING_RIGHT_TOOL_REQUEST_EVENT = "shift:onboarding-right-tool-request";
const TIME_RANGE_SAVED_EVENT = "shift:onboarding-time-range-saved";
const AVAILABILITY_RULE_CREATED_EVENT = "shift:onboarding-availability-rule-created";
const ONBOARDING_GUIDE_DISABLED = true;

const SELECTORS = {
  leftDock: "#sidedock",
  rightDock: "[data-right-side-dock]",
  leftParticipants: '[data-onboarding-target="left-dock-participants"]',
  leftCategories: '[data-onboarding-target="left-dock-categories"]',
  leftTimeRanges: '[data-onboarding-target="left-dock-time-ranges"]',
  leftCells: '[data-onboarding-target="left-dock-cells"]',
  participantsPanel: '[data-onboarding-target="participants-panel"]',
  participantsAddButton: '[data-onboarding-target="participants-add-button"]',
  participantDialog: '[data-onboarding-target="participant-dialog"]',
  participantsLatestRow: '[data-onboarding-target="participants-latest-row"]',
  participantDetailPage: '[data-onboarding-target="participant-detail-page"]',
  participantRulesWorkspace: '[data-onboarding-target="participant-rules-workspace"]',
  participantRulesTimetable: '[data-onboarding-target="participant-rules-timetable"]',
  availabilityAddRuleButton: '[data-onboarding-target="availability-add-rule-button"]',
  availabilityRuleDialog: '[data-onboarding-target="availability-rule-dialog"]',
  availabilityRuleLatest: '[data-onboarding-target="availability-rule-latest"]',
  categoriesPanel: '[data-onboarding-target="categories-panel"]',
  categoriesAddButton: '[data-onboarding-target="categories-add-button"]',
  categoriesLatestRow: '[data-onboarding-target="categories-latest-row"]',
  categoryDialog: '[data-onboarding-target="category-dialog"]',
  categoryValueAddRow: '[data-onboarding-target="category-value-add-row"]',
  categoryValueNameInput: '[data-onboarding-target="category-value-name-input"]',
  categoryValueLatestRow: '[data-onboarding-target="category-value-latest-row"]',
  unitTabs: '[data-onboarding-target="unit-tabs"]',
  globalBlockageTab: '[data-onboarding-target="global-blockage-tab"]',
  timeRangesAddRow: '[data-onboarding-target="time-ranges-add-row"]',
  timeRangesNameInput: '[data-onboarding-target="time-ranges-name-input"]',
  timeRangesPanel: '[data-onboarding-target="time-ranges-panel"]',
  timeRangeLatestCard: '[data-onboarding-target="time-range-latest-card"]',
  cellsPage: '[data-onboarding-target="cells-page"]',
  cellCreateButton: '[data-onboarding-target="cell-create-button"]',
  cellDialog: '[data-onboarding-target="cell-dialog"]',
  scheduleScroll: "[data-schedule-scroll]",
  rightSolve: '[data-onboarding-target="right-dock-solve"]',
  rightFan: '[data-onboarding-target="right-dock-fan"]',
  rightFanToggle: '[data-onboarding-target="right-dock-fan-toggle"]',
  rightBlockage: '[data-onboarding-target="right-dock-blockage"]',
  rightBlockageActive: '[data-onboarding-target="right-dock-blockage"][data-onboarding-active="true"]',
  rightPublish: '[data-onboarding-target="right-dock-publish"]',
} as const;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readViewport(): Viewport {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function parseCollectionCount(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    if (Array.isArray(source.results)) return source.results.length;
  }
  return 0;
}

async function fetchCollectionCount(path: string): Promise<number> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return 0;
    const data = await response.json().catch(() => ({}));
    return parseCollectionCount(data);
  } catch {
    return 0;
  }
}

function querySpotlight(selector: string, id: string, viewport: Viewport): SpotlightRect | null {
  if (typeof document === "undefined") return null;
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const left = clamp(rect.left - SPOTLIGHT_PADDING, 0, Math.max(0, viewport.width - 1));
  const top = clamp(rect.top - SPOTLIGHT_PADDING, 0, Math.max(0, viewport.height - 1));
  const right = clamp(rect.right + SPOTLIGHT_PADDING, left + 1, viewport.width);
  const bottom = clamp(rect.bottom + SPOTLIGHT_PADDING, top + 1, viewport.height);
  return { id, left, top, width: right - left, height: bottom - top };
}

function queryUnionSpotlight(selectors: string[], id: string, viewport: Viewport): SpotlightRect | null {
  if (typeof document === "undefined") return null;
  const rects = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((element) => (element as HTMLElement).getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);

  if (rects.length === 0) return null;

  const rawLeft = Math.min(...rects.map((rect) => rect.left));
  const rawTop = Math.min(...rects.map((rect) => rect.top));
  const rawRight = Math.max(...rects.map((rect) => rect.right));
  const rawBottom = Math.max(...rects.map((rect) => rect.bottom));
  const left = clamp(rawLeft - SPOTLIGHT_PADDING, 0, Math.max(0, viewport.width - 1));
  const top = clamp(rawTop - SPOTLIGHT_PADDING, 0, Math.max(0, viewport.height - 1));
  const right = clamp(rawRight + SPOTLIGHT_PADDING, left + 1, viewport.width);
  const bottom = clamp(rawBottom + SPOTLIGHT_PADDING, top + 1, viewport.height);
  return { id, left, top, width: right - left, height: bottom - top };
}

function queryAncestorSpotlight(selector: string, ancestorSelector: string, id: string, viewport: Viewport): SpotlightRect | null {
  if (typeof document === "undefined") return null;
  const element = document.querySelector(selector) as HTMLElement | null;
  const ancestor = element?.closest(ancestorSelector) as HTMLElement | null;
  if (!ancestor) return null;
  const rect = ancestor.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const left = clamp(rect.left - SPOTLIGHT_PADDING, 0, Math.max(0, viewport.width - 1));
  const top = clamp(rect.top - SPOTLIGHT_PADDING, 0, Math.max(0, viewport.height - 1));
  const right = clamp(rect.right + SPOTLIGHT_PADDING, left + 1, viewport.width);
  const bottom = clamp(rect.bottom + SPOTLIGHT_PADDING, top + 1, viewport.height);
  return { id, left, top, width: right - left, height: bottom - top };
}

function pointInside(rect: SpotlightRect, x: number, y: number) {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function asPassiveSpotlight(rect: SpotlightRect | null): SpotlightRect[] {
  return rect ? [{ ...rect, passive: true }] : [];
}

function readSavedStep(key: string): GuideStep | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  const parsed = Number(raw);
  return parsed >= 0 && parsed <= 6 ? (parsed as GuideStep) : null;
}

function emptyGuideEngagement(): GuideEngagement {
  return {
    participantsOpened: false,
    categoriesOpened: false,
    timeRangesOpened: false,
    blockageFanOpened: false,
  };
}

function readGuideEngagement(key: string): GuideEngagement {
  if (typeof window === "undefined") return emptyGuideEngagement();
  const raw = window.localStorage.getItem(key);
  if (!raw) return emptyGuideEngagement();
  try {
    const parsed = JSON.parse(raw) as Partial<GuideEngagement>;
    return {
      participantsOpened: Boolean(parsed.participantsOpened),
      categoriesOpened: Boolean(parsed.categoriesOpened),
      timeRangesOpened: Boolean(parsed.timeRangesOpened),
      blockageFanOpened: Boolean(parsed.blockageFanOpened),
    };
  } catch {
    return emptyGuideEngagement();
  }
}

function isBlockageToolActive() {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector(SELECTORS.rightBlockageActive));
}

function isElementInteractive(selector: string) {
  if (typeof document === "undefined") return false;
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function selectorContainsTarget(selector: string, target: HTMLElement | null) {
  if (!target) return false;
  const owner = document.querySelector(selector) as HTMLElement | null;
  return Boolean(target.closest(selector) || owner?.contains(target));
}

function queryAllowedFocusable(selectors: string[]) {
  const seen = new Set<HTMLElement>();
  const elements: HTMLElement[] = [];
  for (const selector of selectors) {
    const containers = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const container of containers) {
      const candidates = Array.from(container.matches(FOCUSABLE_SELECTOR) ? [container] : []).concat(
        Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)),
      );
      for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        if (candidate.offsetParent === null && candidate !== document.activeElement) continue;
        seen.add(candidate);
        elements.push(candidate);
      }
    }
  }
  return elements;
}

function hasExistingCategorySetup(categoryBaseline: number | null, unitBaseline: number | null) {
  return (categoryBaseline != null && categoryBaseline > 0) || (unitBaseline != null && unitBaseline > 0);
}

function tooltipStyle(
  rect: SpotlightRect,
  viewport: Viewport,
  side: "left" | "right" | "bottom",
): React.CSSProperties {
  const cardWidth = Math.min(320, Math.max(240, viewport.width - 48));
  let left = 16;
  let top = 16;

  if (side === "right") {
    left = rect.left + rect.width + 16;
    top = rect.top + rect.height * 0.5 - TOOLTIP_CARD_HEIGHT * 0.5;
  } else if (side === "left") {
    left = rect.left - cardWidth - 16;
    top = rect.top + rect.height * 0.5 - TOOLTIP_CARD_HEIGHT * 0.5;
  } else {
    left = rect.left + rect.width * 0.5 - cardWidth * 0.5;
    top = rect.top + rect.height + 16;
  }

  left = clamp(left, 16, Math.max(16, viewport.width - cardWidth - 16));
  top = clamp(top, 16, Math.max(16, viewport.height - TOOLTIP_CARD_HEIGHT - 16));

  return { width: cardWidth, left, top };
}

function tooltipRect(style: React.CSSProperties) {
  const width = Number(style.width) || 320;
  const left = Number(style.left) || 16;
  const top = Number(style.top) || 16;
  return { left, top, right: left + width, bottom: top + TOOLTIP_CARD_HEIGHT };
}

function tooltipsOverlap(a: React.CSSProperties, b: React.CSSProperties) {
  const ar = tooltipRect(a);
  const br = tooltipRect(b);
  return !(
    ar.right + TOOLTIP_GAP <= br.left ||
    br.right + TOOLTIP_GAP <= ar.left ||
    ar.bottom + TOOLTIP_GAP <= br.top ||
    br.bottom + TOOLTIP_GAP <= ar.top
  );
}

function resolveStepZeroTooltipStyles(
  leftSpotlight: SpotlightRect | null,
  rightSpotlight: SpotlightRect | null,
  viewport: Viewport,
) {
  if (!leftSpotlight || !rightSpotlight) return null;
  const left = tooltipStyle(leftSpotlight, viewport, "right");
  const right = tooltipStyle(rightSpotlight, viewport, "left");
  if (!tooltipsOverlap(left, right)) return { left, right };

  const cardWidth = Number(left.width) || 320;
  const bottomReserved = 120;
  if (viewport.width < cardWidth * 2 + TOOLTIP_GAP * 4) {
    const centeredLeft = clamp((viewport.width - cardWidth) / 2, 16, Math.max(16, viewport.width - cardWidth - 16));
    const top = clamp(96, 16, Math.max(16, viewport.height - TOOLTIP_CARD_HEIGHT - 16));
    const minBottomTop = top + TOOLTIP_CARD_HEIGHT + TOOLTIP_GAP;
    const maxBottomTop = Math.max(minBottomTop, viewport.height - TOOLTIP_CARD_HEIGHT - bottomReserved);
    return {
      left: { width: cardWidth, left: centeredLeft, top },
      right: { width: cardWidth, left: centeredLeft, top: maxBottomTop },
    };
  }

  const top = clamp(
    Math.min(Number(left.top) || 16, Number(right.top) || 16),
    16,
    Math.max(16, viewport.height - bottomReserved - TOOLTIP_CARD_HEIGHT),
  );
  return {
    left: { ...left, left: 16, top },
    right: { ...right, left: viewport.width - cardWidth - 16, top },
  };
}

export default function OnboardingGuide(props: OnboardingGuideProps) {
  if (ONBOARDING_GUIDE_DISABLED) return null;

  return <OnboardingGuideInner {...props} />;
}

function OnboardingGuideInner({ gridId, gridCode, show, unitNature }: OnboardingGuideProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const maskId = useId().replace(/:/g, "");

  const [active, setActive] = useState(false);
  const [step, setStep] = useState<GuideStep>(0);
  const [viewport, setViewport] = useState<Viewport>(readViewport);
  const [spotlights, setSpotlights] = useState<SpotlightRect[]>([]);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [unitsCount, setUnitsCount] = useState(0);
  const [timeRangesCount, setTimeRangesCount] = useState(0);
  const [cellsCount, setCellsCount] = useState(0);
  const [timeRangeSavedInStep, setTimeRangeSavedInStep] = useState(false);
  const [availabilityRuleCreatedInStep, setAvailabilityRuleCreatedInStep] = useState(false);
  const [blockagePhase, setBlockagePhase] = useState<BlockageGuidePhase>("tool");
  const [blockageToolRequested, setBlockageToolRequested] = useState(false);
  const [leftPanelState, setLeftPanelState] = useState<LeftPanelState>({ open: false, tab: null });
  const [categoryBaseline, setCategoryBaseline] = useState<number | null>(null);
  const [unitBaseline, setUnitBaseline] = useState<number | null>(null);
  const [timeRangeBaseline, setTimeRangeBaseline] = useState<number | null>(null);
  const [cellBaseline, setCellBaseline] = useState<number | null>(null);
  const [dismissedCreatedHighlights, setDismissedCreatedHighlights] = useState<Record<string, boolean>>({});
  const [engagedSteps, setEngagedSteps] = useState<GuideEngagement>(emptyGuideEngagement);
  const [mounted, setMounted] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedTargetRef = useRef<string | null>(null);
  const categoryUnitTabsHintSeenRef = useRef(false);
  const doneKey = useMemo(() => `onboarding-done-grid-${gridId}`, [gridId]);
  const stepKey = useMemo(() => `onboarding-step-grid-${gridId}`, [gridId]);
  const engagementKey = useMemo(() => `onboarding-engaged-grid-${gridId}`, [gridId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onLeftPanelState = (event: Event) => {
      const custom = event as CustomEvent<{ gridId?: string; open?: boolean; tab?: string }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      const rawTab = custom.detail?.tab;
      const normalizedTab: LeftPanelTab =
        rawTab === "participants" || rawTab === "categories" || rawTab === "time-ranges" ? rawTab : null;
      setLeftPanelState({ open: Boolean(custom.detail?.open), tab: normalizedTab });
      if (!custom.detail?.open || !normalizedTab) return;
      setEngagedSteps((prev) => {
        const next: GuideEngagement = {
          ...prev,
          participantsOpened: prev.participantsOpened || normalizedTab === "participants",
          categoriesOpened: prev.categoriesOpened || normalizedTab === "categories",
          timeRangesOpened: prev.timeRangesOpened || normalizedTab === "time-ranges",
        };
        if (
          next.participantsOpened === prev.participantsOpened &&
          next.categoriesOpened === prev.categoriesOpened &&
          next.timeRangesOpened === prev.timeRangesOpened
        ) {
          return prev;
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(engagementKey, JSON.stringify(next));
        }
        return next;
      });
    };
    window.addEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
    return () => window.removeEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
  }, [engagementKey, gridId]);

  const stripOnboardingParam = useCallback(() => {
    const currentParams = new URLSearchParams(searchParams?.toString() ?? "");
    if (!currentParams.has("onboarding")) return;
    currentParams.delete("onboarding");
    const query = currentParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const finishGuide = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(doneKey, "1");
      window.localStorage.removeItem(stepKey);
      window.localStorage.removeItem(engagementKey);
    }
    setActive(false);
    stripOnboardingParam();
  }, [doneKey, engagementKey, stepKey, stripOnboardingParam]);

  const requestLeftPanel = useCallback(
    (tab: LeftPanelTab) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent<{ gridId: string; open: boolean; tab: LeftPanelTab }>(GRID_ONBOARDING_LEFT_PANEL_REQUEST_EVENT, {
          detail: { gridId: String(gridId), open: tab != null, tab },
        }),
      );
    },
    [gridId],
  );

  const requestRightFan = useCallback((open: boolean) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<{ open: boolean }>(GRID_ONBOARDING_RIGHT_FAN_REQUEST_EVENT, { detail: { open } }));
  }, []);

  const requestRightTool = useCallback((tool: "blockage") => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<{ tool: "blockage" }>(GRID_ONBOARDING_RIGHT_TOOL_REQUEST_EVENT, { detail: { tool } }));
  }, []);

  const markEngaged = useCallback(
    (patch: Partial<GuideEngagement>) => {
      setEngagedSteps((prev) => {
        const next: GuideEngagement = {
          participantsOpened: patch.participantsOpened ?? prev.participantsOpened,
          categoriesOpened: patch.categoriesOpened ?? prev.categoriesOpened,
          timeRangesOpened: patch.timeRangesOpened ?? prev.timeRangesOpened,
          blockageFanOpened: patch.blockageFanOpened ?? prev.blockageFanOpened,
        };
        if (
          next.participantsOpened === prev.participantsOpened &&
          next.categoriesOpened === prev.categoriesOpened &&
          next.timeRangesOpened === prev.timeRangesOpened &&
          next.blockageFanOpened === prev.blockageFanOpened
        ) {
          return prev;
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(engagementKey, JSON.stringify(next));
        }
        return next;
      });
    },
    [engagementKey],
  );

  const resolveStepSpotlights = useCallback(
    (currentStep: GuideStep, currentViewport: Viewport, panelState: LeftPanelState) => {
      const leftDock =
        querySpotlight(SELECTORS.leftDock, "left-dock", currentViewport) ??
        queryUnionSpotlight(
          [SELECTORS.leftParticipants, SELECTORS.leftCells, SELECTORS.leftCategories, SELECTORS.leftTimeRanges],
          "left-dock",
          currentViewport,
        );
      const rightDock =
        querySpotlight(SELECTORS.rightDock, "right-dock", currentViewport) ??
        queryUnionSpotlight([SELECTORS.rightSolve, SELECTORS.rightFanToggle, SELECTORS.rightPublish], "right-dock", currentViewport);
      const leftParticipants = querySpotlight(SELECTORS.leftParticipants, "left-participants", currentViewport);
      const leftCategories = querySpotlight(SELECTORS.leftCategories, "left-categories", currentViewport);
      const leftTimeRanges = querySpotlight(SELECTORS.leftTimeRanges, "left-time-ranges", currentViewport);
      const leftCells = querySpotlight(SELECTORS.leftCells, "left-cells", currentViewport);
      const participantsAddButton = querySpotlight(SELECTORS.participantsAddButton, "participants-add-button", currentViewport);
      const participantsPanel = querySpotlight(SELECTORS.participantsPanel, "participants-panel", currentViewport);
      const participantsPanelArea =
        queryAncestorSpotlight(SELECTORS.participantsPanel, '[data-slot="sheet-content"]', "participants-panel", currentViewport) ??
        queryUnionSpotlight([SELECTORS.participantsPanel, SELECTORS.participantsAddButton], "participants-panel", currentViewport) ??
        participantsPanel;
      const participantDialog = querySpotlight(SELECTORS.participantDialog, "participant-dialog", currentViewport);
      const participantsLatestRow = querySpotlight(SELECTORS.participantsLatestRow, "participants-latest-row", currentViewport);
      const participantDetailPage = querySpotlight(SELECTORS.participantDetailPage, "participant-detail-page", currentViewport);
      const participantRulesWorkspace = querySpotlight(SELECTORS.participantRulesWorkspace, "participant-rules-workspace", currentViewport);
      const participantRulesTimetable = querySpotlight(SELECTORS.participantRulesTimetable, "participant-rules-timetable", currentViewport);
      const availabilityAddRuleButton = querySpotlight(SELECTORS.availabilityAddRuleButton, "availability-add-rule-button", currentViewport);
      const availabilityRuleDialog = querySpotlight(SELECTORS.availabilityRuleDialog, "availability-rule-dialog", currentViewport);
      const availabilityRuleLatest = querySpotlight(SELECTORS.availabilityRuleLatest, "availability-rule-latest", currentViewport);
      const categoriesAddButton = querySpotlight(SELECTORS.categoriesAddButton, "categories-add-button", currentViewport);
      const categoriesPanel = querySpotlight(SELECTORS.categoriesPanel, "categories-panel", currentViewport);
      const categoriesPanelArea =
        queryAncestorSpotlight(SELECTORS.categoriesPanel, '[data-slot="sheet-content"]', "categories-panel", currentViewport) ??
        queryUnionSpotlight([SELECTORS.categoriesPanel, SELECTORS.categoriesAddButton], "categories-panel", currentViewport) ??
        categoriesPanel;
      const categoriesLatestRow = querySpotlight(SELECTORS.categoriesLatestRow, "categories-latest-row", currentViewport);
      const categoryDialog = querySpotlight(SELECTORS.categoryDialog, "category-dialog", currentViewport);
      const categoryValueAddRow = querySpotlight(SELECTORS.categoryValueAddRow, "category-value-add-row", currentViewport);
      const categoryValueLatestRow = querySpotlight(SELECTORS.categoryValueLatestRow, "category-value-latest-row", currentViewport);
      const unitTabs = querySpotlight(SELECTORS.unitTabs, "unit-tabs", currentViewport);
      const globalBlockageTab = querySpotlight(SELECTORS.globalBlockageTab, "global-blockage-tab", currentViewport);
      const timeRangesAddRow = querySpotlight(SELECTORS.timeRangesAddRow, "time-ranges-add-row", currentViewport);
      const timeRangesPanel = querySpotlight(SELECTORS.timeRangesPanel, "time-ranges-panel", currentViewport);
      const timeRangeLatestCard = querySpotlight(SELECTORS.timeRangeLatestCard, "time-range-latest-card", currentViewport);
      const cellDialog = querySpotlight(SELECTORS.cellDialog, "cell-dialog", currentViewport);
      const cellCreateButton = querySpotlight(SELECTORS.cellCreateButton, "cell-create-button", currentViewport);
      const cellsPage = querySpotlight(SELECTORS.cellsPage, "cells-page", currentViewport);
      const scheduleScroll = querySpotlight(SELECTORS.scheduleScroll, "schedule-grid", currentViewport);
      const rightSolve = querySpotlight(SELECTORS.rightSolve, "right-solve", currentViewport);
      const rightFanToggle = querySpotlight(SELECTORS.rightFanToggle, "right-fan-toggle", currentViewport);
      const rightBlockage = querySpotlight(SELECTORS.rightBlockage, "right-blockage", currentViewport);
      const blockageToolActiveForGuide = isBlockageToolActive();

      if (currentStep === 0) return [leftDock, rightDock].filter(Boolean) as SpotlightRect[];
      if (currentStep === 1) {
        const participantRuleReady = availabilityRuleCreatedInStep || Boolean(availabilityRuleLatest);
        if (participantDetailPage) {
          if (availabilityRuleDialog) return [availabilityRuleDialog];
          if (participantRuleReady && participantRulesWorkspace) return [participantRulesWorkspace];
          if (participantRuleReady && availabilityRuleLatest) return [availabilityRuleLatest];
          if (availabilityAddRuleButton) return [availabilityAddRuleButton];
          if (participantRulesWorkspace) return [participantRulesWorkspace];
          if (participantRulesTimetable) return [participantRulesTimetable];
          return [participantDetailPage];
        }
        if (participantDialog) return [participantDialog];
        if (participantsCount > 0 && !dismissedCreatedHighlights.participant && participantsLatestRow) return [participantsLatestRow];
        if (panelState.open && panelState.tab === "participants" && participantsPanelArea) return [participantsPanelArea];
        return leftParticipants ? [leftParticipants] : [];
      }
      if (currentStep === 2) {
        if (categoryValueLatestRow && !dismissedCreatedHighlights.categoryValue) {
          return [categoryValueLatestRow, categoryDialog].filter(Boolean) as SpotlightRect[];
        }
        if (categoryValueAddRow) {
          return [categoryValueAddRow, categoryDialog].filter(Boolean) as SpotlightRect[];
        }
        if (categoryDialog) return [categoryDialog];
        if (categoriesCount > 0 && unitTabs && !dismissedCreatedHighlights.categoryUnitTabs) return [unitTabs];
        if (!panelState.open || panelState.tab !== "categories") {
          return leftCategories ? [leftCategories] : [];
        }
        if (
          panelState.open &&
          panelState.tab === "categories" &&
          categoriesCount > 0 &&
          !dismissedCreatedHighlights.category &&
          categoriesLatestRow
        ) {
          return [categoriesLatestRow];
        }
        if (panelState.open && panelState.tab === "categories" && categoriesPanelArea) return [categoriesPanelArea];
        return leftCategories ? [leftCategories] : [];
      }
      if (currentStep === 3) {
        if (!panelState.open || panelState.tab !== "time-ranges") {
          return leftTimeRanges ? [leftTimeRanges] : [];
        }
        if (panelState.open && panelState.tab === "time-ranges" && timeRangeBaseline != null && timeRangesCount > timeRangeBaseline && !timeRangeSavedInStep && timeRangeLatestCard) {
          return [timeRangeLatestCard];
        }
        if ((timeRangeBaseline != null && timeRangeBaseline > 0) || timeRangeSavedInStep) {
          return asPassiveSpotlight(timeRangesPanel ?? leftTimeRanges);
        }
        if (panelState.open && panelState.tab === "time-ranges" && timeRangesAddRow) return [timeRangesAddRow];
        if (panelState.open && panelState.tab === "time-ranges" && timeRangesPanel) return [timeRangesPanel];
        return leftTimeRanges ? [leftTimeRanges] : [];
      }
      if (currentStep === 4) {
        if (blockageToolActiveForGuide) {
          if (blockagePhase === "tabs") {
            if (globalBlockageTab) return [globalBlockageTab, ...asPassiveSpotlight(unitTabs)];
            if (unitTabs) return [unitTabs];
            return [];
          }
          if (blockagePhase === "schedule") {
            if (scheduleScroll) return [scheduleScroll];
          }
          if (globalBlockageTab) return [globalBlockageTab, ...asPassiveSpotlight(unitTabs)];
          if (unitTabs) return [unitTabs];
          return [];
        }
        if (rightBlockage) return [rightBlockage];
        const fallback = rightFanToggle ?? rightSolve;
        return fallback ? [fallback] : [];
      }
      if (currentStep === 5) {
        if (cellDialog) return [cellDialog];
        if (cellsPage) {
          if (cellCreateButton) return [cellCreateButton];
          if (cellsCount > 0) return asPassiveSpotlight(cellsPage);
          return [cellsPage];
        }
        return leftCells ? [leftCells] : [];
      }
      return [];
    },
    [
      blockagePhase,
      categoriesCount,
      cellsCount,
      dismissedCreatedHighlights,
      availabilityRuleCreatedInStep,
      participantsCount,
      timeRangeBaseline,
      timeRangeSavedInStep,
      timeRangesCount,
    ],
  );

  const goToStep = useCallback(
    async (nextStep: GuideStep) => {
      if (nextStep !== 1) {
        setLeftPanelState({ open: false, tab: null });
        requestLeftPanel(null);
      }
      if (nextStep !== 4) {
        requestRightFan(false);
      }
      if (nextStep === 4) {
        setBlockagePhase("tool");
        setBlockageToolRequested(false);
        requestRightFan(false);
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(stepKey, String(nextStep));
      }
      setStep(nextStep);
      if (nextStep >= 2 && pathname.includes("/participants/")) {
        router.push(`/grid/${encodeURIComponent(gridCode)}?onboarding=1`);
      }
      if (nextStep < 5 && pathname.endsWith("/cells")) {
        router.push(`/grid/${encodeURIComponent(gridCode)}?onboarding=1`);
      }
      if (nextStep === 2) {
        const [categoryCount, unitCount] = await Promise.all([
          fetchCollectionCount(`/api/categories?grid=${encodeURIComponent(String(gridId))}`),
          fetchCollectionCount(`/api/units?grid=${encodeURIComponent(String(gridId))}`),
        ]);
        setCategoriesCount(categoryCount);
        setCategoryBaseline(categoryCount);
        setUnitsCount(unitCount);
        setUnitBaseline(unitCount);
      }
      if (nextStep === 3) {
        const nextCount = await fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`);
        setTimeRangesCount(nextCount);
        setTimeRangeBaseline(nextCount);
        setTimeRangeSavedInStep(false);
      }
      if (nextStep === 5) {
        const nextCount = await fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`);
        setCellsCount(nextCount);
        setCellBaseline(nextCount);
      }
    },
    [gridCode, gridId, pathname, requestLeftPanel, requestRightFan, router, stepKey],
  );

  useEffect(() => {
    const savedStep = readSavedStep(stepKey);
    if (!show && savedStep == null) {
      setActive(false);
      return;
    }
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(doneKey) === "1") {
      setActive(false);
      stripOnboardingParam();
      return;
    }

    let cancelled = false;
    setActive(true);
    setStep(savedStep ?? 0);
    setEngagedSteps(readGuideEngagement(engagementKey));

    (async () => {
      const [pCount, catCount, unitCount, trCount, cCount] = await Promise.all([
        fetchCollectionCount(`/api/participants?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/categories?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/units?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`),
      ]);
      if (cancelled) return;
      setParticipantsCount(pCount);
      setCategoriesCount(catCount);
      setUnitsCount(unitCount);
      setTimeRangesCount(trCount);
      setCellsCount(cCount);
      setCategoryBaseline(catCount);
      setUnitBaseline(unitCount);
      setTimeRangeBaseline(trCount);
      setCellBaseline(cCount);
    })();

    return () => {
      cancelled = true;
    };
  }, [doneKey, engagementKey, gridId, show, stepKey, stripOnboardingParam]);

  useEffect(() => {
    if (!active) return;
    const syncViewport = () => setViewport(readViewport());
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const refresh = () => setSpotlights(resolveStepSpotlights(step, viewport, leftPanelState));
    refresh();
    const onScroll = () => refresh();
    const onResize = () => refresh();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    const intervalId = window.setInterval(refresh, 250);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.clearInterval(intervalId);
    };
  }, [active, leftPanelState, resolveStepSpotlights, step, viewport]);

  useEffect(() => {
    if (!active) return;
    const unitTabsHighlighted = spotlights.some(
      (spotlight) => !spotlight.passive && (spotlight.id === "unit-tabs" || spotlight.id === "global-blockage-tab"),
    );
    if (step === 2 && unitTabsHighlighted) {
      categoryUnitTabsHintSeenRef.current = true;
      return;
    }
    if (step !== 2 && categoryUnitTabsHintSeenRef.current && !dismissedCreatedHighlights.categoryUnitTabs) {
      setDismissedCreatedHighlights((prev) => ({ ...prev, categoryUnitTabs: true }));
    }
  }, [active, dismissedCreatedHighlights.categoryUnitTabs, spotlights, step]);

  useEffect(() => {
    if (!active) return;
    if (step !== 4) {
      setBlockagePhase("tool");
      setBlockageToolRequested(false);
      return;
    }
    const blockageSelectorVisible = isElementInteractive(SELECTORS.rightBlockage);
    if (!isBlockageToolActive()) {
      setBlockagePhase((prev) => (prev !== "tool" && blockageSelectorVisible ? "tabs" : "tool"));
      return;
    }
    setBlockageToolRequested(false);
    setBlockagePhase((prev) => (prev === "tool" ? "tabs" : prev));
  }, [active, blockageToolRequested, step, spotlights]);

  useEffect(() => {
    if (!active) return;
    const categoryUnitTabsVisible =
      step === 2 &&
      spotlights.some(
        (spotlight) => !spotlight.passive && (spotlight.id === "unit-tabs" || spotlight.id === "global-blockage-tab"),
      );
    if (step === 1) {
      if (document.querySelector(SELECTORS.participantDetailPage)) {
        requestLeftPanel(null);
      } else if (engagedSteps.participantsOpened) {
        requestLeftPanel("participants");
      } else if (leftPanelState.open) {
        requestLeftPanel(null);
      }
      requestRightFan(false);
      return;
    }
    if (step === 2) {
      if (categoryUnitTabsVisible) {
        if (leftPanelState.open) requestLeftPanel(null);
      } else if (engagedSteps.categoriesOpened) {
        if (!leftPanelState.open || leftPanelState.tab !== "categories") {
          requestLeftPanel("categories");
        }
      } else if (leftPanelState.open) {
        requestLeftPanel(null);
      }
      requestRightFan(false);
      return;
    }
    if (step === 3) {
      if (engagedSteps.timeRangesOpened) {
        if (!leftPanelState.open || leftPanelState.tab !== "time-ranges") {
          requestLeftPanel("time-ranges");
        }
      } else if (leftPanelState.open) {
        requestLeftPanel(null);
      }
      requestRightFan(false);
      return;
    }
    if (step === 4) {
      requestLeftPanel(null);
      if (isBlockageToolActive()) {
        requestRightFan(false);
      } else {
        requestRightFan(engagedSteps.blockageFanOpened);
      }
      if (blockagePhase !== "tool" && !isBlockageToolActive()) {
        requestRightTool("blockage");
      }
      return;
    }
    if (step === 5) {
      if (leftPanelState.open) {
        requestLeftPanel(null);
      }
      requestRightFan(false);
      return;
    }
    requestLeftPanel(null);
    requestRightFan(false);
  }, [
    active,
    blockagePhase,
    engagedSteps.blockageFanOpened,
    engagedSteps.categoriesOpened,
    engagedSteps.participantsOpened,
    engagedSteps.timeRangesOpened,
    leftPanelState.open,
    leftPanelState.tab,
    requestLeftPanel,
    requestRightFan,
    requestRightTool,
    spotlights,
    step,
  ]);

  useEffect(() => {
    if (!active) return;
    if (![1, 2, 3, 5].includes(step)) return;
    let cancelled = false;
    const poll = async () => {
      if (step === 1) {
        const count = await fetchCollectionCount(`/api/participants?grid=${encodeURIComponent(String(gridId))}`);
        if (!cancelled) setParticipantsCount(count);
        return;
      }
      if (step === 2) {
        const [categoryCount, unitCount] = await Promise.all([
          fetchCollectionCount(`/api/categories?grid=${encodeURIComponent(String(gridId))}`),
          fetchCollectionCount(`/api/units?grid=${encodeURIComponent(String(gridId))}`),
        ]);
        if (!cancelled) {
          setCategoriesCount(categoryCount);
          setUnitsCount(unitCount);
        }
        return;
      }
      if (step === 3) {
        const count = await fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`);
        if (!cancelled) setTimeRangesCount(count);
        return;
      }
      if (step === 5) {
        const count = await fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`);
        if (!cancelled) setCellsCount(count);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, gridId, step]);

  useEffect(() => {
    if (!active) return;
    const onSaved = () => setTimeRangeSavedInStep(true);
    window.addEventListener(TIME_RANGE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(TIME_RANGE_SAVED_EVENT, onSaved);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onAvailabilityRuleCreated = () => setAvailabilityRuleCreatedInStep(true);
    window.addEventListener(AVAILABILITY_RULE_CREATED_EVENT, onAvailabilityRuleCreated);
    return () => window.removeEventListener(AVAILABILITY_RULE_CREATED_EVENT, onAvailabilityRuleCreated);
  }, [active]);

  const forwardInteraction = useCallback((event: React.PointerEvent<HTMLDivElement>, allowedSelectors?: string[]) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const x = event.clientX;
    const y = event.clientY;
    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    overlay.style.pointerEvents = "auto";
    if (!target) return;
    if (allowedSelectors?.length && !allowedSelectors.some((selector) => selectorContainsTarget(selector, target))) {
      return;
    }
    const pointerInit: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: event.screenX,
      screenY: event.screenY,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", pointerInit));
    target.dispatchEvent(new PointerEvent("pointerup", pointerInit));
    target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        screenX: event.screenX,
        screenY: event.screenY,
      }),
    );
  }, []);

  const forwardPointerDownOnly = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const x = event.clientX;
    const y = event.clientY;
    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    overlay.style.pointerEvents = "auto";
    if (!target) return;
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        screenX: event.screenX,
        screenY: event.screenY,
        button: event.button,
        buttons: event.buttons,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      }),
    );
  }, []);

  const onOverlayPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-onboarding-ui="true"]')) return;

      const isInsideSelector = (selector: string) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      };

      const activeSpotlight = spotlights.find((rect) => !rect.passive) ?? null;
      const dismissCreatedHighlight = (key: string) => {
        setDismissedCreatedHighlights((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      };

      if (activeSpotlight?.id === "participants-latest-row") {
        event.preventDefault();
        event.stopPropagation();
        dismissCreatedHighlight("participant");
        return;
      }

      if (activeSpotlight?.id === "categories-latest-row") {
        event.preventDefault();
        event.stopPropagation();
        dismissCreatedHighlight("category");
        return;
      }

      if (activeSpotlight?.id === "category-value-latest-row") {
        event.preventDefault();
        event.stopPropagation();
        dismissCreatedHighlight("categoryValue");
        return;
      }

      if (step === 1 && participantsCount > 0) {
        const participantDetailMode = Boolean(document.querySelector(SELECTORS.participantDetailPage));
        if (participantDetailMode) {
          event.preventDefault();
          event.stopPropagation();
          const participantDetailAllowedTargets = [
            SELECTORS.availabilityAddRuleButton,
            SELECTORS.availabilityRuleDialog,
            SELECTORS.availabilityRuleLatest,
            SELECTORS.participantRulesTimetable,
          ];
          if (participantDetailAllowedTargets.some((selector) => isInsideSelector(selector))) {
            forwardInteraction(event, participantDetailAllowedTargets);
            return;
          }
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (
          isInsideSelector(SELECTORS.participantsPanel) ||
          isInsideSelector(SELECTORS.participantDialog) ||
          isInsideSelector(SELECTORS.participantsAddButton)
        ) {
          forwardInteraction(event, [SELECTORS.participantsPanel, SELECTORS.participantDialog, SELECTORS.participantsAddButton]);
          return;
        }
        void goToStep(2);
        return;
      }

      const timeRangeHasPendingSave =
        step === 3 && timeRangeBaseline != null && timeRangesCount > timeRangeBaseline && !timeRangeSavedInStep;
      const categoryStepEngaged = leftPanelState.open && leftPanelState.tab === "categories";
      const timeRangeStepEngaged = leftPanelState.open && leftPanelState.tab === "time-ranges";
      const cellStepEngaged = Boolean(document.querySelector(SELECTORS.cellsPage));
      const completedStepTargets =
        step === 2 && categoryStepEngaged && hasExistingCategorySetup(categoryBaseline, unitBaseline)
          ? [SELECTORS.categoriesPanel, SELECTORS.categoriesAddButton, SELECTORS.categoryDialog]
          : step === 3 &&
            timeRangeStepEngaged &&
            !timeRangeHasPendingSave &&
            ((timeRangeBaseline != null && timeRangeBaseline > 0) || timeRangeSavedInStep)
          ? [SELECTORS.timeRangesPanel, SELECTORS.timeRangesAddRow]
          : step === 5 && cellStepEngaged && cellsCount > 0
          ? [SELECTORS.cellsPage, SELECTORS.cellCreateButton, SELECTORS.cellDialog]
          : [];

      if (completedStepTargets.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        if (completedStepTargets.some((selector) => isInsideSelector(selector))) {
          forwardInteraction(event, completedStepTargets);
          return;
        }
        void goToStep((step + 1) as GuideStep);
        return;
      }

      if (step === 0 || step === 6 || spotlights.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const insideSpotlight = spotlights.some((rect) => pointInside(rect, event.clientX, event.clientY));
      if (!insideSpotlight) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (step === 4 && isInsideSelector(SELECTORS.rightFanToggle) && !engagedSteps.blockageFanOpened) {
        markEngaged({ blockageFanOpened: true });
      }
      if (
        step === 4 &&
        blockagePhase === "tabs" &&
        (isInsideSelector(SELECTORS.globalBlockageTab) || isInsideSelector(SELECTORS.unitTabs))
      ) {
        if (!engagedSteps.blockageFanOpened) {
          markEngaged({ blockageFanOpened: true });
        }
        forwardInteraction(event, [SELECTORS.globalBlockageTab, SELECTORS.unitTabs]);
        window.setTimeout(() => {
          if (isBlockageToolActive()) {
            setBlockagePhase("schedule");
            return;
          }
          requestRightTool("blockage");
          setBlockageToolRequested(true);
        }, 0);
        return;
      }
      if (step === 4 && spotlights.some((rect) => rect.id === "right-blockage" && pointInside(rect, event.clientX, event.clientY))) {
        if (!engagedSteps.blockageFanOpened) {
          markEngaged({ blockageFanOpened: true });
        }
        requestRightTool("blockage");
        setBlockageToolRequested(true);
        setBlockagePhase("tool");
        return;
      }
      if (step === 4 && spotlights.some((rect) => rect.id === "schedule-grid" && pointInside(rect, event.clientX, event.clientY))) {
        forwardPointerDownOnly(event);
        return;
      }
      const allowedSelectors =
        step === 1
          ? document.querySelector(SELECTORS.participantDetailPage)
            ? [
                SELECTORS.availabilityAddRuleButton,
                SELECTORS.availabilityRuleDialog,
                SELECTORS.availabilityRuleLatest,
                SELECTORS.participantRulesTimetable,
              ]
            : [SELECTORS.leftParticipants, SELECTORS.participantsPanel, SELECTORS.participantsAddButton, SELECTORS.participantDialog]
        : step === 2
          ? leftPanelState.open && leftPanelState.tab === "categories"
            ? [
                SELECTORS.categoriesPanel,
                SELECTORS.categoriesAddButton,
                SELECTORS.categoryDialog,
                SELECTORS.categoryValueAddRow,
                SELECTORS.categoryValueLatestRow,
                SELECTORS.unitTabs,
              ]
            : spotlights.some(
                (spotlight) => spotlight.id === "unit-tabs" || spotlight.id === "global-blockage-tab",
              )
            ? [SELECTORS.unitTabs, SELECTORS.globalBlockageTab]
            : [SELECTORS.leftCategories]
          : step === 3
          ? leftPanelState.open && leftPanelState.tab === "time-ranges"
            ? [SELECTORS.timeRangesPanel, SELECTORS.timeRangesAddRow, SELECTORS.timeRangeLatestCard]
            : [SELECTORS.leftTimeRanges]
          : step === 4
          ? [SELECTORS.rightFanToggle, SELECTORS.rightBlockage, SELECTORS.rightFan, SELECTORS.globalBlockageTab, SELECTORS.unitTabs]
          : step === 5
          ? document.querySelector(SELECTORS.cellsPage)
            ? [SELECTORS.cellCreateButton, SELECTORS.cellDialog, SELECTORS.cellsPage]
            : [SELECTORS.leftCells]
          : [];
      forwardInteraction(event, allowedSelectors);
    },
    [
      blockagePhase,
      categoryBaseline,
      cellsCount,
      engagedSteps.blockageFanOpened,
      forwardInteraction,
      forwardPointerDownOnly,
      goToStep,
      leftPanelState.open,
      leftPanelState.tab,
      markEngaged,
      requestRightTool,
      participantsCount,
      spotlights,
      step,
      timeRangeBaseline,
      timeRangeSavedInStep,
      timeRangesCount,
      unitBaseline,
    ],
  );

  const getCurrentAllowedSelectors = useCallback(() => {
    const activeSpotlight = spotlights.find((rect) => !rect.passive) ?? null;
    const uiSelectors = ['[data-onboarding-ui="true"]'];

    if (step === 1) {
      if (document.querySelector(SELECTORS.participantDetailPage)) {
        return [
          ...uiSelectors,
          SELECTORS.availabilityAddRuleButton,
          SELECTORS.availabilityRuleDialog,
          SELECTORS.availabilityRuleLatest,
          SELECTORS.participantRulesTimetable,
        ];
      }
      return [
        ...uiSelectors,
        SELECTORS.leftParticipants,
        SELECTORS.participantsPanel,
        SELECTORS.participantsAddButton,
        SELECTORS.participantDialog,
      ];
    }
    if (step === 2) {
      if (!leftPanelState.open || leftPanelState.tab !== "categories") {
        if (spotlights.some((spotlight) => spotlight.id === "unit-tabs" || spotlight.id === "global-blockage-tab")) {
          return [...uiSelectors, SELECTORS.unitTabs, SELECTORS.globalBlockageTab];
        }
        return [...uiSelectors, SELECTORS.leftCategories];
      }
      return [
        ...uiSelectors,
        SELECTORS.categoriesPanel,
        SELECTORS.categoriesAddButton,
        SELECTORS.categoryDialog,
        SELECTORS.categoryValueAddRow,
        SELECTORS.categoryValueLatestRow,
        SELECTORS.unitTabs,
      ];
    }
    if (step === 3) {
      if (!leftPanelState.open || leftPanelState.tab !== "time-ranges") {
        return [...uiSelectors, SELECTORS.leftTimeRanges];
      }
      return [...uiSelectors, SELECTORS.timeRangesPanel, SELECTORS.timeRangesAddRow, SELECTORS.timeRangeLatestCard];
    }
    if (step === 4) {
      return [
        ...uiSelectors,
        SELECTORS.rightFanToggle,
        SELECTORS.rightFan,
        SELECTORS.rightBlockage,
        SELECTORS.globalBlockageTab,
        SELECTORS.unitTabs,
        activeSpotlight?.id === "schedule-grid" ? SELECTORS.scheduleScroll : "",
      ].filter(Boolean);
    }
    if (step === 5) {
      if (!document.querySelector(SELECTORS.cellsPage)) {
        return [...uiSelectors, SELECTORS.leftCells];
      }
      return [...uiSelectors, SELECTORS.cellsPage, SELECTORS.cellCreateButton, SELECTORS.cellDialog];
    }
    return uiSelectors;
  }, [leftPanelState.open, leftPanelState.tab, spotlights, step]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = queryAllowedFocusable(getCurrentAllowedSelectors());
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const current = document.activeElement as HTMLElement | null;
      const currentIndex = current ? focusable.indexOf(current) : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : event.shiftKey
          ? (currentIndex - 1 + focusable.length) % focusable.length
          : (currentIndex + 1) % focusable.length;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, getCurrentAllowedSelectors]);

  useEffect(() => {
    if (!active) return;
    const activeSpotlight = spotlights.find((rect) => !rect.passive) ?? null;
    if (!activeSpotlight) return;

    const focusTargetSelector =
      activeSpotlight.id === "participant-dialog"
        ? `${SELECTORS.participantDialog} input`
        : activeSpotlight.id === "category-dialog"
        ? `${SELECTORS.categoryDialog} input`
        : activeSpotlight.id === "category-value-add-row"
        ? SELECTORS.categoryValueNameInput
        : activeSpotlight.id === "time-ranges-add-row"
        ? SELECTORS.timeRangesNameInput
        : activeSpotlight.id === "cell-dialog"
        ? `${SELECTORS.cellDialog} input`
        : null;

    if (!focusTargetSelector) return;
    const focusKey = `${step}:${activeSpotlight.id}`;
    if (lastFocusedTargetRef.current === focusKey) return;
    lastFocusedTargetRef.current = focusKey;

    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(focusTargetSelector);
      target?.focus();
    }, 50);
  }, [active, spotlights, step]);

  if (!active || !mounted || typeof document === "undefined") return null;

  const primarySpotlight = spotlights.find((spotlight) => !spotlight.passive) ?? null;
  const leftDockSpotlight = spotlights.find((spotlight) => spotlight.id === "left-dock") ?? null;
  const rightDockSpotlight = spotlights.find((spotlight) => spotlight.id === "right-dock") ?? null;
  const stepZeroTooltips = resolveStepZeroTooltipStyles(leftDockSpotlight, rightDockSpotlight, viewport);
  const participantsPanelOpen = leftPanelState.open && leftPanelState.tab === "participants";
  const participantDetailPageVisible = Boolean(document.querySelector(SELECTORS.participantDetailPage));
  const participantDialogVisible = primarySpotlight?.id === "participant-dialog";
  const availabilityAddRuleButtonVisible = primarySpotlight?.id === "availability-add-rule-button";
  const availabilityRuleLatestVisible = primarySpotlight?.id === "availability-rule-latest";
  const participantCreatedInStep = step === 1 && participantsCount > 0 && !participantDetailPageVisible;
  const categoriesPanelOpen = leftPanelState.open && leftPanelState.tab === "categories";
  const categoryDialogVisible = primarySpotlight?.id === "category-dialog";
  const categoryValueAddVisible = primarySpotlight?.id === "category-value-add-row";
  const unitTabsVisible = primarySpotlight?.id === "unit-tabs" || primarySpotlight?.id === "global-blockage-tab";
  const timeRangesPanelOpen = leftPanelState.open && leftPanelState.tab === "time-ranges";
  const timeRangeCreatedInStep = timeRangeBaseline != null && timeRangesCount > timeRangeBaseline;
  const blockageToolSelectable = primarySpotlight?.id === "right-blockage";
  const blockageToolActive = primarySpotlight?.id === "schedule-grid";
  const cellCreateButtonVisible = primarySpotlight?.id === "cell-create-button";
  const categoryUnitHintKey =
    unitNature === "audience" || unitNature === "space" || unitNature === "internal" || unitNature === "none"
      ? `onboarding.category_step_unit_hint_${unitNature}`
      : "onboarding.category_step_unit_hint_default";
  const timeRangeHasPendingSave =
    step === 3 && timeRangeBaseline != null && timeRangesCount > timeRangeBaseline && !timeRangeSavedInStep;
  const participantRuleReady = availabilityRuleCreatedInStep || availabilityRuleLatestVisible;
  const canMoveForward =
    step === 6
      ? true
      : (step !== 1 || participantsCount > 0) && !timeRangeHasPendingSave;
  const optionalStepEngaged =
    (step === 2 &&
      (categoriesPanelOpen ||
        categoryDialogVisible ||
        categoryValueAddVisible ||
        primarySpotlight?.id === "categories-latest-row" ||
        primarySpotlight?.id === "category-value-latest-row" ||
        unitTabsVisible)) ||
    (step === 3 && (timeRangesPanelOpen || primarySpotlight?.id === "time-range-latest-card")) ||
    (step === 4 &&
      (primarySpotlight?.id === "right-blockage" ||
        blockagePhase !== "tool" ||
        blockageToolRequested ||
        isBlockageToolActive())) ||
    (step === 5 && primarySpotlight?.id !== "left-cells");
  const optionalStep = (step === 1 && participantDetailPageVisible) || (step >= 2 && step <= 5);
  const canSkipCurrentStep = optionalStep && !optionalStepEngaged;

  const moveBackward = () => {
    if (step <= 0) return;
    void goToStep((step - 1) as GuideStep);
  };

  const moveForward = () => {
    if (!canMoveForward) return;
    if (step === 6) {
      finishGuide();
      return;
    }
    if (step === 4 && isBlockageToolActive() && blockagePhase === "tool") {
      setBlockagePhase("tabs");
      return;
    }
    if (step === 4 && blockagePhase === "tabs") {
      setBlockagePhase("schedule");
      return;
    }
    void goToStep((step + 1) as GuideStep);
  };

  const moveToStep = (targetStep: GuideStep) => {
    if (targetStep > 1 && participantsCount <= 0) return;
    void goToStep(targetStep);
  };

  const skipCurrentStep = () => {
    if (!canSkipCurrentStep) return;
    void goToStep((step + 1) as GuideStep);
  };

  const stepCard = (() => {
    if (!primarySpotlight) return null;
    if (step === 3 && timeRangeCreatedInStep) return null;
    if (step === 1 && participantDetailPageVisible && participantRuleReady) return null;
    if (
      primarySpotlight.id === "participant-dialog" ||
      primarySpotlight.id === "availability-rule-dialog" ||
      primarySpotlight.id === "category-dialog" ||
      primarySpotlight.id === "category-value-add-row" ||
      primarySpotlight.id === "category-value-latest-row" ||
      primarySpotlight.id === "cell-dialog"
    ) {
      return null;
    }
    if (step === 5) {
      return tooltipStyle(primarySpotlight, viewport, cellCreateButtonVisible && viewport.width >= 640 ? "left" : "bottom");
    }
    if (step === 1 && participantDetailPageVisible) {
      return tooltipStyle(primarySpotlight, viewport, availabilityAddRuleButtonVisible && viewport.width >= 640 ? "left" : "bottom");
    }
    if (step === 4) return tooltipStyle(primarySpotlight, viewport, "left");
    if (step === 1 || step === 2 || step === 3) return tooltipStyle(primarySpotlight, viewport, "right");
    return tooltipStyle(primarySpotlight, viewport, "bottom");
  })();

  const content = (
    <>
      <div
        ref={overlayRef}
        data-onboarding-overlay="true"
        className="fixed inset-0 isolate pointer-events-auto"
        style={{ zIndex: 1700 }}
        onPointerDown={onOverlayPointerDown}
        aria-hidden={false}
      >
        <svg className="absolute inset-0 pointer-events-none" width={viewport.width} height={viewport.height}>
        <defs>
          <mask
            id={`onboarding-mask-${maskId}`}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={viewport.width}
            height={viewport.height}
          >
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
            {spotlights.map((spotlight) => (
              <rect
                key={`mask-hole-${spotlight.id}`}
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx={SPOTLIGHT_RADIUS}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={viewport.width}
          height={viewport.height}
          fill={`rgba(0,0,0,${OVERLAY_ALPHA})`}
          mask={`url(#onboarding-mask-${maskId})`}
        />
      </svg>

      </div>

      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1800 }}>
      <AnimatePresence>
        {spotlights
          .filter((spotlight) => !spotlight.passive)
          .map((spotlight) => (
            <motion.div
              key={`spotlight-ring-${spotlight.id}`}
              className="pointer-events-none absolute rounded-xl border border-white/90"
              initial={false}
              animate={{
                left: spotlight.left,
                top: spotlight.top,
                width: spotlight.width,
                height: spotlight.height,
                boxShadow: [
                  "0 0 0 0 rgba(255,255,255,0.55)",
                  "0 0 0 8px rgba(255,255,255,0)",
                  "0 0 0 0 rgba(255,255,255,0.55)",
                ],
              }}
              transition={{
                left: { duration: 0.3, ease: "easeInOut" },
                top: { duration: 0.3, ease: "easeInOut" },
                width: { duration: 0.3, ease: "easeInOut" },
                height: { duration: 0.3, ease: "easeInOut" },
                boxShadow: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
              }}
            />
          ))}
      </AnimatePresence>

      {step === 0 && stepZeroTooltips ? (
        <>
          <motion.div
            data-onboarding-ui="true"
            className="pointer-events-auto absolute max-w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
            style={{ ...stepZeroTooltips.left, zIndex: 504 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="text-base font-semibold text-gray-900">{t("onboarding.entity_dock_title")}</h3>
            <p className="mt-1 text-sm text-gray-700">{t("onboarding.entity_dock_description")}</p>
          </motion.div>
          <motion.div
            data-onboarding-ui="true"
            className="pointer-events-auto absolute max-w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
            style={{ ...stepZeroTooltips.right, zIndex: 504 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="text-base font-semibold text-gray-900">{t("onboarding.action_dock_title")}</h3>
            <p className="mt-1 text-sm text-gray-700">{t("onboarding.action_dock_description")}</p>
          </motion.div>
        </>
      ) : null}

      {step >= 1 && step <= 5 && stepCard && !participantCreatedInStep ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={`onboarding-card-step-${step}`}
            data-onboarding-ui="true"
            className="pointer-events-auto absolute max-w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
            style={{ ...stepCard, zIndex: 504 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.participant_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {participantDetailPageVisible
                    ? availabilityRuleLatestVisible
                      ? t("onboarding.participant_rule_step_move_tip")
                      : availabilityAddRuleButtonVisible
                      ? t("onboarding.participant_rule_step_click_add")
                      : t("onboarding.participant_rule_step_open")
                    : participantsPanelOpen
                    ? participantDialogVisible
                      ? t("onboarding.participant_step_complete_dialog")
                      : t("onboarding.participant_step_click_add")
                    : t("onboarding.participant_step_open_bubble")}
                </p>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.category_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {unitTabsVisible
                    ? t("onboarding.category_step_unit_tabs")
                    : categoryValueAddVisible
                    ? t("onboarding.category_step_add_value")
                    : categoryDialogVisible
                    ? t("onboarding.category_step_complete_dialog")
                    : categoriesPanelOpen
                    ? t("onboarding.category_step_click_add")
                    : `${t(categoryUnitHintKey as Parameters<typeof t>[0])} ${t("onboarding.category_step_open_bubble")}`}
                </p>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.time_range_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {timeRangesPanelOpen
                    ? timeRangeCreatedInStep
                      ? t("onboarding.time_range_step_adjust_created")
                      : t("onboarding.time_range_step_click_add")
                    : t("onboarding.time_range_step_open_bubble")}
                </p>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.blockage_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {unitTabsVisible
                    ? t("onboarding.blockage_step_tabs")
                    : blockageToolActive
                    ? t("onboarding.blockage_step_click_timetable")
                    : blockageToolSelectable
                    ? t("onboarding.blockage_step_select_tool")
                    : t("onboarding.blockage_step_open_actions")}
                </p>
              </>
            ) : null}

            {step === 5 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.cell_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {cellCreateButtonVisible ? t("onboarding.cell_step_click_create") : t("onboarding.cell_step_description")}
                </p>
              </>
            ) : null}

            {canSkipCurrentStep ? (
              <button
                type="button"
                data-onboarding-ui="true"
                className="mt-3 text-sm text-gray-500 underline underline-offset-2"
                onClick={skipCurrentStep}
              >
                {t("onboarding.skip")}
              </button>
            ) : null}
          </motion.div>
        </AnimatePresence>
      ) : null}

      {step === 6 ? (
        <motion.div
          data-onboarding-ui="true"
          className="pointer-events-auto absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
          style={{ zIndex: 504 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h3 className="text-base font-semibold text-gray-900">{t("onboarding.final_step_title")}</h3>
          <p className="mt-1 text-sm text-gray-700">{t("onboarding.final_step_description")}</p>
          <button
            type="button"
            data-onboarding-ui="true"
            className="mt-3 text-sm text-gray-600 underline underline-offset-2"
            onClick={() => router.push(`/grid/${encodeURIComponent(gridCode)}/settings`)}
          >
            {t("onboarding.go_to_settings")}
          </button>
        </motion.div>
      ) : null}

      </div>

      <div
        data-onboarding-ui="true"
        className="fixed flex items-center gap-4 pointer-events-auto"
        style={{ zIndex: 1810, left: "50%", bottom: 40, transform: "translateX(-50%)", pointerEvents: "auto" }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg transition ${
            step <= 0 ? "pointer-events-none opacity-45" : "hover:scale-105"
          }`}
          onClick={moveBackward}
          aria-label={t("onboarding.previous")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur-sm">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => {
            const targetStep = index as GuideStep;
            const isCurrent = index === step;
            const isDone = index < step;
            const disabled = targetStep > 1 && participantsCount <= 0;
            return (
              <button
                key={`onboarding-progress-${index}`}
                type="button"
                disabled={disabled}
                onClick={() => moveToStep(targetStep)}
                className={`h-2.5 w-2.5 rounded-full border transition ${
                  isCurrent || isDone ? "border-white bg-white" : "border-white/70 bg-transparent"
                } ${disabled ? "cursor-not-allowed opacity-40" : "hover:scale-125"}`}
                aria-label={`Go to onboarding step ${index + 1}`}
              />
            );
          })}
        </div>

        <button
          type="button"
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg transition ${
            canMoveForward ? "hover:scale-105" : "pointer-events-none opacity-45"
          }`}
          onClick={moveForward}
          aria-label={t("onboarding.next")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
