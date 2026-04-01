"use client";

import type { ReactNode } from "react";

type PanelShellProps = {
  title: string;
  error?: string | null;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function PanelShell({ title, error, controls, children, className = "" }: PanelShellProps) {
  return (
    <div className={`flex flex-col h-full space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {controls}
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {children}
    </div>
  );
}

