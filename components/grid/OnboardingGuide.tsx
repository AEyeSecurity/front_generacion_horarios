"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import AddParticipantDialog from "@/components/dialogs/AddParticipantDialog";
import CreateCellDialog from "@/components/dialogs/CreateCellDialog";
import { useI18n } from "@/lib/use-i18n";

type OnboardingGuideProps = {
  gridId: number;
  gridCode: string;
  show: boolean;
};

type GridHorizon = {
  dayStart: string;
  dayEnd: string;
};

function parseCountFromCollection(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    if (Array.isArray(source.results)) return source.results.length;
  }
  return 0;
}

async function fetchCollectionCount(path: string): Promise<number> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    return parseCountFromCollection(data);
  } catch {
    return 0;
  }
}

async function fetchGridHorizon(gridId: number): Promise<GridHorizon> {
  const fallback = { dayStart: "08:00", dayEnd: "20:00" };
  try {
    const res = await fetch(`/api/grids/${encodeURIComponent(String(gridId))}/`, { cache: "no-store" });
    if (!res.ok) return fallback;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return fallback;
    const source = data as Record<string, unknown>;
    const dayStart = typeof source.day_start === "string" ? source.day_start : fallback.dayStart;
    const dayEnd = typeof source.day_end === "string" ? source.day_end : fallback.dayEnd;
    return { dayStart, dayEnd };
  } catch {
    return fallback;
  }
}

