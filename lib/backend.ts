// lib/backend.ts
import { ApiError } from "./errors";
import { getAccessToken } from "./cookies";

const BASE = process.env.BACKEND_URL!;

async function doFetch(input: string, init?: RequestInit) {
  const res = await fetch(input, { ...init, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : (await res.text());
}

/** Llama al DRF con el access token si existe; si 401 -> lanza ApiError(401) */
export async function backendFetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const access = await getAccessToken();
  const headers: HeadersInit = {
    ...(init?.headers || {}),
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
  };
  return (await doFetch(`${BASE}${path}`, { ...init, headers })) as T;
}
