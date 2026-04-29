"use client";

import type { ReactNode } from "react";

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
    <div className="flex-1 border rounded bg-white p-2 overflow-y-auto">
      {loading ? (
        <div className="text-sm text-gray-500 p-3">{loadingLabel}</div>
      ) : empty ? (
        <div className="text-sm text-gray-500 p-3">{emptyLabel}</div>
      ) : (
        children
      )}
    </div>
  );
}
