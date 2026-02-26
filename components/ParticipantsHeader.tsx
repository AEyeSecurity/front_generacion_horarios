"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const AddParticipantDialog = dynamic(() => import("@/components/dialogs/AddParticipantDialog"), { ssr: false });

export default function ParticipantsHeader({
  gridId,
  backHref,
  canCreate,
}: {
  gridId: number;
  backHref: string;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="flex items-center">
        <Link
          href={backHref}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Back to grid"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-center">Participants</h1>

      <div className="flex justify-end">
        {canCreate && (
          <>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-black text-white text-sm"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
            <AddParticipantDialog
              gridId={gridId}
              open={open}
              onOpenChange={setOpen}
              onCreated={() => router.refresh()}
            />
          </>
        )}
      </div>
    </div>
  );
}
