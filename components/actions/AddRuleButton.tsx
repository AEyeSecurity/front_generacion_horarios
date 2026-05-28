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
        data-onboarding-target="availability-add-rule-button"
        className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50 max-[700px]:h-9 max-[700px]:w-9 max-[700px]:justify-center max-[700px]:px-0"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Plus className="w-4 h-4" />
        <span className="max-[700px]:hidden">Add Rule</span>
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
