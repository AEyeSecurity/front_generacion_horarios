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

type CachedSolverRun = { run: SolverRunState; fetchedAt: number };

const INITIAL_CACHE_TTL_MS = 5_000;
const ACTIVE_RUN_POLL_MS = 3_000;
const solverRunCache = new Map<string, CachedSolverRun>();
const solverRunInflight = new Map<string, Promise<SolverRunState>>();

function validateSolverRun(gridId: string | number, value: unknown): SolverRunState {
  const run = value as SolverRunState;
  if (
    !run ||
    String(run.grid) !== String(gridId) ||
    !["idle", "running", "ready", "failed", "chosen", "rejected"].includes(run.state)
  ) {
    throw new Error("Invalid run status");
  }
  return run;
}

async function requestSolverRun(gridId: string | number): Promise<SolverRunState> {
  const key = String(gridId);
  const pending = solverRunInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const response = await authFetch(`/api/grids/${encodeURIComponent(key)}/solve-candidates`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Run status unavailable");
    const run = validateSolverRun(gridId, await response.json());
    solverRunCache.set(key, { run, fetchedAt: Date.now() });
    return run;
  })().finally(() => {
    if (solverRunInflight.get(key) === request) solverRunInflight.delete(key);
  });

  solverRunInflight.set(key, request);
  return request;
}

function readFreshSolverRun(gridId: string | number): SolverRunState | null {
  const cached = solverRunCache.get(String(gridId));
  if (!cached || Date.now() - cached.fetchedAt > INITIAL_CACHE_TTL_MS) return null;
  return cached.run;
}

/** Server state is shared across users. Only an explicitly running solve is polled. */
export function useSolverRun(gridId: string | number, enabled: boolean) {
  const gridKey = String(gridId);
  const [snapshot, setSnapshot] = useState<{ grid: string; run: SolverRunState } | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const request = ++sequence.current;
    try {
      const run = await requestSolverRun(gridId);
      if (request !== sequence.current) return null;
      setSnapshot({ grid: gridKey, run });
      setDisconnected(false);
      return run;
    } catch {
      if (request === sequence.current) setDisconnected(true);
      return null;
    }
  }, [enabled, gridId, gridKey]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const loadInitial = async () => {
      const cached = readFreshSolverRun(gridId);
      if (!cached) {
        await refresh();
        return;
      }
      // Keep cached hydration asynchronous, like the network-backed path.
      await Promise.resolve();
      if (!active) return;
      setSnapshot({ grid: gridKey, run: cached });
      setDisconnected(false);
    };
    void loadInitial();
    return () => {
      active = false;
      sequence.current += 1;
    };
  }, [enabled, gridId, gridKey, refresh]);

  const run = snapshot?.grid === gridKey ? snapshot.run : null;

  useEffect(() => {
    if (!enabled || run?.state !== "running") return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearTimer();
      if (active && document.visibilityState === "visible") {
        timer = setTimeout(() => void poll(), ACTIVE_RUN_POLL_MS);
      }
    };
    const poll = async () => {
      if (!active || document.visibilityState !== "visible") return;
      const latest = await refresh();
      if (active && latest?.state === "running") schedule();
    };
    const wake = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
        return;
      }
      void poll();
    };

    schedule();
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      active = false;
      clearTimer();
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, refresh, run?.state]);

  return { run, disconnected, checking: enabled && !run, refresh };
}
