"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "./client-auth";

export type SolverRunState = {
  grid: number;
  state: "idle" | "running" | "ready" | "failed" | "chosen" | "rejected";
  run_id?: number;
  created_at?: string;
  created_by_id?: number;
  created_by_name?: string;
  failure_code?: string;
  [key: string]: unknown;
};

/** Server state is shared across users. Connectivity loss never resolves a run. */
export function useSolverRun(gridId: string | number, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{ grid: string; run: SolverRunState } | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!enabled || !signal || signal.aborted) return null;
    const request = ++sequence.current;
    try {
      const response = await authFetch(`/api/grids/${gridId}/solve-candidates`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Run status unavailable");
      const run = await response.json() as SolverRunState;
      if (String(run.grid) !== String(gridId) || !["idle", "running", "ready", "failed", "chosen", "rejected"].includes(run.state)) {
        throw new Error("Invalid run status");
      }
      if (signal.aborted || request !== sequence.current) return null;
      setSnapshot({ grid: String(gridId), run });
      setDisconnected(false);
      return run;
    } catch {
      if (!signal.aborted && request === sequence.current) setDisconnected(true);
      return null;
    }
  }, [enabled, gridId]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    };
    if (enabled) void poll();
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, refresh]);

  const run = snapshot?.grid === String(gridId) ? snapshot.run : null;
  return { run, disconnected, checking: enabled && !run, refresh };
}
