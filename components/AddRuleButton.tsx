"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import AddAvailabilityRuleDialog from "./dialogs/AddRuleDialog";

export default function AddRuleButton({
  participantId,
  gridStart,
  gridEnd,
  allowedDays,
  minMinutes,
}: {
  participantId: number;
  gridStart: string; // "HH:MM"
  gridEnd: string;   // "HH:MM"
  allowedDays?: number[];
  minMinutes?: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" />
        Add Rule
      </button>

      <AddAvailabilityRuleDialog
        participantId={participantId}
        gridStart={gridStart}
        gridEnd={gridEnd}
        allowedDays={allowedDays}
        minMinutes={minMinutes}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          // vuelve a pedir los datos del server component
          router.refresh();
        }}
      />
    </>
  );
}
