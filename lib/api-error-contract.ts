/** Preserve Django error envelopes across the BFF without translating on the server. */
export function apiErrorPayload(value: unknown, status: number): Record<string, unknown> {
  if (typeof value === "string") {
    try { return apiErrorPayload(JSON.parse(value), status); } catch { /* Non-JSON upstream failure. */ }
  }
  if (status >= 500) return { code: "UPSTREAM_UNAVAILABLE", detail: "The upstream service is unavailable.", params: {} };
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (typeof raw.code === "string") return { ...raw, params: raw.params ?? {} };
  if (typeof raw.error === "string") {
    try {
      const nested = JSON.parse(raw.error);
      if (nested && typeof nested === "object") return apiErrorPayload(nested, status);
    } catch { /* Legacy diagnostic; the status still supplies a stable fallback. */ }
  }
  const code = ({ 400: "VALIDATION_ERROR", 401: "AUTHENTICATION_REQUIRED", 403: "PERMISSION_DENIED", 404: "NOT_FOUND", 409: "CONFLICT", 429: "THROTTLED" } as Record<number, string>)[status] ?? "UNKNOWN_ERROR";
  return { ...raw, code, params: {}, detail: typeof raw.detail === "string" ? raw.detail : "Request failed." };
}
