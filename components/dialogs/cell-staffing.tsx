"use client";

import * as React from "react";

export type Tier = "PRIMARY" | "SECONDARY" | "TERTIARY";
export type TierCounts = Record<Tier, number>;
export type TierPools = Record<Tier, string[]>;
export type StaffOption = { members: string[] };
export type Participant = { id: number | string; name: string; surname?: string; tier?: Tier | null };

export const TIERS: Tier[] = ["PRIMARY", "SECONDARY", "TERTIARY"];

export const EMPTY_TIER_COUNTS: TierCounts = {
  PRIMARY: 0,
  SECONDARY: 0,
  TERTIARY: 0,
};

export const EMPTY_TIER_POOLS: TierPools = {
  PRIMARY: [],
  SECONDARY: [],
  TERTIARY: [],
};

export function participantLabel(p: Participant) {
  return `${p.name}${p.surname ? ` ${p.surname}` : ""}`;
}

export function normalizeStaffGroups(groups?: Array<{ members?: Array<string | number> } | null> | null): StaffOption[] {
  if (!groups) return [];
  return groups
    .map((group) => ({
      members: Array.from(new Set((group?.members ?? []).map((id) => String(id)))).sort(),
    }))
    .filter((group) => group.members.length > 0);
}

export function normalizeTierPools(pools?: Partial<Record<Tier, Array<string | number>>> | null): TierPools {
  return {
    PRIMARY: Array.from(new Set((pools?.PRIMARY ?? []).map((id) => String(id)))).sort(),
    SECONDARY: Array.from(new Set((pools?.SECONDARY ?? []).map((id) => String(id)))).sort(),
    TERTIARY: Array.from(new Set((pools?.TERTIARY ?? []).map((id) => String(id)))).sort(),
  };
}

export function serializeStaffGroups(groups: StaffOption[]) {
  return JSON.stringify(
    groups
      .map((group) => ({ members: [...group.members].sort() }))
      .sort((a, b) => a.members.join(",").localeCompare(b.members.join(",")))
  );
}

export function buildParticipantsByTier(participants: Participant[]) {
  return {
    PRIMARY: participants.filter((p) => p.tier === "PRIMARY"),
    SECONDARY: participants.filter((p) => p.tier === "SECONDARY"),
    TERTIARY: participants.filter((p) => p.tier === "TERTIARY"),
  } satisfies Record<Tier, Participant[]>;
}

type StaffingEditorProps = {
  participants: Participant[];
  tierCounts: TierCounts;
  onTierCountsChange: (value: TierCounts) => void;
  tierPools: TierPools;
  onTierPoolsChange: (value: TierPools) => void;
  staffGroups: StaffOption[];
  onStaffGroupsChange: (value: StaffOption[]) => void;
};

function countMembersByTier(ids: string[], participantMap: Record<string, Participant>): TierCounts {
  const counts: TierCounts = { ...EMPTY_TIER_COUNTS };
  for (const id of ids) {
    const tier = participantMap[id]?.tier;
    if (tier) counts[tier] += 1;
  }
  return counts;
}

