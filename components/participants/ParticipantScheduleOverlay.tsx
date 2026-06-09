"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, MessageSquare, X } from "lucide-react";
import { formatSlotRange } from "@/lib/schedule";
import {
  getGridScheduleViewModeKey,
  readGridScheduleViewMode,
  SCHEDULE_VIEW_MODE_EVENT,
  type ScheduleViewMode,
} from "@/lib/schedule-view";
import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK, CELL_TEXT_LIGHT } from "@/lib/cell-colors";
import { authFetch } from "@/lib/client-auth";
import { useI18n } from "@/lib/use-i18n";
import PlacementCommentBubble from "@/components/grid/PlacementCommentBubble";

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
  placement_id?: string | number | null;
  placementId?: string | number | null;
  schedule_placement?: string | number | null;
  schedule_placement_id?: string | number | null;
  schedulePlacementId?: string | number | null;
  source_cell?: string | number | null;
  source_cell_id?: string | number | null;
  bundle?: string | number | null;
  bundle_id?: string | number | null;
  day_index: number;
  start_slot: number;
  end_slot: number;
  assigned_participants?: Array<string | number>;
};

type PlacementComment = {
  id: number | string;
  schedule: number | string;
  schedule_placement?: number | string | null;
  source_cell_id: number | string;
  bundle: number | string | null;
  day_index: number;
  start_slot: number;
  end_slot?: number | null;
  text: string;
  created_at?: string;
  author_id?: number | string;
  author_name?: string;
};

type CommentAnchor = {
  placementId?: number | string | null;
  scheduleId: number;
  sourceCellId: string;
  bundleId: number | string | null;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  cellName: string;
  timeLabel: string;
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
  canComment?: boolean;
  commentsPanelOpen?: boolean;
  onCommentsPanelOpenChange?: (open: boolean) => void;
  commentsPanelTopPx?: number;
};

const readEntityId = (value: unknown): string | number | null => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return readEntityId(source.id ?? source.pk ?? source.value);
  }
  return null;
};

function buildPlacementKey(
  scheduleId: number | string,
  sourceCellId: number | string,
  bundleId: number | string | null,
  dayIndex: number,
  startSlot: number,
  placementId?: number | string | null,
) {
  if (placementId != null && String(placementId).trim()) return `placement|${placementId}`;
  return `${scheduleId}|${sourceCellId}|${bundleId == null ? "__no_bundle__" : bundleId}|${dayIndex}|${startSlot}`;
}

const extractAuthorName = (raw: any): string | undefined => {
  const direct = raw?.author_name ?? raw?.created_by_name ?? raw?.user_name;
  if (direct) return String(direct);
  const author = raw?.author ?? raw?.created_by ?? raw?.user;
  if (author && typeof author === "object") {
    const full = `${author.name ?? author.first_name ?? ""}${author.surname || author.last_name ? ` ${author.surname ?? author.last_name}` : ""}`.trim();
    return full || author.email || author.username;
  }
  return undefined;
};

