"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatSlotRange } from "@/lib/schedule";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type BreakEntry = {
  offset_min: number;
  duration_min: number;
};

type Props = {
  open: boolean;
  sourceCellId: string | null;
  startSlot: number;
  endSlot: number;
  breaks: BreakEntry[];
  breakDraftDurationMin: number;
  breakDialogBusy: boolean;
  breakDialogError: string | null;
  dayStartMin: number;
  slotMin: number;
  cellNameById: Record<string, string>;
  cellColorById: Record<string, string>;
  t: (key: any, params?: Record<string, string | number>) => string;
  onOpenChange: (open: boolean) => void;
  setBreakDraftDurationMin: (value: number) => void;
  setBreakDialogError: (value: string | null) => void;
  setBreaks: (updater: (prev: BreakEntry[]) => BreakEntry[]) => void;
  onSave: () => void;
};

const round5 = (n: number) => Math.round(n / 5) * 5;
const floor5 = (n: number) => Math.floor(n / 5) * 5;

const mergeBreaks = (entries: BreakEntry[]) => {
  const sorted = [...entries]
    .map((entry) => ({
      offset_min: Math.round(Number(entry.offset_min)),
      duration_min: Math.round(Number(entry.duration_min)),
    }))
    .filter((entry) => Number.isFinite(entry.offset_min) && Number.isFinite(entry.duration_min))
    .sort((a, b) => a.offset_min - b.offset_min);
  const merged: BreakEntry[] = [];
  for (const entry of sorted) {
    if (merged.length === 0) {
      merged.push({ ...entry });
      continue;
    }
    const last = merged[merged.length - 1];
    const lastEnd = last.offset_min + last.duration_min;
    if (entry.offset_min <= lastEnd) {
      const nextEnd = Math.max(lastEnd, entry.offset_min + entry.duration_min);
      last.duration_min = nextEnd - last.offset_min;
      continue;
    }
    merged.push({ ...entry });
  }
  return merged;
};

