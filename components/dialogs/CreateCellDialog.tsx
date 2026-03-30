"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  CellStaffingEditor,
  EMPTY_TIER_COUNTS,
  EMPTY_TIER_POOLS,
  TIERS,
  type Participant,
  type StaffOption,
  type TierCounts,
  type TierPools,
} from "@/components/dialogs/cell-staffing";

type TimeRange = { id: number; name: string; start_time: string; end_time: string };
type Unit = { id: number; name: string };

const COLOR_OPTIONS = [
  "#FF692A",
  "#FE9A37",
  "#FDC745",
  "#7CCF35",
  "#31C950",
  "#37BC7D",
  "#36BBA7",
  "#3BB8DB",
  "#34A6F4",
  "#2B7FFF",
  "#615FFF",
  "#8E51FF",
  "#AD46FF",
  "#E12AFB",
  "#F6339A",
  "#FF2056",
];

function buildStaffingError(
  tierCounts: TierCounts,
  tierPools: TierPools,
  staffGroups: StaffOption[],
  participantMap: Record<string, Participant>
) {
  const headcount = TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0);
  if (headcount < 1) return "Headcount must be at least 1.";

  const poolIds = new Set<string>();
  for (const tier of TIERS) {
    for (const id of tierPools[tier]) poolIds.add(id);
  }

  const groupIds = new Set<string>();
  for (const group of staffGroups) {
    if (group.members.length !== headcount) {
      return "Each staff group must contain exactly headcount participants.";
    }
    const composition: TierCounts = { ...EMPTY_TIER_COUNTS };
    for (const id of group.members) {
      if (poolIds.has(id)) return "A participant cannot be in both a tier pool and a staff group.";
      if (groupIds.has(id)) return "A participant cannot appear in more than one staff group.";
      groupIds.add(id);
      const tier = participantMap[id]?.tier;
      if (!tier) return "All participants in staff groups must have a tier.";
      composition[tier] += 1;
    }
    if (TIERS.some((tier) => composition[tier] !== tierCounts[tier])) {
      return "Each staff group must match the required tier composition.";
    }
  }

  const hasPools = TIERS.some((tier) => tierPools[tier].length > 0);
  const hasGroups = staffGroups.length > 0;
  if (!hasPools && !hasGroups) {
    return "At least one staffing source is required: tier pools or explicit staff groups.";
  }
  return null;
}

function normalizeUnitSet(ids: Array<string | number>) {
  return Array.from(new Set(ids.map(String))).sort((a, b) => Number(a) - Number(b));
}

function overlappingUnitIds(sets: string[][]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const set of sets) {
    for (const id of normalizeUnitSet(set)) {
      if (seen.has(id)) duplicates.add(id);
      else seen.add(id);
    }
  }
  return Array.from(duplicates).sort((a, b) => Number(a) - Number(b));
}

