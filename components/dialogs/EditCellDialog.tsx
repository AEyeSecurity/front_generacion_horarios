"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CellStaffingEditor,
  EMPTY_TIER_COUNTS,
  EMPTY_TIER_POOLS,
  normalizeStaffGroups,
  normalizeTierPools,
  serializeStaffGroups,
  TIERS,
  type Participant,
  type StaffOption,
  type TierCounts,
  type TierPools,
} from "@/components/dialogs/cell-staffing";

type TimeRange = { id: number; name: string; start_time: string; end_time: string };
type Unit = { id: number; name: string };
type Bundle = { id: number | string; name?: string; units?: Array<number | string> };

type Cell = {
  id: number | string;
  name?: string;
  description?: string;
  duration_min?: number;
  division_days?: number;
  time_range?: number | string;
  bundles?: Array<number | string>;
  staffs?: Array<number | string>;
  colorHex?: string | null;
  color_hex?: string | null;
  headcount?: number | null;
  tier_counts?: Partial<TierCounts> | null;
  tier_pools?: Partial<Record<"PRIMARY" | "SECONDARY" | "TERTIARY", Array<string | number>>> | null;
  staff_options_resolved?: Array<{ staff?: string | number; members?: Array<string | number> }> | null;
  series_id?: string | null;
  seriesCells?: Cell[];
};

