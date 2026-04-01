"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import EntityPageHeader from "./EntityPageHeader";

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
    <EntityPageHeader
      title="Participants"
      backHref={backHref}
      canCreate={canCreate}
      onCreateClick={() => setOpen(true)}
      dialog={
        <AddParticipantDialog
          gridId={gridId}
          open={open}
          onOpenChange={setOpen}
          onCreated={() => router.refresh()}
        />
      }
    />
  );
}
