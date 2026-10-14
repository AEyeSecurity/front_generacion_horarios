export type SplitCellPlacementState = "UNPLACED" | "PARTIALLY_PLACED" | "FULLY_PLACED" | "STALE";

export function buildBalancedSlotParts(totalSlots: number, partCount: number): number[] {
  const safeTotal = Math.max(1, Math.round(totalSlots) || 1);
  const safePartCount = Math.max(1, Math.min(Math.round(partCount) || 1, safeTotal));
  const base = Math.floor(safeTotal / safePartCount);
  let remainder = safeTotal - base * safePartCount;
  return Array.from({ length: safePartCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return value;
  });
}

export function classifySplitCellPlacements(
  expectedSegmentSlots: number[],
  placedDurationSlots: number[],
): { state: SplitCellPlacementState; remainingSegmentSlots: number[] } {
  const remainingSegmentSlots = expectedSegmentSlots.map((duration) => Math.max(1, Math.round(duration) || 1));
  let compatible = placedDurationSlots.length <= remainingSegmentSlots.length;

  for (const rawDuration of placedDurationSlots) {
    if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
      compatible = false;
      continue;
    }
    const duration = Math.max(1, Math.round(rawDuration));
    const matchingIndex = remainingSegmentSlots.indexOf(duration);
    if (matchingIndex < 0) {
      compatible = false;
      continue;
    }
    remainingSegmentSlots.splice(matchingIndex, 1);
  }

  const state: SplitCellPlacementState =
    placedDurationSlots.length === 0
      ? "UNPLACED"
      : !compatible
      ? "STALE"
      : remainingSegmentSlots.length === 0
      ? "FULLY_PLACED"
      : "PARTIALLY_PLACED";

  return { state, remainingSegmentSlots };
}
