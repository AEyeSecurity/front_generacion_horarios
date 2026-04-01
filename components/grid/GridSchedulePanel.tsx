"use client";

import { useEffect, useMemo, useState } from "react";
import UnitTabs from "@/components/grid/UnitTabs";
import SolveOverlay from "@/components/grid/SolveOverlay";
import GradualBlur from "@/components/animations/GradualBlur";
import { formatSlotRange } from "@/lib/schedule";
import {
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
} from "@/lib/schedule-view";

type Unit = { id: number | string; name: string };

type Participant = {
  id: number | string;
  name?: string;
  surname?: string;
  tier?: "PRIMARY" | "SECONDARY" | "TERTIARY" | null;
};

type Cell = {
  id: number | string;
  name?: string;
  colorHex?: string;
  color_hex?: string;
  bundles?: Array<number | string>;
  pin_day_index?: number | null;
  pin_start_slot?: number | null;
};

type SchedulePlacement = {
  id: number | string;
  source_cell?: string | number | null;
  bundle?: string | number | null;
  day_index: number;
  start_slot: number;
  end_slot: number;
  assigned_participants?: Array<string | number>;
};

type Props = {
  gridId: number;
  role: "viewer" | "editor" | "supervisor";
  units: Unit[];
  days: string[];
  dayStartMin: number;
  dayEndMin: number;
  slotMin: number;
  rowPx: number;
  timeColPx: number;
};

type ParticipantCellEntry = {
  key: string;
  cellName: string;
  timeLabel: string;
  color?: string;
};

const TIER_ORDER: Record<string, number> = {
  PRIMARY: 0,
  SECONDARY: 1,
  TERTIARY: 2,
};

const TIER_LABEL: Record<string, string> = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  TERTIARY: "Tertiary",
};

