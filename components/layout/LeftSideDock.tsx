"use client";

import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SidePanel from "./SidePanel";
import { Users, Tags, User as UserIcon, LayoutGrid, Clock } from "lucide-react";
import type { Role } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";
import DeleteDropBubble from "@/components/layout/DeleteDropBubble";

type Tab = "participants" | "categories" | "time-ranges";
const SHEET_ANIM_MS = 240;
const GRID_COMMENTS_PANEL_STATE_EVENT = "shift:grid-comments-panel-state";
const GRID_LEFT_PANEL_STATE_EVENT = "shift:grid-left-panel-state";
const GRID_ONBOARDING_LEFT_PANEL_REQUEST_EVENT = "shift:onboarding-left-panel-request";
const DOCK_FEEDBACK_HIGHLIGHT_EVENT = "shift:dock-feedback-highlight";
const PARTICIPANT_ADD_HIGHLIGHT_EVENT = "shift:participants-add-highlight";

function DockButton({
  active,
  locked,
  highlighted,
  onClick,
  title,
  onboardingTarget,
  children,
}: {
  active?: boolean;
  locked?: boolean;
  highlighted?: boolean;
  onClick?: (e: MouseEvent) => void;
  title: string;
  onboardingTarget?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-onboarding-target={onboardingTarget}
      data-state={locked ? "locked" : active ? "active" : "idle"}
      title={title}
      aria-disabled={locked ? "true" : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`w-12 h-12 rounded-full shadow-md border border-gray-200 bg-white
                  flex items-center justify-center transition-all duration-200 pointer-events-auto
                  ${active ? "scale-100" : "scale-75 opacity-90"}
                  ${locked ? "opacity-55 cursor-pointer hover:shadow-md" : ""}
                  ${highlighted ? "ring-4 ring-amber-300 ring-offset-2 animate-pulse" : ""}`}
    >
      <div className={`${locked ? "text-gray-300" : active ? "text-black" : "text-gray-400 hover:text-black"} transition-colors duration-200`}>
        {children}
      </div>
    </button>
  );
}

