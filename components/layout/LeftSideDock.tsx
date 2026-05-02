"use client";

import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SidePanel from "./SidePanel";
import { Users, Tags, User as UserIcon, LayoutGrid } from "lucide-react";
import type { Role } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";
import DeleteDropBubble from "@/components/layout/DeleteDropBubble";

type Tab = "participants" | "categories";
const SHEET_ANIM_MS = 240;
const GRID_COMMENTS_PANEL_STATE_EVENT = "shift:grid-comments-panel-state";
const GRID_LEFT_PANEL_STATE_EVENT = "shift:grid-left-panel-state";

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

export default function LeftSideDock({
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("participants");
  const [showDeleteDrop, setShowDeleteDrop] = useState(false);
  const [deleteDropActive, setDeleteDropActive] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const lockRef = useRef(false);
  const pendingTabRef = useRef<Tab | null>(null);
  const router = useRouter();
  const gridBase = `/grid/${encodeURIComponent(gridCode || String(gridId))}`;
  const gotoCells = () => router.push(`${gridBase}/cells`);

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
      new CustomEvent<{ gridId: string; open: boolean }>(GRID_LEFT_PANEL_STATE_EVENT, {
        detail: { gridId: String(gridId), open },
      }),
    );
  }, [gridId, open]);

  if (role === "viewer") return null;
  if (isNarrowMobile && commentsPanelOpen) return null;

  if (role === "editor") {
    const gotoSelf = () => {
      if (!selfParticipantId) return;
      router.push(`${gridBase}/participants/${selfParticipantId}`);
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
          title={t("side_dock.participants")}
          active={open && tab === "participants"}
          onClick={() => switchTo("participants")}
        >
          <Users className="w-5 h-5" />
        </DockButton>

        <DockButton title={t("side_dock.cells")} onClick={gotoCells}>
          <LayoutGrid className="w-5 h-5" />
        </DockButton>

        <DockButton
          title={t("side_dock.categories")}
          active={open && tab === "categories"}
          onClick={() => switchTo("categories")}
        >
          <Tags className="w-5 h-5" />
        </DockButton>
      </div>

      <SidePanel
        gridId={gridId}
        gridCode={gridCode}
        role={role}
        tab={tab}
        open={open}
        onOpenChange={(v) => setOpen(v)}
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