export default function OnboardingGuide({ gridId, gridCode, show }: OnboardingGuideProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [createCellDialogOpen, setCreateCellDialogOpen] = useState(false);
  const [cellBaselineCount, setCellBaselineCount] = useState<number | null>(null);
  const [timeRangeFormOpen, setTimeRangeFormOpen] = useState(false);
  const [timeRangeName, setTimeRangeName] = useState("");
  const [timeRangeSaving, setTimeRangeSaving] = useState(false);
  const [timeRangeCount, setTimeRangeCount] = useState(0);
  const [timeRangeCreatedFlash, setTimeRangeCreatedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<GridHorizon>({ dayStart: "08:00", dayEnd: "20:00" });

  const storageKey = useMemo(() => `onboarding-done-${gridId}`, [gridId]);
  const totalSteps = 5;

  const completeAndHide = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
    setVisible(false);
    setParticipantDialogOpen(false);
    setCreateCellDialogOpen(false);
    setTimeRangeFormOpen(false);
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    if (!show) {
      setVisible(false);
      return () => {
        active = false;
      };
    }
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(storageKey) === "1") {
      setVisible(false);
      return;
    }

    setVisible(true);
    setError(null);

    (async () => {
      const [participantsCount, rangesCount, nextHorizon] = await Promise.all([
        fetchCollectionCount(`/api/participants?grid=${encodeURIComponent(String(gridId))}`),
        fetchCollectionCount(`/api/time_ranges?grid=${encodeURIComponent(String(gridId))}`),
        fetchGridHorizon(gridId),
      ]);
      if (!active) return;
      setTimeRangeCount(rangesCount);
      setHorizon(nextHorizon);
      if (participantsCount > 0) {
        setStep((prev) => Math.max(prev, 2));
      }
    })();

    return () => {
      active = false;
    };
  }, [gridId, show, storageKey]);

  if (!visible) return null;

  const handleParticipantCreated = () => {
    setError(null);
    setStep(2);
  };

  const handleOpenCreateCell = async () => {
    setError(null);
    const baseline = await fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`);
    setCellBaselineCount(baseline);
    setCreateCellDialogOpen(true);
  };

  const handleCreateCellOpenChange = async (nextOpen: boolean) => {
    if (nextOpen) {
      setCreateCellDialogOpen(true);
      return;
    }
    setCreateCellDialogOpen(false);
    if (cellBaselineCount == null) return;
    const nextCount = await fetchCollectionCount(`/api/cells?grid=${encodeURIComponent(String(gridId))}`);
    if (nextCount > cellBaselineCount) {
      setStep(5);
      setError(null);
    }
    setCellBaselineCount(null);
  };

  const handleAddTimeRange = async () => {
    const name = timeRangeName.trim();
    if (!name) {
      setError(t("onboarding.time_range_name_required"));
      return;
    }

    setTimeRangeSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/time_ranges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name,
          start_time: horizon.dayStart,
          end_time: horizon.dayEnd,
        }),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(raw || t("onboarding.time_range_create_failed"));
      }
      setTimeRangeName("");
      setTimeRangeCount((prev) => prev + 1);
      setTimeRangeCreatedFlash(true);
      window.setTimeout(() => setTimeRangeCreatedFlash(false), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("onboarding.time_range_create_failed"));
    } finally {
      setTimeRangeSaving(false);
    }
  };

  const stepTitle = {
    1: t("onboarding.step_1_title"),
    2: t("onboarding.step_2_title"),
    3: t("onboarding.step_3_title"),
    4: t("onboarding.step_4_title"),
    5: t("onboarding.step_5_title"),
  }[step as 1 | 2 | 3 | 4 | 5];

  const stepDescription = {
    1: t("onboarding.step_1_description"),
    2: t("onboarding.step_2_description"),
    3: t("onboarding.step_3_description"),
    4: t("onboarding.step_4_description"),
    5: t("onboarding.step_5_description"),
  }[step as 1 | 2 | 3 | 4 | 5];

  return (
    <>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[170] w-[calc(100%-2rem)] max-w-[480px] pointer-events-auto">
        <div className="relative rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="px-4 pt-4">
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              onClick={completeAndHide}
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-3 flex items-center gap-2 pr-8">
              {Array.from({ length: totalSteps }, (_, index) => index + 1).map((dot) => {
                const active = dot === step;
                const completed = dot < step;
                return (
                  <span
                    key={`onboarding-dot-${dot}`}
                    className={`h-2.5 w-2.5 rounded-full ${
                      active || completed ? "bg-black" : "bg-gray-300"
                    }`}
                  />
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`onboarding-step-${step}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t("onboarding.title")}
                </p>
                <h3 className="text-base font-semibold text-gray-900">{stepTitle}</h3>
                <p className="mt-1 text-sm text-gray-700">{stepDescription}</p>

                {step === 2 ? (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                      onClick={() => {
                        setTimeRangeFormOpen((prev) => !prev);
                        setError(null);
                      }}
                    >
                      {t("onboarding.add_time_range")}
                    </button>

                    {timeRangeFormOpen ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                          placeholder={t("common.name")}
                          value={timeRangeName}
                          onChange={(event) => setTimeRangeName(event.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                          disabled={timeRangeSaving}
                          onClick={() => void handleAddTimeRange()}
                        >
                          {timeRangeSaving ? t("common.saving") : t("common.add")}
                        </button>
                      </div>
                    ) : null}

                    {timeRangeCreatedFlash ? (
                      <div className="inline-flex items-center gap-1 text-sm text-green-700">
                        <Check className="h-4 w-4" />
                        {t("onboarding.time_range_created")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {step === 5 ? (
                  <button
                    type="button"
                    className="mt-3 text-sm text-gray-600 underline underline-offset-2"
                    onClick={() => router.push(`/grid/${encodeURIComponent(gridCode)}/settings`)}
                  >
                    {t("onboarding.go_to_settings")}
                  </button>
                ) : null}
              </motion.div>
            </AnimatePresence>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
            <div>
              {step === 2 ? (
                <button
                  type="button"
                  className="text-sm text-gray-500 underline underline-offset-2"
                  onClick={() => setStep(3)}
                >
                  {t("onboarding.skip")}
                </button>
              ) : step === 4 ? (
                <button
                  type="button"
                  className="text-sm text-gray-500 underline underline-offset-2"
                  onClick={completeAndHide}
                >
                  {t("onboarding.later")}
                </button>
              ) : <span />}
            </div>

            <div className="flex items-center gap-2">
              {step === 1 ? (
                <button
                  type="button"
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  onClick={() => setParticipantDialogOpen(true)}
                >
                  {t("onboarding.add_participant")}
                </button>
              ) : null}

              {step === 2 && timeRangeCount > 0 ? (
                <button
                  type="button"
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  onClick={() => setStep(3)}
                >
                  {t("common.next")}
                </button>
              ) : null}

              {step === 3 ? (
                <button
                  type="button"
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  onClick={() => setStep(4)}
                >
                  {t("onboarding.skip_for_now")}
                </button>
              ) : null}

              {step === 4 ? (
                <button
                  type="button"
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  onClick={() => void handleOpenCreateCell()}
                >
                  {t("onboarding.create_cell")}
                </button>
              ) : null}

              {step === 5 ? (
                <button
                  type="button"
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
                  onClick={completeAndHide}
                >
                  {t("onboarding.got_it")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <AddParticipantDialog
        gridId={gridId}
        open={participantDialogOpen}
        onOpenChange={setParticipantDialogOpen}
        onCreated={handleParticipantCreated}
      />

      <CreateCellDialog
        gridId={gridId}
        open={createCellDialogOpen}
        onOpenChange={(nextOpen) => {
          void handleCreateCellOpenChange(nextOpen);
        }}
      />
    </>
  );
}
