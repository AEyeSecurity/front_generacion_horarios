"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/lib/use-i18n";

type OnboardingGuideProps = {
  gridId: number;
  gridCode: string;
  show: boolean;
};

type GuideStep = 0 | 1 | 2 | 3 | 4 | 5;

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
};

type LeftPanelTab = "participants" | "categories" | "time-ranges" | null;

type LeftPanelState = {
  open: boolean;
  tab: LeftPanelTab;
};

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 12;
const OVERLAY_ALPHA = 0.45;
const TOTAL_STEPS = 6;
const GRID_LEFT_PANEL_STATE_EVENT = "shift:grid-left-panel-state";

const SELECTORS = {
  leftParticipants: '[data-onboarding-target="left-dock-participants"]',
  leftTimeRanges: '[data-onboarding-target="left-dock-time-ranges"]',
  leftCells: '[data-onboarding-target="left-dock-cells"]',
  participantsAddButton: '[data-onboarding-target="participants-add-button"]',
  timeRangesAddButton: '[data-onboarding-target="time-ranges-add-button"]',
  rightSolve: '[data-onboarding-target="right-dock-solve"]',
  rightFanToggle: '[data-onboarding-target="right-dock-fan-toggle"]',
  rightBlockage: '[data-onboarding-target="right-dock-blockage"]',
} as const;

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

