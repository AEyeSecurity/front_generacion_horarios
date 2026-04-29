// lib/backend.ts
import { ApiError } from "./errors";
import { getAccessToken, getRefreshToken } from "./cookies";
import { getApiBaseUrl } from "./api-base";

const BASE = getApiBaseUrl();

async function readDataOrThrow(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : (await res.text());
}

/** Llama al DRF con el access token si existe; si 401 -> lanza ApiError(401) */
export async function backendFetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const callWithAccess = async (access: string | null) => {
    const headers: HeadersInit = {
      ...(init?.headers || {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    };
    return fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
  };

  let access = await getAccessToken();
  let response = await callWithAccess(access ?? null);

  if (response.status === 401) {
    const refresh = await getRefreshToken();
    if (refresh) {
      const refreshResponse = await fetch(`${BASE}/api/auth/refresh/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh }),
        cache: "no-store",
      });
      if (refreshResponse.ok) {
        const tokens = (await refreshResponse.json().catch(() => ({}))) as { access?: string };
        if (typeof tokens.access === "string" && tokens.access) {
          access = tokens.access;
          response = await callWithAccess(access);
        }
      }
    }
  }

  return (await readDataOrThrow(response)) as T;
}



