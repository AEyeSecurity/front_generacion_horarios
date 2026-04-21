"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import InviteDialog from "@/components/dialogs/InviteDialog";

type Role = "viewer" | "editor" | "supervisor";

export default function ShareInviteButton({
  gridId,
  gridName,
  disabled = false,
  roleOptions,
}: {
  gridId: number;
  gridName: string;
  disabled?: boolean;
  roleOptions?: Role[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm disabled:opacity-50 max-[700px]:h-8 max-[700px]:w-8 max-[700px]:justify-center max-[700px]:p-0"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Send className="h-4 w-4" />
        <span className="max-[700px]:hidden">Share</span>
      </button>
      <InviteDialog gridId={gridId} gridName={gridName} open={open} onOpenChange={setOpen} roleOptions={roleOptions} />
    </>
  );
}
