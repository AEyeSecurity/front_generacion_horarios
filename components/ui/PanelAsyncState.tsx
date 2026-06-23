"use client";

import type { ReactNode } from "react";
import EmptyState from "@/components/ui/EmptyState";
import ShiftSpinner from "@/components/ui/ShiftSpinner";

type PanelAsyncStateProps = {
  isLoading: boolean;
  isEmpty: boolean;
  loadingLabel?: string;
  emptyMessage?: ReactNode;
  mode?: "panel" | "plain";
  spinnerSize?: "sm" | "md" | "lg";
  emptySize?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
};

export default function PanelAsyncState({
  isLoading,
  isEmpty,
  loadingLabel,
  emptyMessage,
  mode = "panel",
  spinnerSize = "md",
  emptySize = "md",
  className = "",
  children,
}: PanelAsyncStateProps) {
  if (isLoading) {
    return (
      <div className={`flex min-h-[180px] items-center justify-center ${className}`}>
        <ShiftSpinner size={spinnerSize} label={loadingLabel} />
      </div>
    );
  }

  if (isEmpty) {
    return <EmptyState mode={mode} size={emptySize} message={emptyMessage ?? ""} className={className} />;
  }

  return <>{children}</>;
}
