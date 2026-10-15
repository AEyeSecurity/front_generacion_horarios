import { ERROR_EN } from "./api-error-translations";
import { t as translate, type I18nKey } from "./i18n";
import { readDocumentPreferredLanguage } from "./language";

export type ErrorTranslator = (key: I18nKey, params?: Record<string, string | number>) => string;
export type ApiErrorOptions = { locale?: unknown; translate?: ErrorTranslator; status?: number };
export type NormalizedApiError = { code: string; message: string; fields: Record<string, string[]> };

function translator(options: ApiErrorOptions): ErrorTranslator {
  return options.translate ?? ((key, params) => translate(options.locale ?? readDocumentPreferredLanguage(), key, params));
}

export function isKnownApiErrorCode(code: unknown): code is string {
  return typeof code === "string" && Object.hasOwn(ERROR_EN, `errors.${code}`);
}

function parameters(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "number" || typeof item === "string"));
}

const HTTP_CODES: Record<number, string> = {
  400: "VALIDATION_ERROR", 401: "AUTHENTICATION_REQUIRED", 403: "PERMISSION_DENIED",
  404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 429: "THROTTLED",
};

/** The sole API error decoder. Unknown diagnostics never leak HTML or server text. */
export function getApiError(payload: unknown, options: ApiErrorOptions = {}): NormalizedApiError {
  const t = translator(options);
  const fields: Record<string, string[]> = {};
  const render = (code: string, params?: unknown) => {
    const message = t(`errors.${code}` as I18nKey, parameters(params));
    // Legacy validators may not provide limits. Do not expose interpolation tokens.
    return /\{\w+\}/.test(message) ? t("errors.INVALID") : message;
  };
  const visit = (value: unknown, path = "", depth = 0): string[] => {
    if (depth > 12 || value == null) return [];
    if (value instanceof ApiError) return visit(value.payload, path, depth + 1);
    if (value instanceof LocalizedApiError) return [value.message];
    if (value instanceof TypeError) return [render("NETWORK_ERROR")];
    if (typeof value === "string") {
      try {
        const decoded = JSON.parse(value);
        if (decoded && typeof decoded === "object") return visit(decoded, path, depth + 1);
      } catch { /* Legacy, malformed and HTML bodies use a translated fallback. */ }
      if (path) {
        const messages = [render("INVALID")];
        fields[path] = [...(fields[path] ?? []), ...messages];
        return messages;
      }
      return [];
    }
    if (Array.isArray(value)) return value.flatMap((item) => visit(item, path || "non_field_errors", depth + 1));
    if (typeof value !== "object") return [];
    const raw = value as Record<string, unknown>;
    const code = raw.code ?? raw.type;
    if (isKnownApiErrorCode(code) && !(code === "VALIDATION_ERROR" && raw.fields)) {
      const messages = [render(code, raw.params ?? raw)];
      if (path) fields[path] = [...(fields[path] ?? []), ...messages];
      return messages;
    }
    if (raw.fields && typeof raw.fields === "object") {
      return Object.entries(raw.fields).flatMap(([key, entry]) => visit(entry, path ? `${path}.${key}` : key, depth + 1));
    }
    if (raw.code || raw.type) return [];
    // Legacy DRF field containers, arrays and JSON encoded BFF error bodies.
    // This does not match English sentences or display unknown backend details.
    return Object.entries(raw).flatMap(([key, entry]) => {
      if (["code", "type", "params", "status", "traceback", "error_real"].includes(key)) return [];
      return visit(entry, ["detail", "error", "message"].includes(key) ? path : path ? `${path}.${key}` : key, depth + 1);
    });
  };
  const messages = [...new Set(visit(payload))];
  const status = options.status ?? (payload instanceof ApiError ? payload.status : undefined);
  let code = status && status >= 500 ? "UNEXPECTED_ERROR" : HTTP_CODES[status ?? 0] ?? "UNKNOWN_ERROR";
  if (payload instanceof TypeError) code = "NETWORK_ERROR";
  if (payload && typeof payload === "object" && "code" in payload && isKnownApiErrorCode(payload.code)) code = payload.code;
  return { code, message: messages.join("\n") || render(code), fields };
}

export function normalizeApiError(payload: unknown, fallback = "", options: ApiErrorOptions = {}): string {
  const result = getApiError(payload, options);
  // A caller's already-localized contextual message is useful for unrecognized
  // legacy responses. Known codes and structured fields always take precedence.
  if (result.code === "UNKNOWN_ERROR" && !Object.keys(result.fields).length && result.message === translator(options)("errors.UNKNOWN_ERROR")) {
    return fallback || result.message;
  }
  return result.message;
}

export class LocalizedApiError extends Error {}

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(normalizeApiError(payload, "", { status }));
    this.name = "ApiError";
  }
}
