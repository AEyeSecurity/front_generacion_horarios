"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import EntityPageHeader from "./EntityPageHeader";
import { useI18n } from "@/lib/use-i18n";

const AddCategoryDialog = dynamic(() => import("@/components/dialogs/AddCategoryDialog"), { ssr: false });

export default function CategoriesHeader({
  gridId,
  backHref,
  canCreate,
}: {
  gridId: number;
  backHref: string;
  canCreate: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <EntityPageHeader
      title={t("entity.categories")}
      backHref={backHref}
      canCreate={canCreate}
      onCreateClick={() => setOpen(true)}
      dialog={
        <AddCategoryDialog
          gridId={gridId}
          open={open}
          onOpenChange={setOpen}
          parents={[]}
          onCreated={() => router.refresh()}
        />
      }
    />
  );
}
