export type BasicSolution = {
  status?: string | null;
  created_at?: string | null;
};

export function sortSolutionsNewestFirst<T extends BasicSolution>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  });
}

export function pickDisplaySolution<T extends BasicSolution>(list: T[]): T | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const sorted = sortSolutionsNewestFirst(list);
  const latestOptimal = sorted.find((s) => s.status === "OPTIMAL");
  if (latestOptimal) return latestOptimal;

  const latestFeasible = sorted.find((s) => s.status === "FEASIBLE");
  if (latestFeasible) return latestFeasible;

  const latestNonError = sorted.find(
    (s) => s.status !== "INFEASIBLE" && s.status !== "ERROR",
  );
  if (latestNonError) return latestNonError;

  return sorted[0] ?? null;
}

export function isSolvedSolution(solution: BasicSolution | null | undefined) {
  return Boolean(
    solution &&
      (solution.status === "OPTIMAL" || solution.status === "FEASIBLE"),
  );
}
