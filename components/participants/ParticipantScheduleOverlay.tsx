"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSlotRange } from "@/lib/schedule";
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
  routeId: string;
  name: string;
  tier: ParticipantTier;
};

type ParticipantTabOverride = {
  id: string | number;
  routeId?: string | number | null;
  name?: string | null;
  tier?: ParticipantTier;
};

type Props = {
  gridId: number;
  gridCode: string;
  participantId: number;
  participantTabsOverride?: ParticipantTabOverride[];
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
  participantTabsOpacity?: number;
};

export default function ParticipantScheduleOverlay({
  gridId,
  gridCode,
  participantId,
  participantTabsOverride,
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
  participantTabsOpacity = 1,
}: Props) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [schedulePlacements, setSchedulePlacements] = useState<SchedulePlacement[]>([]);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<ParticipantLite[]>([]);
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
        const screenContextRes = await fetch(
          `/api/grids/${gridId}/screen-context/?view=${scheduleViewMode}`,
          { cache: "no-store" },
        ).catch(() => null);

        if (screenContextRes?.ok) {
          const data = await screenContextRes.json().catch(() => ({}));
          const scheduleCandidate = data?.schedule ?? data?.published_schedule ?? data?.latest ?? data;
          const placements = Array.isArray(scheduleCandidate?.placements)
            ? scheduleCandidate.placements
            : Array.isArray(scheduleCandidate?.schedule)
            ? scheduleCandidate.schedule
            : [];
          if (active) setSchedulePlacements(placements);
          return;
        }

        const scheduleEndpoint =
          scheduleViewMode === "published"
            ? `/api/grids/${gridId}/published-schedule/`
            : `/api/grids/${gridId}/schedule/`;
        const r = await fetch(scheduleEndpoint, { cache: "no-store" }).catch(() => null);
        if (!r || !r.ok) {
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
        const fetchCollection = async (urls: string[]) => {
          for (const url of urls) {
            const res = await fetch(url, { cache: "no-store" }).catch(() => null);
            if (!res || !res.ok) continue;
            const data = await res.json().catch(() => null);
            if (Array.isArray(data)) return data;
            if (Array.isArray((data as any)?.results)) return (data as any).results;
          }
          return [] as any[];
        };

        const [clist, blist, plist] = await Promise.all([
          fetchCollection([`/api/cells?grid=${gridId}`, `/api/cells/?grid=${gridId}`]),
          fetchCollection([`/api/bundles?grid=${gridId}`, `/api/bundles/?grid=${gridId}`]),
          fetchCollection([
            `/api/participants?grid=${gridId}`,
            `/api/participants/?grid=${gridId}`,
            `/api/grids/${gridId}/participants/`,
            `/api/grids/${gridId}/participants`,
          ]),
        ]);

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

        const bmap: Record<string, string> = {};
        for (const b of blist) {
          if (b?.id != null) bmap[String(b.id)] = b.name || `Bundle ${b.id}`;
        }

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
              routeId: String(p.grid_participant_id ?? p.id),
              name: fullName || `Participant ${p.id}`,
              tier,
            };
          });

        if (active) {
          setCellNameById(cmap);
          setCellColorById(ccolors);
          setBundleNameById(bmap);
          setParticipants(pitems);
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

  const participantTabs = useMemo(() => {
    const source =
      Array.isArray(participantTabsOverride) && participantTabsOverride.length > 0
        ? participantTabsOverride
        : participants;
    return source
      .map((p) => {
        const pid = String((p as ParticipantLite).id ?? (p as ParticipantTabOverride).id ?? "");
        const rawName = (p as ParticipantLite).name ?? (p as ParticipantTabOverride).name ?? "";
        const name = String(rawName).trim() || `Participant ${pid}`;
        const rawRouteId =
          (p as ParticipantLite).routeId ??
          (p as ParticipantTabOverride).routeId ??
          pid;
        const rawTier = typeof (p as any)?.tier === "string" ? String((p as any).tier).toUpperCase() : null;
        const tier: ParticipantTier =
          rawTier === "PRIMARY" || rawTier === "SECONDARY" || rawTier === "TERTIARY"
            ? rawTier
            : null;
        return { id: pid, routeId: String(rawRouteId), name, tier };
      })
      .filter((p) => p.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [participantTabsOverride, participants]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const scrollEl = overlay.closest("[data-schedule-scroll]") as HTMLElement | null;
    if (!scrollEl) return;

    let rafId: number | null = null;
    const applyClip = () => {
      const leftInset = Math.max(0, timeColPx + scrollEl.scrollLeft);
      const clip = `inset(0px 0px 0px ${leftInset}px)`;
      overlay.style.setProperty("clip-path", clip);
      overlay.style.setProperty("-webkit-clip-path", clip);
    };
    const requestApply = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyClip();
      });
    };

    applyClip();
    scrollEl.addEventListener("scroll", requestApply, { passive: true });
    window.addEventListener("resize", requestApply);
    return () => {
      scrollEl.removeEventListener("scroll", requestApply);
      window.removeEventListener("resize", requestApply);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [timeColPx, bodyHeight, rowPx, daysCount]);

  return (
    <>
      {showPlacements && (
        <div
          ref={overlayRef}
          className="pointer-events-none absolute inset-x-0 z-[5]"
          style={{ top: topOffset, height: bodyHeight }}
        >
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

      {!hideSideStack && participantTabs.length > 0 && (
        <div
          data-participant-tabs
          className="fixed inset-x-0 bottom-0 z-[70] pointer-events-none"
          style={{
            opacity: participantTabsOpacity,
            transform: `translateY(${Math.round((1 - participantTabsOpacity) * 18)}px)`,
            pointerEvents: participantTabsOpacity > 0.05 ? undefined : "none",
          }}
        >
          <div className="max-w-5xl mx-auto flex items-end gap-2 px-4 pt-2 pb-3 overflow-x-auto overflow-y-hidden pointer-events-auto hide-scrollbar">
            {participantTabs.map((participant) => {
              const isActive = String(participant.id) === String(participantId);
              return (
                <button
                  key={`participant-tab-${participant.id}`}
                  type="button"
                  onClick={() => {
                    if (isActive) return;
                    router.push(
                      `/grid/${encodeURIComponent(gridCode)}/participants/${encodeURIComponent(participant.routeId)}?view=${targetView}`,
                    );
                  }}
                  className={[
                    "px-4 py-2 text-sm border rounded-t-xl rounded-b-none origin-bottom",
                    "transition-colors transition-shadow transition-transform duration-150 ease-out whitespace-nowrap",
                    isActive
                      ? "bg-white text-black shadow-lg border-gray-300"
                      : "bg-gray-100 text-gray-700 shadow-md hover:shadow-lg hover:bg-white hover:scale-[1.02]",
                  ].join(" ")}
                  title={participant.name}
                >
                  {participant.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
