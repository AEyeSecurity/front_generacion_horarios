"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import AddAvailabilityRuleDialog from "@/components/dialogs/AddRuleDialog";

export default function AddRuleButton({
  participantId,
  gridStart,
  gridEnd,
  allowedDays,
  minMinutes,
  disabled = false,
  onCreated,
}: {
  participantId: number;
  gridStart: string; // "HH:MM"
  gridEnd: string;   // "HH:MM"
  allowedDays?: number[];
  minMinutes?: number;
  disabled?: boolean;
  onCreated?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={disabled}
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
          if (onCreated) {
            void onCreated();
            return;
          }
          router.refresh();
        }}
      />
    </>
  );
}