const extractAuthorId = (raw: any): string | number | undefined => {
  const direct = raw?.author_id ?? raw?.created_by_id ?? raw?.user_id;
  if (direct != null) return direct;
  const author = raw?.author ?? raw?.created_by ?? raw?.user;
  if (author && typeof author === "object" && author.id != null) return author.id;
  if (typeof author === "string" || typeof author === "number") return author;
  return undefined;
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
  canComment = false,
  commentsPanelOpen = false,
  onCommentsPanelOpenChange,
  commentsPanelTopPx = 56,
}: Props) {
  const { t, locale } = useI18n();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [schedulePlacements, setSchedulePlacements] = useState<SchedulePlacement[]>([]);
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [cellNameById, setCellNameById] = useState<Record<string, string>>({});
  const [cellColorById, setCellColorById] = useState<Record<string, string>>({});
  const [bundleNameById, setBundleNameById] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<ParticipantLite[]>([]);
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("draft");
  const [placementComments, setPlacementComments] = useState<PlacementComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const [hoveredCommentPlacementKey, setHoveredCommentPlacementKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authFetch("/api/whoami", { cache: "no-store" });
        if (!response.ok) return;
        const me = await response.json().catch(() => null);
        const id = me?.id;
        if (active && id != null) setCurrentUserId(String(id));
      } catch {
        if (active) setCurrentUserId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const nextMode = readGridScheduleViewMode(gridId);
      setScheduleViewMode((prev) => (prev === nextMode ? prev : nextMode));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== getGridScheduleViewModeKey(gridId)) return;
      syncFromStorage();
    };

    const onModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ gridId?: string; mode?: ScheduleViewMode }>;
      if (customEvent.detail?.gridId !== String(gridId)) return;
      const nextMode = customEvent.detail?.mode === "published" ? "published" : "draft";
      setScheduleViewMode((prev) => (prev === nextMode ? prev : nextMode));
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
          const resolvedScheduleId = Number(
            readEntityId(scheduleCandidate?.schedule_id) ??
              readEntityId(scheduleCandidate?.schedule) ??
              readEntityId(scheduleCandidate?.id) ??
              0,
          );
          if (active) {
            setSchedulePlacements((prev) => (prev === placements ? prev : placements));
            const nextScheduleId = Number.isFinite(resolvedScheduleId) && resolvedScheduleId > 0 ? resolvedScheduleId : null;
            setScheduleId((prev) => (prev === nextScheduleId ? prev : nextScheduleId));
          }
          return;
        }

        const scheduleEndpoint =
          scheduleViewMode === "published"
            ? `/api/grids/${gridId}/published-schedule/`
            : `/api/grids/${gridId}/schedule/`;
        const r = await fetch(scheduleEndpoint, { cache: "no-store" }).catch(() => null);
        if (!r || !r.ok) {
          if (active) setSchedulePlacements((prev) => (prev.length === 0 ? prev : []));
          return;
        }
        const data = await r.json().catch(() => ({}));
        const scheduleCandidate = data?.schedule ?? data?.published_schedule ?? data?.latest ?? data;
        const placements = Array.isArray(scheduleCandidate?.placements)
          ? scheduleCandidate.placements
          : Array.isArray(scheduleCandidate?.schedule)
          ? scheduleCandidate.schedule
          : [];
        const resolvedScheduleId = Number(
          readEntityId(scheduleCandidate?.schedule_id) ??
            readEntityId(scheduleCandidate?.schedule) ??
            readEntityId(scheduleCandidate?.id) ??
            0,
        );
        if (active) {
          setSchedulePlacements((prev) => (prev === placements ? prev : placements));
          const nextScheduleId = Number.isFinite(resolvedScheduleId) && resolvedScheduleId > 0 ? resolvedScheduleId : null;
          setScheduleId((prev) => (prev === nextScheduleId ? prev : nextScheduleId));
        }
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
          setParticipants((prev) => {
            const same =
              prev.length === pitems.length &&
              prev.every((item, index) =>
                item.id === pitems[index]?.id &&
                item.routeId === pitems[index]?.routeId &&
                item.name === pitems[index]?.name &&
                item.tier === pitems[index]?.tier,
              );
            return same ? prev : pitems;
          });
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [gridId]);

  const filteredSchedule = useMemo(() => schedulePlacements.filter((s) => {
    const assigned = Array.isArray(s.assigned_participants) ? s.assigned_participants : [];
    return assigned.map(String).includes(String(participantId));
  }), [participantId, schedulePlacements]);

  const getPlacementId = useCallback((placement: SchedulePlacement) =>
    readEntityId(
      placement.placement_id ??
        placement.placementId ??
        placement.schedule_placement_id ??
        placement.schedulePlacementId ??
        placement.schedule_placement ??
        placement.id,
    ), []);

  useEffect(() => {
    if (!canComment || !scheduleId) {
      setPlacementComments([]);
      setCommentsLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setCommentsLoading(true);
      try {
        const res = await authFetch(
          `/api/placement-comments/?schedule=${encodeURIComponent(String(scheduleId))}&grid=${encodeURIComponent(String(gridId))}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Failed to load comments (${res.status})`);
        const data = await res.json().catch(() => ([]));
        const list = Array.isArray(data) ? data : data.results ?? [];
        const normalized = list
          .map((raw: any) => {
            const bundleRaw =
              typeof raw?.bundle === "object" && raw.bundle?.id != null ? raw.bundle.id : raw?.bundle;
            const message = raw?.message ?? raw?.text ?? raw?.comment ?? "";
            if (
              raw?.id == null ||
              raw?.schedule == null ||
              raw?.source_cell_id == null ||
              raw?.day_index == null ||
              raw?.start_slot == null
            ) {
              return null;
            }
            return {
              id: raw.id,
              schedule: raw.schedule,
              schedule_placement:
                raw.schedule_placement ??
                raw.schedule_placement_id ??
                raw.placement_id ??
                raw.placementId ??
                null,
              source_cell_id: raw.source_cell_id,
              bundle: bundleRaw ?? null,
              day_index: Number(raw.day_index),
              start_slot: Number(raw.start_slot),
              end_slot: raw.end_slot == null ? null : Number(raw.end_slot),
              text: String(message),
              created_at: raw.created_at,
              author_id: extractAuthorId(raw),
              author_name: extractAuthorName(raw),
            } as PlacementComment;
          })
          .filter(Boolean) as PlacementComment[];
        if (active) setPlacementComments(normalized);
      } catch {
        if (active) setPlacementComments([]);
      } finally {
        if (active) setCommentsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [canComment, gridId, scheduleId]);

  const commentCountByPlacement = useMemo(() => {
    const map: Record<string, number> = {};
    for (const comment of placementComments) {
      const anchorKey = buildPlacementKey(
        comment.schedule,
        comment.source_cell_id,
        comment.bundle,
        Number(comment.day_index),
        Number(comment.start_slot),
      );
      map[anchorKey] = (map[anchorKey] || 0) + 1;
      if (comment.schedule_placement != null) {
        const placementKey = buildPlacementKey(
          comment.schedule,
          comment.source_cell_id,
          comment.bundle,
          Number(comment.day_index),
          Number(comment.start_slot),
          comment.schedule_placement,
        );
        if (placementKey !== anchorKey) map[placementKey] = (map[placementKey] || 0) + 1;
      }
    }
    return map;
  }, [placementComments]);

  const commentPlacementOptions = useMemo(() => {
    if (!canComment || scheduleId == null) return [];
    const deduped = new Map<string, { key: string; anchor: CommentAnchor; label: string; count: number }>();
    for (const placement of filteredSchedule) {
      const sourceCellId = String(placement.source_cell_id ?? placement.source_cell ?? placement.id);
      const placementId = getPlacementId(placement);
      const bundleId = placement.bundle_id ?? placement.bundle ?? null;
      const cellName = cellNameById[sourceCellId] || `Cell ${sourceCellId}`;
      const timeLabel = formatSlotRange(dayStartMin, slotMin, placement.start_slot, placement.end_slot);
      const key = buildPlacementKey(
        scheduleId,
        sourceCellId,
        bundleId,
        placement.day_index,
        placement.start_slot,
        placementId,
      );
      if (deduped.has(key)) continue;
      deduped.set(key, {
        key,
        label: `${cellName} - ${timeLabel}`,
        count: commentCountByPlacement[key] || 0,
        anchor: {
          placementId,
          scheduleId,
          sourceCellId,
          bundleId,
          dayIndex: placement.day_index,
          startSlot: placement.start_slot,
          endSlot: placement.end_slot,
          cellName,
          timeLabel,
        },
      });
    }
    return Array.from(deduped.values()).sort(
      (a, b) =>
        a.anchor.dayIndex - b.anchor.dayIndex ||
        a.anchor.startSlot - b.anchor.startSlot ||
        a.anchor.cellName.localeCompare(b.anchor.cellName),
    );
  }, [canComment, cellNameById, commentCountByPlacement, dayStartMin, filteredSchedule, getPlacementId, scheduleId, slotMin]);

  const selectedCommentPlacementKey = commentAnchor
    ? buildPlacementKey(
        commentAnchor.scheduleId,
        commentAnchor.sourceCellId,
        commentAnchor.bundleId,
        commentAnchor.dayIndex,
        commentAnchor.startSlot,
        commentAnchor.placementId,
      )
    : "";

  const selectedCommentPlacementIndex = useMemo(
    () => commentPlacementOptions.findIndex((option) => option.key === selectedCommentPlacementKey),
    [commentPlacementOptions, selectedCommentPlacementKey],
  );

  const moveCommentPlacementSelection = useCallback(
    (direction: -1 | 1) => {
      if (commentPlacementOptions.length === 0) return;
      const currentIndex = selectedCommentPlacementIndex >= 0 ? selectedCommentPlacementIndex : 0;
      const nextIndex =
        (currentIndex + direction + commentPlacementOptions.length) % commentPlacementOptions.length;
      const next = commentPlacementOptions[nextIndex];
      if (!next) return;
      setCommentAnchor(next.anchor);
      setCommentError(null);
    },
    [commentPlacementOptions, selectedCommentPlacementIndex],
  );

  useEffect(() => {
    if (!commentsPanelOpen) {
      setCommentError((prev) => (prev == null ? prev : null));
      setCommentBusy((prev) => (prev === false ? prev : false));
      setHoveredCommentPlacementKey((prev) => (prev == null ? prev : null));
      return;
    }
    if (commentPlacementOptions.length === 0) {
      setCommentAnchor((prev) => (prev == null ? prev : null));
      return;
    }
    if (!selectedCommentPlacementKey) {
      setCommentAnchor((prev) => (prev ? prev : commentPlacementOptions[0].anchor));
      return;
    }
    const hasCurrent = commentPlacementOptions.some((option) => option.key === selectedCommentPlacementKey);
    if (!hasCurrent) {
      setCommentAnchor((prev) => {
        if (!prev) return commentPlacementOptions[0].anchor;
        const prevKey = buildPlacementKey(
          prev.scheduleId,
          prev.sourceCellId,
          prev.bundleId,
          prev.dayIndex,
          prev.startSlot,
          prev.placementId,
        );
        return prevKey === commentPlacementOptions[0].key ? prev : commentPlacementOptions[0].anchor;
      });
    }
  }, [commentPlacementOptions, commentsPanelOpen, selectedCommentPlacementKey]);

  const activePlacementComments = useMemo(() => {
    if (!commentAnchor) return [];
    return placementComments.filter((comment) => {
      const placementMatches =
        commentAnchor.placementId != null &&
        comment.schedule_placement != null &&
        String(comment.schedule_placement) === String(commentAnchor.placementId);
      const anchorMatches =
        Number(comment.schedule) === Number(commentAnchor.scheduleId) &&
        String(comment.source_cell_id) === String(commentAnchor.sourceCellId) &&
        String(comment.bundle) === String(commentAnchor.bundleId) &&
        Number(comment.day_index) === Number(commentAnchor.dayIndex) &&
        Number(comment.start_slot) === Number(commentAnchor.startSlot);
      return placementMatches || anchorMatches;
    });
  }, [commentAnchor, placementComments]);

  const shouldDimScheduleForCommentFocus =
    commentsPanelOpen && Boolean(selectedCommentPlacementKey);

  const orderedActivePlacementComments = useMemo(
    () =>
      [...activePlacementComments].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      }),
    [activePlacementComments],
  );

  const submitPlacementComment = async () => {
    if (!commentAnchor || !commentDraft.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const payload =
        commentAnchor.placementId != null && String(commentAnchor.placementId).trim()
          ? { placement_id: commentAnchor.placementId, text: commentDraft.trim() }
          : {
              schedule: commentAnchor.scheduleId,
              source_cell_id: commentAnchor.sourceCellId,
              bundle: commentAnchor.bundleId,
              day_index: commentAnchor.dayIndex,
              start_slot: commentAnchor.startSlot,
              end_slot: commentAnchor.endSlot,
              text: commentDraft.trim(),
            };
      const res = await authFetch("/api/placement-comments/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || t("solve_overlay.could_not_add_comment"));
      }
      const raw = await res.json().catch(() => ({}));
      const bundleRaw =
        typeof raw?.bundle === "object" && raw.bundle?.id != null ? raw.bundle.id : raw?.bundle;
      const next: PlacementComment = {
        id: raw.id,
        schedule: raw.schedule ?? commentAnchor.scheduleId,
        schedule_placement:
          raw.schedule_placement ??
          raw.schedule_placement_id ??
          raw.placement_id ??
          raw.placementId ??
          commentAnchor.placementId ??
          null,
        source_cell_id: raw.source_cell_id ?? commentAnchor.sourceCellId,
        bundle: bundleRaw ?? commentAnchor.bundleId,
        day_index: Number(raw.day_index ?? commentAnchor.dayIndex),
        start_slot: Number(raw.start_slot ?? commentAnchor.startSlot),
        end_slot: raw.end_slot == null ? commentAnchor.endSlot : Number(raw.end_slot),
        text: String(raw.text ?? raw.message ?? commentDraft.trim()),
        created_at: raw.created_at,
        author_id: extractAuthorId(raw) ?? currentUserId ?? undefined,
        author_name: extractAuthorName(raw),
      };
      setPlacementComments((prev) => [next, ...prev]);
      setCommentDraft("");
    } catch (error: unknown) {
      setCommentError(error instanceof Error ? error.message : t("solve_overlay.could_not_add_comment"));
    } finally {
      setCommentBusy(false);
    }
  };

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
          {filteredSchedule.length === 0 && (
            <div
              className="sticky z-[6] flex justify-center"
              style={{ top: "calc(50% - 1rem)", marginLeft: timeColPx, width: `calc(100% - ${timeColPx}px)` }}
            >
              <span className="rounded-full border border-gray-200 bg-white/85 px-3 py-1 text-xs font-medium text-gray-500 shadow-sm backdrop-blur">
                {t("participant_detail.no_schedule_placements")}
              </span>
            </div>
          )}
          {filteredSchedule.map((s, idx) => {
            const col = s.day_index;
            if (col < 0 || col >= daysCount) return null;
            const sourceCellId = String(s.source_cell_id ?? s.source_cell ?? s.id);
            const placementId = getPlacementId(s);
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
            const commentKey =
              scheduleId != null
                ? buildPlacementKey(scheduleId, sourceCellId, bundleId, s.day_index, s.start_slot, placementId)
                : null;
            const isCommentFocused =
              commentsPanelOpen && Boolean(commentKey) && commentKey === selectedCommentPlacementKey;
            const isCommentHovered =
              commentsPanelOpen && Boolean(commentKey) && hoveredCommentPlacementKey === commentKey;
            const isCommentMuted =
              shouldDimScheduleForCommentFocus && !isCommentFocused && !isCommentHovered;
            const commentAnchorForCard =
              canComment && scheduleId != null
                ? {
                    placementId,
                    scheduleId,
                    sourceCellId,
                    bundleId,
                    dayIndex: s.day_index,
                    startSlot: s.start_slot,
                    endSlot: s.end_slot,
                    cellName,
                    timeLabel,
                  }
                : null;
            return (
              <div
                key={`${s.id}-${idx}`}
                data-placement-card
                data-placement-id={placementId == null ? undefined : String(placementId)}
                className={`absolute ${commentsPanelOpen && commentAnchorForCard ? "pointer-events-auto cursor-pointer transition-transform duration-150 ease-out" : ""}`}
                style={{
                  top,
                  left,
                  width,
                  height,
                  transform: isCommentFocused ? "scale(1.08)" : undefined,
                  zIndex: isCommentFocused ? 60 : isCommentHovered ? 52 : undefined,
                  transformOrigin: "center",
                }}
                onClick={() => {
                  if (!commentsPanelOpen || !commentAnchorForCard) return;
                  setCommentAnchor(commentAnchorForCard);
                  setCommentError(null);
                }}
                onPointerEnter={() => {
                  if (!commentsPanelOpen || !commentKey) return;
                  setHoveredCommentPlacementKey(commentKey);
                }}
                onPointerLeave={() => {
                  if (!commentKey) return;
                  setHoveredCommentPlacementKey((prev) => (prev === commentKey ? null : prev));
                }}
              >
                <div
                  className="relative w-full h-full rounded-md border px-2 py-2 text-[11px] transition-[filter,opacity] duration-150 ease-out"
                  style={{
                    backgroundColor: bg || "#f3f4f6",
                    borderColor: border,
                    color: textDark,
                    opacity: isCommentMuted ? 0.38 : 1,
                    filter: isCommentMuted ? "grayscale(0.85)" : "none",
                  }}
                >
                  {isCommentFocused && (
                    <>
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md border-2 schedule-comment-ring"
                        style={{ borderColor: bg || border }}
                      />
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md border-2 schedule-comment-ring schedule-comment-ring-delay"
                        style={{ borderColor: bg || border }}
                      />
                    </>
                  )}
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

      {canComment &&
        commentsPanelOpen &&
        isClientReady &&
        createPortal(
          <aside
            className="fixed right-0 z-[1302] w-[340px] max-w-full border-l border-gray-200 bg-gray-50"
            style={{
              top: `${commentsPanelTopPx}px`,
              height: `calc(100dvh - ${commentsPanelTopPx}px)`,
            }}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-gray-700" />
                  <h2 className="text-xl font-semibold text-gray-900">{t("solve_overlay.comments")}</h2>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-200 hover:text-black"
                  title={t("solve_overlay.close_comments_panel")}
                  onClick={() => {
                    onCommentsPanelOpenChange?.(false);
                    setCommentError(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {scheduleId != null && (
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t("solve_overlay.placement")}</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title={t("solve_overlay.previous_placement")}
                      onClick={() => moveCommentPlacementSelection(-1)}
                      disabled={commentPlacementOptions.length <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <select
                      className="h-9 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 text-sm"
                      value={selectedCommentPlacementKey}
                      onChange={(event) => {
                        const selected = commentPlacementOptions.find((option) => option.key === event.target.value);
                        if (!selected) return;
                        setCommentAnchor(selected.anchor);
                        setCommentError(null);
                      }}
                      disabled={commentPlacementOptions.length === 0}
                    >
                      {commentPlacementOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                          {option.count > 0 ? ` (${option.count})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title={t("solve_overlay.next_placement")}
                      onClick={() => moveCommentPlacementSelection(1)}
                      disabled={commentPlacementOptions.length <= 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {scheduleId == null ? (
                  <div className="text-sm text-gray-500">{t("solve_overlay.comments_unavailable")}</div>
                ) : (
                  <>
                    {commentsLoading ? (
                      <div className="text-sm text-gray-500">{t("solve_overlay.loading_comments")}</div>
                    ) : orderedActivePlacementComments.length === 0 ? (
                      <div className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                        {t("solve_overlay.no_comments_for_placement")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {orderedActivePlacementComments.map((comment) => (
                          <PlacementCommentBubble
                            key={String(comment.id)}
                            text={comment.text}
                            createdAt={comment.created_at}
                            authorId={comment.author_id}
                            authorName={comment.author_name}
                            currentUserId={currentUserId}
                            locale={locale}
                            youLabel={t("solve_overlay.comment_you")}
                            justNowLabel={t("solve_overlay.comment_just_now")}
                            fallbackAuthorLabel={t("solve_overlay.default_comment_author")}
                          />
                        ))}
                      </div>
                    )}

                  </>
                )}
              </div>

              {scheduleId != null && (
                <div className="border-t border-gray-200 px-4 py-3">
                  <textarea
                    className="min-h-[100px] w-full rounded border bg-white px-3 py-2 text-sm"
                    placeholder={t("solve_overlay.write_comment_selected")}
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    disabled={commentBusy}
                  />
                  {commentError && <div className="mt-2 text-xs text-red-600">{commentError}</div>}
                  <button
                    type="button"
                    className="mt-2 h-9 w-full rounded bg-black px-3 text-sm text-white disabled:opacity-60"
                    onClick={() => void submitPlacementComment()}
                    disabled={commentBusy || !commentDraft.trim() || !commentAnchor}
                  >
                    {commentBusy ? t("solve_overlay.saving") : t("solve_overlay.add_comment")}
                  </button>
                </div>
              )}
            </div>
          </aside>,
          document.body,
        )}

      {!hideSideStack && participantTabs.length > 1 && (
        <div
          data-participant-tabs
          className="fixed inset-x-0 bottom-0 z-[70] pointer-events-none"
          style={{
            opacity: participantTabsOpacity,
            transform: `translateY(${Math.round((1 - participantTabsOpacity) * 18)}px)`,
            pointerEvents: participantTabsOpacity > 0.05 ? undefined : "none",
          }}
        >
          <div className="max-w-5xl mx-auto flex items-end gap-2 px-4 pt-2 pb-0 overflow-x-auto overflow-y-hidden pointer-events-auto hide-scrollbar">
            {participantTabs.map((participant) => {
              const isActive = String(participant.id) === String(participantId);
              return (
                <Link
                  key={`participant-tab-${participant.id}`}
                  href={`/grid/${encodeURIComponent(gridCode)}/participants?pid=${encodeURIComponent(
                    String(participant.routeId),
                  )}&view=${isActive ? targetView : "schedule"}`}
                  onClick={(event) => {
                    if (isActive) event.preventDefault();
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
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