export default function LeftSideDock({
  gridId,
  gridCode,
  role,
  selfParticipantId,
  selfParticipantRouteId,
  horizonStart,
  horizonEnd,
  cellSizeMin,
  dayStartMin,
  dayEndMin,
  tiersEnabled,
  participantCount = 0,
}: {
  gridId: number;
  gridCode?: string | null;
  role: Role;
  selfParticipantId?: number | null;
  selfParticipantRouteId?: string | number | null;
  horizonStart?: string;
  horizonEnd?: string;
  cellSizeMin?: number;
  dayStartMin?: number;
  dayEndMin?: number;
  tiersEnabled?: boolean;
  participantCount?: number;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("participants");
  const [highlightCells, setHighlightCells] = useState(false);
  const [showDeleteDrop, setShowDeleteDrop] = useState(false);
  const [deleteDropActive, setDeleteDropActive] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const [liveParticipantCount, setLiveParticipantCount] = useState(participantCount);
  const lockRef = useRef(false);
  const pendingTabRef = useRef<Tab | null>(null);
  const router = useRouter();
  const gridBase = `/grid/${encodeURIComponent(gridCode || String(gridId))}`;
  const feedbackCooldownRef = useRef(0);

  useEffect(() => {
    setLiveParticipantCount(participantCount);
  }, [participantCount]);

  const switchTo = useCallback(
    (next: Tab) => {
      if (lockRef.current) return;
      if (open && tab === next) return;
      if (!open) {
        setTab(next);
        setOpen(true);
        return;
      }
      lockRef.current = true;
      pendingTabRef.current = next;
      setOpen(false);
      window.setTimeout(() => {
        setTab(pendingTabRef.current as Tab);
        setOpen(true);
        pendingTabRef.current = null;
        window.setTimeout(() => (lockRef.current = false), SHEET_ANIM_MS);
      }, SHEET_ANIM_MS);
    },
    [open, tab],
  );

  const triggerParticipantsFeedback = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - feedbackCooldownRef.current < 900) return;
      feedbackCooldownRef.current = now;
      switchTo("participants");
      window.dispatchEvent(new CustomEvent(DOCK_FEEDBACK_HIGHLIGHT_EVENT, { detail: { message } }));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(PARTICIPANT_ADD_HIGHLIGHT_EVENT, { detail: { gridId: String(gridId) } }));
      }, 260);
    },
    [gridId, switchTo],
  );

  const gotoCells = () => {
    if (liveParticipantCount <= 0) {
      triggerParticipantsFeedback(t("dock.create_participants_first"));
      return;
    }
    const onboardingActive =
      typeof window !== "undefined" &&
      window.localStorage.getItem(`onboarding-step-grid-${gridId}`) != null &&
      window.localStorage.getItem(`onboarding-done-grid-${gridId}`) !== "1";
    router.push(`${gridBase}/cells${onboardingActive ? "?onboarding=1" : ""}`);
  };

  useEffect(() => {
    const onState = (event: Event) => {
      const custom = event as CustomEvent<{ visible?: boolean; active?: boolean }>;
      setShowDeleteDrop(Boolean(custom.detail?.visible));
      setDeleteDropActive(Boolean(custom.detail?.active));
    };
    window.addEventListener("shift:left-delete-state", onState as EventListener);
    return () => {
      window.removeEventListener("shift:left-delete-state", onState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 460px)");
    const sync = () => setIsNarrowMobile(media.matches);
    sync();
    const onChange = () => sync();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCommentsPanelState = (event: Event) => {
      const custom = event as CustomEvent<{ gridId?: string; open?: boolean }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      const nextOpen = Boolean(custom.detail?.open);
      setCommentsPanelOpen(nextOpen);
      if (nextOpen) setOpen(false);
    };
    window.addEventListener(GRID_COMMENTS_PANEL_STATE_EVENT, onCommentsPanelState as EventListener);
    return () => window.removeEventListener(GRID_COMMENTS_PANEL_STATE_EVENT, onCommentsPanelState as EventListener);
  }, [gridId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent<{ gridId: string; open: boolean; tab: Tab }>(GRID_LEFT_PANEL_STATE_EVENT, {
        detail: { gridId: String(gridId), open, tab },
      }),
    );
  }, [gridId, open, tab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onDockFeedbackHighlight = (event: Event) => {
      const custom = event as CustomEvent<{ target?: string; message?: string }>;
      if (custom.detail?.target !== "cells") return;
      setHighlightCells(true);
      window.setTimeout(() => setHighlightCells(false), 1800);
    };
    window.addEventListener(DOCK_FEEDBACK_HIGHLIGHT_EVENT, onDockFeedbackHighlight as EventListener);
    return () => window.removeEventListener(DOCK_FEEDBACK_HIGHLIGHT_EVENT, onDockFeedbackHighlight as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dock = searchParams.get("dock");
    const feedback = searchParams.get("dock_feedback");
    if (dock !== "participants" || feedback !== "participants_before_cells") return;
    triggerParticipantsFeedback(t("dock.create_participants_before_cells"));
    window.setTimeout(() => {
      router.replace(gridBase, { scroll: false });
    }, 350);
  }, [gridBase, router, searchParams, t, triggerParticipantsFeedback]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnboardingPanelRequest = (event: Event) => {
      const custom = event as CustomEvent<{ gridId?: string; open?: boolean; tab?: Tab | null }>;
      if (custom.detail?.gridId !== String(gridId)) return;
      lockRef.current = false;
      pendingTabRef.current = null;
      if (!custom.detail.open) {
        setOpen(false);
        return;
      }
      if (custom.detail.tab === "participants" || custom.detail.tab === "categories" || custom.detail.tab === "time-ranges") {
        setTab(custom.detail.tab);
        setOpen(true);
      }
    };
    window.addEventListener(GRID_ONBOARDING_LEFT_PANEL_REQUEST_EVENT, onOnboardingPanelRequest as EventListener);
    return () =>
      window.removeEventListener(GRID_ONBOARDING_LEFT_PANEL_REQUEST_EVENT, onOnboardingPanelRequest as EventListener);
  }, [gridId]);

  if (role === "viewer") return null;
  if (isNarrowMobile && commentsPanelOpen) return null;

  if (role === "editor") {
    const gotoSelf = () => {
      const routeId = selfParticipantRouteId ?? selfParticipantId;
      if (!routeId) return;
      const onboardingActive =
        typeof window !== "undefined" &&
        window.localStorage.getItem(`onboarding-step-grid-${gridId}`) != null &&
        window.localStorage.getItem(`onboarding-done-grid-${gridId}`) !== "1";
      router.push(
        `${gridBase}/participants?pid=${encodeURIComponent(String(routeId))}&view=schedule${
          onboardingActive ? "&onboarding=1" : ""
        }`,
      );
    };
    return (
      <div className="pointer-events-none">
        <div
          id="sidedock"
          className={`fixed left-4 top-1/2 -translate-y-1/2 z-[150] flex flex-col gap-3 pointer-events-auto transition-opacity duration-150 ${
            showDeleteDrop ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <DockButton title={t("side_dock.my_availability")} onClick={gotoSelf}>
            <UserIcon className={`w-5 h-5 ${selfParticipantId ? "" : "opacity-50"}`} />
          </DockButton>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none">
      <div
        id="sidedock"
        className={`fixed left-4 top-1/2 -translate-y-1/2 z-[150] flex flex-col gap-3 pointer-events-auto transition-opacity duration-150 ${
          showDeleteDrop ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <DockButton
          title={liveParticipantCount <= 0 ? t("dock.create_participants_first") : t("side_dock.cells")}
          onboardingTarget="left-dock-cells"
          locked={liveParticipantCount <= 0}
          highlighted={highlightCells}
          onClick={gotoCells}
        >
          <LayoutGrid className="w-5 h-5" />
        </DockButton>

        <DockButton
          title={t("side_dock.participants")}
          onboardingTarget="left-dock-participants"
          active={open && tab === "participants"}
          onClick={() => switchTo("participants")}
        >
          <Users className="w-5 h-5" />
        </DockButton>

        <DockButton
          title={t("side_dock.categories")}
          onboardingTarget="left-dock-categories"
          active={open && tab === "categories"}
          onClick={() => switchTo("categories")}
        >
          <Tags className="w-5 h-5" />
        </DockButton>

        <DockButton
          title={t("side_dock.time_ranges")}
          onboardingTarget="left-dock-time-ranges"
          active={open && tab === "time-ranges"}
          onClick={() => switchTo("time-ranges")}
        >
          <Clock className="w-5 h-5" />
        </DockButton>
      </div>

      <SidePanel
        gridId={gridId}
        gridCode={gridCode}
        horizonStart={horizonStart}
        horizonEnd={horizonEnd}
        cellSizeMin={cellSizeMin}
        dayStartMin={dayStartMin}
        dayEndMin={dayEndMin}
        tiersEnabled={tiersEnabled}
        role={role}
        tab={tab}
        open={open}
        onOpenChange={(v) => setOpen(v)}
        onParticipantCreated={() => setLiveParticipantCount((count) => Math.max(1, count + 1))}
        onParticipantCountChange={setLiveParticipantCount}
      />
      {showDeleteDrop && (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[165] pointer-events-none">
          <DeleteDropBubble
            visible={showDeleteDrop}
            active={deleteDropActive}
            title={t("solve_overlay.drop_to_remove_placement")}
          />
        </div>
      )}
    </div>
  );
}
