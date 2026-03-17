"use client";

import { MouseEvent, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SidePanel from "./SidePanel";
import { Users, Tags, User as UserIcon, LayoutGrid } from "lucide-react";
import type { Role } from "@/lib/types";

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
