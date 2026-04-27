"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/use-i18n";

type Grid = {
  id: number;
  grid_code?: string | null;
  name: string;
  description?: string;
  day_start: string;
  day_end: string;
  days_enabled: number[];
  cell_size_min: number;
};

type OrganizationType = "school" | "work" | "gym" | "private_tutor" | "other";
type UnitNature = "audience" | "internal" | "none";
type TierKey = "PRIMARY" | "SECONDARY" | "TERTIARY";
type PriorityCode = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P9" | "P10";

const PRIORITY_DEFAULT: Record<PriorityCode, number> = {
  P1: 5,
  P2: 5,
  P3: 5,
  P4: 5,
  P5: 5,
  P6: 5,
  P9: 5,
  P10: 5,
};

const ALWAYS_PRIORITY_CODES: PriorityCode[] = ["P1", "P2", "P3", "P6", "P9", "P10"];
const AUDIENCE_PRIORITY_CODES: PriorityCode[] = ["P4", "P5"];

function normalizeTime(t: string) {
  const [hRaw, mRaw] = t.split(":");
  const h = Math.max(0, Math.min(23, Number(hRaw || 0)));
  const m = Math.max(0, Math.min(59, Number(mRaw || 0)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMin(t: string) {
  const [h, m] = normalizeTime(t).split(":").map(Number);
  return h * 60 + m;
}

function parseNullableNonNegativeInt(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}

export default function NewGridPage() {
  const router = useRouter();
  const { t } = useI18n();

  const tt = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const translated = t(key as never, params);
    return translated === key ? fallback : translated;
  };

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [cellMinutes, setCellMinutes] = useState(60);

  const [q1OrganizationType, setQ1OrganizationType] = useState<OrganizationType | null>(null);
  const [q1OtherDescription, setQ1OtherDescription] = useState("");
  const [q2UnitNature, setQ2UnitNature] = useState<UnitNature | null>(null);
  const [q4UnitNoOverlap, setQ4UnitNoOverlap] = useState<boolean | null>(null);
  const [q5MinRestHours, setQ5MinRestHours] = useState("");
  const [qTiers, setQTiers] = useState<boolean | null>(null);
  const [qMinCells, setQMinCells] = useState<Record<TierKey, string>>({
    PRIMARY: "",
    SECONDARY: "",
    TERTIARY: "",
  });

  const [priorities, setPriorities] = useState<Record<PriorityCode, number>>(PRIORITY_DEFAULT);
  const [priorityTouched, setPriorityTouched] = useState<Record<PriorityCode, boolean>>({
    P1: false,
    P2: false,
    P3: false,
    P4: false,
    P5: false,
    P6: false,
    P9: false,
    P10: false,
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dayOptions = [
    { idx: 0, label: t("day.mon_short") },
    { idx: 1, label: t("day.tue_short") },
    { idx: 2, label: t("day.wed_short") },
    { idx: 3, label: t("day.thu_short") },
    { idx: 4, label: t("day.fri_short") },
    { idx: 5, label: t("day.sat_short") },
    { idx: 6, label: t("day.sun_short") },
  ];

  const orgOptions: Array<{ key: OrganizationType; label: string }> = [
    { key: "school", label: tt("solver_wizard.org_type_school", "School") },
    { key: "work", label: tt("solver_wizard.org_type_work", "Work") },
    { key: "gym", label: tt("solver_wizard.org_type_gym", "Gym") },
    { key: "private_tutor", label: tt("solver_wizard.org_type_private_tutor", "Private tutor") },
    { key: "other", label: tt("solver_wizard.org_type_other", "Other") },
  ];

  const unitNatureOptions: Array<{ key: UnitNature; label: string; help: string }> = [
    {
      key: "audience",
      label: tt("solver_wizard.unit_nature_audience", "Audience"),
      help: tt(
        "solver_wizard.unit_nature_audience_help",
        "Units represent groups that attend together (classes/sections).",
      ),
    },
    {
      key: "internal",
      label: tt("solver_wizard.unit_nature_internal", "Internal"),
      help: tt(
        "solver_wizard.unit_nature_internal_help",
        "Units represent internal operational groups.",
      ),
    },
    {
      key: "none",
      label: tt("solver_wizard.unit_nature_none", "None"),
      help: tt(
        "solver_wizard.unit_nature_none_help",
        "No unit-level coupling is needed.",
      ),
    },
  ];

  const priorityRows = useMemo(() => {
    const rows: Array<{ code: PriorityCode; label: string; bipolar?: boolean }> = [
      { code: "P1", label: tt("solver_wizard.priority_availability", "Respect participant availability") },
      {
        code: "P2",
        label: tt("solver_wizard.priority_participant_gap", "Minimize gaps between participant activities"),
      },
      { code: "P3", label: tt("solver_wizard.priority_participant_days", "Concentrate activities in fewer days") },
      { code: "P6", label: tt("solver_wizard.priority_soft_window", "Respect preferred time windows") },
      { code: "P9", label: tt("solver_wizard.priority_daily_load_balance", "Daily load balance") },
      { code: "P10", label: tt("solver_wizard.priority_day_spread", "Separate vs. cluster days"), bipolar: true },
    ];
    if (q2UnitNature === "audience") {
      rows.push(
        { code: "P4", label: tt("solver_wizard.priority_unit_gap", "Minimize gaps in units") },
        { code: "P5", label: tt("solver_wizard.priority_unit_days", "Concentrate unit activities") },
      );
    }
    return rows;
  }, [q2UnitNature, t]);

  const normalizedStart = normalizeTime(start);
  const normalizedEnd = normalizeTime(end);
  const validTime = toMin(normalizedEnd) > toMin(normalizedStart);
  const validCell = Number.isFinite(cellMinutes) && cellMinutes >= 30 && cellMinutes % 5 === 0;
  const hasName = name.trim().length > 0;
  const hasDays = days.length > 0;

  const step1Valid = hasName && hasDays && validTime && validCell;
  const step2Valid = Boolean(q1OrganizationType);

  const tiersMayBeActive = qTiers !== false;

  const parsedQMinCells = useMemo(() => {
    const primary = parseNullableNonNegativeInt(qMinCells.PRIMARY);
    const secondary = parseNullableNonNegativeInt(qMinCells.SECONDARY);
    const tertiary = parseNullableNonNegativeInt(qMinCells.TERTIARY);
    return { PRIMARY: primary, SECONDARY: secondary, TERTIARY: tertiary };
  }, [qMinCells]);

  const hasQMinCellsInvalid =
    parsedQMinCells.PRIMARY === "invalid" ||
    parsedQMinCells.SECONDARY === "invalid" ||
    parsedQMinCells.TERTIARY === "invalid";

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b),
    );
  }

  function setPriority(code: PriorityCode, raw: number) {
    const next = Math.max(1, Math.min(10, Math.round(raw)));
    setPriorities((prev) => ({ ...prev, [code]: next }));
    setPriorityTouched((prev) => ({ ...prev, [code]: true }));
  }

  function canGoToStep(target: 1 | 2 | 3 | 4) {
    if (target === 1) return true;
    if (target === 2) return step1Valid;
    if (target === 3) return step1Valid && step2Valid;
    return step1Valid && step2Valid;
  }

  function validateBeforeSubmit() {
    if (!step1Valid) {
      if (!validTime) {
        setErr(tt("grid_new.end_time_after_start_error", "End time must be after start time."));
        return false;
      }
      if (!validCell) {
        setErr(tt("grid_new.cell_size_validation_error", "Cell size must be at least 30 and a multiple of 5."));
        return false;
      }
      setErr(tt("solver_wizard.fix_basic_fields", "Complete all required grid basics."));
      return false;
    }
    if (!q1OrganizationType) {
      setErr(tt("solver_wizard.q1_required", "Please select an organization type."));
      return false;
    }
    if (hasQMinCellsInvalid) {
      setErr(tt("solver_wizard.q_min_cells_invalid", "Min cells values must be non-negative integers."));
      return false;
    }
    return true;
  }

  function buildWizardPayload(useDefaults: boolean) {
    if (!q1OrganizationType) return null;

    const payload: Record<string, unknown> = {
      Q1: q1OrganizationType,
    };

    if (q2UnitNature) payload.Q2 = q2UnitNature;

    if (q2UnitNature === "audience" && q4UnitNoOverlap !== null) {
      payload.Q4 = q4UnitNoOverlap;
    }

    const q5Trimmed = q5MinRestHours.trim();
    if (q5Trimmed.length > 0) {
      const q5 = Number(q5Trimmed);
      if (Number.isFinite(q5) && q5 > 0) payload.Q5 = q5;
    }

    if (qTiers !== null) {
      payload.Q_tiers = qTiers;
    }

    if (tiersMayBeActive) {
      const minCells: Record<TierKey, number | null> = {
        PRIMARY: parsedQMinCells.PRIMARY === "invalid" ? null : parsedQMinCells.PRIMARY,
        SECONDARY: parsedQMinCells.SECONDARY === "invalid" ? null : parsedQMinCells.SECONDARY,
        TERTIARY: parsedQMinCells.TERTIARY === "invalid" ? null : parsedQMinCells.TERTIARY,
      };
      const hasAtLeastOneValue = Object.values(minCells).some((value) => value !== null);
      if (hasAtLeastOneValue) {
        payload.Q_min_cells = minCells;
      }
    }

    const activePriorityCodes =
      q2UnitNature === "audience" ? [...ALWAYS_PRIORITY_CODES, ...AUDIENCE_PRIORITY_CODES] : ALWAYS_PRIORITY_CODES;

    const priorityPayload: Partial<Record<PriorityCode, number>> = {};
    for (const code of activePriorityCodes) {
      if (useDefaults || priorityTouched[code]) {
        priorityPayload[code] = useDefaults ? 5 : priorities[code];
      }
    }
    if (Object.keys(priorityPayload).length > 0) {
      payload.priorities = priorityPayload;
    }

    return payload;
  }

  async function createGridAndWizard(useDefaults: boolean) {
    setErr(null);
    if (!validateBeforeSubmit()) return;

    const gridPayload: Record<string, unknown> = {
      name: name.trim(),
      day_start: normalizedStart,
      day_end: normalizedEnd,
      days_enabled: days,
      cell_size_min: cellMinutes,
    };

    if (q1OrganizationType === "other") {
      const trimmedDescription = q1OtherDescription.trim();
      if (trimmedDescription.length > 0) {
        gridPayload.description = trimmedDescription;
      }
    }

    const wizardPayload = buildWizardPayload(useDefaults);
    if (!wizardPayload) {
      setErr(tt("solver_wizard.create_failed", "Could not create grid."));
      return;
    }

    setLoading(true);
    try {
      const createRes = await fetch("/api/grids/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(gridPayload),
      });

      if (!createRes.ok) {
        const raw = await createRes.text().catch(() => "");
        throw new Error(raw || `Failed to create grid (${createRes.status})`);
      }

      const grid = (await createRes.json()) as Grid;
      const gridId = Number(grid?.id ?? 0);
      const target = String(grid?.grid_code || grid?.id || "");

      if (gridId > 0) {
        try {
          const wizardRes = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}/solver-wizard/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(wizardPayload),
          });
          if (!wizardRes.ok) {
            const wizardText = await wizardRes.text().catch(() => "");
            console.error("solver-wizard save failed", wizardRes.status, wizardText);
          }
        } catch (wizardError) {
          console.error("solver-wizard save failed", wizardError);
        }
      }

      router.push(`/grid/${encodeURIComponent(target || String(gridId))}`);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : tt("solver_wizard.create_failed", "Could not create grid."));
    } finally {
      setLoading(false);
    }
  }

  const questionCardClass =
    "rounded-xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

  return (
    <div className="min-h-screen bg-[#f0ebf8] py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="h-2 bg-[#673AB7]" />

          <div className="px-6 py-5 border-b border-gray-100">
            <h1 className="text-2xl font-semibold text-gray-900">
              {tt("solver_wizard.title", "Create New Grid")}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {tt("solver_wizard.step_x_of_y", "Step {step} of {total}", { step, total: 4 })}
            </p>
          </div>

          <div className="px-6 pt-4">
            <div className="flex items-center justify-center gap-0 select-none">
              {[1, 2, 3, 4].map((idx) => {
                const stepIdx = idx as 1 | 2 | 3 | 4;
                const isActive = step === stepIdx;
                const enabled = canGoToStep(stepIdx);
                return (
                  <div key={idx} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (!enabled || loading) return;
                        setStep(stepIdx);
                        setErr(null);
                      }}
                      disabled={!enabled || loading}
                      className={`h-9 w-9 rounded-full border-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? "border-black bg-black text-white"
                          : enabled
                          ? "border-gray-300 bg-white text-gray-700"
                          : "border-gray-200 bg-gray-100 text-gray-400"
                      }`}
                      aria-label={tt("solver_wizard.go_to_step", "Go to step {step}", { step: idx })}
                    >
                      {idx}
                    </button>
                    {idx < 4 ? <div className={`h-0.5 w-10 ${step > stepIdx ? "bg-black" : "bg-gray-300"}`} /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 space-y-4">
            {err ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

            {step === 1 ? (
              <section className={questionCardClass}>
                <h2 className="text-base font-medium text-gray-900">{tt("solver_wizard.section_basics", "Grid basics")}</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm mb-1 text-gray-700">{tt("grid_new.name", "Name")}</label>
                    <input
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={120}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-gray-700">{tt("grid_new.days_of_week", "Days of the week")}</label>
                    <div className="flex flex-wrap gap-2">
                      {dayOptions.map((day) => {
                        const selected = days.includes(day.idx);
                        return (
                          <button
                            key={day.idx}
                            type="button"
                            onClick={() => toggleDay(day.idx)}
                            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm mb-1 text-gray-700">{tt("grid_new.from", "From")}</label>
                      <input
                        type="time"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={start}
                        onChange={(event) => setStart(normalizeTime(event.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-700">{tt("grid_new.to", "To")}</label>
                      <input
                        type="time"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={end}
                        onChange={(event) => setEnd(normalizeTime(event.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-gray-700">{tt("grid_new.cell_size_min", "Cell size (min)")}</label>
                    <input
                      type="number"
                      min={30}
                      step={5}
                      className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={cellMinutes}
                      onChange={(event) => setCellMinutes(Number(event.target.value) || 0)}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className={questionCardClass}>
                <h2 className="text-base font-medium text-gray-900">{tt("solver_wizard.section_questions", "Questions")}</h2>

                <div className="mt-4 space-y-5">
                  <div>
                    <label className="block text-sm mb-2 text-gray-700">{tt("solver_wizard.org_type", "Organization type")}</label>
                    <div className="flex flex-wrap gap-2">
                      {orgOptions.map((option) => {
                        const selected = q1OrganizationType === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setQ1OrganizationType(option.key);
                              setErr(null);
                            }}
                            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {q1OrganizationType === "other" ? (
                    <div>
                      <label className="block text-sm mb-1 text-gray-700">
                        {tt("solver_wizard.custom_description", "Custom description")}
                      </label>
                      <input
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={q1OtherDescription}
                        onChange={(event) => setQ1OtherDescription(event.target.value)}
                        placeholder={tt("solver_wizard.custom_description_placeholder", "Describe your organization")}
                        maxLength={240}
                      />
                    </div>
                  ) : null}

                  {q1OrganizationType ? (
                    <button
                      type="button"
                      onClick={() => void createGridAndWizard(true)}
                      disabled={loading}
                      className="text-sm text-gray-500 underline underline-offset-2 disabled:opacity-50"
                    >
                      {tt("solver_wizard.use_default_configuration", "Use default configuration")}
                    </button>
                  ) : null}

                  <div>
                    <label className="block text-sm mb-2 text-gray-700">
                      {tt("solver_wizard.unit_nature", "Unit nature")} ({tt("solver_wizard.optional", "optional")})
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {unitNatureOptions.map((option) => {
                        const selected = q2UnitNature === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setQ2UnitNature(option.key);
                              if (option.key !== "audience") setQ4UnitNoOverlap(null);
                            }}
                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            <div className={`mt-1 text-xs ${selected ? "text-gray-200" : "text-gray-500"}`}>
                              {option.help}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {q2UnitNature === "audience" ? (
                    <div>
                      <label className="block text-sm mb-2 text-gray-700">
                        {tt("solver_wizard.q4_unit_nooverlap", "Keep unit placements from overlapping")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: tt("solver_wizard.no_preference", "No preference"), value: null as boolean | null },
                          { label: tt("solver_wizard.q4_yes", "Yes"), value: true as boolean | null },
                          { label: tt("solver_wizard.q4_no", "No"), value: false as boolean | null },
                        ].map((option) => {
                          const selected = q4UnitNoOverlap === option.value;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => setQ4UnitNoOverlap(option.value)}
                              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                                selected
                                  ? "border-black bg-black text-white"
                                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-sm mb-1 text-gray-700">
                      {tt("solver_wizard.q5_min_rest", "Minimum rest hours")} ({tt("solver_wizard.optional", "optional")})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="w-44 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={q5MinRestHours}
                      onChange={(event) => setQ5MinRestHours(event.target.value)}
                      placeholder={tt("solver_wizard.q5_help", "Leave empty or 0 to skip")}
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-gray-700">
                      {tt("solver_wizard.q_tiers", "Tier usage")} ({tt("solver_wizard.optional", "optional")})
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: tt("solver_wizard.q_tiers_keep", "No change"), value: null as boolean | null },
                        { label: tt("solver_wizard.q_tiers_enable", "Enable tiers"), value: true as boolean | null },
                        { label: tt("solver_wizard.q_tiers_disable", "Disable tiers"), value: false as boolean | null },
                      ].map((option) => {
                        const selected = qTiers === option.value;
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setQTiers(option.value)}
                            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      tiersMayBeActive ? "max-h-72 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="space-y-2 pt-1">
                      <label className="block text-sm mb-1 text-gray-700">
                        {tt("solver_wizard.q_min_cells", "Minimum cells per week by tier")} ({tt("solver_wizard.optional", "optional")})
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {([
                          ["PRIMARY", tt("tier.primary", "Primary")],
                          ["SECONDARY", tt("tier.secondary", "Secondary")],
                          ["TERTIARY", tt("tier.tertiary", "Tertiary")],
                        ] as Array<[TierKey, string]>).map(([tier, label]) => (
                          <div key={tier}>
                            <label className="mb-1 block text-xs text-gray-500">{label}</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              value={qMinCells[tier]}
                              onChange={(event) =>
                                setQMinCells((prev) => ({
                                  ...prev,
                                  [tier]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className={questionCardClass}>
                <h2 className="text-base font-medium text-gray-900">{tt("solver_wizard.section_priorities", "Priorities")}</h2>
                <p className="mt-1 text-xs text-gray-500">{tt("solver_wizard.priorities_optional", "All sliders are optional. Untouched values keep profile defaults.")}</p>

                <div className="mt-4 space-y-4">
                  {priorityRows.map((row) => {
                    const value = priorities[row.code];
                    const pct = ((value - 1) / 9) * 100;
                    return (
                      <div key={row.code} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm text-gray-700">{row.label}</label>
                          <span className="text-sm font-medium text-gray-900">{value}</span>
                        </div>
                        {row.bipolar ? (
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{tt("solver_wizard.day_spread_separate", "Separate")}</span>
                            <span>{tt("solver_wizard.day_spread_cluster", "Cluster")}</span>
                          </div>
                        ) : null}
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={value}
                          onChange={(event) => setPriority(row.code, Number(event.target.value))}
                          className="wizard-range w-full h-2 appearance-none rounded-full"
                          style={{
                            background: `linear-gradient(to right, #111827 ${pct}%, #E5E7EB ${pct}%)`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section className={questionCardClass}>
                <h2 className="text-base font-medium text-gray-900">{tt("solver_wizard.section_confirm", "Confirmation")}</h2>
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">{tt("solver_wizard.org_type", "Organization type")}</div>
                        <div className="text-sm font-medium text-gray-900">
                          {orgOptions.find((option) => option.key === q1OrganizationType)?.label || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">{tt("solver_wizard.unit_nature", "Unit nature")}</div>
                        <div className="text-sm font-medium text-gray-900">
                          {unitNatureOptions.find((option) => option.key === q2UnitNature)?.label || "-"}
                        </div>
                      </div>
                    </div>
                    {q1OrganizationType === "other" && q1OtherDescription.trim() ? (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">{tt("solver_wizard.custom_description", "Custom description")}</div>
                        <div className="text-sm text-gray-900">{q1OtherDescription.trim()}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4 space-y-2">
                    {priorityRows.map((row) => {
                      const value = priorities[row.code];
                      const pct = ((value - 1) / 9) * 100;
                      return (
                        <div key={row.code} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-700">{row.label}</span>
                            <span className="font-medium text-gray-900">{value}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-200">
                            <div className="h-full rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => void createGridAndWizard(false)}
                    disabled={loading || !step1Valid || !step2Valid}
                    className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {loading ? tt("solver_wizard.creating", "Creating...") : tt("solver_wizard.create_grid", "Create Grid")}
                  </button>
                </div>
              </section>
            ) : null}

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
                }}
                disabled={loading || step === 1}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 disabled:opacity-40"
                aria-label={tt("solver_wizard.previous_step", "Previous step")}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    setErr(null);
                    if (step === 1 && !step1Valid) {
                      void validateBeforeSubmit();
                      return;
                    }
                    if (step === 2 && !step2Valid) {
                      setErr(tt("solver_wizard.q1_required", "Please select an organization type."));
                      return;
                    }
                    setStep((prev) => (prev < 4 ? ((prev + 1) as 1 | 2 | 3 | 4) : prev));
                  }}
                  disabled={loading || (step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 disabled:opacity-40"
                  aria-label={tt("solver_wizard.next_step", "Next step")}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : <span className="w-10" />}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .wizard-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 2px solid #111827;
          background: #ffffff;
          cursor: pointer;
          margin-top: -4px;
        }

        .wizard-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 2px solid #111827;
          background: #ffffff;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
