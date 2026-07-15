"use client";

import { toast } from "sonner";

export const NETWORK_OFFLINE_MESSAGE = "Sin conexión a internet";
export const SESSION_EXPIRED_MESSAGE = "Tu sesión ha expirado por inactividad";
export const SESSION_EXPIRED_EVENT = "shift:session-expired";
export const NETWORK_STATUS_EVENT = "shift:network-status";

let sessionExpiryHandling = false;
let offlineToastVisible = false;

export class NetworkOfflineError extends Error {
  constructor(message = NETWORK_OFFLINE_MESSAGE) {
    super(message);
    this.name = "NetworkOfflineError";
  }
}

export class SessionExpiredError extends Error {
  constructor(message = SESSION_EXPIRED_MESSAGE) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export function getIsOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function notifyOffline() {
  if (offlineToastVisible) return;
  offlineToastVisible = true;
  toast.error(NETWORK_OFFLINE_MESSAGE, {
    id: "network-offline",
    duration: Infinity,
  });
}

export function notifyOnline() {
  offlineToastVisible = false;
  toast.dismiss("network-offline");
}

export function dispatchNetworkStatus(isOnline: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NETWORK_STATUS_EVENT, { detail: { isOnline } }));
}

function buildLoginUrl() {
  if (typeof window === "undefined") return "/login";
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

async function clearAuthSession() {
  await fetch("/api/auth/logout", {
    method: "POST",
    cache: "no-store",
    redirect: "manual",
  }).catch(() => null);
}

export async function handleSessionExpired(options: { redirectWith?: (url: string) => void; redirect?: boolean } = {}) {
  if (sessionExpiryHandling) throw new SessionExpiredError();
  sessionExpiryHandling = true;
  toast.error(SESSION_EXPIRED_MESSAGE, { id: "session-expired" });
  await clearAuthSession();
  if (options.redirect !== false && typeof window !== "undefined") {
    const loginUrl = buildLoginUrl();
    if (options.redirectWith) {
      options.redirectWith(loginUrl);
    } else {
      window.location.assign(loginUrl);
    }
  }
  throw new SessionExpiredError();
}

export function dispatchSessionExpired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

function isNetworkFailure(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch|network/i.test(error.message));
}

export async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!getIsOnline()) {
    notifyOffline();
    throw new NetworkOfflineError();
  }

  try {
    return await fetch(input, init);
  } catch (error) {
    if (!getIsOnline() || isNetworkFailure(error)) {
      notifyOffline();
      throw new NetworkOfflineError();
    }
    throw error;
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await networkFetch(input, init);
  if (response.status === 401) {
    await handleSessionExpired();
  }
  return response;
}
