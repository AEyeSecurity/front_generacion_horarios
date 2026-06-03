"use client";

import type { I18nKey } from "@/lib/i18n";

type Translate = (key: I18nKey) => string;

export type PasswordPolicyState = {
  minLength: boolean;
  number: boolean;
  lowercase: boolean;
  uppercase: boolean;
  valid: boolean;
};

export function getPasswordPolicyState(password: string): PasswordPolicyState {
  const state = {
    minLength: password.length >= 8,
    number: /\d/.test(password),
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
  };
  return {
    ...state,
    valid: state.minLength && state.number && state.lowercase && state.uppercase,
  };
}

export function PasswordPolicyChecklist({
  password,
  t,
}: {
  password: string;
  t: Translate;
}) {
  const state = getPasswordPolicyState(password);
  const items: Array<{ key: keyof Omit<PasswordPolicyState, "valid">; label: I18nKey }> = [
    { key: "minLength", label: "auth.password_rule_min_8" },
    { key: "number", label: "auth.password_rule_number" },
    { key: "lowercase", label: "auth.password_rule_lowercase" },
    { key: "uppercase", label: "auth.password_rule_uppercase" },
  ];

  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="mb-1 text-xs font-medium text-gray-700">{t("auth.password_requirements")}</div>
      <ul className="grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
        {items.map((item) => {
          const passed = state[item.key];
          return (
            <li key={item.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${passed ? "bg-green-600" : "bg-gray-300"}`}
              />
              <span className={passed ? "text-green-700" : ""}>{t(item.label)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
