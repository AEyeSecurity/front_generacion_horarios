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
  hasCells,
}: {
  gridId: number;
  backHref: string;
  canCreate: boolean;
  hasCells: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <EntityPageHeader
      title={t("cells.title")}
      subtitle={hasCells ? t("cells.subtitle") : undefined}
      backHref={backHref}
      canCreate={canCreate}
      onCreateClick={() => setOpen(true)}
      dialog={<CreateCellDialog gridId={gridId} open={open} onOpenChange={setOpen} onCreated={() => router.refresh()} />}
    />
  );
}
