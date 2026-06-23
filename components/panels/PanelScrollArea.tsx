"use client";

import type { ReactNode } from "react";
import PanelAsyncState from "@/components/ui/PanelAsyncState";

type PanelScrollAreaProps = {
  loading: boolean;
  empty: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  children: ReactNode;
};

export default function PanelScrollArea({
  loading,
  empty,
  loadingLabel = "Loading...",
  emptyLabel = "No items found",
  children,
}: PanelScrollAreaProps) {
  return (
    <div className="flex-1 min-h-0 border rounded bg-white p-2 overflow-y-auto">
      <PanelAsyncState
        isLoading={loading}
        isEmpty={empty}
        loadingLabel={loadingLabel}
        emptyMessage={emptyLabel}
        mode="panel"
        spinnerSize="md"
        emptySize="md"
      >
        {children}
      </PanelAsyncState>
    </div>
  );
}
