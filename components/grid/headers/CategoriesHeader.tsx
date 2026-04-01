"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import EntityPageHeader from "./EntityPageHeader";

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
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <EntityPageHeader
      title="Categories"
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
