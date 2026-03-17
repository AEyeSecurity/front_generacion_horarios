"use client";

import { useState } from "react";
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
        className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        Share
      </button>
      <InviteDialog gridId={gridId} gridName={gridName} open={open} onOpenChange={setOpen} roleOptions={roleOptions} />
    </>
  );
}