function TierCountControls({
  tierCounts,
  onTierCountsChange,
}: {
  tierCounts: TierCounts;
  onTierCountsChange: (value: TierCounts) => void;
}) {
  const currentTotal = TIERS.reduce((sum, tier) => sum + tierCounts[tier], 0);

  const updateTierCount = (tier: Tier, next: number) => {
    const safe = Math.max(0, next);
    onTierCountsChange({ ...tierCounts, [tier]: safe });
  };

  return (
    <div className="rounded border bg-gray-50 p-3">
      <div className="text-sm font-medium mb-2">Tier counts</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TIERS.map((tier) => (
          <div key={tier} className="rounded border bg-white p-3">
            <div className="text-sm font-medium mb-2">
              {tier === "PRIMARY" ? "Primary" : tier === "SECONDARY" ? "Secondary" : "Tertiary"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-8 h-8 rounded border"
                onClick={() => updateTierCount(tier, tierCounts[tier] - 1)}
              >
                -
              </button>
              <div className="min-w-[2rem] text-center text-sm">{tierCounts[tier]}</div>
              <button
                type="button"
                className="w-8 h-8 rounded border"
                onClick={() => updateTierCount(tier, tierCounts[tier] + 1)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500 mt-2">
        Inferred headcount: {currentTotal}
      </div>
    </div>
  );
}

export function CellStaffingEditor({
  participants,
  tierCounts,
  onTierCountsChange,
  tierPools,
  onTierPoolsChange,
  staffGroups,
  onStaffGroupsChange,
}: StaffingEditorProps) {
  const participantsByTier = React.useMemo(() => buildParticipantsByTier(participants), [participants]);
  const participantMap = React.useMemo(
    () => Object.fromEntries(participants.map((p) => [String(p.id), p])) as Record<string, Participant>,
    [participants]
  );

  const lockedIds = React.useMemo(() => {
    const out = new Set<string>();
    for (const group of staffGroups) {
      for (const id of group.members) out.add(String(id));
    }
    return out;
  }, [staffGroups]);

  const [groupMode, setGroupMode] = React.useState(false);
  const [groupDraft, setGroupDraft] = React.useState<string[]>([]);
  const longPressTimerRef = React.useRef<number | null>(null);
  const didLongPressRef = React.useRef(false);
  const longPressIdRef = React.useRef<string | null>(null);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const headcount = React.useMemo(() => TIERS.reduce((sum, tier) => sum + tierCounts[tier], 0), [tierCounts]);
  const canBuildGroups = headcount > 1;
  const draftCounts = React.useMemo(() => countMembersByTier(groupDraft, participantMap), [groupDraft, participantMap]);
  const memberGroupIndex = React.useMemo(() => {
    const out = new Map<string, number>();
    staffGroups.forEach((group, index) => {
      group.members.forEach((id) => out.set(String(id), index));
    });
    return out;
  }, [staffGroups]);

  const canStartGroupWithParticipant = React.useCallback(
    (participant: Participant) => {
      const id = String(participant.id);
      if (!canBuildGroups) return false;
      if (lockedIds.has(id)) return false;
      if (!participant.tier) return false;
      if (tierCounts[participant.tier] <= 0) return false;
      return true;
    },
    [canBuildGroups, lockedIds, tierCounts]
  );

  React.useEffect(() => {
    setGroupDraft((current) => current.filter((id) => !lockedIds.has(id) && Boolean(participantMap[id])));
  }, [lockedIds, participantMap]);

  React.useEffect(() => {
    if (!canBuildGroups) {
      setGroupMode(false);
      setGroupDraft([]);
    }
  }, [canBuildGroups]);

  React.useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  const togglePool = (tier: Tier, id: string) => {
    if (lockedIds.has(id)) return;
    const set = new Set(tierPools[tier]);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onTierPoolsChange({ ...tierPools, [tier]: Array.from(set).sort() });
  };

  const canToggleDraftMember = React.useCallback(
    (participant: Participant) => {
      const id = String(participant.id);
      if (lockedIds.has(id)) return false;
      if (groupDraft.includes(id)) return true;
      if (!canBuildGroups || !groupMode || !participant.tier) return false;
      if (groupDraft.length >= headcount) return false;
      if (draftCounts[participant.tier] >= tierCounts[participant.tier]) return false;
      return true;
    },
    [lockedIds, groupDraft, canBuildGroups, groupMode, headcount, draftCounts, tierCounts]
  );

  const toggleDraftMember = (participant: Participant) => {
    const id = String(participant.id);
    if (!canToggleDraftMember(participant)) return;
    setGroupDraft((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const addGroup = () => {
    const normalized = Array.from(new Set(groupDraft)).sort();
    if (normalized.length !== headcount) return;
    const counts: TierCounts = { ...EMPTY_TIER_COUNTS };
    for (const id of normalized) {
      const participant = participantMap[id];
      const tier = participant?.tier;
      if (!tier) return;
      counts[tier] += 1;
    }
    if (TIERS.some((tier) => counts[tier] !== tierCounts[tier])) return;
    onStaffGroupsChange([...staffGroups, { members: normalized }]);
    onTierPoolsChange({
      PRIMARY: tierPools.PRIMARY.filter((id) => !normalized.includes(id)),
      SECONDARY: tierPools.SECONDARY.filter((id) => !normalized.includes(id)),
      TERTIARY: tierPools.TERTIARY.filter((id) => !normalized.includes(id)),
    });
    setGroupDraft([]);
    setGroupMode(false);
  };

  const removeGroup = (index: number) => {
    onStaffGroupsChange(staffGroups.filter((_, idx) => idx !== index));
  };

  const cancelGroupMode = () => {
    setGroupMode(false);
    setGroupDraft([]);
  };

  const startLongPress = (participant: Participant) => {
    const id = String(participant.id);
    if (!canStartGroupWithParticipant(participant)) return;
    clearLongPress();
    didLongPressRef.current = false;
    longPressIdRef.current = id;
    longPressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      setGroupMode(true);
      setGroupDraft([id]);
    }, 450);
  };

  const handleChipClick = (participant: Participant) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      longPressIdRef.current = null;
      return;
    }
    longPressIdRef.current = null;
    if (groupMode) {
      toggleDraftMember(participant);
      return;
    }
    if (!participant.tier) return;
    const id = String(participant.id);
    const inPool = tierPools[participant.tier].includes(id);
    if (tierCounts[participant.tier] === 0 && !inPool) return;
    togglePool(participant.tier, id);
  };

  const chipClassName = (participant: Participant) => {
    const id = String(participant.id);
    const inDraft = groupDraft.includes(id);
    const locked = memberGroupIndex.has(id);
    const inPool = participant.tier ? tierPools[participant.tier].includes(id) : false;
    if (inDraft) {
      return "border-black bg-black text-white shadow-sm";
    }
    if (locked) {
      return "border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed";
    }
    if (participant.tier && tierCounts[participant.tier] === 0 && !inPool) {
      return "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed";
    }
    if (inPool) {
      return "border-gray-900 bg-gray-900 text-white";
    }
    return "border-gray-300 bg-white text-gray-800 hover:bg-gray-50";
  };

  return (
    <div className="space-y-5">
      <TierCountControls tierCounts={tierCounts} onTierCountsChange={onTierCountsChange} />

      <div className="rounded border p-3 space-y-4">
        <div className="flex items-start justify-between gap-4">
            <div className="text-sm font-medium">Participants board</div>
        </div>
        {headcount > 1 && !groupMode && (
          <div className="text-xs text-gray-500">
            Long-press a participant chip to start building a staff group.
          </div>
        )}
        {groupMode && headcount > 1 && (
          <div className="rounded border bg-gray-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">
                Draft staff group: {groupDraft.length} / {headcount}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded border text-sm"
                  onClick={cancelGroupMode}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={groupDraft.length !== headcount}
                  onClick={addGroup}
                >
                  Save group
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupDraft.length === 0 ? (
                <span className="text-xs text-gray-500">Long-press any eligible chip to start.</span>
              ) : (
                groupDraft.map((id) => (
                  <span key={id} className="rounded-full border bg-white px-3 py-1 text-sm">
                    {participantLabel(participantMap[id] || { id, name: id })}
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIERS.map((tier) => (
            <div key={tier} className="rounded border bg-white p-3">
              <div className="text-sm font-medium mb-3">
                {tier === "PRIMARY" ? "Primary" : tier === "SECONDARY" ? "Secondary" : "Tertiary"}
              </div>
              <div className="flex flex-wrap gap-2">
                {participantsByTier[tier].map((participant) => {
                  const id = String(participant.id);
                  const locked = memberGroupIndex.has(id);
                  const inDraft = groupDraft.includes(id);
                  const draftDisabled = groupMode && !canToggleDraftMember(participant);
                  const inPool = tierPools[tier].includes(id);
                  const poolDisabled = !groupMode && (locked || (tierCounts[tier] === 0 && !inPool));
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${chipClassName(participant)} ${
                        draftDisabled || poolDisabled ? "opacity-50" : ""
                      }`}
                      onPointerDown={() => {
                        if (!groupMode) startLongPress(participant);
                      }}
                      onPointerUp={clearLongPress}
                      onPointerLeave={clearLongPress}
                      onPointerCancel={clearLongPress}
                      onClick={() => handleChipClick(participant)}
                      disabled={groupMode ? !canToggleDraftMember(participant) && !inDraft : poolDisabled}
                      title={
                        locked
                          ? `Locked in group ${Number(memberGroupIndex.get(id)) + 1}`
                          : inDraft
                          ? "In current draft group"
                          : tierCounts[tier] === 0 && !inPool
                          ? "Tier count is 0"
                          : inPool
                          ? "In eligible pool"
                          : undefined
                      }
                    >
                      <span>{participantLabel(participant)}</span>
                      {locked && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide">
                          G{Number(memberGroupIndex.get(id)) + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
                {participantsByTier[tier].length === 0 && (
                  <div className="text-xs text-gray-500">No participants in this tier.</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {headcount > 1 && staffGroups.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Staff groups</div>
            <div className="flex flex-wrap gap-2">
              {staffGroups.map((group, index) => (
                <div
                  key={`${group.members.join("-")}-${index}`}
                  className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm"
                >
                  <span className="text-xs font-medium text-gray-500">G{index + 1}</span>
                  <span>
                    {group.members
                      .map((id) => participantLabel(participantMap[id] || { id, name: id }))
                      .join(" + ")}
                  </span>
                  <button type="button" className="text-gray-500" onClick={() => removeGroup(index)}>
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
