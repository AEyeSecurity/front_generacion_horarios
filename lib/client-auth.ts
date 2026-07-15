"use client";

import { dispatchSessionExpired, networkFetch } from "@/lib/network-auth";

export class AuthExpiredError extends Error {
  constructor(message = "Tu sesión ha expirado por inactividad") {
    super(message);
  }
}

async function expireSession(): Promise<never> {
  dispatchSessionExpired();
  throw new AuthExpiredError();
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const execute = () => networkFetch(input, init);
  let res = await execute();
  if (res.status !== 401) return res;

  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/api/auth/refresh")) {
    return expireSession();
  }

  const refreshRes = await networkFetch("/api/auth/refresh", {
    method: "POST",
    cache: "no-store",
  });
  if (!refreshRes.ok) {
    return expireSession();
  }

  res = await execute();
  if (res.status === 401) {
    return expireSession();
  }
  return res;
}
