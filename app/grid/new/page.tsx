"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Stepper, { Step } from "@/components/Stepper";
import { useI18n } from "@/lib/use-i18n";

type Grid = {
  id: number;
  grid_code?: string | null;
  code?: string | null;
  name: string;
  description?: string;
  day_start: string;
  day_end: string;
  days_enabled: number[];
  cell_size_min: number;
  solver_profile?: string;
  solver_options?: Record<string, unknown>;
  objective_weights?: Record<string, number>;
  organization_type?: OrganizationType;
  unit_nature?: UnitNature;
  other_context_description?: string | null;
};

type OrganizationType = "school" | "work" | "gym" | "private_tutor" | "event" | "other";
type UnitNature = "audience" | "space" | "internal" | "none";

type UnitOption = {
  value: UnitNature;
  labelKey: string;
  labelFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
};

const UNIT_OPTIONS_BY_ORG: Record<OrganizationType, UnitOption[]> = {
  school: [
    {
      value: "audience",
      labelKey: "solver_wizard.unit_nature_school_audience_label",
      labelFallback: "Courses, divisions or student groups",
      descriptionKey: "solver_wizard.unit_nature_school_audience_description",
      descriptionFallback:
        "Use this when the schedule is built for groups that receive activities, such as classes, years, divisions or academic groups.",
    },
    {
      value: "space",
      labelKey: "solver_wizard.unit_nature_school_space_label",
      labelFallback: "Physical spaces such as classrooms or labs",
      descriptionKey: "solver_wizard.unit_nature_school_space_description",
      descriptionFallback:
        "Use this when rooms, classrooms, laboratories or similar spaces must not be assigned to two activities at the same time.",
    },
    {
      value: "none",
      labelKey: "solver_wizard.unit_nature_school_none_label",
      labelFallback: "Only participants or teachers",
      descriptionKey: "solver_wizard.unit_nature_school_none_description",
      descriptionFallback:
        "Use this when the schedule is mainly organized around people, without needing unit-based views.",
    },
  ],
  work: [
    {
      value: "none",
      labelKey: "solver_wizard.unit_nature_work_none_label",
      labelFallback: "People covering shifts or tasks",
      descriptionKey: "solver_wizard.unit_nature_work_none_description",
      descriptionFallback:
        "Use this when employees or staff members must be assigned to shifts, tasks or work periods.",
    },
    {
      value: "internal",
      labelKey: "solver_wizard.unit_nature_work_internal_label",
      labelFallback: "Areas, teams or departments",
      descriptionKey: "solver_wizard.unit_nature_work_internal_description",
      descriptionFallback:
        "Use this when the schedule is organized by internal company groupings such as teams, departments or areas.",
    },
    {
      value: "audience",
      labelKey: "solver_wizard.unit_nature_work_audience_label",
      labelFallback: "Trainings or activities for groups",
      descriptionKey: "solver_wizard.unit_nature_work_audience_description",
      descriptionFallback:
        "Use this when groups of people receive activities, such as onboarding sessions, internal training or workshops.",
    },
    {
      value: "space",
      labelKey: "solver_wizard.unit_nature_work_space_label",
      labelFallback: "Physical spaces such as offices, desks or rooms",
      descriptionKey: "solver_wizard.unit_nature_work_space_description",
      descriptionFallback:
        "Use this when physical spaces or resources must not be assigned to two activities at the same time.",
    },
  ],
  gym: [
    {
      value: "audience",
      labelKey: "solver_wizard.unit_nature_gym_audience_label",
      labelFallback: "Group classes for clients or students",
      descriptionKey: "solver_wizard.unit_nature_gym_audience_description",
      descriptionFallback:
        "Use this when groups of clients or students receive scheduled classes or activities.",
    },
    {
      value: "none",
      labelKey: "solver_wizard.unit_nature_gym_none_label",
      labelFallback: "Instructor or staff shifts",
      descriptionKey: "solver_wizard.unit_nature_gym_none_description",
      descriptionFallback:
        "Use this when the goal is to assign instructors, reception staff or other workers to shifts or tasks.",
    },
    {
      value: "space",
      labelKey: "solver_wizard.unit_nature_gym_space_label",
      labelFallback: "Spaces such as rooms, courts or training areas",
      descriptionKey: "solver_wizard.unit_nature_gym_space_description",
      descriptionFallback:
        "Use this when rooms, courts, boxes or training areas must not overlap.",
    },
  ],
  private_tutor: [
    {
      value: "none",
      labelKey: "solver_wizard.unit_nature_private_tutor_none_label",
      labelFallback: "Individual lesson agenda",
      descriptionKey: "solver_wizard.unit_nature_private_tutor_none_description",
      descriptionFallback:
        "Use this when the schedule is mainly an agenda for individual sessions or appointments.",
    },
    {
      value: "audience",
      labelKey: "solver_wizard.unit_nature_private_tutor_audience_label",
      labelFallback: "Student groups",
      descriptionKey: "solver_wizard.unit_nature_private_tutor_audience_description",
      descriptionFallback:
        "Use this when several students or groups receive activities and need their own schedule view.",
    },
    {
      value: "space",
      labelKey: "solver_wizard.unit_nature_private_tutor_space_label",
      labelFallback: "Physical spaces",
      descriptionKey: "solver_wizard.unit_nature_private_tutor_space_description",
      descriptionFallback:
        "Use this when rooms, offices or other spaces must be assigned without overlaps.",
    },
  ],
  event: [
    {
      value: "none",
      labelKey: "solver_wizard.unit_nature_event_none_label",
      labelFallback: "People covering tasks or stations",
      descriptionKey: "solver_wizard.unit_nature_event_none_description",
      descriptionFallback:
        "Use this when volunteers or staff members must be assigned to tasks, stations or time slots.",
    },
    {
      value: "audience",
      labelKey: "solver_wizard.unit_nature_event_audience_label",
      labelFallback: "Activities for groups or attendees",
      descriptionKey: "solver_wizard.unit_nature_event_audience_description",
      descriptionFallback:
        "Use this when groups or attendees receive scheduled activities, workshops or sessions.",
    },
    {
      value: "space",
      labelKey: "solver_wizard.unit_nature_event_space_label",
      labelFallback: "Spaces, stands or rooms",
      descriptionKey: "solver_wizard.unit_nature_event_space_description",
      descriptionFallback:
        "Use this when stands, rooms, halls or event spaces must not overlap.",
    },
  ],
  other: [
    {
      value: "audience",
      labelKey: "solver_wizard.unit_nature_other_audience_label",
      labelFallback: "Groups that receive activities",
      descriptionKey: "solver_wizard.unit_nature_other_audience_description",
      descriptionFallback: "Use this when units are groups of people that receive scheduled activities.",
    },
    {
      value: "space",
      labelKey: "solver_wizard.unit_nature_other_space_label",
      labelFallback: "Spaces or physical resources",
      descriptionKey: "solver_wizard.unit_nature_other_space_description",
      descriptionFallback: "Use this when units are physical spaces or resources that cannot overlap.",
    },
    {
      value: "internal",
      labelKey: "solver_wizard.unit_nature_other_internal_label",
      labelFallback: "Internal groupings",
      descriptionKey: "solver_wizard.unit_nature_other_internal_description",
      descriptionFallback:
        "Use this when units are categories such as teams, areas, departments or activity types.",
    },
    {
      value: "none",
      labelKey: "solver_wizard.unit_nature_other_none_label",
      labelFallback: "I do not need units",
      descriptionKey: "solver_wizard.unit_nature_other_none_description",
      descriptionFallback: "Use this when the schedule is mainly organized around participants and shift cells.",
    },
  ],
};

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