function pointInside(rect: SpotlightRect, x: number, y: number) {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function tooltipStyle(
  rect: SpotlightRect,
  viewport: Viewport,
  side: "left" | "right" | "bottom",
): React.CSSProperties {
  const cardWidth = Math.min(320, Math.max(240, viewport.width - 48));
  const cardHeight = 164;
  let left = 16;
  let top = 16;

  if (side === "right") {
    left = rect.left + rect.width + 16;
    top = rect.top + rect.height * 0.5 - cardHeight * 0.5;
  } else if (side === "left") {
    left = rect.left - cardWidth - 16;
    top = rect.top + rect.height * 0.5 - cardHeight * 0.5;
  } else {
    left = rect.left + rect.width * 0.5 - cardWidth * 0.5;
    top = rect.top + rect.height + 16;
  }

  left = clamp(left, 16, Math.max(16, viewport.width - cardWidth - 16));
  top = clamp(top, 16, Math.max(16, viewport.height - cardHeight - 16));

  return { width: cardWidth, left, top };
}

export default function OnboardingGuide({ gridId, gridCode, show }: OnboardingGuideProps) {
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
  const [timeRangesCount, setTimeRangesCount] = useState(0);
  const [cellsCount, setCellsCount] = useState(0);
  const [leftPanelState, setLeftPanelState] = useState<LeftPanelState>({ open: false, tab: null });
  const [timeRangeBaseline, setTimeRangeBaseline] = useState<number | null>(null);
  const [cellBaseline, setCellBaseline] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const doneKey = useMemo(() => `onboarding-done-grid-${gridId}`, [gridId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onLeftPanelState = (
      event: Event,
    ) => {
      const custom = event as CustomEvent<{ gridId?: string; open?: boolean; tab?: string }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      const rawTab = custom.detail?.tab;
      const normalizedTab: LeftPanelTab =
        rawTab === "participants" || rawTab === "categories" || rawTab === "time-ranges"
          ? rawTab
          : null;
      setLeftPanelState({
        open: Boolean(custom.detail?.open),
        tab: normalizedTab,
      });
    };
    window.addEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
    return () => window.removeEventListener(GRID_LEFT_PANEL_STATE_EVENT, onLeftPanelState as EventListener);
  }, [gridId]);

  const stripOnboardingParam = useCallback(() => {
    const currentParams = new URLSearchParams(searchParams?.toString() ?? "");
    if (!currentParams.has("onboarding")) return;
    currentParams.delete("onboarding");
    const query = currentParams.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    router.replace(next, { scroll: false });
  }, [pathname, router, searchParams]);

  const finishGuide = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(doneKey, "1");
    }
    setActive(false);
    stripOnboardingParam();
  }, [doneKey, stripOnboardingParam]);

  const resolveStepSpotlights = useCallback(
    (currentStep: GuideStep, currentViewport: Viewport, panelState: LeftPanelState) => {
      const leftParticipants = querySpotlight(SELECTORS.leftParticipants, "left-participants", currentViewport);
      const leftTimeRanges = querySpotlight(SELECTORS.leftTimeRanges, "left-time-ranges", currentViewport);
      const leftCells = querySpotlight(SELECTORS.leftCells, "left-cells", currentViewport);
      const participantsAddButton = querySpotlight(
        SELECTORS.participantsAddButton,
        "participants-add-button",
        currentViewport,
      );
      const timeRangesAddButton = querySpotlight(
        SELECTORS.timeRangesAddButton,
        "time-ranges-add-button",
        currentViewport,
      );
      const rightSolve = querySpotlight(SELECTORS.rightSolve, "right-solve", currentViewport);
      const rightFanToggle = querySpotlight(SELECTORS.rightFanToggle, "right-fan-toggle", currentViewport);
      const rightBlockage = querySpotlight(SELECTORS.rightBlockage, "right-blockage", currentViewport);

      if (currentStep === 0) {
        return [leftParticipants, rightSolve ?? rightFanToggle].filter(Boolean) as SpotlightRect[];
      }
      if (currentStep === 1) {
        if (panelState.open && panelState.tab === "participants" && participantsAddButton) {
          return [participantsAddButton];
        }
        return leftParticipants ? [leftParticipants] : [];
      }
      if (currentStep === 2) {
        if (panelState.open && panelState.tab === "time-ranges" && timeRangesAddButton) {
          return [timeRangesAddButton];
        }
        return leftTimeRanges ? [leftTimeRanges] : [];
      }
      if (currentStep === 3) {
        if (rightBlockage) return [rightBlockage];
        const fallback = rightFanToggle ?? rightSolve;
        return fallback ? [fallback] : [];
      }
      if (currentStep === 4) {
        return leftCells ? [leftCells] : [];
      }
      return [];
    },
    [],
  );

  const goToStep = useCallback(
    async (nextStep: GuideStep) => {
      setStep(nextStep);
      if (nextStep === 2) {
        const nextCount = await fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`);
        setTimeRangesCount(nextCount);
        setTimeRangeBaseline(nextCount);
      }
      if (nextStep === 4) {
        const nextCount = await fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`);
        setCellsCount(nextCount);
        setCellBaseline(nextCount);
      }
    },
    [gridId],
  );

  useEffect(() => {
    if (!show) {
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
    setStep(0);

    (async () => {
      const [pCount, trCount, cCount] = await Promise.all([
        fetchCollectionCount(`/api/participants?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`),
      ]);
      if (cancelled) return;
      setParticipantsCount(pCount);
      setTimeRangesCount(trCount);
      setCellsCount(cCount);
      setTimeRangeBaseline(trCount);
      setCellBaseline(cCount);
    })();

    return () => {
      cancelled = true;
    };
  }, [doneKey, gridId, show, stripOnboardingParam]);

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
    if (![1, 2, 4].includes(step)) return;
    let cancelled = false;

    const poll = async () => {
      if (step === 1) {
        const count = await fetchCollectionCount(`/api/participants?grid=${encodeURIComponent(String(gridId))}`);
        if (cancelled) return;
        setParticipantsCount(count);
        if (count > 0) {
          await goToStep(2);
        }
        return;
      }

      if (step === 2) {
        const count = await fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`);
        if (cancelled) return;
        setTimeRangesCount(count);
        if (timeRangeBaseline != null && count > timeRangeBaseline) {
          await goToStep(3);
        }
        return;
      }

      if (step === 4) {
        const count = await fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`);
        if (cancelled) return;
        setCellsCount(count);
        if (cellBaseline != null && count > cellBaseline) {
          await goToStep(5);
        }
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, cellBaseline, goToStep, gridId, step, timeRangeBaseline]);

  const forwardInteraction = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const x = event.clientX;
    const y = event.clientY;

    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    overlay.style.pointerEvents = "auto";
    if (!target) return;

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

  const onOverlayPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-onboarding-ui="true"]')) return;

      if (step === 0 || step === 5 || spotlights.length === 0) {
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
      forwardInteraction(event);
    },
    [forwardInteraction, spotlights, step],
  );

  if (!active || !mounted || typeof document === "undefined") return null;

  const primarySpotlight = spotlights[0] ?? null;
  const leftDockSpotlight = spotlights.find((spotlight) => spotlight.id === "left-participants") ?? null;
  const rightDockSpotlight =
    spotlights.find((spotlight) => spotlight.id === "right-solve") ??
    spotlights.find((spotlight) => spotlight.id === "right-fan-toggle") ??
    null;

  const participantsPanelOpen = leftPanelState.open && leftPanelState.tab === "participants";
  const timeRangesPanelOpen = leftPanelState.open && leftPanelState.tab === "time-ranges";
  const blockageToolSelectable = primarySpotlight?.id === "right-blockage";

  const stepCard = (() => {
    if (!primarySpotlight) return null;
    if (step === 1 || step === 2 || step === 4) {
      return tooltipStyle(primarySpotlight, viewport, "right");
    }
    if (step === 3) {
      return tooltipStyle(primarySpotlight, viewport, "left");
    }
    return tooltipStyle(primarySpotlight, viewport, "bottom");
  })();

  const content = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[500] isolate pointer-events-auto"
      onPointerDown={onOverlayPointerDown}
      aria-hidden={false}
    >
      <svg className="absolute inset-0 z-[500] pointer-events-none" width={viewport.width} height={viewport.height}>
        <defs>
          <mask id={`onboarding-mask-${maskId}`}>
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
            {spotlights.map((spotlight) => (
              <motion.rect
                key={`mask-hole-${spotlight.id}`}
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx={SPOTLIGHT_RADIUS}
                fill="black"
                animate={{
                  x: spotlight.left,
                  y: spotlight.top,
                  width: spotlight.width,
                  height: spotlight.height,
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
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

      <AnimatePresence>
        {spotlights.map((spotlight) => (
          <motion.div
            key={`spotlight-ring-${spotlight.id}`}
            className="pointer-events-none absolute z-[501] rounded-xl border border-white/90"
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

      {step === 0 && leftDockSpotlight ? (
        <motion.div
          data-onboarding-ui="true"
          className="absolute z-[504] max-w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
          style={tooltipStyle(leftDockSpotlight, viewport, "right")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h3 className="text-base font-semibold text-gray-900">{t("onboarding.entity_dock_title")}</h3>
          <p className="mt-1 text-sm text-gray-700">{t("onboarding.entity_dock_description")}</p>
        </motion.div>
      ) : null}

      {step === 0 && rightDockSpotlight ? (
        <motion.div
          data-onboarding-ui="true"
          className="absolute z-[504] max-w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
          style={tooltipStyle(rightDockSpotlight, viewport, "left")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h3 className="text-base font-semibold text-gray-900">{t("onboarding.action_dock_title")}</h3>
          <p className="mt-1 text-sm text-gray-700">{t("onboarding.action_dock_description")}</p>
        </motion.div>
      ) : null}

      {step >= 1 && step <= 4 && stepCard ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={`onboarding-card-step-${step}`}
            data-onboarding-ui="true"
            className="absolute z-[504] max-w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
            style={stepCard}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.participant_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {participantsPanelOpen
                    ? t("onboarding.participant_step_click_add")
                    : t("onboarding.participant_step_open_bubble")}
                </p>
                <p className="mt-3 text-xs text-gray-500">
                  {t("onboarding.waiting_participant_creation", { count: participantsCount })}
                </p>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.time_range_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {timeRangesPanelOpen
                    ? t("onboarding.time_range_step_click_add")
                    : t("onboarding.time_range_step_open_bubble")}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    {t("onboarding.waiting_time_range_creation", { count: timeRangesCount })}
                  </p>
                  <button
                    type="button"
                    data-onboarding-ui="true"
                    className="text-sm text-gray-600 underline underline-offset-2"
                    onClick={() => {
                      void goToStep(3);
                    }}
                  >
                    {t("onboarding.skip")}
                  </button>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.blockage_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">
                  {blockageToolSelectable
                    ? t("onboarding.blockage_step_select_tool")
                    : t("onboarding.blockage_step_open_actions")}
                </p>
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    data-onboarding-ui="true"
                    className="text-sm text-gray-600 underline underline-offset-2"
                    onClick={() => {
                      void goToStep(4);
                    }}
                  >
                    {t("onboarding.skip")}
                  </button>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">{t("onboarding.cell_step_title")}</h3>
                <p className="mt-1 text-sm text-gray-700">{t("onboarding.cell_step_description")}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">{t("onboarding.waiting_cell_creation", { count: cellsCount })}</p>
                  <button
                    type="button"
                    data-onboarding-ui="true"
                    className="text-sm text-gray-600 underline underline-offset-2"
                    onClick={() => {
                      void goToStep(5);
                    }}
                  >
                    {t("onboarding.skip")}
                  </button>
                </div>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      ) : null}

      {step === 5 ? (
        <motion.div
          data-onboarding-ui="true"
          className="absolute left-1/2 top-1/2 z-[504] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
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

          <div className="mt-5 text-right">
            <button
              type="button"
              data-onboarding-ui="true"
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
              onClick={finishGuide}
            >
              {t("onboarding.finish")}
            </button>
          </div>
        </motion.div>
      ) : null}

      <div data-onboarding-ui="true" className="fixed bottom-3 left-1/2 z-[505] -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 backdrop-blur-sm">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => {
            const isCurrent = index === step;
            const isDone = index < step;
            return (
              <span
                key={`onboarding-progress-${index}`}
                className={`h-2.5 w-2.5 rounded-full border ${
                  isCurrent || isDone ? "border-white bg-white" : "border-white/70 bg-transparent"
                }`}
              />
            );
          })}
        </div>
      </div>

      {step === 0 ? (
        <div data-onboarding-ui="true" className="fixed bottom-12 left-1/2 z-[505] -translate-x-1/2">
          <button
            type="button"
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-lg"
            onClick={() => {
              if (participantsCount > 0) {
                void goToStep(2);
                return;
              }
              void goToStep(1);
            }}
          >
            {t("onboarding.got_it")}
          </button>
        </div>
      ) : null}
    </div>
  );

  return createPortal(content, document.body);
}
