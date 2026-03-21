export type BasicSolution = {
  state?: string | null;
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
  const latest = sorted[0];
  if (!latest) return null;
  if (latest.state === "DONE" && latest.status === "INFEASIBLE") {
    const fallbackOptimal = sorted.find((s) => s.state === "DONE" && s.status === "OPTIMAL");
    if (fallbackOptimal) return fallbackOptimal;
  }
  return latest;
}

export function isSolvedSolution(solution: BasicSolution | null | undefined) {
  return Boolean(
    solution &&
      solution.state === "DONE" &&
      (solution.status === "OPTIMAL" || solution.status === "FEASIBLE"),
  );
}
