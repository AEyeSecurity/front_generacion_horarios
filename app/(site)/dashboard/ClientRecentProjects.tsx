"use client";

import { useEffect, useState } from "react";
import RecentProjects from "@/components/dashboard/RecentProjects";
import PanelAsyncState from "@/components/ui/PanelAsyncState";
import { useI18n } from "@/lib/use-i18n";

interface ClientRecentProjectsProps {
  meId: any;
}

export default function ClientRecentProjects({ meId }: ClientRecentProjectsProps) {
  const { t } = useI18n();
  const [grids, setGrids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/grids", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: any) => {
        const normalized = Array.isArray(data) ? data : (data.results ?? []);
        setGrids(normalized);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-base font-semibold whitespace-nowrap">{t("recent_projects.title")}</div>
        <PanelAsyncState
          isLoading
          isEmpty={false}
          loadingLabel={t("recent_projects.loading")}
          mode="plain"
          spinnerSize="md"
          className="min-h-[220px]"
        >
          {null}
        </PanelAsyncState>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-base font-semibold whitespace-nowrap">{t("recent_projects.title")}</div>
        <div className="min-h-[220px] rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-600">
          {t("recent_projects.error_loading", { code: error })}
        </div>
      </div>
    );
  }

  return <RecentProjects meId={meId} initialItems={grids} />;
}
