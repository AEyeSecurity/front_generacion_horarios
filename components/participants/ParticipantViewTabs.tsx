"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DEFAULT_UNIT_NOOVERLAP_ENABLED,
  getGridSolverSettingsKey,
  parseGridSolverSettings,
} from "@/lib/grid-solver-settings";

type Props = {
  gridId: number;
  gridBase: string;
  participantId: string | number;
  view: "rules" | "schedule";
};

export default function ParticipantViewTabs({
  gridId,
  gridBase,
  participantId,
  view,
}: Props) {
  const router = useRouter();
  const [showScheduleTab, setShowScheduleTab] = useState(DEFAULT_UNIT_NOOVERLAP_ENABLED);

  useEffect(() => {
    const readSettings = () => {
      try {
        const key = getGridSolverSettingsKey(gridId);
        const parsed = parseGridSolverSettings(window.localStorage.getItem(key));
        const enabled =
          typeof parsed.unit_nooverlap_enabled === "boolean"
            ? parsed.unit_nooverlap_enabled
            : DEFAULT_UNIT_NOOVERLAP_ENABLED;
        setShowScheduleTab(enabled);
      } catch {
        setShowScheduleTab(DEFAULT_UNIT_NOOVERLAP_ENABLED);
      }
    };

    const onStorage = (event: StorageEvent) => {
      const key = getGridSolverSettingsKey(gridId);
      if (event.key === key) readSettings();
    };

    readSettings();
    window.addEventListener("focus", readSettings);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", readSettings);
      window.removeEventListener("storage", onStorage);
    };
  }, [gridId]);

  useEffect(() => {
    if (!showScheduleTab && view === "schedule") {
      router.replace(`${gridBase}/participants/${participantId}`);
    }
  }, [gridBase, participantId, router, showScheduleTab, view]);

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`${gridBase}/participants/${participantId}`}
        className={`px-3 py-1.5 rounded-full text-sm border ${
          view === "rules" ? "bg-black text-white" : "bg-white"
        }`}
      >
        Availability
      </Link>
      {showScheduleTab && (
        <Link
          href={`${gridBase}/participants/${participantId}?view=schedule`}
          className={`px-3 py-1.5 rounded-full text-sm border ${
            view === "schedule" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Schedule
        </Link>
      )}
    </div>
  );
}
