import { normalizeApiError, type ErrorTranslator } from "./api-errors";

export function getGuidedAuthErrorMessage(
  payload: unknown,
  status: number,
  t: ErrorTranslator,
  context: "login" | "register" | "password_reset" | "password_change",
): string {
  const fallback = context === "login" ? t("auth.error.login_failed_guidance")
    : context === "password_reset" ? t("auth.could_not_reset_password")
    : context === "password_change" ? t("password_change.could_not_change_password")
    : t("auth.error.register_failed_guidance");
  return normalizeApiError(payload, fallback, { status, translate: t });
}
