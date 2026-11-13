export type OverlapGroupMeta = {
  dayIndex: number;
  groupSize: number;
  groupPosition: number;
  startUnit: number;
  spanUnits: number;
  layoutUnits: number;
  clusterPlacementIds: string[];
  concurrentPlacementIds: string[];
};

export type OverlapPlacementEntry = {
  placementId: string;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  spanWeight?: number;
  visualOrder?: number | null;
};

export function buildOverlapGroupMeta(
  rowsByDay: Map<number, OverlapPlacementEntry[]>,
  availableUnits = 1,
): Record<string, OverlapGroupMeta> {
  const nextMeta: Record<string, OverlapGroupMeta> = {};
  const capacityUnits = Math.max(1, Math.round(availableUnits));

  const compareVisualOrder = (a: OverlapPlacementEntry, b: OverlapPlacementEntry) => {
    const aOrder = typeof a.visualOrder === "number" && Number.isFinite(a.visualOrder) ? a.visualOrder : null;
    const bOrder = typeof b.visualOrder === "number" && Number.isFinite(b.visualOrder) ? b.visualOrder : null;
    if (aOrder != null || bOrder != null) {
      if (aOrder == null) return 1;
      if (bOrder == null) return -1;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    return (
      a.startSlot - b.startSlot ||
      a.endSlot - b.endSlot ||
      a.placementId.localeCompare(b.placementId, undefined, { numeric: true })
    );
  };

  const assignCluster = (dayIndex: number, clusterRows: OverlapPlacementEntry[]) => {
    if (clusterRows.length === 0) return;
    const orderedRows = [...clusterRows].sort(compareVisualOrder);
    const placed: Array<OverlapPlacementEntry & { startUnit: number; spanUnits: number }> = [];

    for (const row of orderedRows) {
      const spanUnits = Math.max(1, Math.min(capacityUnits, Math.round(Number(row.spanWeight) || 1)));
      const candidateStarts = new Set<number>([0]);
      for (const existing of placed) candidateStarts.add(existing.startUnit + existing.spanUnits);
      const starts = Array.from(candidateStarts).sort((a, b) => a - b);
      const startUnit =
        starts.find((candidateStart) =>
          placed.every((existing) => {
            const overlapsInTime = row.startSlot < existing.endSlot && row.endSlot > existing.startSlot;
            if (!overlapsInTime) return true;
            return (
              candidateStart + spanUnits <= existing.startUnit ||
              candidateStart >= existing.startUnit + existing.spanUnits
            );
          }),
        ) ?? 0;
      placed.push({ ...row, startUnit, spanUnits });
    }

    const usedUnits = Math.max(1, ...placed.map((row) => row.startUnit + row.spanUnits));
    // Unit count sets preferred widths, not a limit on visual concurrency.
    // Independent activities (including grids without units) can exceed it.
    const layoutUnits = Math.max(capacityUnits, usedUnits);
    const centeredOffset = usedUnits < capacityUnits ? (capacityUnits - usedUnits) / 2 : 0;
    const clusterPlacementIds = orderedRows.map((row) => row.placementId);

    for (const row of placed) {
      const concurrentRows = placed
        .filter((candidate) => row.startSlot < candidate.endSlot && row.endSlot > candidate.startSlot)
        .sort((a, b) => a.startUnit - b.startUnit || compareVisualOrder(a, b));
      const concurrentPlacementIds = concurrentRows.map((candidate) => candidate.placementId);
      nextMeta[row.placementId] = {
        dayIndex,
        groupSize: concurrentPlacementIds.length,
        groupPosition: Math.max(0, concurrentPlacementIds.indexOf(row.placementId)),
        startUnit: centeredOffset + row.startUnit,
        spanUnits: row.spanUnits,
        layoutUnits,
        clusterPlacementIds,
        concurrentPlacementIds,
      };
    }
  };

  for (const [dayIndex, dayRows] of rowsByDay.entries()) {
    const orderedRows = [...dayRows].sort(
      (a, b) =>
        a.startSlot - b.startSlot ||
        a.endSlot - b.endSlot ||
        a.placementId.localeCompare(b.placementId),
    );

    let clusterRows: OverlapPlacementEntry[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;

    for (const row of orderedRows) {
      if (clusterRows.length === 0 || row.startSlot < clusterEnd) {
        clusterRows.push(row);
        clusterEnd = Math.max(clusterEnd, row.endSlot);
        continue;
      }

      assignCluster(dayIndex, clusterRows);
      clusterRows = [row];
      clusterEnd = row.endSlot;
    }

    assignCluster(dayIndex, clusterRows);
  }

  return nextMeta;
}

export function getColumnOverlapCardLayout(
  col: number,
  timeColPx: number,
  dayWidthFactors: number[],
  meta?: OverlapGroupMeta,
  insetPx = 0,
) {
  const safeFactors = dayWidthFactors.length > 0 ? dayWidthFactors : [1];
  const safeCol = Math.max(0, Math.min(safeFactors.length - 1, col));
  const totalFactor = Math.max(
    1,
    safeFactors.reduce((sum, factor) => sum + Math.max(0.1, Number(factor) || 1), 0),
  );
  const dayFactor = Math.max(0.1, Number(safeFactors[safeCol]) || 1);
  const prefixFactor = safeFactors
    .slice(0, safeCol)
    .reduce((sum, factor) => sum + Math.max(0.1, Number(factor) || 1), 0);
  const scopeCount = Math.max(1, Math.round(dayFactor), meta?.layoutUnits ?? 1);
  const spanUnits = Math.max(1, Math.min(scopeCount, Math.round(meta?.spanUnits ?? scopeCount)));
  const maxStartUnit = Math.max(0, scopeCount - spanUnits);
  const startUnit = meta
    ? Math.max(0, Math.min(maxStartUnit, meta.startUnit))
    : maxStartUnit / 2;
  const startFactor = prefixFactor + dayFactor * (startUnit / scopeCount);
  const widthFactor = dayFactor * (spanUnits / scopeCount);
  return {
    left: `calc(${timeColPx}px + ${startFactor} * ((100% - ${timeColPx}px) / ${totalFactor}) + ${insetPx}px)`,
    width: `calc(${widthFactor} * ((100% - ${timeColPx}px) / ${totalFactor}) - ${insetPx * 2}px)`,
  };
}

export function getGroupedUnitCardLayout(
  col: number,
  timeColPx: number,
  dayWidthFactors: number[],
  scopeUnitIds: string[],
  placementUnitIds: string[],
  _pointerUnitIndex?: number | null,
  meta?: OverlapGroupMeta,
  insetPx = 0,
) {
  const safeFactors = dayWidthFactors.length > 0 ? dayWidthFactors : [1];
  const safeCol = Math.max(0, Math.min(safeFactors.length - 1, col));
  const totalFactor = Math.max(
    1,
    safeFactors.reduce((sum, factor) => sum + Math.max(0.1, Number(factor) || 1), 0),
  );
  const dayFactor = Math.max(0.1, Number(safeFactors[safeCol]) || 1);
  const prefixFactor = safeFactors
    .slice(0, safeCol)
    .reduce((sum, factor) => sum + Math.max(0.1, Number(factor) || 1), 0);
  const scopeCount = Math.max(1, scopeUnitIds.length);
  const indexByUnitId = new Map(scopeUnitIds.map((unitId, index) => [String(unitId), index]));
  const indexes = Array.from(
    new Set(
      placementUnitIds
        .map((unitId) => indexByUnitId.get(String(unitId)))
        .filter((index): index is number => typeof index === "number"),
    ),
  ).sort((a, b) => a - b);

  let spanUnits = scopeCount;
  let startUnit = 0;
  if (indexes.length > 0) {
    spanUnits = Math.min(scopeCount, Math.max(1, indexes.length));
  }

  const layoutUnits = Math.max(scopeCount, meta?.layoutUnits ?? scopeCount);
  const maxStartUnit = Math.max(0, layoutUnits - spanUnits);
  startUnit = meta
    ? Math.max(0, Math.min(maxStartUnit, meta.startUnit))
    : maxStartUnit / 2;

  const startFactor = prefixFactor + dayFactor * (startUnit / layoutUnits);
  const widthFactor = dayFactor * (spanUnits / layoutUnits);
  const leadingInsetPx = startUnit <= 0.001 ? insetPx : 0;
  const trailingInsetPx = startUnit + spanUnits >= layoutUnits - 0.001 ? insetPx : 0;

  return {
    left: `calc(${timeColPx}px + ${startFactor} * ((100% - ${timeColPx}px) / ${totalFactor}) + ${leadingInsetPx}px)`,
    width: `calc(${widthFactor} * ((100% - ${timeColPx}px) / ${totalFactor}) - ${leadingInsetPx + trailingInsetPx}px)`,
  };
}

