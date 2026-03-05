"use client";

import { useMemo, useState } from "react";
import SolveOverlay from "@/components/SolveOverlay";

type Unit = { id: number | string; name: string };

export default function UnitTabs({
  gridId,
  role,
  units,
  daysCount,
  rowPx,
  timeColPx,
  bodyHeight,
  dayStartMin,
  slotMin,
  topOffset = 0,
}: {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  units: Unit[];
  daysCount: number;
  rowPx: number;
  timeColPx: number;
  bodyHeight: number;
  dayStartMin: number;
  slotMin: number;
  topOffset?: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const tabs = useMemo(
    () =>
      units
        .filter((u) => {
          const id = String(u.id).toLowerCase();
          const name = (u.name || "").toLowerCase();
          return id !== "all" && name !== "all";
        })
        .map((u) => ({ id: String(u.id), name: u.name })),
    [units]
  );
  const effectiveSelected = selected ?? (tabs[0]?.id ?? null);

  return (
    <>
      <SolveOverlay
        gridId={gridId}
        role={role}
        daysCount={daysCount}
        rowPx={rowPx}
        timeColPx={timeColPx}
        bodyHeight={bodyHeight}
        dayStartMin={dayStartMin}
        slotMin={slotMin}
        selectedUnitId={effectiveSelected}
        topOffset={topOffset}
      />

      {tabs.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[40] pointer-events-none">
          <div className="max-w-5xl mx-auto flex items-end gap-2 px-4 pt-2 pb-0 overflow-x-auto overflow-y-hidden pointer-events-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={[
                  "px-4 py-2 text-sm border rounded-t-xl rounded-b-none origin-bottom",
                  "transition-[background-color,box-shadow,color,transform] duration-150 ease-out",
                  effectiveSelected === t.id
                    ? "bg-white text-black shadow-lg border-gray-300"
                    : "bg-gray-100 text-gray-700 shadow-md hover:shadow-lg hover:bg-white hover:scale-[1.02]",
                ].join(" ")}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
