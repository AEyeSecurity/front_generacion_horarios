"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
const EditorInviteDialog = dynamic(() => import("@/components/dialogs/EditorInviteDialog"), { ssr: false });

export default function EditorInviteInline({ gridId, participantId }: { gridId: number | string; participantId: number | string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="px-3 py-2 rounded bg-black text-white text-sm" onClick={() => setOpen(true)}>
        Link
      </button>
      <EditorInviteDialog gridId={gridId} participantId={participantId} open={open} onOpenChange={setOpen} />
    </>
  );
}

