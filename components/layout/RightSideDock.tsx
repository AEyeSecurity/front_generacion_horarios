"use client";

import { useEffect, useState } from "react";
import { CircleOff, Coffee, LayoutGrid, Lightbulb, LightbulbOff, Loader2, MessageSquare, Plus, Upload, Users } from "lucide-react";
import GlassSurface from "@/components/ui/GlassSurface";

type ToolKey = "participants" | "break" | "blockage" | "unassigned";

type Props = {
  visible: boolean;
  closeSignal?: number;
  publishedCommentOnly?: boolean;
  commentTitle?: string;
  onCommentsPressed?: () => void;
  canUseSolve?: boolean;
  solveDisabledReason?: string;
  canManualEditCards?: boolean;
  hasOverstaffableCells?: boolean;
  hasUnassignedCells?: boolean;
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
  };
  onSolvePressed?: () => void;
  onActivateTool?: (tool: ToolKey) => void;
  onPublishDraft?: () => void;
};

export default function RightSideDock({
  visible,
  closeSignal = 0,
  publishedCommentOnly = false,
  commentTitle = "Comments",
  onCommentsPressed,
  canUseSolve = false,
  solveDisabledReason = "",
  canManualEditCards = false,
  hasOverstaffableCells = false,
  hasUnassignedCells = false,
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
  onSolvePressed,
  onActivateTool,
  onPublishDraft,
}: Props) {
  const bubbleClass =
    "w-12 h-12 rounded-full shadow-md border border-gray-200 bg-white flex items-center justify-center transition-all duration-200 pointer-events-auto";
  const iconClass = "text-gray-400 hover:text-black transition-colors duration-200";

  const [fanOpen, setFanOpen] = useState(false);

  useEffect(() => {
    setFanOpen(false);
  }, [closeSignal]);

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
    <div data-right-side-dock className="fixed right-4 top-1/2 z-[160] -translate-y-1/2 pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        {!fanOpen && (
          <button
            type="button"
            title={solveDisabledReason}
            onClick={() => onSolvePressed?.()}
            disabled={!canUseSolve}
            className={`${bubbleClass} scale-75 opacity-90 ${canUseSolve ? "" : "opacity-70"} disabled:cursor-not-allowed`}
            aria-disabled={!canUseSolve}
          >
            {canUseSolve ? <Lightbulb className={`w-5 h-5 ${iconClass}`} /> : <LightbulbOff className="w-5 h-5 text-gray-300" />}
          </button>
        )}

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
              disabled: false,
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

        {!fanOpen && (
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
  );
}
