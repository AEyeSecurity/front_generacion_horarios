"use client";

import * as React from "react";
import { useI18n } from "@/lib/use-i18n";

export type Tier = "PRIMARY" | "SECONDARY" | "TERTIARY";
export type TierCounts = Record<Tier, number>;
export type TierPools = Record<Tier, string[]>;
export type StaffOption = {
  staff?: string;
  members: string[];
  name?: string;
  display_name?: string;
};
export type Participant = {
  id: number | string;
  name: string;
  display_name?: string;
  surname?: string;
  tier?: Tier | null;
  hours_week_mode?: "default" | "custom" | "not_available" | null;
  min_hours_week_override?: number | null;
  max_hours_week_override?: number | null;
};

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
  if (p.display_name?.trim()) return p.display_name.trim();
  return `${p.name}${p.surname ? ` ${p.surname}` : ""}`;
}

export function normalizeStaffGroups(
  groups?: Array<{
    id?: string | number;
    staff?: string | number;
    members?: Array<string | number | { id?: string | number }>;
    participant_ids?: Array<string | number | { id?: string | number }>;
    participants?: Array<string | number | { id?: string | number }>;
    name?: string;
    display_name?: string;
  } | null> | null,
): StaffOption[] {
  if (!groups) return [];
  const normalized = groups
    .map((group) => {
      const staffId = group?.staff ?? group?.id;
      const members = group?.members ?? group?.participant_ids ?? group?.participants ?? [];
      return {
        ...(staffId != null ? { staff: String(staffId) } : {}),
        ...(group?.name ? { name: group.name } : {}),
        ...(group?.display_name ? { display_name: group.display_name } : {}),
        members: Array.from(new Set(members.map((member) => {
          if (typeof member === "string" || typeof member === "number") return String(member);
          return member?.id != null ? String(member.id) : "";
        }).filter(Boolean))).sort(),
      };
    })
    .filter((group) => group.members.length > 0 || Boolean(group.staff));
  return dedupeStaffGroups(normalized);
}

function staffGroupIdentity(group: StaffOption): string {
  return group.staff ? `staff:${group.staff}` : `members:${[...group.members].sort().join(",")}`;
}

function staffGroupMembersKey(members: string[]) {
  return Array.from(new Set(members.map(String))).sort().join(",");
}

function dedupeStaffGroups(groups: StaffOption[]): StaffOption[] {
  const seen = new Set<string>();
  const out: StaffOption[] = [];
  for (const group of groups) {
    const key = staffGroupIdentity(group);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(group);
  }
  return out;
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
      .map((group) => ({ staff: group.staff ?? null, members: [...group.members].sort() }))
      .sort((a, b) => `${a.staff}:${a.members.join(",")}`.localeCompare(`${b.staff}:${b.members.join(",")}`))
  );
}

export function resolveStaffGroupMembers(
  staffGroups: StaffOption[],
  availableStaffGroups: StaffOption[] = [],
): StaffOption[] {
  const availableByStaffId = new Map(
    availableStaffGroups
      .filter((group) => group.staff)
      .map((group) => [String(group.staff), group]),
  );

  return staffGroups.map((group) => {
    if (group.members.length > 0) return group;
    const available = group.staff ? availableByStaffId.get(String(group.staff)) : undefined;
    if (!available || available.members.length === 0) return group;
    return {
      ...available,
      ...group,
      members: [...available.members],
    };
  });
}

export function getCoveredParticipantIds(
  staffGroups: StaffOption[],
  availableStaffGroups: StaffOption[] = [],
) {
  const covered = new Set<string>();
  for (const group of resolveStaffGroupMembers(staffGroups, availableStaffGroups)) {
    for (const id of group.members) covered.add(String(id));
  }
  return covered;
}

export function getSelectedStaffGroupIds(staffGroups: StaffOption[]) {
  return Array.from(new Set(staffGroups.map((group) => group.staff).filter((id): id is string => Boolean(id)))).sort();
}

export function buildStaffOptionsPayload(
  staffGroups: StaffOption[],
  availableStaffGroups: StaffOption[] = [],
) {
  return resolveStaffGroupMembers(staffGroups, availableStaffGroups).map((group) => {
    const payload: { staff?: number | string; members?: Array<number | string> } = {};
    if (group.staff) payload.staff = /^\d+$/.test(group.staff) ? Number(group.staff) : group.staff;
    if (!group.staff) {
      payload.members = group.members.map((id) => (/^\d+$/.test(id) ? Number(id) : id));
    }
    return payload;
  });
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
  tierEnabled?: boolean;
  tierCounts: TierCounts;
  onTierCountsChange: (value: TierCounts) => void;
  tierPools: TierPools;
  onTierPoolsChange: (value: TierPools) => void;
  staffGroups: StaffOption[];
  onStaffGroupsChange: (value: StaffOption[]) => void;
  availableStaffGroups?: StaffOption[];
};

