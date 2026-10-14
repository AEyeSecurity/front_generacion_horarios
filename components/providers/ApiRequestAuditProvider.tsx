"use client";

import { useEffect } from "react";

type RequestAuditApi = {
  reset: () => void;
  snapshot: () => Record<string, number>;
};

declare global {
  interface Window {
    __SHIFT_API_REQUEST_AUDIT__?: RequestAuditApi;
    __SHIFT_API_REQUEST_AUDIT_INSTALLED__?: boolean;
  }
}

const AUDITED_ENDPOINTS = [
  /^\/api\/units\/?$/,
  /^\/api\/cells\/?$/,
  /^\/api\/categories\/?$/,
  /^\/api\/time_ranges\/?$/,
  /^\/api\/grids\/[^/]+\/?$/,
  /^\/api\/grids\/[^/]+\/screen-context\/?$/,
  /^\/api\/grids\/[^/]+\/schedule\/history\/?$/,
];

function requestKey(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const method = String(init?.method ?? request?.method ?? "GET").toUpperCase();
  const rawUrl = request?.url ?? String(input);
  const url = new URL(rawUrl, window.location.origin);
  if (!AUDITED_ENDPOINTS.some((pattern) => pattern.test(url.pathname))) return null;
  return `${method} ${url.pathname.replace(/\/$/, "")}`;
}

export default function ApiRequestAuditProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || window.__SHIFT_API_REQUEST_AUDIT_INSTALLED__) return;

    const counts = new Map<string, number>();
    const originalFetch = window.fetch.bind(window);
    window.__SHIFT_API_REQUEST_AUDIT_INSTALLED__ = true;
    window.__SHIFT_API_REQUEST_AUDIT__ = {
      reset: () => counts.clear(),
      snapshot: () => Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    };

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const key = requestKey(input, init);
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        console.debug(`[api-audit] ${key}: ${counts.get(key)}`);
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
  }, []);

  return null;
}
