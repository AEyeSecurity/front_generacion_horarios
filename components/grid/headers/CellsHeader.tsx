"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import EntityPageHeader from "./EntityPageHeader";

const CreateCellDialog = dynamic(() => import("@/components/dialogs/CreateCellDialog"), { ssr: false });

export default function CellsHeader({
  gridId,
  backHref,
  canCreate,
}: {
  gridId: number;
  backHref: string;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <EntityPageHeader
      title="Cells"
      backHref={backHref}
      canCreate={canCreate}
      onCreateClick={() => setOpen(true)}
      dialog={<CreateCellDialog gridId={gridId} open={open} onOpenChange={setOpen} />}
    />
  );
}
