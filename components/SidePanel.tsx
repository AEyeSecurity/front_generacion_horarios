"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const ParticipantsPanel = dynamic(() => import("./panels/ParticipantsPanel"), { ssr: false });
const CategoriesPanel   = dynamic(() => import("./panels/CategoriesPanel"),   { ssr: false });

export default function SidePanel({
  gridId,
  tab,
  open,
  onOpenChange,
}: {
  gridId: number;
  tab: "participants" | "categories";
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [showPerson, setShowPerson] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [categoryParents, setCategoryParents] = useState<{ id: number; name: string }[]>([]);

  const AddParticipantDialog = dynamic(() => import("./dialogs/AddParticipantDialog"), { ssr: false });
  const AddCategoryDialog   = dynamic(() => import("./dialogs/AddCategoryDialog"),   { ssr: false });

  // ⛔️ Evitar que un click en el dock sea considerado "outside" por el Sheet
  const ignoreDockOutside = (e: any) => {
    const dock = document.getElementById("sidedock");
    if (dock && e.target && dock.contains(e.target as Node)) {
      e.preventDefault(); // no cerrar el panel
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="p-0 w-[380px] sm:w-[440px] z-[60]"
        // ⬇️ Radix hooks para ignorar outside clicks provenientes del dock
        onPointerDownOutside={ignoreDockOutside}
        onInteractOutside={ignoreDockOutside}
      >
        {/* Título oculto requerido por accesibilidad */}
        <SheetHeader className="sr-only">
          <SheetTitle>Manage panel</SheetTitle>
        </SheetHeader>

        <div className="h-full flex flex-col pl-16 pr-4 pt-4 pb-0">
          <div className="flex-1 overflow-y-auto pb-[72px]">
            {tab === "participants" ? (
              <ParticipantsPanel gridId={gridId} />
            ) : (
              <CategoriesPanel
                gridId={gridId}
                onParents={(p) => setCategoryParents(p)}
              />
            )}
          </div>

          <div className="pointer-events-auto sticky bottom-0 left-0 right-0 -mx-4 px-4 py-3 border-t bg-white">
            {tab === "participants" ? (
              <>
                <button
                  onClick={() => setShowPerson(true)}
                  className="w-full py-2 rounded bg-black text-white text-sm"
                >
                  + Add Participant
                </button>
                <AddParticipantDialog
                  gridId={gridId}
                  open={showPerson}
                  onOpenChange={setShowPerson}
                />
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowCategory(true)}
                  className="w-full py-2 rounded bg-black text-white text-sm"
                >
                  + Add Category
                </button>
                <AddCategoryDialog
                  gridId={gridId}
                  open={showCategory}
                  onOpenChange={setShowCategory}
                  parents={categoryParents}
                />
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