export default function BreakDialog({
  open,
  sourceCellId,
  startSlot,
  endSlot,
  breaks,
  breakDraftDurationMin,
  breakDialogBusy,
  breakDialogError,
  dayStartMin,
  slotMin,
  cellNameById,
  cellColorById,
  t,
  onOpenChange,
  setBreakDraftDurationMin,
  setBreakDialogError,
  setBreaks,
  onSave,
}: Props) {
  const replicaRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    index: number;
    mode: "move" | "resize-start" | "resize-end";
    pointerId: number;
    startClientY: number;
    originalOffsetMin: number;
    originalDurationMin: number;
  } | null>(null);

  const placementDurationMin = Math.max(slotMin, Math.max(1, endSlot - startSlot) * slotMin);
  const maxTotalMin = Math.floor(placementDurationMin / 2);
  const totalMin = useMemo(() => breaks.reduce((sum, entry) => sum + Number(entry.duration_min || 0), 0), [breaks]);
  const remainingMin = Math.max(0, maxTotalMin - totalMin);
  const maxDraftForNew = floor5(remainingMin);
  const canCreateNewBreak = maxDraftForNew >= 5;

  useEffect(() => {
    const next = Math.max(5, Math.min(floor5(Math.max(5, breakDraftDurationMin)), Math.max(5, maxDraftForNew)));
    if (canCreateNewBreak && next !== breakDraftDurationMin) setBreakDraftDurationMin(next);
  }, [breakDraftDurationMin, canCreateNewBreak, maxDraftForNew, setBreakDraftDurationMin]);

  const validateCollection = (items: BreakEntry[]) => {
    for (const entry of items) {
      if (entry.duration_min < 5 || entry.duration_min % 5 !== 0) {
        return "Break duration must be at least 5 minutes and a multiple of 5.";
      }
      if (entry.offset_min < 0 || entry.offset_min % 5 !== 0) {
        return "Break start must be 0 or greater and a multiple of 5.";
      }
      if (entry.offset_min + entry.duration_min > placementDurationMin) {
        return "Break must fit inside the placement duration.";
      }
    }
    const sum = items.reduce((acc, entry) => acc + entry.duration_min, 0);
    if (sum > maxTotalMin) return "Total break time cannot exceed 50% of the placement duration.";
    return null;
  };

  const applyBreaks = (next: BreakEntry[], merge = false) => {
    const candidate = merge ? mergeBreaks(next) : next;
    const error = validateCollection(candidate);
    if (error) {
      setBreakDialogError(error);
      return false;
    }
    setBreakDialogError(null);
    setBreaks(() => candidate.sort((a, b) => a.offset_min - b.offset_min));
    return true;
  };

  useEffect(() => {
    if (!dragState || !open) return;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      const rect = replicaRef.current?.getBoundingClientRect();
      if (!rect?.height) return;
      const deltaPx = event.clientY - dragState.startClientY;
      const deltaMin = round5((deltaPx / rect.height) * placementDurationMin);
      const current = breaks[dragState.index];
      if (!current) return;
      let nextOffset = dragState.originalOffsetMin;
      let nextDuration = dragState.originalDurationMin;
      if (dragState.mode === "move") {
        nextOffset = Math.max(0, Math.min(placementDurationMin - nextDuration, dragState.originalOffsetMin + deltaMin));
      } else if (dragState.mode === "resize-start") {
        const candidate = Math.max(0, Math.min(dragState.originalOffsetMin + dragState.originalDurationMin - 5, dragState.originalOffsetMin + deltaMin));
        nextDuration = dragState.originalDurationMin - (candidate - dragState.originalOffsetMin);
        nextOffset = candidate;
      } else {
        nextDuration = Math.max(5, Math.min(placementDurationMin - dragState.originalOffsetMin, dragState.originalDurationMin + deltaMin));
      }
      const next = [...breaks];
      next[dragState.index] = {
        offset_min: Math.max(0, round5(nextOffset)),
        duration_min: Math.max(5, round5(nextDuration)),
      };
      void applyBreaks(next, false);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      setBreaks((prev) => mergeBreaks(prev));
      setDragState(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [applyBreaks, breaks, dragState, open, placementDurationMin, setBreaks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] z-[182]">
        <div data-break-dialog>
          <DialogHeader>
            <DialogTitle>Breaks</DialogTitle>
            <DialogDescription>Set break duration and place/edit breaks directly on the placement timeline.</DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                className="h-8 w-8 rounded border border-gray-300 bg-white text-sm disabled:opacity-50"
                onClick={() => setBreakDraftDurationMin(Math.max(5, breakDraftDurationMin - 5))}
                disabled={breakDraftDurationMin <= 5}
              >
                -
              </button>
              <div className="min-w-[140px] text-center text-sm font-medium">
                Duration: {breakDraftDurationMin} min
                {canCreateNewBreak ? ` (max ${maxDraftForNew})` : " (max 0)"}
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded border border-gray-300 bg-white text-sm disabled:opacity-50"
                onClick={() => setBreakDraftDurationMin(Math.min(maxDraftForNew, breakDraftDurationMin + 5))}
                disabled={!canCreateNewBreak || breakDraftDurationMin >= maxDraftForNew}
              >
                +
              </button>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-4">
              <div className="mx-auto flex max-w-[380px] gap-3">
                <div className="relative w-[72px] shrink-0">
                  <div className="absolute left-0 top-0 text-[11px] text-gray-500">
                    {formatSlotRange(0, 1, dayStartMin + startSlot * slotMin, dayStartMin + startSlot * slotMin + 1).slice(0, 5)}
                  </div>
                  <div className="absolute left-0 bottom-0 text-[11px] text-gray-500">
                    {formatSlotRange(0, 1, dayStartMin + endSlot * slotMin, dayStartMin + endSlot * slotMin + 1).slice(0, 5)}
                  </div>
                </div>
                <div
                  ref={replicaRef}
                  className="relative h-[320px] flex-1 overflow-hidden rounded-md border border-gray-200"
                  style={{ backgroundColor: (sourceCellId && cellColorById[sourceCellId]) || "#f3f4f6" }}
                  onClick={(event) => {
                    if (!canCreateNewBreak) return;
                    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const y = event.clientY - rect.top;
                    const offsetMin = Math.max(0, Math.min(placementDurationMin - breakDraftDurationMin, round5((y / rect.height) * placementDurationMin)));
                    const next = [...breaks, { offset_min: offsetMin, duration_min: breakDraftDurationMin }];
                    void applyBreaks(next, true);
                  }}
                >
                  <div className="pointer-events-none absolute left-2 top-2 right-2 text-center text-xs font-semibold text-white drop-shadow">
                    {sourceCellId ? (cellNameById[sourceCellId] || t("format.cell_with_id", { id: sourceCellId })) : "Placement"}
                  </div>
                  {breaks.map((entry, index) => {
                    const topPct = Math.max(0, Math.min(100, (entry.offset_min / placementDurationMin) * 100));
                    const hPct = Math.max(2, Math.min(100, (entry.duration_min / placementDurationMin) * 100));
                    return (
                      <div
                        key={`break-band-${index}-${entry.offset_min}-${entry.duration_min}`}
                        className="absolute left-2 right-2 rounded-sm border border-dashed border-black/60 bg-black/30"
                        style={{ top: `${topPct}%`, height: `${hPct}%` }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="absolute right-1 top-1 z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-[10px] text-black"
                          onClick={(event) => {
                            event.stopPropagation();
                            setBreaks((prev) => prev.filter((_, i) => i !== index));
                          }}
                        >
                          ×
                        </button>
                        <div className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize" onPointerDown={(event) => setDragState({ index, mode: "resize-start", pointerId: event.pointerId, startClientY: event.clientY, originalOffsetMin: entry.offset_min, originalDurationMin: entry.duration_min })} />
                        <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={(event) => setDragState({ index, mode: "resize-end", pointerId: event.pointerId, startClientY: event.clientY, originalOffsetMin: entry.offset_min, originalDurationMin: entry.duration_min })} />
                        <div className="absolute left-0 right-0 top-2 bottom-2 cursor-grab active:cursor-grabbing" onPointerDown={(event) => setDragState({ index, mode: "move", pointerId: event.pointerId, startClientY: event.clientY, originalOffsetMin: entry.offset_min, originalDurationMin: entry.duration_min })} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-700 text-center">Total: {totalMin} min / {maxTotalMin} min max</div>
            {breakDialogError && <div className="text-sm text-red-600">{breakDialogError}</div>}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="h-9 rounded border px-3 text-sm" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="h-9 rounded bg-black px-3 text-sm text-white disabled:opacity-60" onClick={onSave} disabled={breakDialogBusy}>
              {breakDialogBusy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
