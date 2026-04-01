"use client";

import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SidePanel from "./SidePanel";
import { Users, Tags, User as UserIcon, LayoutGrid, FileCheck2, PencilLine } from "lucide-react";
import type { Role } from "@/lib/types";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
  writeGridScheduleViewMode,
} from "@/lib/schedule-view";

type Tab = "participants" | "categories";
const SHEET_ANIM_MS = 240;

function DockButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick?: (e: MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`w-12 h-12 rounded-full shadow-md border border-gray-200 bg-white
                  flex items-center justify-center transition-all duration-200 pointer-events-auto
                  ${active ? "scale-100" : "scale-75 opacity-90"}`}
    >
      <div className={`${active ? "text-black" : "text-gray-400 hover:text-black"} transition-colors duration-200`}>
        {children}
      </div>
    </button>
  );
}

export default function SideDock({
  gridId,
  gridCode,
  role,
  selfParticipantId,
}: {
  gridId: number;
  gridCode?: string | null;
  role: Role;
  selfParticipantId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("participants");
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("draft");
  const lockRef = useRef(false);
  const pendingTabRef = useRef<Tab | null>(null);
  const router = useRouter();
  const gridBase = `/grid/${encodeURIComponent(gridCode || String(gridId))}`;
  const gotoCells = () => router.push(`${gridBase}/cells`);
  const toggleScheduleViewMode = () => {
    const nextMode: ScheduleViewMode = scheduleViewMode === "draft" ? "published" : "draft";
    const written = writeGridScheduleViewMode(gridId, nextMode);
    setScheduleViewMode(written);
  };

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
    [open, tab]
  );

  // Viewer: no dock at all
  if (role === "viewer") return null;

  // Editor: only a user icon linking to own availability rules
  if (role === "editor") {
    const gotoSelf = () => {
      if (!selfParticipantId) return;
      router.push(`${gridBase}/participants/${selfParticipantId}`);
    };
    return (
      <div className="pointer-events-none">
        <div
          id="sidedock"
          className="fixed left-4 top-1/2 -translate-y-1/2 z-[150] flex flex-col gap-3 pointer-events-auto"
        >
          <DockButton title="My availability" onClick={gotoSelf}>
            <UserIcon className={`w-5 h-5 ${selfParticipantId ? "" : "opacity-50"}`} />
          </DockButton>
        </div>
      </div>
    );
  }

  // Supervisor: full dock with panels
  return (
    <div className="pointer-events-none">
      <div
        id="sidedock"
        className="fixed left-4 top-1/2 -translate-y-1/2 z-[150] flex flex-col gap-3 pointer-events-auto"
      >
        <DockButton
          title={scheduleViewMode === "draft" ? "Switch to published view" : "Switch to draft view"}
          onClick={toggleScheduleViewMode}
        >
          {scheduleViewMode === "draft" ? (
            <FileCheck2 className="w-5 h-5" />
          ) : (
            <PencilLine className="w-5 h-5" />
          )}
        </DockButton>

        <DockButton
          title="Participants"
          active={open && tab === "participants"}
          onClick={() => switchTo("participants")}
        >
          <Users className="w-5 h-5" />
        </DockButton>

        <DockButton title="Cells" onClick={gotoCells}>
          <LayoutGrid className="w-5 h-5" />
        </DockButton>

        <DockButton
          title="Categories"
          active={open && tab === "categories"}
          onClick={() => switchTo("categories")}
        >
          <Tags className="w-5 h-5" />
        </DockButton>
      </div>

      <SidePanel
        gridId={gridId}
        gridCode={gridCode}
        tab={tab}
        open={open}
        onOpenChange={(v) => setOpen(v)}
      />
    </div>
  );
}
