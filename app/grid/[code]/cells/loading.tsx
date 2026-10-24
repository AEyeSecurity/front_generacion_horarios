"use client";

import CellsCardSkeleton from "@/components/grid/CellsCardSkeleton";
import { useI18n } from "@/lib/use-i18n";

export default function GridCellsLoading() {
  const { t } = useI18n();

  return (
    <div className="relative">
      <div className="p-4">
        <div className="mx-auto w-[80%] space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div />
            <h1 className="text-2xl font-bold">{t("cells.title")}</h1>
            <div />
          </div>
          <CellsCardSkeleton />
        </div>
      </div>
    </div>
  );
}
