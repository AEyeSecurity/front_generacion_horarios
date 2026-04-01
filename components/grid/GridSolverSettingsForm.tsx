"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildSolverParamsPayload,
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
  TIER_KEYS,
  type GridSolverSettings,
  type TierKey,
} from "@/lib/grid-solver-settings";

type TierValues = Record<TierKey, string>;

type ToggleNumber = { enabled: boolean; value: string };
type ToggleBoolean = { enabled: boolean; value: boolean };
type ToggleTierValues = { enabled: boolean; values: TierValues };

type FormState = {
  unit_nooverlap_enabled: boolean;
  max_hours_day_by_tier: ToggleTierValues;
  max_hours_week_by_tier: ToggleTierValues;
  min_hours_week_by_tier: ToggleTierValues;
  min_hours_week_hard: ToggleBoolean;
  min_hours_week_weight: ToggleNumber;
  allow_overstaffing: ToggleBoolean;
  unit_max_hours_day: ToggleNumber;
  min_rest_hours: ToggleNumber;
  stability_weight: ToggleNumber;
};

function emptyTierValues(): TierValues {
  return { PRIMARY: "", SECONDARY: "", TERTIARY: "" };
}

function toTierValues(map: Record<TierKey, number> | undefined): ToggleTierValues {
  if (!map) return { enabled: false, values: emptyTierValues() };
  return {
    enabled: true,
    values: {
      PRIMARY: String(map.PRIMARY),
      SECONDARY: String(map.SECONDARY),
      TERTIARY: String(map.TERTIARY),
    },
  };
}

function toToggleNumber(value: number | undefined): ToggleNumber {
  if (typeof value !== "number" || !Number.isFinite(value)) return { enabled: false, value: "" };
  return { enabled: true, value: String(value) };
}

function toToggleBoolean(value: boolean | undefined): ToggleBoolean {
  if (typeof value !== "boolean") return { enabled: false, value: false };
  return { enabled: true, value };
}

function fromParsedSettings(settings: GridSolverSettings): FormState {
  return {
    unit_nooverlap_enabled: settings.unit_nooverlap_enabled ?? DEFAULT_UNIT_NOOVERLAP_ENABLED,
    max_hours_day_by_tier: toTierValues(settings.max_hours_day_by_tier),
    max_hours_week_by_tier: toTierValues(settings.max_hours_week_by_tier),
    min_hours_week_by_tier: toTierValues(settings.min_hours_week_by_tier),
    min_hours_week_hard: toToggleBoolean(settings.min_hours_week_hard),
    min_hours_week_weight: toToggleNumber(settings.min_hours_week_weight),
    allow_overstaffing: toToggleBoolean(settings.allow_overstaffing),
    unit_max_hours_day: toToggleNumber(settings.unit_max_hours_day),
    min_rest_hours: toToggleNumber(settings.min_rest_hours),
    stability_weight: toToggleNumber(settings.stability_weight),
  };
}

function parseNumeric(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function tierValuesToPayload(input: ToggleTierValues): Record<TierKey, number> | undefined {
  if (!input.enabled) return undefined;
  const out = {} as Record<TierKey, number>;
  for (const tier of TIER_KEYS) {
    const parsed = parseNumeric(input.values[tier]);
    if (parsed === undefined) return undefined;
    out[tier] = parsed;
  }
  return out;
}

function toSettingsPayload(state: FormState): GridSolverSettings {
  const payload: GridSolverSettings = {
    unit_nooverlap_enabled: state.unit_nooverlap_enabled,
  };

  const maxDayByTier = tierValuesToPayload(state.max_hours_day_by_tier);
  if (maxDayByTier) payload.max_hours_day_by_tier = maxDayByTier;

  const maxWeekByTier = tierValuesToPayload(state.max_hours_week_by_tier);
  if (maxWeekByTier) payload.max_hours_week_by_tier = maxWeekByTier;

  const minWeekByTier = tierValuesToPayload(state.min_hours_week_by_tier);
  if (minWeekByTier) payload.min_hours_week_by_tier = minWeekByTier;

  if (state.min_hours_week_hard.enabled) payload.min_hours_week_hard = state.min_hours_week_hard.value;

  if (state.min_hours_week_weight.enabled) {
    const parsed = parseNumeric(state.min_hours_week_weight.value);
    if (parsed !== undefined) payload.min_hours_week_weight = parsed;
  }

  if (state.allow_overstaffing.enabled) payload.allow_overstaffing = state.allow_overstaffing.value;

  if (state.unit_max_hours_day.enabled) {
    const parsed = parseNumeric(state.unit_max_hours_day.value);
    if (parsed !== undefined) payload.unit_max_hours_day = parsed;
  }

  if (state.min_rest_hours.enabled) {
    const parsed = parseNumeric(state.min_rest_hours.value);
    if (parsed !== undefined) payload.min_rest_hours = parsed;
  }

  if (state.stability_weight.enabled) {
    const parsed = parseNumeric(state.stability_weight.value);
    if (parsed !== undefined) payload.stability_weight = Math.max(0, Math.min(100, parsed));
  }

  return buildSolverParamsPayload(payload);
}

function TierInputs({
  title,
  helper,
  value,
  onEnabledChange,
  onValueChange,
}: {
  title: string;
  helper: string;
  value: ToggleTierValues;
  onEnabledChange: (next: boolean) => void;
  onValueChange: (tier: TierKey, next: string) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div className="w-full">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-600">{helper}</div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TIER_KEYS.map((tier) => (
              <div key={tier}>
                <div className="mb-1 text-xs text-gray-600">
                  {tier === "PRIMARY" ? "Primary" : tier === "SECONDARY" ? "Secondary" : "Tertiary"}
                </div>
                <input
                  type="number"
                  step="1"
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={value.values[tier]}
                  disabled={!value.enabled}
                  onChange={(e) => onValueChange(tier, e.target.value)}
                  placeholder="e.g. 8"
                />
              </div>
            ))}
          </div>
        </div>
      </label>
    </div>
  );
}