function countMembersByTier(ids: string[], participantMap: Record<string, Participant>): TierCounts {
  const counts: TierCounts = { ...EMPTY_TIER_COUNTS };
  for (const id of ids) {
    const tier = participantMap[id]?.tier;
    if (tier) counts[tier] += 1;
  }
  return counts;
}

function staffGroupMatchesRequirements(
  group: StaffOption,
  participantMap: Record<string, Participant>,
  usingTiers: boolean,
  tierCounts: TierCounts,
  headcount: number,
) {
  const uniqueMembers = Array.from(new Set(group.members.map(String)));
  if (headcount <= 1 || uniqueMembers.length !== headcount) return false;
  for (const id of uniqueMembers) {
    if (!participantMap[id]) return false;
  }
  if (!usingTiers) return true;
  const counts = countMembersByTier(uniqueMembers, participantMap);
  return TIERS.every((tier) => counts[tier] === tierCounts[tier]);
}

function TierCountControls({
  tierCounts,
  onTierCountsChange,
}: {
  tierCounts: TierCounts;
  onTierCountsChange: (value: TierCounts) => void;
}) {
  const { t } = useI18n();
  const currentTotal = TIERS.reduce((sum, tier) => sum + tierCounts[tier], 0);

  const updateTierCount = (tier: Tier, next: number) => {
    const safe = Math.max(0, next);
    onTierCountsChange({ ...tierCounts, [tier]: safe });
  };

  return (
    <div className="rounded border bg-gray-50 p-3">
      <div className="text-sm font-medium mb-2">{t("cell_staffing.tier_counts")}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TIERS.map((tier) => (
          <div key={tier} className="rounded border bg-white p-3">
            <div className="text-sm font-medium mb-2">
              {tier === "PRIMARY" ? t("tier.primary") : tier === "SECONDARY" ? t("tier.secondary") : t("tier.tertiary")}
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
        {t("cell_staffing.inferred_headcount", { count: currentTotal })}
      </div>
    </div>
  );
}

function HeadcountControls({
  headcount,
  maxHeadcount,
  onHeadcountChange,
}: {
  headcount: number;
  maxHeadcount: number;
  onHeadcountChange: (value: number) => void;
}) {
  const { t } = useI18n();
  const safeHeadcount = Math.max(0, Math.floor(headcount || 0));
  return (
    <div className="rounded border bg-gray-50 p-3">
      <div className="text-sm font-medium mb-2">{t("cell_staffing.headcount")}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-8 h-8 rounded border"
          onClick={() => onHeadcountChange(Math.max(0, safeHeadcount - 1))}
        >
          -
        </button>
        <div className="min-w-[2rem] text-center text-sm">{safeHeadcount}</div>
        <button
          type="button"
          className="w-8 h-8 rounded border"
          onClick={() => onHeadcountChange(Math.min(Math.max(1, maxHeadcount), safeHeadcount + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CellStaffingEditor({
  participants,
  tierEnabled = true,
  tierCounts,
  onTierCountsChange,
  tierPools,
  onTierPoolsChange,
  staffGroups,
  onStaffGroupsChange,
  availableStaffGroups = [],
}: StaffingEditorProps) {
  const { t } = useI18n();
  const usingTiers = tierEnabled !== false;
  const labelOrFallback = React.useCallback(
    (key: Parameters<typeof t>[0], fallback: string) => {
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t],
  );
  const labelOrFallbackWithParams = React.useCallback(
    (key: Parameters<typeof t>[0], params: Record<string, string | number>, fallback: string) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t],
  );
  const participantMap = React.useMemo(
    () => Object.fromEntries(participants.map((p) => [String(p.id), p])) as Record<string, Participant>,
    [participants]
  );
  const [participantSearch, setParticipantSearch] = React.useState("");
  const normalizedParticipantSearch = participantSearch.trim().toLowerCase();
  const filteredParticipants = React.useMemo(
    () =>
      normalizedParticipantSearch
        ? participants.filter((participant) =>
            participantLabel(participant).toLowerCase().includes(normalizedParticipantSearch),
          )
        : participants,
    [normalizedParticipantSearch, participants],
  );
  const filteredParticipantsByTier = React.useMemo(
    () => buildParticipantsByTier(filteredParticipants),
    [filteredParticipants],
  );
  const resolvedStaffGroups = React.useMemo(
    () => dedupeStaffGroups(resolveStaffGroupMembers(staffGroups, availableStaffGroups)),
    [availableStaffGroups, staffGroups],
  );
  const resolvedAvailableStaffGroups = React.useMemo(
    () => dedupeStaffGroups(resolveStaffGroupMembers(availableStaffGroups, availableStaffGroups)),
    [availableStaffGroups],
  );

  const staffCoveredIds = React.useMemo(() => {
    return getCoveredParticipantIds(staffGroups, availableStaffGroups);
  }, [availableStaffGroups, staffGroups]);

  React.useEffect(() => {
    if (staffCoveredIds.size === 0) return;
    const nextPools: TierPools = {
      PRIMARY: tierPools.PRIMARY.filter((id) => !staffCoveredIds.has(String(id))),
      SECONDARY: tierPools.SECONDARY.filter((id) => !staffCoveredIds.has(String(id))),
      TERTIARY: tierPools.TERTIARY.filter((id) => !staffCoveredIds.has(String(id))),
    };
    const changed = TIERS.some((tier) => nextPools[tier].length !== tierPools[tier].length);
    if (changed) onTierPoolsChange(nextPools);
  }, [staffCoveredIds, onTierPoolsChange, tierPools]);

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

  const headcount = React.useMemo(() => {
    if (!usingTiers) return Math.max(0, Number(tierCounts.PRIMARY) || 0);
    return TIERS.reduce((sum, tier) => sum + tierCounts[tier], 0);
  }, [tierCounts, usingTiers]);
  const canBuildGroups = headcount > 1;
  const draftCounts = React.useMemo(() => countMembersByTier(groupDraft, participantMap), [groupDraft, participantMap]);
  const memberGroupIndex = React.useMemo(() => {
    const out = new Map<string, number>();
    resolvedStaffGroups.forEach((group, index) => {
      group.members.forEach((id) => out.set(String(id), index));
    });
    return out;
  }, [resolvedStaffGroups]);
  const selectedStaffGroupKeys = React.useMemo(
    () => new Set(resolvedStaffGroups.map(staffGroupIdentity)),
    [resolvedStaffGroups],
  );
  const selectedStaffGroupMemberKeys = React.useMemo(
    () => new Set(resolvedStaffGroups.map((group) => staffGroupMembersKey(group.members))),
    [resolvedStaffGroups],
  );
  const eligibleAvailableStaffGroups = React.useMemo(
    () =>
      resolvedAvailableStaffGroups.filter(
        (group) =>
          !selectedStaffGroupKeys.has(staffGroupIdentity(group)) &&
          staffGroupMatchesRequirements(group, participantMap, usingTiers, tierCounts, headcount),
      ),
    [headcount, participantMap, resolvedAvailableStaffGroups, selectedStaffGroupKeys, tierCounts, usingTiers],
  );

  const canStartGroupWithParticipant = React.useCallback(
    (participant: Participant) => {
      if (!canBuildGroups) return false;
      if (usingTiers) {
        if (!participant.tier) return false;
        if (tierCounts[participant.tier] <= 0) return false;
      }
      return true;
    },
    [canBuildGroups, tierCounts, usingTiers]
  );

  React.useEffect(() => {
    setGroupDraft((current) => current.filter((id) => Boolean(participantMap[id])));
  }, [participantMap]);

  React.useEffect(() => {
    if (!canBuildGroups) {
      setGroupMode(false);
      setGroupDraft([]);
    }
  }, [canBuildGroups]);

  React.useEffect(() => {
    const deduped = dedupeStaffGroups(staffGroups);
    if (deduped.length !== staffGroups.length) {
      onStaffGroupsChange(deduped);
    }
  }, [onStaffGroupsChange, staffGroups]);

  React.useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  const togglePool = (tier: Tier, id: string) => {
    if (staffCoveredIds.has(id)) return;
    const targetTier: Tier = usingTiers ? tier : "PRIMARY";
    const set = new Set(tierPools[targetTier]);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onTierPoolsChange({
      ...tierPools,
      [targetTier]: Array.from(set).sort(),
      ...(usingTiers ? {} : { SECONDARY: [], TERTIARY: [] }),
    });
  };

  const canToggleDraftMember = React.useCallback(
    (participant: Participant) => {
      const id = String(participant.id);
      if (groupDraft.includes(id)) return true;
      if (!canBuildGroups || !groupMode) return false;
      if (usingTiers && !participant.tier) return false;
      if (groupDraft.length >= headcount) return false;
      if (usingTiers && participant.tier && draftCounts[participant.tier] >= tierCounts[participant.tier]) return false;
      return true;
    },
    [groupDraft, canBuildGroups, groupMode, headcount, draftCounts, tierCounts, usingTiers]
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
    if (usingTiers) {
      const counts: TierCounts = { ...EMPTY_TIER_COUNTS };
      for (const id of normalized) {
        const participant = participantMap[id];
        const tier = participant?.tier;
        if (!tier) return;
        counts[tier] += 1;
      }
      if (TIERS.some((tier) => counts[tier] !== tierCounts[tier])) return;
    }
    const normalizedKey = staffGroupMembersKey(normalized);
    const existingGroup = resolvedAvailableStaffGroups.find(
      (group) => staffGroupMembersKey(group.members) === normalizedKey,
    );
    const nextStaffGroups = existingGroup
      ? selectedStaffGroupMemberKeys.has(normalizedKey)
        ? staffGroups
        : [...staffGroups, existingGroup]
      : [...staffGroups, { members: normalized }];
    onStaffGroupsChange(dedupeStaffGroups(nextStaffGroups));
    if (usingTiers) {
      onTierPoolsChange({
        PRIMARY: tierPools.PRIMARY.filter((id) => !normalized.includes(id)),
        SECONDARY: tierPools.SECONDARY.filter((id) => !normalized.includes(id)),
        TERTIARY: tierPools.TERTIARY.filter((id) => !normalized.includes(id)),
      });
    } else {
      onTierPoolsChange({
        PRIMARY: tierPools.PRIMARY.filter((id) => !normalized.includes(id)),
        SECONDARY: [],
        TERTIARY: [],
      });
    }
    setGroupDraft([]);
    setGroupMode(false);
  };

  const removeGroup = (index: number) => {
    onStaffGroupsChange(staffGroups.filter((_, idx) => idx !== index));
  };

  const toggleAvailableStaffGroup = (group: StaffOption) => {
    if (!group.staff) return;
    const selectedIndex = staffGroups.findIndex((selected) => selected.staff === group.staff);
    if (selectedIndex >= 0) {
      onStaffGroupsChange(staffGroups.filter((_, index) => index !== selectedIndex));
      return;
    }
    onStaffGroupsChange(dedupeStaffGroups([...staffGroups, group]));
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
    const id = String(participant.id);
    if (usingTiers) {
      if (!participant.tier) return;
      const inPool = tierPools[participant.tier].includes(id);
      if (tierCounts[participant.tier] === 0 && !inPool) return;
      togglePool(participant.tier, id);
      return;
    }
    togglePool("PRIMARY", id);
  };

  const chipClassName = (participant: Participant) => {
    const id = String(participant.id);
    const inDraft = groupDraft.includes(id);
    const coveredByStaffGroup = memberGroupIndex.has(id);
    const inPool = usingTiers
      ? participant.tier
        ? tierPools[participant.tier].includes(id)
        : false
      : tierPools.PRIMARY.includes(id);
    if (inDraft) {
      return "border-black bg-black text-white shadow-sm";
    }
    if (coveredByStaffGroup && !groupMode) {
      return "border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed";
    }
    if (usingTiers && participant.tier && tierCounts[participant.tier] === 0 && !inPool) {
      return "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed";
    }
    if (inPool) {
      return "border-gray-900 bg-gray-900 text-white";
    }
    return "border-gray-300 bg-white text-gray-800 hover:bg-gray-50";
  };

  return (
    <div className="space-y-5">
      {usingTiers ? (
        <TierCountControls tierCounts={tierCounts} onTierCountsChange={onTierCountsChange} />
      ) : (
        <HeadcountControls
          headcount={headcount}
          maxHeadcount={Math.max(1, participants.length)}
          onHeadcountChange={(next) =>
            onTierCountsChange({
              PRIMARY: Math.max(0, Math.min(Math.max(1, participants.length), Math.round(next || 0))),
              SECONDARY: 0,
              TERTIARY: 0,
            })
          }
        />
      )}

      <div className="rounded border p-3 space-y-4">
        <div className="flex items-start justify-between gap-4">
            <div className="text-sm font-medium">{t("cell_staffing.participants_board")}</div>
        </div>
        <input
          type="search"
          value={participantSearch}
          onChange={(event) => setParticipantSearch(event.target.value)}
          placeholder={t("common.search")}
          className="w-full rounded border px-3 py-2 text-sm"
        />
        {headcount > 1 && !groupMode && (
          <div className="text-xs text-gray-500">
            {t("cell_staffing.long_press_chip")}
          </div>
        )}

        {usingTiers ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TIERS.map((tier) => (
              <div key={tier} className="rounded border bg-white p-3">
                <div className="text-sm font-medium mb-3">
                  {tier === "PRIMARY" ? t("tier.primary") : tier === "SECONDARY" ? t("tier.secondary") : t("tier.tertiary")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {filteredParticipantsByTier[tier].map((participant) => {
                    const id = String(participant.id);
                    const coveredByStaffGroup = memberGroupIndex.has(id);
                    const inDraft = groupDraft.includes(id);
                    const draftDisabled = groupMode && !canToggleDraftMember(participant);
                    const inPool = tierPools[tier].includes(id);
                    const poolDisabled = !groupMode && (coveredByStaffGroup || (tierCounts[tier] === 0 && !inPool));
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
                          coveredByStaffGroup
                            ? `Already in staff group ${Number(memberGroupIndex.get(id)) + 1}`
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
                        {coveredByStaffGroup && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide">
                            G{Number(memberGroupIndex.get(id)) + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredParticipantsByTier[tier].length === 0 && (
                    <div className="text-xs text-gray-500">{t("cell_staffing.no_participants_tier")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border bg-white p-3">
            <div className="text-sm font-medium mb-3">Eligible participants</div>
            <div className="flex flex-wrap gap-2">
              {filteredParticipants.map((participant) => {
                const id = String(participant.id);
                const coveredByStaffGroup = memberGroupIndex.has(id);
                const inDraft = groupDraft.includes(id);
                const draftDisabled = groupMode && !canToggleDraftMember(participant);
                const poolDisabled = !groupMode && coveredByStaffGroup;
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
                    title={coveredByStaffGroup ? `Already in staff group ${Number(memberGroupIndex.get(id)) + 1}` : undefined}
                  >
                    <span>{participantLabel(participant)}</span>
                    {coveredByStaffGroup && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide">
                        G{Number(memberGroupIndex.get(id)) + 1}
                      </span>
                    )}
                  </button>
                );
              })}
              {filteredParticipants.length === 0 && (
                <div className="text-xs text-gray-500">{t("cell_staffing.no_participants_tier")}</div>
              )}
            </div>
          </div>
        )}

        {headcount > 1 && (eligibleAvailableStaffGroups.length > 0 || groupMode || staffGroups.length > 0) && (
          <div className="space-y-4">
            <div className="text-sm font-medium">{t("cell_staffing.staff_groups")}</div>

            {eligibleAvailableStaffGroups.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {labelOrFallback("cell_staffing.available_staff_groups", "Available")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {eligibleAvailableStaffGroups.map((group, index) => {
                    const label = group.display_name || group.name || group.members
                      .map((id) => participantLabel(participantMap[id] || { id, name: "" }))
                      .filter(Boolean)
                      .join(" + ");
                    return (
                      <button
                        key={group.staff || `${label}-${index}`}
                        type="button"
                        onClick={() => toggleAvailableStaffGroup(group)}
                        className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(groupMode || staffGroups.length > 0) && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {labelOrFallback("cell_staffing.selected_staff_groups", "Selected")}
                </div>

                {groupMode && (
                  <div className="rounded border bg-gray-50 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {labelOrFallbackWithParams(
                          "cell_staffing.draft_staff_group",
                          { count: groupDraft.length, total: headcount },
                          `Draft staff group: ${groupDraft.length} / ${headcount}`,
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded border text-sm"
                          onClick={cancelGroupMode}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-50"
                          disabled={groupDraft.length !== headcount}
                          onClick={addGroup}
                        >
                          {labelOrFallback("cell_staffing.save_group", "Save group")}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {groupDraft.length === 0 ? (
                        <span className="text-xs text-gray-500">{t("cell_staffing.long_press_chip")}</span>
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

                {staffGroups.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {resolvedStaffGroups.map((group, index) => (
                      <div
                        key={`${group.members.join("-")}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm"
                      >
                        <span className="text-xs font-medium text-gray-500">G{index + 1}</span>
                        <span>
                          {group.display_name || group.name || group.members
                            .map((id) => participantLabel(participantMap[id] || { id, name: id }))
                            .join(" + ")}
                        </span>
                        <button type="button" className="text-gray-500" onClick={() => removeGroup(index)}>
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
