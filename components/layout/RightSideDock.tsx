"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleOff, Coffee, LayoutGrid, Lightbulb, LightbulbOff, Loader2, MessageSquare, Plus, Upload, Users } from "lucide-react";
import GlassSurface from "@/components/ui/GlassSurface";
import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK, CELL_TEXT_LIGHT } from "@/lib/cell-colors";

type ToolKey = "participants" | "break" | "blockage" | "unassigned";

type ParticipantScrollerItem = {
  id: string;
  name: string;
  tier?: string | null;
};

type UnassignedCellItem = {
  id: string;
  name: string;
  color: string;
  timeLabel: string;
  durationSlots: number;
  remainingPlacements?: number;
  totalPlacements?: number;
  canGrab: boolean;
  selectedBundleId: string | null;
};

type Props = {
  visible: boolean;
  closeSignal?: number;
  publishedCommentOnly?: boolean;
  commentTitle?: string;
  onCommentsPressed?: () => void;
  pendingCandidateReview?: boolean;
  pendingCandidateTitle?: string;
  showSolveNotification?: boolean;
  onPendingReviewPressed?: () => void;
  canUseSolve?: boolean;
  solveDisabledReason?: string;
  canManualEditCards?: boolean;
  hasOverstaffableCells?: boolean;
  hasUnassignedCells?: boolean;
  hasPlacedCells?: boolean;
  isParticipantsToolActive?: boolean;
  isBreakToolActive?: boolean;
  isBlockageToolActive?: boolean;
  isUnassignedToolActive?: boolean;
  canPublishDraft?: boolean;
  isPublishing?: boolean;
  isSolving?: boolean;
  solveElapsedMs?: number;
  error: string | null;
  labels: {
    add: string;
    participants: string;
    breaks: string;
    blockages: string;
    cells: string;
    publishDraft: string;
    nothingToPublish: string;
    solving: string;
    noParticipants?: string;
    noCells?: string;
  };
  participantScrollerItems?: ParticipantScrollerItem[];
  unassignedCellItems?: UnassignedCellItem[];
  onUnassignedGrabStart?: (payload: {
    cardKey: string;
    sourceCellId: string;
    sourceBundleId: string | null;
    cellName: string;
    durationSlots: number;
    pointerId: number;
    clientX: number;
    clientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    offsetX: number;
    offsetY: number;
  }) => void;
  onUnassignedGrabBlocked?: () => void;
  onParticipantGrabStart?: (payload: {
    cardKey: string;
    participantId: string;
    participantName: string;
    pointerId: number;
    clientX: number;
    clientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    offsetX: number;
    offsetY: number;
  }) => void;
  participantDragVisual?: {
    cardKey: string;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null;
  onSolvePressed?: () => void;
  onActivateTool?: (tool: ToolKey) => void;
  onPublishDraft?: () => void;
  showParticipantTier?: boolean;
};

const shadeHex = (hex: string, amt: number) => {
  if (!/^#([0-9a-f]{6})$/i.test(hex)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = clamp(Math.round(r + (255 - r) * amt));
  const ng = clamp(Math.round(g + (255 - g) * amt));
  const nb = clamp(Math.round(b + (255 - b) * amt));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
};

export default function RightSideDock({
  visible,
  closeSignal = 0,
  publishedCommentOnly = false,
  commentTitle = "Comments",
  onCommentsPressed,
  pendingCandidateReview = false,
  pendingCandidateTitle = "",
  showSolveNotification = false,
  onPendingReviewPressed,
  canUseSolve = false,
  solveDisabledReason = "",
  canManualEditCards = false,
  hasOverstaffableCells = false,
  hasUnassignedCells = false,
  hasPlacedCells = false,
  isParticipantsToolActive = false,
  isBreakToolActive = false,
  isBlockageToolActive = false,
  isUnassignedToolActive = false,
  canPublishDraft = false,
  isPublishing = false,
  isSolving = false,
  solveElapsedMs = 0,
  error,
  labels,
  participantScrollerItems = [],
  unassignedCellItems = [],
  onUnassignedGrabStart,
  onUnassignedGrabBlocked,
  onParticipantGrabStart,
  participantDragVisual = null,
  onSolvePressed,
  onActivateTool,
  onPublishDraft,
  showParticipantTier = true,
}: Props) {
  const bubbleClass =
    "w-12 h-12 rounded-full shadow-md border border-gray-200 bg-white flex items-center justify-center transition-all duration-200 pointer-events-auto";
  const iconClass = "text-gray-400 hover:text-black transition-colors duration-200";

  const [fanOpen, setFanOpen] = useState(false);
  const [participantFocusIndex, setParticipantFocusIndex] = useState(0);
  const [unassignedFocusIndex, setUnassignedFocusIndex] = useState(0);

  useEffect(() => {
    setFanOpen(false);
  }, [closeSignal]);

  useEffect(() => {
    if (pendingCandidateReview) {
      setFanOpen(false);
    }
  }, [pendingCandidateReview]);

  useEffect(() => {
    if (!fanOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-right-side-dock]")) return;
      setFanOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [fanOpen]);

  useEffect(() => {
    setParticipantFocusIndex((prev) => {
      if (participantScrollerItems.length <= 1) return 0;
      return Math.max(0, Math.min(participantScrollerItems.length - 1, prev));
    });
  }, [participantScrollerItems.length]);

  useEffect(() => {
    setUnassignedFocusIndex((prev) => {
      if (unassignedCellItems.length <= 1) return 0;
      return Math.max(0, Math.min(unassignedCellItems.length - 1, prev));
    });
  }, [unassignedCellItems.length]);

  const showParticipantScroller = isParticipantsToolActive && participantScrollerItems.length > 0;
  const showUnassignedScroller = isUnassignedToolActive && unassignedCellItems.length > 0;
  const showToolScroller = showParticipantScroller || showUnassignedScroller;

  useEffect(() => {
    if (showToolScroller) setFanOpen(false);
  }, [showToolScroller]);

  const activeScroller = useMemo(() => {
    if (showParticipantScroller) return "participants" as const;
    if (showUnassignedScroller) return "unassigned" as const;
    return null;
  }, [showParticipantScroller, showUnassignedScroller]);

  if (!visible) return null;
  if (publishedCommentOnly) {
    return (
      <div data-right-side-dock className="fixed right-4 top-1/2 z-[160] -translate-y-1/2 pointer-events-none">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            title={commentTitle}
            onClick={() => onCommentsPressed?.()}
            className={`${bubbleClass} scale-75 opacity-90`}
          >
            <MessageSquare className={`w-5 h-5 ${iconClass}`} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div data-right-side-dock className="fixed right-4 top-1/2 z-[160] -translate-y-1/2 pointer-events-none">
        <div className="flex flex-col items-center gap-3">
          {!fanOpen && !showToolScroller && (
            <button
              type="button"
              title={pendingCandidateReview ? pendingCandidateTitle : solveDisabledReason}
              onClick={() => {
                if (pendingCandidateReview) {
                  onPendingReviewPressed?.();
                  return;
                }
                onSolvePressed?.();
              }}
              disabled={pendingCandidateReview ? false : !canUseSolve}
              className={`${bubbleClass} relative scale-75 opacity-90 ${pendingCandidateReview || canUseSolve ? "" : "opacity-70"} disabled:cursor-not-allowed`}
              aria-disabled={pendingCandidateReview ? false : !canUseSolve}
            >
              {pendingCandidateReview || canUseSolve ? (
                <Lightbulb className={`w-5 h-5 ${iconClass}`} />
              ) : (
                <LightbulbOff className="w-5 h-5 text-gray-300" />
              )}
              {showSolveNotification && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white shadow-sm">
                  !
                </span>
              )}
            </button>
          )}

          {!pendingCandidateReview && !showToolScroller && (
            <div className="relative h-12 w-12 pointer-events-auto" data-jiggle-tools>
              <div
                className={`absolute inset-0 pointer-events-none transition-all duration-200 ${
                  fanOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
              >
                <GlassSurface
                  width={220}
                  height={220}
                  borderRadius={999}
                  backgroundOpacity={0.14}
                  brightness={50}
                  opacity={0.95}
                  blur={11}
                  displace={0.5}
                  distortionScale={-180}
                  saturation={1.35}
                  className="pointer-events-none absolute -left-[86px] -top-[86px]"
                  style={{ background: "rgba(255, 255, 255, 0.26)" }}
                />
              </div>
              {[
                {
                  key: "participants" as const,
                  title: labels.participants,
                  icon: <Users className="h-5 w-5" />,
                  active: isParticipantsToolActive,
                  disabled: !hasOverstaffableCells,
                  onClick: () => onActivateTool?.("participants"),
                  angle: -78,
                },
                {
                  key: "break" as const,
                  title: labels.breaks,
                  icon: <Coffee className="h-5 w-5" />,
                  active: isBreakToolActive,
                  disabled: !hasPlacedCells,
                  onClick: () => onActivateTool?.("break"),
                  angle: -26,
                },
                {
                  key: "blockage" as const,
                  title: labels.blockages,
                  icon: <CircleOff className="h-5 w-5" />,
                  active: isBlockageToolActive,
                  disabled: false,
                  onClick: () => onActivateTool?.("blockage"),
                  angle: 26,
                },
                {
                  key: "cells" as const,
                  title: labels.cells,
                  icon: <LayoutGrid className="h-5 w-5" />,
                  active: isUnassignedToolActive,
                  disabled: !hasUnassignedCells,
                  onClick: () => onActivateTool?.("unassigned"),
                  angle: 78,
                },
              ].map((action, idx, list) => {
                const angleRad = (action.angle * Math.PI) / 180;
                const x = -Math.round(98 * Math.cos(angleRad));
                const y = Math.round(98 * Math.sin(angleRad));
                const openDelay = idx * 50;
                const closeDelay = (list.length - idx - 1) * 50;
                return (
                  <button
                    key={action.key}
                    type="button"
                    title={action.title}
                    disabled={action.disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      action.onClick();
                    }}
                    className={`absolute left-0 top-0 z-[161] ${bubbleClass} transition-[transform,opacity] duration-220 ease-out ${
                      action.active ? "scale-100" : "scale-75 opacity-90"
                    } ${action.disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
                    style={{
                      opacity: fanOpen ? 1 : 0,
                      transform: fanOpen ? `translate(${x}px, ${y}px) scale(1)` : "translate(0px,0px) scale(0)",
                      transitionDelay: `${fanOpen ? openDelay : closeDelay}ms`,
                      pointerEvents: fanOpen ? "auto" : "none",
                    }}
                    aria-disabled={action.disabled}
                  >
                    <div className={`flex h-full w-full items-center justify-center ${iconClass}`}>{action.icon}</div>
                  </button>
                );
              })}

              <button
                type="button"
                title={labels.add}
                onClick={() => setFanOpen((prev) => !prev)}
                disabled={!canManualEditCards}
                className={`absolute inset-0 ${bubbleClass} scale-75 opacity-90 disabled:cursor-not-allowed ${
                  canManualEditCards ? "" : "opacity-70"
                }`}
                aria-disabled={!canManualEditCards}
              >
                <Plus className={`w-5 h-5 ${iconClass} transition-transform duration-200 ${fanOpen ? "rotate-45" : "rotate-0"}`} />
              </button>
            </div>
          )}

          {!pendingCandidateReview && !fanOpen && !showToolScroller && (
            <button
              type="button"
              title={canPublishDraft ? labels.publishDraft : labels.nothingToPublish}
              onClick={onPublishDraft}
              disabled={!canPublishDraft}
              className={`${bubbleClass} scale-75 opacity-90 ${canPublishDraft ? "" : "opacity-70"} disabled:cursor-not-allowed`}
              aria-disabled={!canPublishDraft}
            >
              {isPublishing ? (
                <Loader2 className="w-5 h-5 text-gray-200 animate-spin" />
              ) : (
                <Upload className={`w-5 h-5 ${canPublishDraft ? iconClass : "text-gray-300"}`} />
              )}
            </button>
          )}
        </div>
        {error && <div className="mt-2 w-48 text-xs text-red-600 text-right">{error}</div>}
        {isSolving && (
          <div className="mt-1 w-48 text-xs text-gray-600 text-right">
            {labels.solving} {Math.round(solveElapsedMs / 100) / 10}s
          </div>
        )}
      </div>

      {showToolScroller && activeScroller === "participants" && (
        <div className="fixed right-[-108px] top-1/2 -translate-y-1/2 z-[220] pointer-events-none" data-jiggle-participants>
          <div className="w-[228px] pointer-events-auto">
            <div
              className="relative h-[312px] pr-2 overflow-visible overscroll-contain"
              onWheel={(event) => {
                event.stopPropagation();
                if (participantScrollerItems.length <= 1) return;
                event.preventDefault();
                const dir = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
                if (!dir) return;
                setParticipantFocusIndex((prev) =>
                  Math.max(0, Math.min(participantScrollerItems.length - 1, prev + dir)),
                );
              }}
            >
              {participantScrollerItems.map((participant, index) => {
                const distance = index - participantFocusIndex;
                if (Math.abs(distance) > 2) return null;
                const cardKey = `participant-tool-${participant.id}`;
                const absDistance = Math.abs(distance);
                const scale = absDistance === 0 ? 1 : absDistance === 1 ? 0.78 : 0.62;
                const opacity = absDistance === 0 ? 1 : absDistance === 1 ? 0.92 : 0.82;
                const cardHeight = absDistance === 0 ? 86 : 52;
                const baseCenterY = 156;
                const visualNearHeight = 52 * 0.78;
                const visualFarHeight = 52 * 0.62;
                const sign = distance === 0 ? 0 : distance > 0 ? 1 : -1;
                const nearOffset = 52;
                const nearToFarOffset = visualNearHeight / 2 + visualFarHeight / 2;
                const yOffset =
                  absDistance === 0
                    ? 0
                    : absDistance === 1
                    ? nearOffset
                    : nearOffset + nearToFarOffset;
                const y = baseCenterY + sign * yOffset;
                const z = 120 - absDistance * 20;
                const isDraggingCard = participantDragVisual?.cardKey === cardKey;
                return (
                  <div
                    key={cardKey}
                    className={`absolute left-0 right-2 rounded-xl border px-3 py-2 shadow-[0_12px_18px_-14px_rgba(0,0,0,0.55)] ${
                      isDraggingCard
                        ? "transition-all duration-150 ease-out cursor-grabbing pointer-events-none"
                        : "transition-transform duration-150 cursor-grab"
                    }`}
                    style={{
                      top: `${y - cardHeight / 2}px`,
                      height: `${cardHeight}px`,
                      transform: `scale(${isDraggingCard ? Math.max(0.56, scale * 0.9) : scale})`,
                      opacity: isDraggingCard ? 0 : opacity,
                      zIndex: z,
                      backgroundColor: absDistance === 0 ? "#FFFFFF" : "#F3F4F6",
                      borderColor: absDistance === 0 ? "#D1D5DB" : "#E5E7EB",
                    }}
                    onPointerDown={(event) => {
                      const cardRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                      onParticipantGrabStart?.({
                        cardKey,
                        participantId: String(participant.id),
                        participantName: participant.name,
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        grabOffsetX: event.clientX - cardRect.left,
                        grabOffsetY: event.clientY - cardRect.top,
                        offsetX: event.clientX,
                        offsetY: event.clientY,
                      });
                    }}
                    >
                      <div className="flex h-full w-full items-center justify-start text-left">
                        <div className="min-w-0 w-full">
                          <div className="truncate text-xs font-semibold text-gray-900" title={participant.name}>
                            {participant.name}
                          </div>
                          {absDistance === 0 && showParticipantTier && participant.tier ? (
                            <div className="mt-1 text-[10px] font-medium text-gray-500">{participant.tier}</div>
                          ) : null}
                        </div>
                      </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showToolScroller && activeScroller === "unassigned" && (
        <div className="fixed right-[-108px] top-1/2 -translate-y-1/2 z-[220] pointer-events-none" data-jiggle-unassigned>
          <div className="w-[228px] pointer-events-auto">
            <div
              className="relative h-[312px] pr-2 overflow-visible overscroll-contain"
              onWheel={(event) => {
                event.stopPropagation();
                if (unassignedCellItems.length <= 1) return;
                event.preventDefault();
                const dir = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
                if (!dir) return;
                setUnassignedFocusIndex((prev) =>
                  Math.max(0, Math.min(unassignedCellItems.length - 1, prev + dir)),
                );
              }}
            >
              {unassignedCellItems.map((cell, index) => {
                const distance = index - unassignedFocusIndex;
                if (Math.abs(distance) > 2) return null;
                const cardKey = `unassigned-${cell.id}`;
                const colorIdx = CELL_COLOR_OPTIONS.findIndex(
                  (color) => color.toLowerCase() === (cell.color || "").toLowerCase(),
                );
                const useColor = Boolean(cell.color && colorIdx >= 0);
                const bg = useColor ? cell.color : "#9CA3AF";
                const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "#111827";
                const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "#F9FAFB";
                const border = useColor ? shadeHex(bg, -0.33) : "#6B7280";
                const absDistance = Math.abs(distance);
                const scale = absDistance === 0 ? 1 : absDistance === 1 ? 0.78 : 0.62;
                const opacity = absDistance === 0 ? 1 : absDistance === 1 ? 0.92 : 0.82;
                const cardHeight = absDistance === 0 ? 86 : 52;
                const baseCenterY = 156;
                const visualNearHeight = 52 * 0.78;
                const visualFarHeight = 52 * 0.62;
                const sign = distance === 0 ? 0 : distance > 0 ? 1 : -1;
                const nearOffset = 52;
                const nearToFarOffset = visualNearHeight / 2 + visualFarHeight / 2;
                const yOffset =
                  absDistance === 0
                    ? 0
                    : absDistance === 1
                    ? nearOffset
                    : nearOffset + nearToFarOffset;
                const y = baseCenterY + sign * yOffset;
                const z = 120 - absDistance * 20;
                return (
                  <div
                    key={`unassigned-cell-${cell.id}`}
                    className={`absolute left-0 right-2 rounded-xl border px-3 py-2 shadow-[0_12px_18px_-14px_rgba(0,0,0,0.55)] transition-transform duration-150 ${
                      cell.canGrab ? "cursor-grab" : "cursor-not-allowed"
                    }`}
                    style={{
                      top: `${y - cardHeight / 2}px`,
                      height: `${cardHeight}px`,
                      backgroundColor: bg,
                      borderColor: border,
                      transform: `scale(${scale})`,
                      opacity: cell.canGrab ? opacity : Math.max(0.45, opacity * 0.6),
                      zIndex: z,
                    }}
                    onPointerDown={(event) => {
                      if (!cell.canGrab) {
                        onUnassignedGrabBlocked?.();
                        return;
                      }
                      const cardRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                      onUnassignedGrabStart?.({
                        cardKey,
                        sourceCellId: String(cell.id),
                        sourceBundleId: cell.selectedBundleId != null ? String(cell.selectedBundleId) : null,
                        cellName: cell.name,
                        durationSlots: Math.max(1, Number(cell.durationSlots) || 1),
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        grabOffsetX: event.clientX - cardRect.left,
                        grabOffsetY: event.clientY - cardRect.top,
                        offsetX: event.clientX,
                        offsetY: event.clientY,
                      });
                    }}
                  >
                    {absDistance === 0 && (
                      <div
                        className="absolute right-2 top-2 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                        style={{ color: textLight }}
                      >
                        {Math.max(0, Number(cell.remainingPlacements) || 0)}/
                        {Math.max(1, Number(cell.totalPlacements) || 1)}
                      </div>
                    )}
                    <div className="flex h-full w-full items-center justify-start text-left">
                      <div className="min-w-0 w-full">
                        <div
                          className="truncate text-xs font-semibold"
                          style={{ color: textLight }}
                          title={cell.name}
                        >
                          {cell.name}
                        </div>
                        {absDistance === 0 && (
                          <div className="mt-1 text-[10px] font-medium" style={{ color: textDark }}>
                            {cell.timeLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