export default function GridSchedulePanel({
  gridId,
  role,
  units,
  days,
  dayStartMin,
  dayEndMin,
  slotMin,
  rowPx,
  timeColPx,
}: Props) {
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let t = dayStartMin; t < dayEndMin; t += slotMin) out.push(t);
    return out;
  }, [dayStartMin, dayEndMin, slotMin]);
  const bodyHeight = rows.length * rowPx;

  const [unitNoOverlapEnabled, setUnitNoOverlapEnabled] = useState(DEFAULT_UNIT_NOOVERLAP_ENABLED);
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("draft");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cellById, setCellById] = useState<Record<string, Cell>>({});
  const [schedulePlacements, setSchedulePlacements] = useState<SchedulePlacement[]>([]);

  useEffect(() => {
    const readSettings = () => {
      try {
        const key = getGridSolverSettingsKey(gridId);
        const parsed = parseGridSolverSettings(window.localStorage.getItem(key));
        setUnitNoOverlapEnabled(
          typeof parsed.unit_nooverlap_enabled === "boolean"
            ? parsed.unit_nooverlap_enabled
            : DEFAULT_UNIT_NOOVERLAP_ENABLED,
        );
      } catch {
        setUnitNoOverlapEnabled(DEFAULT_UNIT_NOOVERLAP_ENABLED);
      }
    };

    const onStorage = (event: StorageEvent) => {
      const key = getGridSolverSettingsKey(gridId);
      if (event.key === key) readSettings();
    };

    readSettings();
    window.addEventListener("focus", readSettings);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", readSettings);
      window.removeEventListener("storage", onStorage);
    };
  }, [gridId]);

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
    if (unitNoOverlapEnabled) return;
    let active = true;
    (async () => {
      try {
        const [participantsRes, cellsRes, solutionsRes] = await Promise.all([
          fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/cells?grid=${gridId}`, { cache: "no-store" }),
          fetch(`/api/grids/${gridId}/schedule/?status=${encodeURIComponent(scheduleViewMode)}`, { cache: "no-store" }),
        ]);

        const participantsJson = participantsRes.ok ? await participantsRes.json().catch(() => ([])) : [];
        const participantsList = Array.isArray(participantsJson)
          ? participantsJson
          : participantsJson?.results ?? [];

        const cellsJson = cellsRes.ok ? await cellsRes.json().catch(() => ([])) : [];
        const cellsList = Array.isArray(cellsJson) ? cellsJson : cellsJson?.results ?? [];
        const cellMap: Record<string, Cell> = {};
        for (const cell of cellsList) {
          if (cell?.id == null) continue;
          cellMap[String(cell.id)] = cell;
        }

        const scheduleJson = solutionsRes.ok ? await solutionsRes.json().catch(() => ({})) : {};
        const scheduleList = Array.isArray(scheduleJson?.placements)
          ? scheduleJson.placements
          : [];

        if (active) {
          setParticipants(participantsList);
          setCellById(cellMap);
          setSchedulePlacements(scheduleList);
        }
      } catch {
        if (active) {
          setParticipants([]);
          setCellById({});
          setSchedulePlacements([]);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [gridId, unitNoOverlapEnabled, scheduleViewMode]);

  const orderedParticipants = useMemo(() => {
    return participants
      .slice()
      .sort((a, b) => {
        const ta = TIER_ORDER[String(a.tier || "")] ?? 99;
        const tb = TIER_ORDER[String(b.tier || "")] ?? 99;
        if (ta !== tb) return ta - tb;
        const an = `${a.name || ""} ${a.surname || ""}`.trim().toLowerCase();
        const bn = `${b.name || ""} ${b.surname || ""}`.trim().toLowerCase();
        return an.localeCompare(bn);
      })
      .map((p) => ({
        ...p,
        displayName: `${p.name || ""}${p.surname ? ` ${p.surname}` : ""}`.trim() || `Participant ${p.id}`,
      }));
  }, [participants]);

  const entriesByParticipantDay = useMemo(() => {
    const out: Record<string, Record<number, ParticipantCellEntry[]>> = {};

    for (const item of schedulePlacements) {
      const assigned = Array.isArray(item.assigned_participants) ? item.assigned_participants : [];
      const sourceCellId = String(item.source_cell ?? item.id);
      const cell = cellById[sourceCellId];
      const cellName = cell?.name || `Cell ${sourceCellId}`;
      const color = cell?.colorHex || cell?.color_hex || undefined;
      const timeLabel = formatSlotRange(dayStartMin, slotMin, item.start_slot, item.end_slot);

      for (const rawPid of assigned) {
        const pid = String(rawPid);
        if (!out[pid]) out[pid] = {};
        if (!out[pid][item.day_index]) out[pid][item.day_index] = [];
        out[pid][item.day_index].push({
          key: `${sourceCellId}-${item.day_index}-${item.start_slot}-${item.end_slot}`,
          cellName,
          timeLabel,
          color,
        });
      }
    }

    for (const pid of Object.keys(out)) {
      for (const dayIndex of Object.keys(out[pid])) {
        out[pid][Number(dayIndex)].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
      }
    }

    return out;
  }, [schedulePlacements, cellById, dayStartMin, slotMin]);

  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  if (unitNoOverlapEnabled) {
    return (
      <>
        <div className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
          <div className="bg-gray-50 border-b h-12" />
          {days.map((day) => (
            <div key={day} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
              {day}
            </div>
          ))}
        </div>

        <div
          data-schedule-scroll
          className="relative max-h-[70vh] overflow-y-auto hide-scrollbar"
        >
          <div className="pointer-events-none absolute left-0 top-0 z-[2]" style={{ width: timeColPx, height: bodyHeight }}>
            <div className="absolute inset-x-0 top-1 text-center text-xs text-gray-500">{fmt(dayStartMin)}</div>
            {rows.slice(1).map((time, index) => (
              <div
                key={`time-axis-${time}`}
                className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-gray-500"
                style={{ top: (index + 1) * rowPx }}
              >
                {fmt(time)}
              </div>
            ))}
            <div className="absolute inset-x-0 bottom-1 text-center text-xs text-gray-500">{fmt(dayEndMin)}</div>
          </div>

          {rows.map((time) => (
            <div key={time} className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
              <div className="h-16 border-r" />
              {days.map((day, dayIndex) => (
                <div
                  key={`${time}-${day}`}
                  className={`border-b ${dayIndex < days.length - 1 ? "border-r" : ""} h-16 hover:bg-gray-50`}
                />
              ))}
            </div>
          ))}

          <UnitTabs
            gridId={gridId}
            role={role}
            units={units}
            daysCount={days.length}
            dayLabels={days}
            rowPx={rowPx}
            timeColPx={timeColPx}
            bodyHeight={bodyHeight}
            dayStartMin={dayStartMin}
            slotMin={slotMin}
            scheduleViewMode={scheduleViewMode}
            enablePinning={role === "supervisor" && scheduleViewMode === "draft"}
          />
        </div>

        <GradualBlur
          target="parent"
          position="top"
          height="2.1rem"
          strength={2}
          divCount={5}
          curve="bezier"
          exponential
          opacity={1}
          showWhen="not-at-start"
          style={{ top: "3rem" }}
        />
        <GradualBlur
          target="parent"
          position="bottom"
          height="2.1rem"
          strength={2}
          divCount={5}
          curve="bezier"
          exponential
          opacity={1}
          showWhen="not-at-end"
        />
      </>
    );
  }

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}>
        <div className="bg-gray-50 border-b h-12" />
        {days.map((day) => (
          <div key={day} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
            {day}
          </div>
        ))}
      </div>

      <div data-schedule-scroll className="relative max-h-[70vh] overflow-y-auto hide-scrollbar">
        {orderedParticipants.length === 0 && (
          <div className="px-4 py-6 text-sm text-gray-500">No participants found for this grid.</div>
        )}
        {orderedParticipants.map((participant) => {
          const pid = String(participant.id);
          const tier = participant.tier ? TIER_LABEL[String(participant.tier)] || String(participant.tier) : "No tier";
          return (
            <div
              key={pid}
              className="grid"
              style={{ gridTemplateColumns: `220px repeat(${days.length}, 1fr)` }}
            >
              <div className="border-r border-b px-3 py-3 bg-white">
                <div className="font-medium text-sm text-gray-900">{participant.displayName}</div>
                <div className="text-xs text-gray-500 mt-1">{tier}</div>
              </div>
              {days.map((day, dayIndex) => {
                const entries = entriesByParticipantDay[pid]?.[dayIndex] || [];
                return (
                  <div
                    key={`${pid}-${day}`}
                    className={`border-b ${dayIndex < days.length - 1 ? "border-r" : ""} min-h-[80px] p-2`}
                  >
                    <div className="space-y-2">
                      {entries.map((entry) => (
                        <div
                          key={entry.key}
                          className="relative rounded-md border px-2 py-1 text-xs leading-tight"
                          style={{
                            backgroundColor: entry.color || "#f9fafb",
                            borderColor: "#e5e7eb",
                          }}
                        >
                          <div className="font-semibold text-gray-900">{entry.cellName}</div>
                          <div className="mt-0.5 text-gray-700">{entry.timeLabel}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <SolveOverlay
          gridId={gridId}
          role={role}
          daysCount={days.length}
          dayLabels={days}
          rowPx={rowPx}
          timeColPx={timeColPx}
          bodyHeight={bodyHeight}
          dayStartMin={dayStartMin}
          slotMin={slotMin}
          selectedUnitId={null}
          hideScheduleOverlay
          scheduleViewMode={scheduleViewMode}
        />
      </div>

      <GradualBlur
        target="parent"
        position="top"
        height="2.1rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
        showWhen="not-at-start"
        style={{ top: "3rem" }}
      />
      <GradualBlur
        target="parent"
        position="bottom"
        height="2.1rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
        showWhen="not-at-end"
      />
    </>
  );
}