function extractCreatedGrid(raw: unknown): Grid | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.id === "number" || typeof source.id === "string") {
    return source as Grid;
  }
  for (const key of ["grid", "data", "result"]) {
    const nested = source[key];
    if (nested && typeof nested === "object") {
      const nestedSource = nested as Record<string, unknown>;
      if (typeof nestedSource.id === "number" || typeof nestedSource.id === "string") {
        return nestedSource as Grid;
      }
    }
  }
  return null;
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

  const [organizationType, setOrganizationType] = useState<OrganizationType | null>(null);
  const [unitNature, setUnitNature] = useState<UnitNature | null>(null);
  const [otherContextDescription, setOtherContextDescription] = useState("");

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

  const orgOptions: Array<{ key: OrganizationType; label: string; description: string }> = [
    {
      key: "school",
      label: tt("solver_wizard.org_type_school", "School / University"),
      description: tt("solver_wizard.org_type_school_description", "Schedules for classes, courses and student groups."),
    },
    {
      key: "work",
      label: tt("solver_wizard.org_type_work", "Company / Work"),
      description: tt("solver_wizard.org_type_work_description", "Schedules for teams, shifts and workplace operations."),
    },
    {
      key: "gym",
      label: tt("solver_wizard.org_type_gym", "Gym / Group Classes"),
      description: tt("solver_wizard.org_type_gym_description", "Schedules for classes, trainers and gym resources."),
    },
    {
      key: "private_tutor",
      label: tt("solver_wizard.org_type_private_tutor", "Private Tutor / Independent Professional"),
      description: tt(
        "solver_wizard.org_type_private_tutor_description",
        "Schedules for individual sessions, lessons and appointments.",
      ),
    },
    {
      key: "event",
      label: tt("solver_wizard.org_type_event", "Event / Volunteering"),
      description: tt(
        "solver_wizard.org_type_event_description",
        "Schedules for event staff, volunteers, activities and spaces.",
      ),
    },
    {
      key: "other",
      label: tt("solver_wizard.org_type_other", "Other"),
      description: tt("solver_wizard.org_type_other_description", "A different scheduling scenario not listed above."),
    },
  ];

  const availableUnitOptions = useMemo<UnitOption[]>(
    () => (organizationType ? UNIT_OPTIONS_BY_ORG[organizationType] : []),
    [organizationType],
  );
  const allowedUnitNatures = useMemo(
    () => new Set(availableUnitOptions.map((option) => option.value)),
    [availableUnitOptions],
  );

  const unitNatureQuestion = useMemo(() => {
    switch (organizationType) {
      case "school":
        return tt("solver_wizard.unit_nature_school_question", "What do you want to organize in this schedule?");
      case "work":
        return tt("solver_wizard.unit_nature_work_question", "What do you want to organize mainly?");
      case "gym":
        return tt("solver_wizard.unit_nature_gym_question", "What do you want to organize?");
      case "private_tutor":
        return tt("solver_wizard.unit_nature_private_tutor_question", "What do you want to organize?");
      case "event":
        return tt("solver_wizard.unit_nature_event_question", "What do you want to organize?");
      case "other":
        return tt("solver_wizard.unit_nature_other_question", "What do the main units represent?");
      default:
        return tt("solver_wizard.unit_nature", "Unit nature");
    }
  }, [organizationType, tt]);

  const normalizedStart = normalizeTime(start);
  const normalizedEnd = normalizeTime(end);
  const validTime = toMin(normalizedEnd) > toMin(normalizedStart);
  const validCell = Number.isFinite(cellMinutes) && cellMinutes >= 30 && cellMinutes % 5 === 0;
  const hasName = name.trim().length > 0;
  const hasDays = days.length > 0;

  const step1Valid = hasName && hasDays && validTime && validCell;
  const trimmedOtherDescription = otherContextDescription.trim();
  const needsOtherDescription = organizationType === "other";
  const otherDescriptionValid = !needsOtherDescription || (trimmedOtherDescription.length > 0 && trimmedOtherDescription.length <= 500);
  const q2Allowed = unitNature != null && allowedUnitNatures.has(unitNature);
  const step2Valid = Boolean(organizationType && otherDescriptionValid);
  const step3Valid = Boolean(organizationType && q2Allowed);
  const organizationError = useMemo(() => {
    if (!organizationType) {
      return tt("solver_wizard.validation_organization_required", "Please select where you will use this schedule.");
    }
    if (needsOtherDescription && trimmedOtherDescription.length === 0) {
      return tt("solver_wizard.other_context_required_error", "Please describe your scheduling case.");
    }
    if (needsOtherDescription && trimmedOtherDescription.length > 500) {
      return tt("solver_wizard.other_context_max_length_error", "Description must be 500 characters or less.");
    }
    return null;
  }, [organizationType, needsOtherDescription, trimmedOtherDescription, tt]);

  const unitNatureError = useMemo(() => {
    if (!unitNature) {
      return tt("solver_wizard.validation_unit_nature_required", "Please choose what you want to organize.");
    }
    if (!allowedUnitNatures.has(unitNature)) {
      return tt("solver_wizard.validation_unit_nature_invalid", "The selected option is not valid for this organization type.");
    }
    return null;
  }, [allowedUnitNatures, unitNature, tt]);

  function toggleDay(idx: number) {
    setDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b),
    );
  }

  function selectOrganization(next: OrganizationType) {
    setOrganizationType(next);
    if (next !== "other") {
      setOtherContextDescription("");
    }
    if (unitNature && !UNIT_OPTIONS_BY_ORG[next].some((option) => option.value === unitNature)) {
      setUnitNature(null);
    }
    setErr(null);
  }

  function canGoToStep(target: 1 | 2 | 3 | 4) {
    if (target === 1) return true;
    if (target === 2) return step1Valid;
    if (target === 3) return step1Valid && step2Valid;
    return step1Valid && step2Valid && step3Valid;
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
    if (!step2Valid) {
      setErr(organizationError);
      return false;
    }
    if (!step3Valid) {
      setErr(unitNatureError);
      return false;
    }
    return true;
  }

  async function createGrid() {
    setErr(null);
    if (!validateBeforeSubmit()) return;

    const payload: Record<string, unknown> = {
      name: name.trim(),
      day_start: normalizedStart,
      day_end: normalizedEnd,
      days_enabled: days,
      cell_size_min: cellMinutes,
      organization_type: organizationType,
      unit_nature: unitNature,
      other_context_description: organizationType === "other" ? trimmedOtherDescription : null,
    };

    setLoading(true);
    try {
      const createRes = await fetch("/api/grids/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const raw = await createRes.text().catch(() => "");
        throw new Error(raw || `Failed to create grid (${createRes.status})`);
      }

      const rawGrid = await createRes.json();
      const grid = extractCreatedGrid(rawGrid);
      if (!grid) {
        throw new Error(tt("solver_wizard.create_failed", "Could not create grid."));
      }
      const gridId = Number(grid?.id ?? 0);
      const target = String(grid?.grid_code || grid?.code || grid?.id || "");
      if (typeof window !== "undefined" && Number.isFinite(gridId) && gridId > 0) {
        window.localStorage.removeItem(`onboarding-done-grid-${gridId}`);
      }
      router.replace(`/grid/${encodeURIComponent(target || String(gridId))}?onboarding=1`);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : tt("solver_wizard.create_failed", "Could not create grid."));
    } finally {
      setLoading(false);
    }
  }

  function handleStepChange(nextStep: number) {
    const target = nextStep as 1 | 2 | 3 | 4;
    if (target === 2 && !step1Valid) {
      void validateBeforeSubmit();
      return;
    }
    if (target === 3 && !step2Valid) {
      setErr(organizationError);
      return;
    }
    if (target === 4 && !step3Valid) {
      setErr(unitNatureError);
      return;
    }
    setErr(null);
    setStep(target);
  }

  const questionCardClass = "rounded-xl bg-white p-0";
  const stepPanelClass = "h-[clamp(300px,45dvh,410px)] overflow-y-auto px-1 pr-2 space-y-4";
  const headerStepNumbers = [1, 2, 3, 4] as const;

  return (
    <div className="min-h-screen bg-[#f0ebf8] px-4 py-3 md:py-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex h-[min(740px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 pt-3 pb-7">
            <h1 className="text-2xl font-semibold text-gray-900">{tt("solver_wizard.title", "Create New Grid")}</h1>
            <div className="mt-3 flex justify-center">
              <div className="flex w-full max-w-md items-center">
                {headerStepNumbers.map((stepNumber, index) => {
                  const enabled = canGoToStep(stepNumber) && !loading;
                  const isActive = step === stepNumber;
                  const isComplete = step > stepNumber;
                  return (
                    <div key={stepNumber} className={`flex items-center ${index === headerStepNumbers.length - 1 ? "flex-none" : "flex-1"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!enabled) return;
                          handleStepChange(stepNumber);
                        }}
                        disabled={!enabled}
                        className={`h-9 w-9 rounded-full border-2 text-sm font-semibold transition-colors ${
                          isComplete || isActive
                            ? "border-black bg-black text-white"
                            : enabled
                            ? "border-gray-300 bg-white text-gray-700"
                            : "border-gray-200 bg-gray-100 text-gray-400"
                        }`}
                        aria-label={tt("solver_wizard.go_to_step", "Go to step {step}", { step: stepNumber })}
                      >
                        {isComplete ? (
                          <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" aria-hidden="true">
                            <path
                              d="M5 13l4 4L19 7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : isActive ? (
                          <span className="mx-auto block h-2.5 w-2.5 rounded-full bg-white" />
                        ) : (
                          stepNumber
                        )}
                      </button>
                      {index < headerStepNumbers.length - 1 ? (
                        <div className={`mx-2 h-0.5 flex-1 rounded ${step > stepNumber ? "bg-black" : "bg-gray-200"}`} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 px-6 py-7">
            <Stepper
              currentStep={step}
              hideStepIndicators
              onStepChange={handleStepChange}
              onFinalStepCompleted={() => void createGrid()}
              backButtonText={tt("solver_wizard.previous_step", "Previous step")}
              nextButtonText={tt("solver_wizard.next_step", "Next")}
              completeButtonText={loading ? tt("solver_wizard.creating", "Creating...") : tt("solver_wizard.create_grid", "Create Grid")}
              nextButtonProps={{
                disabled:
                  loading ||
                  (step === 1 && !step1Valid) ||
                  (step === 2 && !step2Valid) ||
                  (step === 3 && !step3Valid),
                className:
                  "duration-350 flex min-w-[112px] items-center justify-center whitespace-nowrap rounded-2xl bg-black px-7 py-3 text-base font-medium leading-none tracking-tight text-white transition hover:bg-black/90 active:bg-black/80 disabled:opacity-50",
              }}
              backButtonProps={{
                disabled: loading,
                className:
                  "duration-350 rounded-2xl px-5 py-3 text-base font-medium leading-none text-neutral-900 transition hover:text-neutral-700 disabled:opacity-50",
              }}
              stepCircleContainerClassName="mt-0 max-w-2xl rounded-xl border-0 shadow-none"
              contentClassName="px-0"
              footerClassName="px-0 pb-0 [&>div]:mt-8"
              className="min-h-0 p-0"
            >
              <Step>
                <div className={stepPanelClass}>
                  {err ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
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
                </div>
              </Step>

              <Step>
                <div className={stepPanelClass}>
                  {err ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
                  <section className={questionCardClass}>
                    <h2 className="text-base font-medium text-gray-900">
                      {tt("solver_wizard.q1_prompt", "Where will you use this schedule?")}
                    </h2>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {orgOptions.map((option) => {
                        const selected = organizationType === option.key;
                        const isOther = option.key === "other";
                        return (
                          <div
                            key={option.key}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectOrganization(option.key)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectOrganization(option.key);
                              }
                            }}
                            className={`min-h-[104px] rounded-xl border px-3 py-3 text-left transition-colors ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            {isOther && selected ? null : (
                              <div className={`mt-1 text-xs ${selected ? "text-gray-200" : "text-gray-500"}`}>{option.description}</div>
                            )}
                            {isOther && selected ? (
                              <input
                                className="mt-2 w-full rounded-md border border-white/30 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                                value={otherContextDescription}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                                onChange={(event) => setOtherContextDescription(event.target.value)}
                                placeholder={tt(
                                  "solver_wizard.other_context_placeholder_short",
                                  "Example: rotating shifts",
                                )}
                                maxLength={500}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </Step>

              <Step>
                <div className={stepPanelClass}>
                  {err ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
                  <section className={questionCardClass}>
                    <h2 className="text-base font-medium text-gray-900">{unitNatureQuestion}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {tt(
                        "solver_wizard.unit_nature_optional_hint",
                        "Choose the option that best matches what this grid needs to organize.",
                      )}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {availableUnitOptions.map((option) => {
                        const selected = unitNature === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setUnitNature(option.value);
                              setErr(null);
                            }}
                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <div className="text-sm font-medium">{tt(option.labelKey, option.labelFallback)}</div>
                            <div className={`mt-1 text-xs ${selected ? "text-gray-200" : "text-gray-500"}`}>
                              {tt(option.descriptionKey, option.descriptionFallback)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </Step>

              <Step>
                <div className={stepPanelClass}>
                  {err ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
                  <section className={questionCardClass}>
                    <h2 className="text-base font-medium text-gray-900">{tt("solver_wizard.section_confirm", "Confirmation")}</h2>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              {tt("solver_wizard.org_type", "Organization type")}
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {orgOptions.find((option) => option.key === organizationType)?.label || "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              {tt("solver_wizard.unit_nature", "What you want to organize")}
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {availableUnitOptions.find((option) => option.value === unitNature)
                                ? tt(
                                    availableUnitOptions.find((option) => option.value === unitNature)?.labelKey || "",
                                    availableUnitOptions.find((option) => option.value === unitNature)?.labelFallback || "-",
                                  )
                                : "-"}
                            </div>
                          </div>
                        </div>
                        {organizationType === "other" ? (
                          <div className="mt-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              {tt("solver_wizard.other_context_label", "Briefly describe your scheduling case")}
                            </div>
                            <div className="text-sm text-gray-900">{trimmedOtherDescription || "-"}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                </div>
              </Step>
            </Stepper>
          </div>
        </div>
      </div>
    </div>
  );
}