const COLOR_OPTIONS = [
  "#E7180B",
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
  headcount: number,
  tierCounts: TierCounts,
  tierPools: TierPools,
  staffGroups: StaffOption[],
  participantMap: Record<string, Participant>
) {
  if (headcount < 1) return "Headcount must be at least 1.";
  const total = TIERS.reduce((sum, tier) => sum + tierCounts[tier], 0);
  if (total !== headcount) return "Tier counts must add up exactly to headcount.";

  const poolIds = new Set<string>();
  for (const tier of TIERS) {
    for (const id of tierPools[tier]) poolIds.add(id);
  }

  const groupIds = new Set<string>();
  for (const group of staffGroups) {
    if (group.members.length !== headcount) return "Each staff group must contain exactly headcount participants.";
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
  if (!hasPools && !hasGroups) return "At least one staffing source is required: tier pools or explicit staff groups.";
  return null;
}

function normalizeUnitSet(ids: Array<string | number>) {
  return Array.from(new Set(ids.map(String))).sort((a, b) => Number(a) - Number(b));
}

function serializeUnitSets(sets: string[][]) {
  return JSON.stringify(sets.map((set) => normalizeUnitSet(set)).sort((a, b) => a.join(",").localeCompare(b.join(","))));
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

function stripBundleSuffix(name?: string) {
  return (name || "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function bundleKeyFromUnitIds(ids: Array<string | number>) {
  return normalizeUnitSet(ids).join(",");
}

export default function EditCellDialog({
  gridId,
  cell,
  open,
  onOpenChange,
  onSaved,
}: {
  gridId: number;
  cell: Cell | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const requestClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const ignoreOutsideClose = (e: Event) => {
    e.preventDefault();
  };

  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [durationCells, setDurationCells] = React.useState<number>(1);
  const [headcount, setHeadcount] = React.useState<number>(1);
  const [daysDivision, setDaysDivision] = React.useState<number>(1);
  const [timeRangeId, setTimeRangeId] = React.useState<string>("");
  const [colorHex, setColorHex] = React.useState<string | null>(COLOR_OPTIONS[0]);
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);
  const [unitIds, setUnitIds] = React.useState<string[]>([]);
  const [bundleUnitSets, setBundleUnitSets] = React.useState<string[][]>([]);
  const [editingBundleIndex, setEditingBundleIndex] = React.useState<number | null>(null);
  const [initialBundleSetsSerialized, setInitialBundleSetsSerialized] = React.useState("[]");
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [timeRanges, setTimeRanges] = React.useState<TimeRange[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [bundles, setBundles] = React.useState<Bundle[]>([]);
  const [cellMin, setCellMin] = React.useState<number>(1);
  const [tierCounts, setTierCounts] = React.useState<TierCounts>({ ...EMPTY_TIER_COUNTS });
  const [tierPools, setTierPools] = React.useState<TierPools>({ ...EMPTY_TIER_POOLS });
  const [staffGroups, setStaffGroups] = React.useState<StaffOption[]>([]);
  const [initialStaffGroupsSerialized, setInitialStaffGroupsSerialized] = React.useState("[]");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const participantMap = React.useMemo(
    () => Object.fromEntries(participants.map((p) => [String(p.id), p])) as Record<string, Participant>,
    [participants]
  );
  const unitNameById = React.useMemo(
    () => Object.fromEntries(units.map((u) => [String(u.id), u.name || `Unit ${u.id}`])) as Record<string, string>,
    [units]
  );
  const previewBundleSets = React.useMemo(() => {
    if (bundleUnitSets.length === 0) {
      if (unitIds.length === 0) return [];
      return [normalizeUnitSet(unitIds)];
    }
    if (editingBundleIndex == null) return bundleUnitSets;
    return bundleUnitSets.map((set, index) =>
      index === editingBundleIndex ? normalizeUnitSet(unitIds) : set
    );
  }, [bundleUnitSets, editingBundleIndex, unitIds]);
  const activeBundleSets = React.useMemo(() => {
    return previewBundleSets.filter((set) => set.length > 0);
  }, [previewBundleSets]);
  const usedUnitIds = React.useMemo(() => {
    const sets = bundleUnitSets.filter((_, index) => index !== editingBundleIndex);
    return new Set(sets.flat());
  }, [bundleUnitSets, editingBundleIndex]);
  const bundleSetsError = React.useMemo(() => {
    const duplicates = overlappingUnitIds(activeBundleSets);
    if (duplicates.length === 0) return null;
    return `Bundle sets cannot share units: ${duplicates.map((id) => unitNameById[id] || `Unit ${id}`).join(", ")}.`;
  }, [activeBundleSets, unitNameById]);

  React.useEffect(() => {
    if (!open || !cell) return;
    setErr(null);
    setLoading(true);
    setStep(1);
    setName(stripBundleSuffix(cell.name) || "");
    setDescription(cell.description || "");
    setDaysDivision(Number(cell.division_days) || 1);
    setTimeRangeId(cell.time_range != null ? String(cell.time_range) : "");
    setColorHex((cell.colorHex || cell.color_hex || COLOR_OPTIONS[0]) as string);
    setColorMenuOpen(false);
    setUnitIds([]);
    setEditingBundleIndex(null);

    (async () => {
      try {
        const seriesCells = cell.seriesCells?.length ? cell.seriesCells : [cell];
        let gridCellMin = 1;
        let bundlesList: Bundle[] = [];

        try {
          let g: any = null;
          try {
            g = await fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).then((r) => r.json());
          } catch {
            g = await fetch(`/api/grids/${gridId}`, { cache: "no-store" }).then((r) => r.json());
          }
          if (g?.cell_size_min) {
            gridCellMin = Number(g.cell_size_min);
            setCellMin(gridCellMin);
            const dur = Number(cell.duration_min) || gridCellMin;
            setDurationCells(Math.max(1, Math.round(dur / gridCellMin)));
          }
        } catch {}

        try {
          const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
          const pdata = await rp.json().catch(() => []);
          setParticipants(Array.isArray(pdata) ? pdata : pdata.results ?? []);
        } catch {}

        try {
          const rt = await fetch(`/api/time_ranges?grid=${gridId}`, { cache: "no-store" });
          const tdata = await rt.json().catch(() => []);
          setTimeRanges(Array.isArray(tdata) ? tdata : tdata.results ?? []);
        } catch {}

        try {
          const ru = await fetch(`/api/units?grid=${gridId}`, { cache: "no-store" });
          const udata = await ru.json().catch(() => []);
          setUnits(Array.isArray(udata) ? udata : udata.results ?? []);
        } catch {}

        try {
          const rb = await fetch(`/api/bundles?grid=${gridId}`, { cache: "no-store" });
          const bdata = await rb.json().catch(() => []);
          bundlesList = Array.isArray(bdata) ? bdata : bdata.results ?? [];
          setBundles(bundlesList);
        } catch {}

        const bundlesById = new Map<string, Bundle>(
          bundlesList.map((bundle) => [String(bundle.id), bundle])
        );
        const initialSets = seriesCells
          .map((seriesCell) => {
            const unitSet = new Set<string>();
            const bundleIds = Array.isArray(seriesCell.bundles) ? seriesCell.bundles.map(String) : [];
            bundleIds.forEach((bundleId) => {
              const bundle = bundlesById.get(bundleId);
              if (Array.isArray(bundle?.units)) {
                bundle.units.forEach((unitId) => unitSet.add(String(unitId)));
              }
            });
            return normalizeUnitSet(Array.from(unitSet));
          })
          .filter((set) => set.length > 0);

        setBundleUnitSets(initialSets);
        setInitialBundleSetsSerialized(serializeUnitSets(initialSets));
        const nextHeadcount = Math.max(1, Number(cell.headcount) || 1);
        setHeadcount(nextHeadcount);
        setTierCounts({
          PRIMARY: Number(cell.tier_counts?.PRIMARY || 0),
          SECONDARY: Number(cell.tier_counts?.SECONDARY || 0),
          TERTIARY: Number(cell.tier_counts?.TERTIARY || 0),
        });
        setTierPools(normalizeTierPools(cell.tier_pools));
        const resolvedGroups = normalizeStaffGroups(cell.staff_options_resolved);
        setStaffGroups(resolvedGroups);
        setInitialStaffGroupsSerialized(serializeStaffGroups(resolvedGroups));
      } catch (e: any) {
        setErr(e?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, gridId, cell]);

  const stepOneReady = Boolean(name.trim() && timeRangeId && durationCells >= 1 && headcount >= 1 && activeBundleSets.length > 0);
  const staffingError = buildStaffingError(headcount, tierCounts, tierPools, staffGroups, participantMap);
  const canSubmit = stepOneReady && !staffingError && !bundleSetsError;

  const onHeadcountChange = (value: number) => {
    setHeadcount(Math.max(1, value));
    setTierCounts({ ...EMPTY_TIER_COUNTS });
    setTierPools({ ...EMPTY_TIER_POOLS });
    setStaffGroups([]);
  };

  const onMultiChange = (e: React.ChangeEvent<HTMLSelectElement>, setFn: (v: string[]) => void) => {
    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
    setFn(vals);
  };

  const saveCurrentUnitSet = () => {
    const normalized = normalizeUnitSet(unitIds);
    if (normalized.length === 0) return;
    const nextSets =
      editingBundleIndex == null
        ? [...bundleUnitSets, normalized]
        : bundleUnitSets.map((set, index) => (index === editingBundleIndex ? normalized : set));
    const overlap = overlappingUnitIds(nextSets);
    if (overlap.length > 0) {
      setErr(`Bundle sets cannot share units: ${overlap.map((id) => unitNameById[id] || `Unit ${id}`).join(", ")}.`);
      return;
    }
    setBundleUnitSets(nextSets);
    setUnitIds([]);
    setEditingBundleIndex(null);
    setErr(null);
  };

  async function patchCell(targetCellId: number | string, payload: any) {
    const res = await fetch(`/api/cells/${targetCellId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed (${res.status})`);
    }
  }

  async function deleteCell(targetCellId: number | string) {
    const res = await fetch(`/api/cells/${targetCellId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed (${res.status})`);
    }
  }

  async function ensureBundleId(unitSet: number[]) {
    const targetKey = bundleKeyFromUnitIds(unitSet);
    const existing = bundles.find((bundle) => bundleKeyFromUnitIds(bundle.units ?? []) === targetKey);
    if (existing?.id != null) return Number(existing.id);

    const payloads = [
      { grid: gridId, unit_ids: unitSet },
      { unit_ids: unitSet },
      { grid: gridId, units: unitSet },
      { units: unitSet },
    ];

    for (const payload of payloads) {
      const res = await fetch(`/api/bundles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (data?.id != null) {
        setBundles((prev) => [...prev, data]);
        return Number(data.id);
      }
    }

    throw new Error("Failed to resolve bundle for the selected units.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !cell) return;
    setSaving(true);
    setErr(null);
    try {
      const seriesCells = cell.seriesCells?.length ? cell.seriesCells : [cell];
      const basePayload: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        duration_min: Number(durationCells) * Math.max(1, cellMin),
        division_days: Number(daysDivision) || 1,
        time_range: Number(timeRangeId),
        colorHex: colorHex || undefined,
        headcount,
        tier_counts: tierCounts,
        tier_pools: tierPools,
      };

      const serializedCurrentStaff = serializeStaffGroups(staffGroups);
      const sharedPayload: any = { ...basePayload };
      if (serializedCurrentStaff !== initialStaffGroupsSerialized) {
        sharedPayload.staff_options = staffGroups;
      }

      const desiredSets = activeBundleSets.map((set) => set.map(Number));
      if (seriesCells.length === 1 && desiredSets.length > 1) {
        const res = await fetch(`/api/cells/${cell.id}/extend_series`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            template: {
              grid: gridId,
              ...sharedPayload,
            },
            bundle_unit_sets: desiredSets,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed (${res.status})`);
        }
      } else {
        if (seriesCells.length > 1 && desiredSets.length > seriesCells.length) {
          throw new Error("Adding bundle sets to an existing bulk series is not supported yet.");
        }

        const desiredBundleIds = await Promise.all(desiredSets.map((set) => ensureBundleId(set)));
        for (let index = 0; index < desiredSets.length; index += 1) {
          await patchCell(seriesCells[index].id, {
            ...sharedPayload,
            bundles: [desiredBundleIds[index]],
          });
        }

        if (seriesCells.length > desiredSets.length) {
          for (const extraCell of seriesCells.slice(desiredSets.length)) {
            await deleteCell(extraCell.id);
          }
        }
      }

      requestClose();
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message || "Failed to update cell");
    } finally {
      setSaving(false);
    }
  }

  const isSeriesEdit = Boolean((cell?.seriesCells?.length ?? 0) > 1 || cell?.series_id);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
      }}
    >
      <DialogContent
        className="sm:max-w-[880px] z-[96]"
        showCloseButton={false}
        onPointerDownOutside={ignoreOutsideClose}
        onInteractOutside={ignoreOutsideClose}
        onEscapeKeyDown={ignoreOutsideClose}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={requestClose}
          className="absolute top-4 right-4 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <DialogHeader>
          <DialogTitle>{isSeriesEdit ? "Edit Cell Series" : "Edit Cell"}</DialogTitle>
          <DialogDescription>Step {step} of 2</DialogDescription>
        </DialogHeader>

        {err && <div className="text-sm text-red-600 mb-2 whitespace-pre-wrap">{err}</div>}

        <form onSubmit={submit} className="space-y-4">
          {step === 1 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-sm mb-1">Name *</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm mb-1">Duration (in cells) *</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" type="number" min={1} step={1} value={durationCells} onChange={(e) => setDurationCells(Number(e.target.value))} required />
                  <div className="text-xs text-gray-500 mt-1">Total minutes: {durationCells * cellMin}</div>
                </div>
                <div>
                  <label className="block text-sm mb-1">Headcount *</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    step={1}
                    value={headcount}
                    onChange={(e) => onHeadcountChange(Number(e.target.value) || 1)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Division in days</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" type="number" min={1} value={daysDivision} onChange={(e) => setDaysDivision(Number(e.target.value) || 1)} />
                </div>
                <div>
                  <label className="block text-sm mb-1">Color</label>
                  <div className="relative">
                    <button type="button" onClick={() => setColorMenuOpen((v) => !v)} className="h-10 w-10 rounded-full border border-gray-300 shadow-sm" style={{ backgroundColor: colorHex || "#ffffff" }} />
                    {colorMenuOpen && (
                      <div className="absolute left-1/2 -translate-x-1/2 z-10 mt-2 rounded-md border bg-white p-2 shadow-lg">
                        <div className="flex items-center gap-2 overflow-x-auto max-w-[360px]">
                          <button type="button" onClick={() => { setColorHex(null); setColorMenuOpen(false); }} className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
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
                        {editingBundleIndex == null ? "Save bundle set" : "Update bundle set"}
                      </button>
                      {editingBundleIndex != null && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBundleIndex(null);
                            setUnitIds([]);
                          }}
                          className="px-3 py-2 rounded border text-sm"
                        >
                          Cancel edit
                        </button>
                      )}
                      <div className="text-xs text-gray-500">Save each bundle/unit set. Bundle sets cannot share units.</div>
                    </div>
                  {bundleSetsError && <div className="text-xs text-red-600 mt-2">{bundleSetsError}</div>}
                  {bundleUnitSets.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {bundleUnitSets.map((set, index) => (
                        <div key={set.join(",")} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBundleIndex(index);
                              setUnitIds(set);
                            }}
                            className={`min-w-0 flex-1 text-left ${editingBundleIndex === index ? "font-medium" : ""}`}
                          >
                            <span className="font-medium">{`Bundle ${index + 1}:`}</span>{" "}
                            <span className="break-words">{(previewBundleSets[index] ?? set).map((id) => unitNameById[id] || `Unit ${id}`).join(" + ")}</span>
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBundleIndex(index);
                                setUnitIds(set);
                              }}
                              className="text-gray-500 hover:text-black"
                              aria-label={`Edit bundle ${index + 1}`}
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                                <path d="M4 20h4l10-10-4-4L4 16v4zm11-13 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBundleUnitSets((prev) => prev.filter((_, i) => i !== index));
                                if (editingBundleIndex === index) {
                                  setEditingBundleIndex(null);
                                  setUnitIds([]);
                                } else if (editingBundleIndex != null && editingBundleIndex > index) {
                                  setEditingBundleIndex(editingBundleIndex - 1);
                                }
                              }}
                              className="text-gray-500 hover:text-black"
                              aria-label={`Remove bundle ${index + 1}`}
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <CellStaffingEditor
                participants={participants}
                headcount={headcount}
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
              {step === 2 && (
                <button
                  type="button"
                  className="px-3 py-2 rounded border text-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep(1);
                  }}
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="px-3 py-2 rounded border text-sm" onClick={requestClose}>
                Cancel
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={!stepOneReady || loading || Boolean(bundleSetsError)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep(2);
                  }}
                >
                  Next
                </button>
              ) : (
                <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || !canSubmit || loading}>
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
