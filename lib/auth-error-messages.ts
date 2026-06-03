import type { I18nKey } from "@/lib/i18n";

type Translate = (key: I18nKey) => string;

function collectErrorText(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return collectErrorText(JSON.parse(trimmed), depth + 1);
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectErrorText(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectErrorText(item, depth + 1));
  }
  return [String(value)];
}

function uniqueLines(lines: string[]) {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

export function getGuidedAuthErrorMessage(
  payload: unknown,
  status: number,
  t: Translate,
  context: "login" | "register" | "password_reset" | "password_change",
): string {
  const lines = uniqueLines(collectErrorText(payload));
  const text = lines.join(" ").toLowerCase();

  if (
    status === 401 ||
    text.includes("no active account found") ||
    text.includes("given credentials") ||
    text.includes("invalid credentials")
  ) {
    return t("auth.error.invalid_credentials");
  }
  if (text.includes("inactive") || text.includes("not active")) {
    return t("auth.error.account_inactive");
  }
  if (text.includes("confirmation does not match") || text.includes("passwords do not match")) {
    return t("auth.passwords_do_not_match");
  }
  if (text.includes("already exists") || text.includes("email already") || text.includes("user with this email")) {
    return t("auth.error.email_exists");
  }
  if (text.includes("valid email") || text.includes("invalid email")) {
    return t("auth.error.email_invalid");
  }
  if (
    context !== "login" &&
    lines.length > 0 &&
    (text.includes("too short") ||
      text.includes("minimum length") ||
      text.includes("at least") ||
      text.includes("too common") ||
      text.includes("entirely numeric") ||
      text.includes("only numeric"))
  ) {
    return lines.join("\n");
  }
  if (text.includes("too short") || text.includes("minimum length") || text.includes("at least")) {
    return t("auth.error.password_too_short");
  }
  if (text.includes("too common")) {
    return t("auth.error.password_too_common");
  }
  if (text.includes("entirely numeric") || text.includes("only numeric")) {
    return t("auth.error.password_numeric");
  }
  if (text.includes("required") || text.includes("blank") || text.includes("empty")) {
    return t("auth.error.required_fields");
  }

  if (context !== "login" && lines.length > 0) {
    return lines.join("\n");
  }

  if (context === "login") return t("auth.error.login_failed_guidance");
  if (context === "password_reset") return t("auth.could_not_reset_password");
  if (context === "password_change") return t("password_change.could_not_change_password");
  return t("auth.error.register_failed_guidance");
}