function NumberOption({
  title,
  helper,
  value,
  min,
  max,
  step = 1,
  onEnabledChange,
  onValueChange,
}: {
  title: string;
  helper: string;
  value: ToggleNumber;
  min?: number;
  max?: number;
  step?: number;
  onEnabledChange: (next: boolean) => void;
  onValueChange: (next: string) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div className="w-full">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-600">{helper}</div>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            className="mt-3 w-full rounded border px-2 py-1 text-sm sm:w-56"
            value={value.value}
            disabled={!value.enabled}
            onChange={(e) => onValueChange(e.target.value)}
          />
        </div>
      </label>
    </div>
  );
}

function BooleanOption({
  title,
  helper,
  value,
  onEnabledChange,
  onValueChange,
}: {
  title: string;
  helper: string;
  value: ToggleBoolean;
  onEnabledChange: (next: boolean) => void;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={value.enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <div className="w-full">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-600">{helper}</div>
          <div className="mt-3">
            <label className={`inline-flex items-center gap-2 text-sm ${value.enabled ? "" : "text-gray-500"}`}>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={value.value}
                disabled={!value.enabled}
                onChange={(e) => onValueChange(e.target.checked)}
              />
              Enabled
            </label>
          </div>
        </div>
      </label>
    </div>
  );
}

export default function GridSolverSettingsForm({ gridId }: { gridId: number }) {
  const [state, setState] = useState<FormState | null>(null);

  useEffect(() => {
    const key = getGridSolverSettingsKey(gridId);
    const parsed = parseGridSolverSettings(window.localStorage.getItem(key));
    setState(fromParsedSettings(parsed));
  }, [gridId]);

  useEffect(() => {
    if (!state) return;
    const key = getGridSolverSettingsKey(gridId);
    const payload = toSettingsPayload(state);
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, [gridId, state]);

  const previewPayload = useMemo(() => (state ? toSettingsPayload(state) : null), [state]);

  if (!state) {
    return (
      <div className="max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-4 text-sm text-gray-600">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-gray-600">
        Runtime solver options. Only enabled and fully configured fields are sent in{" "}
        <code>solver_params</code>.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-md border p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={state.unit_nooverlap_enabled}
              onChange={(e) =>
                setState((prev) => (prev ? { ...prev, unit_nooverlap_enabled: e.target.checked } : prev))
              }
            />
            <div>
              <div className="text-sm font-medium">Prevent overlap for same unit</div>
              <div className="text-sm text-gray-600">
                If enabled, cells sharing the same unit cannot be scheduled at the same time.
              </div>
            </div>
          </label>
        </div>

        <TierInputs
          title="Max hours per day by tier"
          helper="Hard cap per day by participant tier."
          value={state.max_hours_day_by_tier}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, max_hours_day_by_tier: { ...prev.max_hours_day_by_tier, enabled } } : prev
            )
          }
          onValueChange={(tier, next) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    max_hours_day_by_tier: {
                      ...prev.max_hours_day_by_tier,
                      values: { ...prev.max_hours_day_by_tier.values, [tier]: next },
                    },
                  }
                : prev
            )
          }
        />

        <TierInputs
          title="Max hours per week by tier"
          helper="Hard weekly cap by participant tier."
          value={state.max_hours_week_by_tier}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, max_hours_week_by_tier: { ...prev.max_hours_week_by_tier, enabled } } : prev
            )
          }
          onValueChange={(tier, next) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    max_hours_week_by_tier: {
                      ...prev.max_hours_week_by_tier,
                      values: { ...prev.max_hours_week_by_tier.values, [tier]: next },
                    },
                  }
                : prev
            )
          }
        />

        <TierInputs
          title="Min hours per week by tier"
          helper="Weekly minimum target by participant tier."
          value={state.min_hours_week_by_tier}
          onEnabledChange={(enabled) =>
            setState((prev) =>
              prev ? { ...prev, min_hours_week_by_tier: { ...prev.min_hours_week_by_tier, enabled } } : prev
            )
          }
          onValueChange={(tier, next) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    min_hours_week_by_tier: {
                      ...prev.min_hours_week_by_tier,
                      values: { ...prev.min_hours_week_by_tier.values, [tier]: next },
                    },
                  }
                : prev
            )
          }
        />

        <BooleanOption
          title="Minimum weekly hours are hard"
          helper="If disabled, weekly minimum is soft and uses penalty weight."
          value={state.min_hours_week_hard}
          onEnabledChange={(enabled) =>
            setState((prev) => (prev ? { ...prev, min_hours_week_hard: { ...prev.min_hours_week_hard, enabled } } : prev))
          }
          onValueChange={(next) =>
            setState((prev) => (prev ? { ...prev, min_hours_week_hard: { ...prev.min_hours_week_hard, value: next } } : prev))
          }
        />

        <NumberOption
          title="Min weekly shortfall penalty weight"
          helper="Penalty multiplier used when minimum weekly hours are soft."
          value={state.min_hours_week_weight}
          min={0}
          onEnabledChange={(enabled) =>
            setState((prev) => (prev ? { ...prev, min_hours_week_weight: { ...prev.min_hours_week_weight, enabled } } : prev))
          }
          onValueChange={(next) =>
            setState((prev) => (prev ? { ...prev, min_hours_week_weight: { ...prev.min_hours_week_weight, value: next } } : prev))
          }
        />

        <BooleanOption
          title="Allow overstaffing"
          helper="Allows assigning above headcount to reduce minimum-hours shortfall."
          value={state.allow_overstaffing}
          onEnabledChange={(enabled) =>
            setState((prev) => (prev ? { ...prev, allow_overstaffing: { ...prev.allow_overstaffing, enabled } } : prev))
          }
          onValueChange={(next) =>
            setState((prev) => (prev ? { ...prev, allow_overstaffing: { ...prev.allow_overstaffing, value: next } } : prev))
          }
        />

        <NumberOption
          title="Unit max hours per day"
          helper="Hard daily cap per unit."
          value={state.unit_max_hours_day}
          min={0}
          onEnabledChange={(enabled) =>
            setState((prev) => (prev ? { ...prev, unit_max_hours_day: { ...prev.unit_max_hours_day, enabled } } : prev))
          }
          onValueChange={(next) =>
            setState((prev) => (prev ? { ...prev, unit_max_hours_day: { ...prev.unit_max_hours_day, value: next } } : prev))
          }
        />

        <NumberOption
          title="Minimum rest hours"
          helper="Hard minimum rest between two assigned shifts."
          value={state.min_rest_hours}
          min={0}
          onEnabledChange={(enabled) =>
            setState((prev) => (prev ? { ...prev, min_rest_hours: { ...prev.min_rest_hours, enabled } } : prev))
          }
          onValueChange={(next) =>
            setState((prev) => (prev ? { ...prev, min_rest_hours: { ...prev.min_rest_hours, value: next } } : prev))
          }
        />

        <NumberOption
          title="Stability weight"
          helper="0..100. Higher values keep schedules closer to the previous solution."
          value={state.stability_weight}
          min={0}
          max={100}
          onEnabledChange={(enabled) =>
            setState((prev) => (prev ? { ...prev, stability_weight: { ...prev.stability_weight, enabled } } : prev))
          }
          onValueChange={(next) =>
            setState((prev) => (prev ? { ...prev, stability_weight: { ...prev.stability_weight, value: next } } : prev))
          }
        />
      </div>

      {previewPayload && (
        <div className="mt-6 rounded-md border bg-gray-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Payload Preview</div>
          <pre className="overflow-auto text-xs text-gray-700">{JSON.stringify(previewPayload, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
