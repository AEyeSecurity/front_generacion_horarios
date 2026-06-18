"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/use-i18n";
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
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <EntityPageHeader
      title={t("cells.title")}
      backHref={backHref}
      canCreate={canCreate}
      createOnboardingTarget="cell-create-button"
      onCreateClick={() => setOpen(true)}
      dialog={<CreateCellDialog gridId={gridId} open={open} onOpenChange={setOpen} onCreated={() => router.refresh()} />}
    />
  );
}
