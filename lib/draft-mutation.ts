export type DraftHistoryPayload = {
  cursor: number;
  latest: number;
  can_undo: boolean;
  can_redo: boolean;
};

export type DraftPlacementCacheChange =
  | {
      kind: "upsert";
      placement: Record<string, unknown>;
      replacementPlacementId?: string | number | null;
    }
  | {
      kind: "delete";
      placementId: string | number;
    };

export type DraftMutationNotice = {
  requiresContextRefresh?: boolean;
  draftHistory?: unknown;
  placementChange?: DraftPlacementCacheChange;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export function readDraftHistoryPayload(payload: unknown): unknown | undefined {
  if (!isRecord(payload)) return undefined;

  if (payload.draft_history !== undefined) return payload.draft_history;
  if (payload.history !== undefined) return payload.history;

  const schedule = isRecord(payload.schedule) ? payload.schedule : null;
  if (schedule?.draft_history !== undefined) return schedule.draft_history;
  if (schedule?.history !== undefined) return schedule.history;

  const hasDirectHistoryState =
    Object.prototype.hasOwnProperty.call(payload, "cursor") &&
    Object.prototype.hasOwnProperty.call(payload, "latest") &&
    Object.prototype.hasOwnProperty.call(payload, "can_undo") &&
    Object.prototype.hasOwnProperty.call(payload, "can_redo");
  return hasDirectHistoryState ? payload : undefined;
}