export default function CreateCellDialog({
  gridId,
  open,
  onOpenChange,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [durationCells, setDurationCells] = React.useState<number>(1);
  const [daysDivision, setDaysDivision] = React.useState<number>(1);
  const [timeRangeId, setTimeRangeId] = React.useState<string>("");
  const [colorHex, setColorHex] = React.useState<string | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);
  const [unitIds, setUnitIds] = React.useState<string[]>([]);
  const [bundleUnitSets, setBundleUnitSets] = React.useState<string[][]>([]);
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [timeRanges, setTimeRanges] = React.useState<TimeRange[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [cellMin, setCellMin] = React.useState<number>(1);
  const [tierCounts, setTierCounts] = React.useState<TierCounts>({ PRIMARY: 1, SECONDARY: 0, TERTIARY: 0 });
  const [tierPools, setTierPools] = React.useState<TierPools>({ ...EMPTY_TIER_POOLS });
  const [staffGroups, setStaffGroups] = React.useState<StaffOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const stepCircleBase = "w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-colors";

  const inferredHeadcount = React.useMemo(
    () => TIERS.reduce((sum, tier) => sum + Math.max(0, Number(tierCounts[tier] || 0)), 0),
    [tierCounts]
  );
  const participantMap = React.useMemo(
    () => Object.fromEntries(participants.map((p) => [String(p.id), p])) as Record<string, Participant>,
    [participants]
  );
  const unitNameById = React.useMemo(
    () => Object.fromEntries(units.map((u) => [String(u.id), u.name || `Unit ${u.id}`])) as Record<string, string>,
    [units]
  );
  const usedUnitIds = React.useMemo(() => new Set(bundleUnitSets.flat()), [bundleUnitSets]);
  const activeBundleSets = React.useMemo(() => {
    if (bundleUnitSets.length > 0) return bundleUnitSets;
    if (unitIds.length === 0) return [];
    return [normalizeUnitSet(unitIds)];
  }, [bundleUnitSets, unitIds]);
  const bundleSetsError = React.useMemo(() => {
    const duplicates = overlappingUnitIds(activeBundleSets);
    if (duplicates.length === 0) return null;
    return `Bundle sets cannot share units: ${duplicates.map((id) => unitNameById[id] || `Unit ${id}`).join(", ")}.`;
  }, [activeBundleSets, unitNameById]);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    setStep(1);
    setName("");
    setDescription("");
    setDurationCells(1);
    setDaysDivision(1);
    setTimeRangeId("");
    setColorHex(null);
    setColorMenuOpen(false);
    setUnitIds([]);
    setBundleUnitSets([]);
    setTierCounts({ PRIMARY: 1, SECONDARY: 0, TERTIARY: 0 });
    setTierPools({ ...EMPTY_TIER_POOLS });
    setStaffGroups([]);
    (async () => {
      try {
        try {
          let g: any = null;
          try {
            g = await fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).then((r) => r.json());
          } catch {
            g = await fetch(`/api/grids/${gridId}`, { cache: "no-store" }).then((r) => r.json());
          }
          if (g?.cell_size_min) setCellMin(Number(g.cell_size_min));
        } catch {}

        try {
          const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
          const pdata = await rp.json().catch(() => ([]));
          setParticipants(Array.isArray(pdata) ? pdata : pdata.results ?? []);
        } catch {}

        try {
          const rt = await fetch(`/api/time_ranges?grid=${gridId}`, { cache: "no-store" });
          const tdata = await rt.json().catch(() => ([]));
          setTimeRanges(Array.isArray(tdata) ? tdata : tdata.results ?? []);
        } catch {}

        try {
          const ru = await fetch(`/api/units?grid=${gridId}`, { cache: "no-store" });
          const udata = await ru.json().catch(() => ([]));
          setUnits(Array.isArray(udata) ? udata : udata.results ?? []);
        } catch {}

      } catch (e: any) {
        setErr(e?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, gridId]);

  const stepOneReady = Boolean(name.trim() && timeRangeId && durationCells >= 1 && activeBundleSets.length > 0);
  const staffingError = buildStaffingError(tierCounts, tierPools, staffGroups, participantMap);
  const canSubmit = stepOneReady && !staffingError && !bundleSetsError;

  const onMultiChange = (e: React.ChangeEvent<HTMLSelectElement>, setFn: (v: string[]) => void) => {
    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
    setFn(vals);
  };

  const saveCurrentUnitSet = () => {
    const normalized = normalizeUnitSet(unitIds);
    if (normalized.length === 0) return;
    const key = normalized.join(",");
    const overlap = overlappingUnitIds([...bundleUnitSets, normalized]);
    if (overlap.length > 0) {
      setErr(`Bundle sets cannot share units: ${overlap.map((id) => unitNameById[id] || `Unit ${id}`).join(", ")}.`);
      return;
    }
    setBundleUnitSets((prev) => {
      if (prev.some((set) => set.join(",") === key)) return prev;
      return [...prev, normalized];
    });
    setUnitIds([]);
    setErr(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      const template: any = {
        grid: gridId,
        name: name.trim(),
        description: description.trim() || undefined,
        duration_min: Number(durationCells) * Math.max(1, cellMin),
        division_days: Number(daysDivision) || 1,
        time_range: Number(timeRangeId),
        colorHex: colorHex ?? undefined,
        headcount: inferredHeadcount,
        tier_counts: tierCounts,
        tier_pools: tierPools,
      };

      if (staffGroups.length > 0) template.staff_options = staffGroups;

      const selectedSets = activeBundleSets.map((set) => set.map(Number));
      const isBulk = selectedSets.length > 1;
      const payload = isBulk
        ? {
            template,
            bundle_unit_sets: selectedSets,
          }
        : {
            ...template,
            units: selectedSets[0],
          };

      const res = await fetch(isBulk ? `/api/cells/bulk_create` : `/api/cells`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed (${res.status})`);
      }
      onOpenChange(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to create cell");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[880px] z-[96]">
          <DialogHeader className="relative min-h-9 pr-8">
            <DialogTitle>Create Cell</DialogTitle>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 flex items-center justify-center gap-2 select-none">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`${stepCircleBase} ${
                  step === 1
                    ? "bg-black text-white border-black shadow-[0_0_0_3px_rgba(0,0,0,0.18)]"
                    : "bg-black text-white border-black"
                }`}
                aria-label="Go to step 1"
              >
                1
              </button>
              <div className={`h-0.5 w-12 ${step === 2 ? "bg-black" : "bg-gray-300"}`} />
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!stepOneReady}
                className={`${stepCircleBase} ${
                  step === 2
                    ? "bg-black text-white border-black shadow-[0_0_0_3px_rgba(0,0,0,0.18)]"
                    : "bg-white text-gray-500 border-gray-300"
                } disabled:opacity-40`}
                aria-label="Go to step 2"
              >
                2
              </button>
            </div>
          </DialogHeader>

          {err && <div className="text-sm text-red-600 mb-2 whitespace-pre-wrap">{err}</div>}

          <form onSubmit={submit} className="space-y-4">
            {step === 1 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-sm mb-1">Name *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm mb-1">Duration (in cells) *</label>
                    <input className="w-full border rounded px-3 py-2 text-sm" type="number" min={1} step={1} value={durationCells} onChange={(e) => setDurationCells(Number(e.target.value))} required />
                    <div className="text-xs text-gray-500 mt-1">Total minutes: {durationCells * cellMin}</div>
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-sm mb-1">Division in days</label>
                    <input className="w-full border rounded px-3 py-2 text-sm" type="number" min={1} value={daysDivision} onChange={(e) => setDaysDivision(Number(e.target.value) || 1)} />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-sm mb-1">Time Range *</label>
                    <select className="w-full border rounded px-3 py-2 text-sm" value={timeRangeId} onChange={(e) => setTimeRangeId(e.target.value)} required>
                      <option value="">Select...</option>
                      {timeRanges.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.start_time}-{t.end_time})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-sm mb-1">Color</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setColorMenuOpen((v) => !v)}
                        className="h-10 w-10 rounded-full border border-gray-300 shadow-sm flex items-center justify-center text-gray-500"
                        style={{ backgroundColor: colorHex || "#ffffff" }}
                        aria-label="Select color"
                      >
                        {!colorHex ? <span className="text-base leading-none">/</span> : null}
                      </button>
                      {colorMenuOpen && (
                        <div className="absolute left-1/2 -translate-x-1/2 z-10 mt-2 rounded-md border bg-white p-2 shadow-lg">
                          <div className="flex items-center gap-2 overflow-x-auto max-w-[360px]">
                            <button
                              type="button"
                              onClick={() => { setColorHex(null); setColorMenuOpen(false); }}
                              className={`h-8 w-8 rounded-full border flex items-center justify-center text-gray-500 ${colorHex === null ? "ring-2 ring-black border-black" : "border-gray-300"}`}
                              aria-label="No color"
                            >
                              <span className="text-sm leading-none">/</span>
                            </button>
                            {COLOR_OPTIONS.map((hex) => (
                              <button key={hex} type="button" onClick={() => { setColorHex(hex); setColorMenuOpen(false); }} className={`h-8 w-8 rounded-full border ${colorHex === hex ? "ring-2 ring-black border-black" : "border-gray-300"}`} style={{ backgroundColor: hex }} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1">Description</label>
                  <textarea className="w-full border rounded px-3 py-2 text-sm resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1">Units *</label>
                    <select multiple className="w-full border rounded px-3 py-2 text-sm h-28" value={unitIds} onChange={(e) => onMultiChange(e, setUnitIds)} required={bundleUnitSets.length === 0}>
                      {units.map((u) => {
                        const id = String(u.id);
                        return (
                          <option key={u.id} value={u.id} disabled={usedUnitIds.has(id) && !unitIds.includes(id)}>
                            {u.name}
                          </option>
                        );
                      })}
                    </select>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveCurrentUnitSet}
                        disabled={unitIds.length === 0}
                        className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                      >
                        Save bundle set
                      </button>
                      <div className="text-xs text-gray-500">Select one or many units. Save each set you want created. Bundle sets cannot share units.</div>
                    </div>
                    {bundleSetsError && <div className="text-xs text-red-600 mt-2">{bundleSetsError}</div>}
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Saved bundles</label>
                    {bundleUnitSets.length > 0 && (
                      <div className="space-y-2">
                        {bundleUnitSets.map((set, index) => (
                          <div key={set.join(",")} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <span className="font-medium">{`Bundle ${index + 1}:`}</span>{" "}
                              <span className="break-words">{set.map((id) => unitNameById[id] || `Unit ${id}`).join(" + ")}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setBundleUnitSets((prev) => prev.filter((_, i) => i !== index))}
                              className="text-gray-500 hover:text-black"
                              aria-label={`Remove bundle ${index + 1}`}
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {bundleUnitSets.length === 0 && (
                      <div className="rounded border border-dashed px-3 py-4 text-xs text-gray-500">
                        No bundle sets saved yet.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <CellStaffingEditor
                  participants={participants}
                  tierCounts={tierCounts}
                  onTierCountsChange={setTierCounts}
                  tierPools={tierPools}
                  onTierPoolsChange={setTierPools}
                  staffGroups={staffGroups}
                  onStaffGroupsChange={setStaffGroups}
                />
                {staffingError && (
                  <div className="text-sm text-red-600">{staffingError}</div>
                )}
              </>
            )}

            <div className="flex justify-between gap-2">
              <div>
                <button
                  type="button"
                  className="h-9 w-9 rounded-full border text-sm flex items-center justify-center hover:bg-gray-50 disabled:opacity-40"
                  onClick={() => setStep(step === 1 ? 2 : 1)}
                  disabled={step === 1 && (!stepOneReady || Boolean(bundleSetsError))}
                  aria-label={step === 1 ? "Go to Staffing" : "Go to Basic Data"}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    {step === 1 ? (
                      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                </button>
              </div>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <button type="button" className="px-3 py-2 rounded border text-sm">Cancel</button>
                </DialogClose>
                {step === 2 && (
                  <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || !canSubmit || loading}>
                    {saving ? "Creating..." : "Create"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </DialogContent>
    </Dialog>
  );
}
