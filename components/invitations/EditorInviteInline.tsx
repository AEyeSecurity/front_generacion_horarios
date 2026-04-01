"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Link as LinkIcon } from "lucide-react";
const EditorInviteDialog = dynamic(() => import("@/components/dialogs/EditorInviteDialog"), { ssr: false });

export default function EditorInviteInline({ gridId, participantId }: { gridId: number | string; participantId: number | string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="Link participant to a user"
        className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100"
        onClick={() => setOpen(true)}
      >
        <LinkIcon className="w-5 h-5 text-gray-700" />
      </button>
      <EditorInviteDialog gridId={gridId} participantId={participantId} open={open} onOpenChange={setOpen} />
    </>
  );
}
