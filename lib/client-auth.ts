"use client";

export class AuthExpiredError extends Error {
  constructor(message = "Your session expired. Please sign in again.") {
    super(message);
  }
}

function buildNextFromLocation() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = buildNextFromLocation();
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const execute = () => fetch(input, init);
  let res = await execute();
  if (res.status !== 401) return res;

  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/api/auth/refresh")) {
    redirectToLogin();
    throw new AuthExpiredError();
  }

  const refreshRes = await fetch("/api/auth/refresh", {
    method: "POST",
    cache: "no-store",
  });
  if (!refreshRes.ok) {
    redirectToLogin();
    throw new AuthExpiredError();
  }

  res = await execute();
  if (res.status === 401) {
    redirectToLogin();
    throw new AuthExpiredError();
  }
  return res;
}
