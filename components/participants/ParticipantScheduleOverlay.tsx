"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSlotRange } from "@/lib/schedule";
import { readGridTierEnabled } from "@/lib/grid-tier";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
} from "@/lib/schedule-view";
import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK, CELL_TEXT_LIGHT } from "@/lib/cell-colors";

const shadeHex = (hex: string, amt: number) => {
  if (!/^#([0-9a-f]{6})$/i.test(hex)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = clamp(Math.round(r + (255 - r) * amt));
  const ng = clamp(Math.round(g + (255 - g) * amt));
  const nb = clamp(Math.round(b + (255 - b) * amt));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
};

type SchedulePlacement = {
  id: number | string;
  source_cell?: string | number | null;
  source_cell_id?: string | number | null;
  bundle?: string | number | null;
  bundle_id?: string | number | null;
  day_index: number;
  start_slot: number;
  end_slot: number;
  assigned_participants?: Array<string | number>;
};

type ParticipantTier = "PRIMARY" | "SECONDARY" | "TERTIARY" | null;

type ParticipantLite = {
  id: string;
  name: string;
  tier: ParticipantTier;
};

const PARTICIPANT_TIER_STYLE: Record<
  Exclude<ParticipantTier, null>,
  { bg: string; dark: string; light: string; border: string }
> = {
  PRIMARY: {
    bg: "#FDC745",
    dark: "#432004",
    light: "#FEFCE8",
    border: "#D59C08",
  },
  SECONDARY: {
    bg: "#9CA3AF",
    dark: "#374151",
    light: "#F9FAFB",
    border: "#6B7280",
  },
  TERTIARY: {
    bg: "#FF692A",
    dark: "#441306",
    light: "#FFEDD4",
    border: "#D1511B",
  },
};

type Props = {
  gridId: number;
  gridCode: string;
  participantId: number;
  targetView?: "rules" | "schedule";
  showPlacements?: boolean;
  hideSideStack?: boolean;
  daysCount: number;
  rowPx: number;
  timeColPx: number;
  bodyHeight: number;
  dayStartMin: number;
  slotMin: number;
  topOffset?: number;
};

export default function ParticipantScheduleOverlay({
  gridId,
  gridCode,
  participantId,
  targetView = "schedule",
  showPlacements = true,
  hideSideStack = false,
  daysCount,
  rowPx,
  timeColPx,
  bodyHeight,
  dayStartMin,
  slotMin,
  topOffset = 0,
}: Props) {
  const router = useRouter();
  const [schedulePlacements, setSchedulePlacements] = useState<SchedulePlacement[]>([]);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<ParticipantLite[]>([]);
  const [gridTierEnabled, setGridTierEnabled] = useState(true);
  const [otherFocusIndex, setOtherFocusIndex] = useState(0);
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("draft");

  useEffect(() => {
    const syncFromStorage = () => {
      setScheduleViewMode(readGridScheduleViewMode(gridId));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== getGridScheduleViewModeKey(gridId)) return;
      syncFromStorage();
    };

    const onModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ gridId?: string; mode?: ScheduleViewMode }>;
      if (customEvent.detail?.gridId !== String(gridId)) return;
      setScheduleViewMode(customEvent.detail?.mode === "published" ? "published" : "draft");
    };

    syncFromStorage();
    window.addEventListener("focus", syncFromStorage);
    window.addEventListener("storage", onStorage);
    window.addEventListener(SCHEDULE_VIEW_MODE_EVENT, onModeChanged as EventListener);
    return () => {
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SCHEDULE_VIEW_MODE_EVENT, onModeChanged as EventListener);
    };
  }, [gridId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const scheduleEndpoint =
          scheduleViewMode === "published"
            ? `/api/grids/${gridId}/published-schedule/`
            : `/api/grids/${gridId}/schedule/`;
        const r = await fetch(scheduleEndpoint, { cache: "no-store" });
        if (!r.ok) {
          if (active) setSchedulePlacements([]);
          return;
        }
        const data = await r.json().catch(() => ({}));
        const scheduleCandidate = data?.schedule ?? data?.published_schedule ?? data?.latest ?? data;
        const placements = Array.isArray(scheduleCandidate?.placements)
          ? scheduleCandidate.placements
          : Array.isArray(scheduleCandidate?.schedule)
          ? scheduleCandidate.schedule
          : [];
        if (active) setSchedulePlacements(placements);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [gridId, scheduleViewMode]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rc, rb, rp, rg] = await Promise.all([
          fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/bundles?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).catch(() => null),
        ]);

        const cdata = await rc.json().catch(() => ([]));
        const clist = Array.isArray(cdata) ? cdata : cdata.results ?? [];
        const cmap: Record<string, string> = {};
        const ccolors: Record<string, string> = {};
        for (const c of clist) {
          if (c?.id != null) {
            const cid = String(c.id);
            cmap[cid] = c.name || `Cell ${c.id}`;
            if (c?.colorHex) ccolors[cid] = c.colorHex;
            else if (c?.color_hex) ccolors[cid] = c.color_hex;
          }
        }

        const bdata = await rb.json().catch(() => ([]));
        const blist = Array.isArray(bdata) ? bdata : bdata.results ?? [];
        const bmap: Record<string, string> = {};
        for (const b of blist) {
          if (b?.id != null) bmap[String(b.id)] = b.name || `Bundle ${b.id}`;
        }

        const pdata = await rp.json().catch(() => ([]));
        const plist = Array.isArray(pdata) ? pdata : pdata.results ?? [];
        const pitems: ParticipantLite[] = plist
          .filter((p: any) => p?.id != null)
          .map((p: any) => {
            const rawTier = typeof p?.tier === "string" ? p.tier.toUpperCase() : null;
            const tier: ParticipantTier =
              rawTier === "PRIMARY" || rawTier === "SECONDARY" || rawTier === "TERTIARY"
                ? rawTier
                : null;
            const fullName = `${p?.name ?? ""}${p?.surname ? ` ${p.surname}` : ""}`.trim();
            return {
              id: String(p.id),
              name: fullName || `Participant ${p.id}`,
              tier,
            };
          });

        const tierEnabled = rg?.ok
          ? readGridTierEnabled(await rg.json().catch(() => null), true)
          : true;

        if (active) {
          setCellNameById(cmap);
          setCellColorById(ccolors);
          setBundleNameById(bmap);
          setParticipants(pitems);
          setGridTierEnabled(tierEnabled);
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [gridId]);

  const filteredSchedule = schedulePlacements.filter((s) => {
    const assigned = Array.isArray(s.assigned_participants) ? s.assigned_participants : [];
    return assigned.map(String).includes(String(participantId));
  });

  const otherParticipants = useMemo(
    () =>
      participants
        .filter((p) => p.id !== String(participantId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [participants, participantId],
  );

  useEffect(() => {
    setOtherFocusIndex((prev) => {
      if (otherParticipants.length <= 1) return 0;
      return Math.max(0, Math.min(otherParticipants.length - 1, prev));
    });
  }, [otherParticipants.length]);

  return (
    <>
      {showPlacements && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: topOffset, height: bodyHeight }}>
          {filteredSchedule.map((s, idx) => {
            const col = s.day_index;
            if (col < 0 || col >= daysCount) return null;
            const sourceCellId = String(s.source_cell ?? s.source_cell_id ?? s.id);
            const top = s.start_slot * rowPx;
            const height = Math.max(6, (s.end_slot - s.start_slot) * rowPx);
            const left = `calc(${timeColPx}px + ${col} * ((100% - ${timeColPx}px) / ${daysCount}) + 6px)`;
            const width = `calc(((100% - ${timeColPx}px) / ${daysCount}) - 12px)`;
            const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
            const timeLabel = formatSlotRange(dayStartMin, slotMin, s.start_slot, s.end_slot);
            const bundleId = s.bundle ?? s.bundle_id ?? null;
            const bundleIds = bundleId != null ? [bundleId] : [];
            const bundleNames = bundleIds.map((b) => bundleNameById[String(b)] || `Bundle ${b}`);
            const bundlesLabel = bundleNames.join(" + ");
            const bg = cellColorById[sourceCellId] || "";
            const colorIdx = CELL_COLOR_OPTIONS.findIndex((c) => c.toLowerCase() === bg.toLowerCase());
            const useColor = Boolean(bg && colorIdx >= 0);
            const textDark = useColor ? CELL_TEXT_DARK[colorIdx] : "#1f2937";
            const textLight = useColor ? CELL_TEXT_LIGHT[colorIdx] : "#111827";
            const border = useColor ? shadeHex(bg, -0.35) : "#e5e7eb";
            return (
              <div key={`${s.id}-${idx}`} className="absolute" style={{ top, left, width, height }}>
                <div
                  className="w-full h-full rounded-md border px-2 py-2 text-[11px]"
                  style={{ backgroundColor: bg || "#f3f4f6", borderColor: border, color: textDark }}
                >
                  <div className="flex h-full flex-col items-center justify-center text-center leading-tight">
                    <div className="font-semibold" style={{ color: textLight }}>{cellName}</div>
                    {bundlesLabel && <div className="px-1">{bundlesLabel}</div>}
                    <div className="h-2" />
                    <div className="text-[10px] font-medium" style={{ color: textDark }}>{timeLabel}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!hideSideStack && otherParticipants.length > 0 && (
        <div className="fixed left-[-108px] top-1/2 -translate-y-1/2 z-[165] pointer-events-none">
          <div className="w-[228px] pointer-events-auto">
            <div
              className="relative h-[312px] pl-2 overflow-hidden overscroll-contain"
              onWheel={(event) => {
                event.stopPropagation();
                if (otherParticipants.length <= 1) return;
                event.preventDefault();
                const dir = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
                if (!dir) return;
                setOtherFocusIndex((prev) =>
                  Math.max(0, Math.min(otherParticipants.length - 1, prev + dir)),
                );
              }}
            >
              {otherParticipants.map((participant, index) => {
                const distance = index - otherFocusIndex;
                if (Math.abs(distance) > 2) return null;
                const tierStyle = gridTierEnabled && participant.tier
                  ? PARTICIPANT_TIER_STYLE[participant.tier]
                  : null;
                const absDistance = Math.abs(distance);
                const scale = absDistance === 0 ? 1 : absDistance === 1 ? 0.78 : 0.62;
                const opacity = absDistance === 0 ? 1 : absDistance === 1 ? 0.92 : 0.82;
                const cardHeight = absDistance === 0 ? 86 : 52;
                const baseCenterY = 156;
                const visualNearHeight = 52 * 0.78;
                const visualFarHeight = 52 * 0.62;
                const sign = distance === 0 ? 0 : distance > 0 ? 1 : -1;
                const nearOffset = 52;
                const nearToFarOffset = visualNearHeight / 2 + visualFarHeight / 2;
                const yOffset =
                  absDistance === 0
                    ? 0
                    : absDistance === 1
                    ? nearOffset
                    : nearOffset + nearToFarOffset;
                const y = baseCenterY + sign * yOffset;
                const z = 120 - absDistance * 20;
                const cardBg = "#F3F4F6";
                const cardBorder = "#E5E7EB";
                const nameColor = "#111827";
                const tierColor = tierStyle?.dark ?? "#374151";
                return (
                  <button
                    key={`other-participant-${participant.id}`}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/grid/${encodeURIComponent(gridCode)}/participants/${encodeURIComponent(participant.id)}?view=${targetView}`,
                      )
                    }
                    className="absolute left-2 right-0 rounded-xl border px-3 py-2 text-right shadow-[0_12px_18px_-14px_rgba(0,0,0,0.55)] transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-black/20"
                    style={{
                      top: `${y - cardHeight / 2}px`,
                      height: `${cardHeight}px`,
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                      transform: `scale(${scale})`,
                      opacity,
                      zIndex: z,
                    }}
                  >
                    <div className="flex h-full w-full items-center justify-end text-right">
                      <div className="min-w-0 w-full">
                        <div
                          className="truncate text-xs font-semibold"
                          style={{ color: nameColor }}
                          title={participant.name}
                        >
                          {participant.name}
                        </div>
                        {absDistance === 0 && gridTierEnabled && participant.tier ? (
                          <div className="mt-1 text-[10px] font-medium" style={{ color: tierColor }}>
                            {participant.tier}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
