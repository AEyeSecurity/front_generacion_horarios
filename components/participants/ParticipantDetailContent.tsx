"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Trash2 } from "lucide-react";
import type { Role } from "@/lib/types";
import { AddRuleButton, DeleteParticipantButton, RuleBubble } from "@/components/actions";
import { AddRuleDialog } from "@/components/dialogs";
import EditRuleDialog from "@/components/dialogs/EditRuleDialog";
import { EditorInviteInline } from "@/components/invitations";
import ParticipantScheduleOverlay from "@/components/participants/ParticipantScheduleOverlay";
import { GradualBlur } from "@/components/animations";
import {
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";

type Rule = {
  id: number;
  participant: number;
  day_of_week: number; // 0=Mon .. 6=Sun
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  preference: "preferred" | "flexible" | "impossible";
};

type Props = {
  gridId: number;
  gridCode: string;
  participantId: number;
  participantName: string;
  participantLinked: boolean;
  role: Role;
  canManageRules: boolean;
  daysIdx: number[];
  days: string[];
  dayStartMin: number;
  dayEndMin: number;
  cellSizeMin: number;
  dayStartHHMM: string;
  dayEndHHMM: string;
  rules: Rule[];
  initialView?: "rules" | "schedule";
};

const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export default function ParticipantDetailContent({
  gridId,
  gridCode,
  participantId,
  participantName,
  participantLinked,
  role,
  canManageRules,
  daysIdx,
  days,
  dayStartMin,
  dayEndMin,
  cellSizeMin,
  dayStartHHMM,
  dayEndHHMM,
  rules,
  initialView = "rules",
}: Props) {
  const router = useRouter();
  const [showScheduleTab, setShowScheduleTab] = useState(DEFAULT_UNIT_NOOVERLAP_ENABLED);
  const [view, setView] = useState<"rules" | "schedule">(initialView);
  const [inlineAddOpen, setInlineAddOpen] = useState(false);
  const [inlineAddDay, setInlineAddDay] = useState<number>(daysIdx[0] ?? 0);
  const [inlineAddStart, setInlineAddStart] = useState(dayStartHHMM);
  const [inlineAddEnd, setInlineAddEnd] = useState(dayEndHHMM);
  const [ruleResize, setRuleResize] = useState<{
    ruleId: number;
    edge: "top" | "bottom";
    startPointerY: number;
    originalStartMin: number;
    startScrollTop: number;
    originalEndMin: number;
  } | null>(null);
  const [ruleDraftBoundsById, setRuleDraftBoundsById] = useState<
    Record<number, { startMin: number; endMin: number }>
  >({});
  const [ruleDraftDayById, setRuleDraftDayById] = useState<Record<number, number>>({});
  const [ruleMove, setRuleMove] = useState<{
    ruleId: number;
    originalDay: number;
    originalStartMin: number;
    originalEndMin: number;
    durationMin: number;
  } | null>(null);
  const [ruleMoveHoverHandleById, setRuleMoveHoverHandleById] = useState<Record<number, boolean>>({});
  const [ruleResizeHoverEdgeById, setRuleResizeHoverEdgeById] = useState<Record<number, "top" | "bottom" | null>>({});
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleResizeBusy, setRuleResizeBusy] = useState(false);
  const [autoMergeBusy, setAutoMergeBusy] = useState(false);
  const rulesScrollRef = useRef<HTMLDivElement | null>(null);
  const ruleDeleteDropRef = useRef<HTMLDivElement | null>(null);
  const resizePointerYRef = useRef<number | null>(null);
  const movePointerRef = useRef<{ x: number; y: number } | null>(null);
  const [isRuleDeleteDropActive, setIsRuleDeleteDropActive] = useState(false);
  const moveHoldTimerRef = useRef<number | null>(null);
  const pendingMovePressRef = useRef<{
    ruleId: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    const readSettings = () => {
      try {
        const key = getGridSolverSettingsKey(gridId);
        const parsed = parseGridSolverSettings(window.localStorage.getItem(key));
        const enabled =
          typeof parsed.unit_nooverlap_enabled === "boolean"
            ? parsed.unit_nooverlap_enabled
            : DEFAULT_UNIT_NOOVERLAP_ENABLED;
        setShowScheduleTab(enabled);
      } catch {
        setShowScheduleTab(DEFAULT_UNIT_NOOVERLAP_ENABLED);
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
    if (!showScheduleTab && view === "schedule") {
      setView("rules");
    }
  }, [showScheduleTab, view]);

  useEffect(() => {
    if (typeof daysIdx[0] === "number") {
      setInlineAddDay(daysIdx[0]);
    }
  }, [daysIdx]);

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let t = dayStartMin; t < dayEndMin; t += cellSizeMin) out.push(t);
    return out;
  }, [cellSizeMin, dayEndMin, dayStartMin]);

  const ROW_PX = 64;
  const TIME_COL_PX = 100;
  const BODY_H = rows.length * ROW_PX;
  const gridBase = `/grid/${encodeURIComponent(gridCode)}`;
  const clearMoveHoldTimer = useCallback(() => {
    if (moveHoldTimerRef.current != null) {
      window.clearTimeout(moveHoldTimerRef.current);
      moveHoldTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearMoveHoldTimer(), [clearMoveHoldTimer]);

  const mergeAdjacentSameTypeRules = useCallback(async () => {
    if (!canManageRules) return;
    const res = await fetch(`/api/availability_rules?participant=${participantId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => ([]));
    const list = Array.isArray(data) ? data : data.results ?? [];

    type MergeRule = {
      id: number;
      day: number;
      pref: string;
      startMin: number;
      endMin: number;
      startHHMM: string;
      endHHMM: string;
    };

    const parsed: MergeRule[] = list
      .map((rawRule: unknown) => {
        const rule = (rawRule ?? {}) as Record<string, unknown>;
        const id = Number(rule.id);
        const day = Number(rule.day_of_week);
        const pref = String(rule.preference ?? "");
        const startHHMM = String(rule.start_time ?? "").slice(0, 5);
        const endHHMM = String(rule.end_time ?? "").slice(0, 5);
        const startMin = toMinutes(startHHMM);
        const endMin = toMinutes(endHHMM);
        if (!Number.isFinite(id) || !Number.isFinite(day) || !pref) return null;
        if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return null;
        return { id, day, pref, startMin, endMin, startHHMM, endHHMM };
      })
      .filter((value: MergeRule | null): value is MergeRule => Boolean(value));

    const grouped = new Map<string, MergeRule[]>();
    for (const rule of parsed) {
      const key = `${rule.day}|${rule.pref}`;
      const arr = grouped.get(key) ?? [];
      arr.push(rule);
      grouped.set(key, arr);
    }

    for (const [, rulesOfType] of grouped) {
      if (rulesOfType.length <= 1) continue;
      const sorted = rulesOfType
        .slice()
        .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.id - b.id);
      const ruleById = new Map(sorted.map((rule) => [rule.id, rule] as const));

      let current = {
        startMin: sorted[0].startMin,
        endMin: sorted[0].endMin,
        ids: [sorted[0].id],
      };
      const mergedRanges: Array<{ startMin: number; endMin: number; ids: number[] }> = [];

      for (let index = 1; index < sorted.length; index += 1) {
        const rule = sorted[index];
        if (rule.startMin <= current.endMin) {
          current.endMin = Math.max(current.endMin, rule.endMin);
          current.ids.push(rule.id);
        } else {
          mergedRanges.push(current);
          current = { startMin: rule.startMin, endMin: rule.endMin, ids: [rule.id] };
        }
      }
      mergedRanges.push(current);

      for (const range of mergedRanges) {
        if (range.ids.length <= 1) continue;
        const keepId = range.ids[0];
        const keepRule = sorted.find((rule) => rule.id === keepId);
        if (!keepRule) continue;
        const nextStart = formatMinutes(range.startMin);
        const nextEnd = formatMinutes(range.endMin);
        const redundantIds = range.ids.slice(1);
        const requiresPatch = keepRule.startHHMM !== nextStart || keepRule.endHHMM !== nextEnd;

        const deleteRule = async (id: number) => {
          const deleteRes = await fetch(`/api/availability_rules/${id}`, { method: "DELETE" });
          return deleteRes.ok || deleteRes.status === 204;
        };
        const recreateRule = async (rule: MergeRule) => {
          await fetch("/api/availability_rules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              participant: participantId,
              day_of_week: rule.day,
              start_time: rule.startHHMM,
              end_time: rule.endHHMM,
              preference: rule.pref,
            }),
          });
        };

        if (!requiresPatch) {
          for (const redundantId of redundantIds) {
            await deleteRule(redundantId);
          }
          continue;
        }

        const patchBeforeDelete = await fetch(`/api/availability_rules/${keepId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            start_time: nextStart,
            end_time: nextEnd,
          }),
        });
        if (patchBeforeDelete.ok) {
          for (const redundantId of redundantIds) {
            await deleteRule(redundantId);
          }
          continue;
        }

        const deletedRules: MergeRule[] = [];
        let deletedAll = true;
        for (const redundantId of redundantIds) {
          const redundantRule = ruleById.get(redundantId);
          if (!redundantRule) continue;
          const deleted = await deleteRule(redundantId);
          if (deleted) {
            deletedRules.push(redundantRule);
          } else {
            deletedAll = false;
            break;
          }
        }
        if (!deletedAll) {
          for (const deletedRule of deletedRules) {
            await recreateRule(deletedRule);
          }
          continue;
        }

        const patchAfterDelete = await fetch(`/api/availability_rules/${keepId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            start_time: nextStart,
            end_time: nextEnd,
          }),
        });
        if (!patchAfterDelete.ok) {
          for (const deletedRule of deletedRules) {
            await recreateRule(deletedRule);
          }
        }
      }
    }
  }, [canManageRules, participantId]);

  const openAddRuleFromCell = (dayColumnIndex: number, startMin: number) => {
    if (!canManageRules) return;
    const dayValue = daysIdx[dayColumnIndex];
    if (typeof dayValue !== "number") return;
    const start = formatMinutes(startMin);
    const end = formatMinutes(Math.min(startMin + cellSizeMin, dayEndMin));
    setInlineAddDay(dayValue);
    setInlineAddStart(start);
    setInlineAddEnd(end);
    setInlineAddOpen(true);
  };

  useEffect(() => {
    if (!canManageRules) {
      clearMoveHoldTimer();
      pendingMovePressRef.current = null;
      movePointerRef.current = null;
      setIsRuleDeleteDropActive(false);
      setRuleResize(null);
      setRuleMove(null);
      setRuleDraftBoundsById({});
      setRuleDraftDayById({});
      setRuleMoveHoverHandleById({});
      setRuleResizeHoverEdgeById({});
      resizePointerYRef.current = null;
      return;
    }
    if (!ruleResize) return;

    const applyResizeByPointer = (clientY: number) => {
      const scrollTop = rulesScrollRef.current?.scrollTop ?? ruleResize.startScrollTop;
      setRuleDraftBoundsById((prev) => {
        const deltaPx = (clientY - ruleResize.startPointerY) + (scrollTop - ruleResize.startScrollTop);
        const deltaSlots = Math.round(deltaPx / ROW_PX);
        let nextStart = ruleResize.originalStartMin;
        let nextEnd = ruleResize.originalEndMin;
        if (ruleResize.edge === "bottom") {
          const rawNextEnd = ruleResize.originalEndMin + deltaSlots * cellSizeMin;
          nextEnd = Math.max(
            ruleResize.originalStartMin + cellSizeMin,
            Math.min(dayEndMin, rawNextEnd),
          );
        } else {
          const rawNextStart = ruleResize.originalStartMin + deltaSlots * cellSizeMin;
          nextStart = Math.max(
            dayStartMin,
            Math.min(ruleResize.originalEndMin - cellSizeMin, rawNextStart),
          );
        }
        const previous = prev[ruleResize.ruleId];
        if (previous && previous.startMin === nextStart && previous.endMin === nextEnd) return prev;
        return { ...prev, [ruleResize.ruleId]: { startMin: nextStart, endMin: nextEnd } };
      });
    };

    const autoScrollThreshold = 36;
    const autoScrollStep = 10;
    let raf = 0;
    const tick = () => {
      const scrollEl = rulesScrollRef.current;
      const pointerY = resizePointerYRef.current;
      if (scrollEl && typeof pointerY === "number") {
        const rect = scrollEl.getBoundingClientRect();
        if (pointerY < rect.top + autoScrollThreshold) {
          scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - autoScrollStep);
          applyResizeByPointer(pointerY);
        } else if (pointerY > rect.bottom - autoScrollThreshold) {
          scrollEl.scrollTop = Math.min(scrollEl.scrollHeight, scrollEl.scrollTop + autoScrollStep);
          applyResizeByPointer(pointerY);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      resizePointerYRef.current = event.clientY;
      applyResizeByPointer(event.clientY);
    };

    const finishResize = async () => {
      const draft = ruleDraftBoundsById[ruleResize.ruleId] ?? {
        startMin: ruleResize.originalStartMin,
        endMin: ruleResize.originalEndMin,
      };
      setRuleResize(null);
      resizePointerYRef.current = null;
      setRuleDraftBoundsById((prev) => {
        const next = { ...prev };
        delete next[ruleResize.ruleId];
        return next;
      });
      if (
        draft.startMin === ruleResize.originalStartMin
        && draft.endMin === ruleResize.originalEndMin
      ) return;
      setRuleResizeBusy(true);
      try {
        const res = await fetch(`/api/availability_rules/${ruleResize.ruleId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            start_time: formatMinutes(draft.startMin),
            end_time: formatMinutes(draft.endMin),
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed to update rule (${res.status})`);
        }
        await mergeAdjacentSameTypeRules();
        router.refresh();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Could not resize rule.");
      } finally {
        setRuleResizeBusy(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRuleResize(null);
      resizePointerYRef.current = null;
      setRuleDraftBoundsById((prev) => {
        const next = { ...prev };
        delete next[ruleResize.ruleId];
        return next;
      });
    };

    const previousBodyCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.cursor = previousBodyCursor;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize as EventListener);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    ROW_PX,
    canManageRules,
    cellSizeMin,
    dayEndMin,
    mergeAdjacentSameTypeRules,
    router,
    ruleDraftBoundsById,
    ruleResize,
    dayStartMin,
    clearMoveHoldTimer,
  ]);

  useEffect(() => {
    if (!canManageRules) return;
    if (!ruleMove) return;

    const isPointerOverRuleDeleteDrop = (x: number, y: number) => {
      const el = ruleDeleteDropRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const durationSlots = Math.max(1, Math.round(ruleMove.durationMin / cellSizeMin));
    const maxStartSlot = Math.max(0, rows.length - durationSlots);

    const applyMoveByPointer = (clientX: number, clientY: number) => {
      const scrollEl = rulesScrollRef.current;
      if (!scrollEl) return;
      const rect = scrollEl.getBoundingClientRect();
      const dayAreaWidth = rect.width - TIME_COL_PX;
      if (dayAreaWidth <= 0) return;
      const dayWidth = dayAreaWidth / Math.max(1, days.length);
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top + scrollEl.scrollTop;
      const column = Math.max(0, Math.min(days.length - 1, Math.floor((relativeX - TIME_COL_PX) / dayWidth)));
      const slot = Math.max(0, Math.min(maxStartSlot, Math.round(relativeY / ROW_PX)));
      const targetDay = daysIdx[column];
      if (typeof targetDay !== "number") return;
      const startMin = dayStartMin + slot * cellSizeMin;
      const endMin = Math.min(dayEndMin, startMin + durationSlots * cellSizeMin);

      setRuleDraftDayById((prev) => (prev[ruleMove.ruleId] === targetDay ? prev : { ...prev, [ruleMove.ruleId]: targetDay }));
      setRuleDraftBoundsById((prev) => {
        const existing = prev[ruleMove.ruleId];
        if (existing && existing.startMin === startMin && existing.endMin === endMin) return prev;
        return { ...prev, [ruleMove.ruleId]: { startMin, endMin } };
      });
    };

    const autoScrollThreshold = 36;
    const autoScrollStep = 10;
    let raf = 0;
    const tick = () => {
      const scrollEl = rulesScrollRef.current;
      const pointer = movePointerRef.current;
      if (scrollEl && pointer) {
        const rect = scrollEl.getBoundingClientRect();
        if (pointer.y < rect.top + autoScrollThreshold) {
          scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - autoScrollStep);
          applyMoveByPointer(pointer.x, pointer.y);
        } else if (pointer.y > rect.bottom - autoScrollThreshold) {
          scrollEl.scrollTop = Math.min(scrollEl.scrollHeight, scrollEl.scrollTop + autoScrollStep);
          applyMoveByPointer(pointer.x, pointer.y);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      movePointerRef.current = { x: event.clientX, y: event.clientY };
      setIsRuleDeleteDropActive(isPointerOverRuleDeleteDrop(event.clientX, event.clientY));
      applyMoveByPointer(event.clientX, event.clientY);
    };

    const finishMove = async () => {
      const pointer = movePointerRef.current;
      const shouldDelete = pointer ? isPointerOverRuleDeleteDrop(pointer.x, pointer.y) : false;
      const draftBounds = ruleDraftBoundsById[ruleMove.ruleId] ?? {
        startMin: ruleMove.originalStartMin,
        endMin: ruleMove.originalEndMin,
      };
      const draftDay = ruleDraftDayById[ruleMove.ruleId] ?? ruleMove.originalDay;

      setRuleMove(null);
      movePointerRef.current = null;
      setIsRuleDeleteDropActive(false);
      setRuleDraftBoundsById((prev) => {
        const next = { ...prev };
        delete next[ruleMove.ruleId];
        return next;
      });
      setRuleDraftDayById((prev) => {
        const next = { ...prev };
        delete next[ruleMove.ruleId];
        return next;
      });

      const unchanged =
        draftDay === ruleMove.originalDay &&
        draftBounds.startMin === ruleMove.originalStartMin &&
        draftBounds.endMin === ruleMove.originalEndMin;
      if (shouldDelete) {
        setRuleResizeBusy(true);
        try {
          const res = await fetch(`/api/availability_rules/${ruleMove.ruleId}`, { method: "DELETE" });
          if (!res.ok && res.status !== 204) {
            const txt = await res.text().catch(() => "");
            throw new Error(txt || `Failed to delete rule (${res.status})`);
          }
          router.refresh();
        } catch (e: unknown) {
          alert(e instanceof Error ? e.message : "Could not delete rule.");
        } finally {
          setRuleResizeBusy(false);
        }
        return;
      }
      if (unchanged) return;

      setRuleResizeBusy(true);
      try {
        const res = await fetch(`/api/availability_rules/${ruleMove.ruleId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            day_of_week: draftDay,
            start_time: formatMinutes(draftBounds.startMin),
            end_time: formatMinutes(draftBounds.endMin),
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed to move rule (${res.status})`);
        }
        await mergeAdjacentSameTypeRules();
        router.refresh();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Could not move rule.");
      } finally {
        setRuleResizeBusy(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRuleMove(null);
      movePointerRef.current = null;
      setIsRuleDeleteDropActive(false);
      setRuleDraftBoundsById((prev) => {
        const next = { ...prev };
        delete next[ruleMove.ruleId];
        return next;
      });
      setRuleDraftDayById((prev) => {
        const next = { ...prev };
        delete next[ruleMove.ruleId];
        return next;
      });
    };

    const previousBodyCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishMove, { once: true });
    window.addEventListener("pointercancel", finishMove, { once: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.cursor = previousBodyCursor;
      setIsRuleDeleteDropActive(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishMove as EventListener);
      window.removeEventListener("pointercancel", finishMove as EventListener);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    ROW_PX,
    canManageRules,
    cellSizeMin,
    dayEndMin,
    dayStartMin,
    days.length,
    daysIdx,
    mergeAdjacentSameTypeRules,
    router,
    rows.length,
    ruleDraftBoundsById,
    ruleDraftDayById,
    ruleMove,
  ]);

  const colorFor = (pref: Rule["preference"]) => {
    switch (pref) {
      case "preferred":
        return {
          bg: "bg-green-50",
          text: "text-green-800",
          bar: "bg-green-400",
          topBorder: "border-t-green-800",
          border: "border-green-800",
        };
      case "flexible":
        return {
          bg: "bg-yellow-50",
          text: "text-yellow-800",
          bar: "bg-yellow-400",
          topBorder: "border-t-yellow-800",
          border: "border-yellow-800",
        };
      default:
        return {
          bg: "bg-red-50",
          text: "text-red-800",
          bar: "bg-red-400",
          topBorder: "border-t-red-800",
          border: "border-red-800",
        };
    }
  };

  const visibleRules = useMemo(
    () => rules.filter((r) => daysIdx.includes(r.day_of_week)),
    [daysIdx, rules],
  );

  const hasMergeCandidates = useMemo(() => {
    type CompactRule = {
      day: number;
      pref: string;
      startMin: number;
      endMin: number;
    };
    const grouped = new Map<string, CompactRule[]>();
    for (const rule of rules) {
      const startMin = toMinutes(String(rule.start_time ?? "").slice(0, 5));
      const endMin = toMinutes(String(rule.end_time ?? "").slice(0, 5));
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) continue;
      const pref = String(rule.preference ?? "");
      const key = `${rule.day_of_week}|${pref}`;
      const arr = grouped.get(key) ?? [];
      arr.push({ day: rule.day_of_week, pref, startMin, endMin });
      grouped.set(key, arr);
    }

    for (const [, arr] of grouped) {
      if (arr.length <= 1) continue;
      const sorted = arr.slice().sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].startMin <= sorted[i - 1].endMin) return true;
      }
    }
    return false;
  }, [rules]);

  useEffect(() => {
    if (!canManageRules || autoMergeBusy || ruleResizeBusy) return;
    if (!hasMergeCandidates) return;
    let cancelled = false;
    (async () => {
      setAutoMergeBusy(true);
      try {
        await mergeAdjacentSameTypeRules();
        if (!cancelled) router.refresh();
      } finally {
        if (!cancelled) setAutoMergeBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoMergeBusy, canManageRules, hasMergeCandidates, mergeAdjacentSameTypeRules, router, ruleResizeBusy]);

  return (
    <div className="w-[80%] mx-auto space-y-4">
      <div className="relative min-h-[64px] flex items-center">
        <Link
          href={gridBase}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Back to grid"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>

        <div className="mx-auto text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl md:text-2xl font-semibold">{participantName}</h1>
            {participantLinked ? (
              <span title="Linked participant">
                <BadgeCheck className="w-5 h-5 text-emerald-600" />
              </span>
            ) : (
              <EditorInviteInline gridId={String(gridId)} participantId={String(participantId)} />
            )}
          </div>

          <div className="mt-1 text-sm text-gray-500 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setView("rules")}
              className={view === "rules" ? "font-semibold text-gray-800" : "hover:text-gray-700"}
            >
              Availability Rules
            </button>
            {showScheduleTab && (
              <>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={() => setView("schedule")}
                  className={view === "schedule" ? "font-semibold text-gray-800" : "hover:text-gray-700"}
                >
                  Schedule
                </button>
              </>
            )}
          </div>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-row-reverse items-center gap-3">
          {view === "rules" && (
            <AddRuleButton
              participantId={participantId}
              gridStart={dayStartHHMM}
              gridEnd={dayEndHHMM}
              allowedDays={daysIdx}
              minMinutes={cellSizeMin}
              disabled={!canManageRules}
              onCreated={async () => {
                await mergeAdjacentSameTypeRules();
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      {view === "rules" && (
        <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
          <div className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
            <div className="bg-gray-50 border-b h-12" />
            {days.map((d) => (
              <div key={d} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
                {d}
              </div>
            ))}
          </div>

          <div
            data-schedule-scroll
            ref={rulesScrollRef}
            className={`relative max-h-[70vh] ${ruleMove ? "overflow-y-hidden" : "overflow-y-auto"} hide-scrollbar`}
            style={{ ["--time-col" as never]: `${TIME_COL_PX}px` }}
          >
            <div className="pointer-events-none absolute left-0 top-0 z-[2]" style={{ width: TIME_COL_PX, height: BODY_H }}>
              <div className="absolute inset-x-0 top-1 text-center text-xs text-gray-500">{formatMinutes(dayStartMin)}</div>
              {rows.slice(1).map((t, index) => (
                <div
                  key={`rules-time-axis-${t}`}
                  className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-gray-500"
                  style={{ top: (index + 1) * ROW_PX }}
                >
                  {formatMinutes(t)}
                </div>
              ))}
              <div className="absolute inset-x-0 bottom-1 text-center text-xs text-gray-500">
                {formatMinutes(dayEndMin)}
              </div>
            </div>

            {rows.map((t) => (
              <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
                <div className="h-16 border-r" />
                {days.map((d, j) => (
                  <button
                    key={`${t}-${d}`}
                    type="button"
                    disabled={!canManageRules}
                    className={`border-b ${j < days.length - 1 ? "border-r" : ""} h-16 text-left ${
                      canManageRules ? "cursor-pointer hover:bg-gray-50/80" : ""
                    }`}
                    onClick={() => openAddRuleFromCell(j, t)}
                  />
                ))}
              </div>
            ))}

            <div className="pointer-events-none absolute inset-0" style={{ height: BODY_H }}>
              {visibleRules.map((r) => {
                const renderDay = ruleDraftDayById[r.id] ?? r.day_of_week;
                const cIdx = daysIdx.indexOf(renderDay);
                if (cIdx < 0) return null;
                const originalStartMin = toMinutes(r.start_time);
                const originalEndMin = toMinutes(r.end_time);
                const draftBounds = ruleDraftBoundsById[r.id];
                const s = draftBounds?.startMin ?? originalStartMin;
                const e = draftBounds?.endMin ?? originalEndMin;
                const GUTTER_X = 12;
                const GUTTER_Y = 16;
                const TOP_BAR = 4;
                const ROW_BORDER = 1;
                const RESIZE_EDGE_PX = 10;

                const slot = cellSizeMin;
                const startSlot = (s - dayStartMin) / slot;
                const endSlot = (e - dayStartMin) / slot;
                const slotHeight = ROW_PX;

                const baseTop = startSlot * slotHeight;
                const rawHeight = (endSlot - startSlot) * slotHeight;

                const borderBefore = Math.max(0, Math.floor(startSlot)) * ROW_BORDER;
                const borderWithin = Math.max(0, Math.floor(endSlot - startSlot)) * ROW_BORDER;

                const top = baseTop + borderBefore + GUTTER_Y / 2 - TOP_BAR / 2;
                const height = Math.max(6, rawHeight + borderWithin - GUTTER_Y - TOP_BAR);
                const left = `calc(var(--time-col) + ${cIdx} * ((100% - var(--time-col)) / ${days.length}) + ${GUTTER_X / 2}px)`;
                const width = `calc(((100% - var(--time-col)) / ${days.length}) - ${GUTTER_X}px)`;
                const c = colorFor(r.preference);
                const ruleType =
                  r.preference === "preferred"
                    ? "Preferred"
                    : r.preference === "flexible"
                    ? "Flexible"
                    : "Impossible";
                const hoverEdge = ruleResizeHoverEdgeById[r.id] ?? null;
                const isDraggingRule = ruleMove?.ruleId === r.id;

                const edgeFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const y = event.clientY - rect.top;
                  if (y <= RESIZE_EDGE_PX) return "top" as const;
                  if (rect.height - y <= RESIZE_EDGE_PX) return "bottom" as const;
                  return null;
                };
                const getPointerRatio = (event: React.PointerEvent<HTMLDivElement>) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const clamp = (value: number, min: number, max: number) =>
                    Math.max(min, Math.min(max, value));
                  const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
                  const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
                  return { x, y };
                };
                const isMoveHandlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
                  const ratio = getPointerRatio(event);
                  return ratio.y <= 0.5 && ratio.x >= 0.25 && ratio.x <= 0.75;
                };
                const canStartMoveFromHandle = Boolean(ruleMoveHoverHandleById[r.id]);

                return (
                  <div
                    key={r.id}
                    className={`absolute pointer-events-auto ${isDraggingRule ? "overflow-visible" : "overflow-hidden"}`}
                    style={{
                      top,
                      left,
                      width,
                      height,
                      cursor:
                        isDraggingRule
                          ? "grabbing"
                          : hoverEdge || ruleResize?.ruleId === r.id
                          ? "row-resize"
                          : canManageRules && canStartMoveFromHandle
                          ? "grab"
                          : "default",
                    }}
                    onPointerMove={(event) => {
                      if (isDraggingRule || ruleResize?.ruleId === r.id) return;
                      if (!canManageRules) return;
                      const edge = edgeFromPointer(event);
                      const isHandle = isMoveHandlePointer(event);
                      setRuleResizeHoverEdgeById((prev) => {
                        if (prev[r.id] === edge) return prev;
                        return { ...prev, [r.id]: edge };
                      });
                      setRuleMoveHoverHandleById((prev) => {
                        if (prev[r.id] === isHandle) return prev;
                        return { ...prev, [r.id]: isHandle };
                      });
                    }}
                    onPointerLeave={() => {
                      setRuleResizeHoverEdgeById((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(prev, r.id)) return prev;
                        const next = { ...prev };
                        delete next[r.id];
                        return next;
                      });
                      setRuleMoveHoverHandleById((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(prev, r.id)) return prev;
                        const next = { ...prev };
                        delete next[r.id];
                        return next;
                      });
                    }}
                    onPointerDown={(event) => {
                      if (!canManageRules || ruleResizeBusy) return;
                      if (ruleMove || ruleResize) return;
                      const edge = edgeFromPointer(event);
                      if (edge) {
                        event.preventDefault();
                        event.stopPropagation();
                        clearMoveHoldTimer();
                        pendingMovePressRef.current = null;
                        resizePointerYRef.current = event.clientY;
                        setRuleResize({
                          ruleId: r.id,
                          edge,
                          startPointerY: event.clientY,
                          originalStartMin,
                          startScrollTop: rulesScrollRef.current?.scrollTop ?? 0,
                          originalEndMin,
                        });
                        setRuleDraftBoundsById((prev) => ({
                          ...prev,
                          [r.id]: { startMin: s, endMin: e },
                        }));
                        return;
                      }
                      if (!isMoveHandlePointer(event)) return;

                      event.preventDefault();
                      event.stopPropagation();
                      clearMoveHoldTimer();
                      pendingMovePressRef.current = { ruleId: r.id, pointerId: event.pointerId };
                      const pressPointerId = event.pointerId;
                      moveHoldTimerRef.current = window.setTimeout(() => {
                        const pending = pendingMovePressRef.current;
                        if (!pending || pending.ruleId !== r.id || pending.pointerId !== pressPointerId) return;
                        setRuleMove({
                          ruleId: r.id,
                          originalDay: r.day_of_week,
                          originalStartMin,
                          originalEndMin,
                          durationMin: Math.max(cellSizeMin, originalEndMin - originalStartMin),
                        });
                        movePointerRef.current = { x: event.clientX, y: event.clientY };
                        setRuleDraftBoundsById((prev) => ({
                          ...prev,
                          [r.id]: { startMin: s, endMin: e },
                        }));
                        setRuleDraftDayById((prev) => ({ ...prev, [r.id]: r.day_of_week }));
                        pendingMovePressRef.current = null;
                        clearMoveHoldTimer();
                      }, 280);

                      const clearPendingPress = () => {
                        if (pendingMovePressRef.current?.pointerId !== pressPointerId) return;
                        pendingMovePressRef.current = null;
                        clearMoveHoldTimer();
                      };
                      window.addEventListener("pointerup", clearPendingPress, { once: true });
                      window.addEventListener("pointercancel", clearPendingPress, { once: true });
                    }}
                  >
                    {isDraggingRule ? (
                      <div
                        className="relative h-full w-full rounded-md border border-dashed border-gray-400/90 bg-gray-100/20 shadow-[0_6px_18px_rgba(0,0,0,0.12)] scale-[1.01]"
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="px-2 text-[10px] font-semibold text-gray-700 whitespace-nowrap">
                            {ruleType}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <RuleBubble
                        title={ruleType}
                        subtitle={`${formatMinutes(s)} - ${formatMinutes(e)}`}
                        colors={c}
                        canEdit={canManageRules}
                        onEdit={() => setEditingRuleId(r.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <ParticipantScheduleOverlay
              gridId={gridId}
              gridCode={gridCode}
              participantId={participantId}
              targetView="rules"
              showPlacements={false}
              hideSideStack={Boolean(ruleMove)}
              daysCount={days.length}
              rowPx={ROW_PX}
              timeColPx={TIME_COL_PX}
              bodyHeight={BODY_H}
              dayStartMin={dayStartMin}
              slotMin={cellSizeMin}
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
        </div>
      )}

      {view === "rules" && ruleMove && (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[190] pointer-events-none">
          <div
            ref={ruleDeleteDropRef}
            data-jiggle-delete-drop
            className={`relative isolate w-12 h-12 rounded-full border shadow-md flex items-center justify-center pointer-events-auto transition-all duration-150 ${
              isRuleDeleteDropActive
                ? "bg-red-600 border-red-700 scale-110"
                : "bg-white border-gray-300"
            }`}
            title="Drop here to delete rule"
          >
            <Trash2 className={`w-5 h-5 ${isRuleDeleteDropActive ? "text-white" : "text-red-600"}`} />
            <div
              className={`absolute left-full top-1/2 -translate-y-1/2 ml-[-22px] h-44 w-9 overflow-hidden pointer-events-none transition-all duration-150 -z-10 ${
                isRuleDeleteDropActive ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
            >
              <div
                className="absolute top-1/2 left-0 h-[220px] w-[220px] -translate-y-1/2 -translate-x-[190px] rounded-full border-[6px] border-red-500/85 shadow-[0_0_34px_rgba(239,68,68,0.34)]"
                style={{ background: "transparent" }}
              />
            </div>
          </div>
        </div>
      )}

      {view === "schedule" && (
        <div className="relative border rounded-lg bg-white overflow-hidden shadow-sm">
          <div className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
            <div className="bg-gray-50 border-b h-12" />
            {days.map((d) => (
              <div key={d} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
                {d}
              </div>
            ))}
          </div>

          <div
            data-schedule-scroll
            className="relative max-h-[70vh] overflow-y-auto hide-scrollbar"
            style={{ ["--time-col" as never]: `${TIME_COL_PX}px` }}
          >
            <div className="pointer-events-none absolute left-0 top-0 z-[2]" style={{ width: TIME_COL_PX, height: BODY_H }}>
              <div className="absolute inset-x-0 top-1 text-center text-xs text-gray-500">{formatMinutes(dayStartMin)}</div>
              {rows.slice(1).map((t, index) => (
                <div
                  key={`schedule-time-axis-${t}`}
                  className="absolute inset-x-0 -translate-y-1/2 text-center text-xs text-gray-500"
                  style={{ top: (index + 1) * ROW_PX }}
                >
                  {formatMinutes(t)}
                </div>
              ))}
              <div className="absolute inset-x-0 bottom-1 text-center text-xs text-gray-500">
                {formatMinutes(dayEndMin)}
              </div>
            </div>

            {rows.map((t) => (
              <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${days.length}, 1fr)` }}>
                <div className="h-16 border-r" />
                {days.map((d, j) => (
                  <div key={`${t}-${d}`} className={`border-b ${j < days.length - 1 ? "border-r" : ""} h-16`} />
                ))}
              </div>
            ))}

            <ParticipantScheduleOverlay
              gridId={gridId}
              gridCode={gridCode}
              participantId={participantId}
              targetView="schedule"
              showPlacements
              daysCount={days.length}
              rowPx={ROW_PX}
              timeColPx={TIME_COL_PX}
              bodyHeight={BODY_H}
              dayStartMin={dayStartMin}
              slotMin={cellSizeMin}
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
        </div>
      )}

      <AddRuleDialog
        participantId={participantId}
        gridStart={dayStartHHMM}
        gridEnd={dayEndHHMM}
        allowedDays={daysIdx}
        minMinutes={cellSizeMin}
        initialDay={inlineAddDay}
        initialStart={inlineAddStart}
        initialEnd={inlineAddEnd}
        open={inlineAddOpen}
        onOpenChange={setInlineAddOpen}
        onCreated={async () => {
          await mergeAdjacentSameTypeRules();
          setInlineAddOpen(false);
          router.refresh();
        }}
      />
      <EditRuleDialog
        ruleId={editingRuleId ?? 0}
        open={editingRuleId != null}
        onOpenChange={(open) => {
          if (!open) setEditingRuleId(null);
        }}
        onSaved={async () => {
          await mergeAdjacentSameTypeRules();
          setEditingRuleId(null);
          router.refresh();
        }}
      />

      {role === "supervisor" && (
        <div className="mt-8 p-4 border rounded bg-white flex items-center justify-between">
          <div>
            <div className="font-medium">Danger zone</div>
            <div className="text-sm text-gray-600">Delete this participant and all their availability rules.</div>
          </div>
          <DeleteParticipantButton
            gridId={String(gridId)}
            gridCode={gridCode}
            participantId={String(participantId)}
          />
        </div>
      )}
    </div>
  );
}
