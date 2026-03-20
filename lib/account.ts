type AccountUser = {
  auth_provider?: string | null;
  provider?: string | null;
  login_provider?: string | null;
  social_provider?: string | null;
  oauth_provider?: string | null;
  social_account_provider?: string | null;
  social_login_provider?: string | null;
  providers?: Array<string | null | undefined> | null;
  is_google_account?: boolean | null;
  is_google?: boolean | null;
  is_google_user?: boolean | null;
  google_account?: boolean | null;
  is_social_account?: boolean | null;
  is_oauth?: boolean | null;
  google_id?: string | null;
  google_sub?: string | null;
  sub?: string | null;
  avatar_url?: string | null;
  avatar?: string | null;
  image?: string | null;
  avatarUrl?: string | null;
  can_change_password?: boolean | null;
  has_usable_password?: boolean | null;
  has_password?: boolean | null;
  password_set?: boolean | null;
};

function normalizedProvider(user: AccountUser): string {
  const raw =
    user?.auth_provider ??
    user?.provider ??
    user?.login_provider ??
    user?.social_provider ??
    user?.oauth_provider ??
    user?.social_account_provider ??
    user?.social_login_provider ??
    "";
  return String(raw).trim().toLowerCase();
}

function providersIncludeGoogle(user: AccountUser): boolean {
  if (!Array.isArray(user.providers)) return false;
  return user.providers.some((p) => String(p ?? "").toLowerCase().includes("google"));
}

function hasGoogleAvatarHost(user: AccountUser): boolean {
  const candidates = [user.avatar_url, user.avatar, user.image, user.avatarUrl];
  return candidates.some((v) => {
    const raw = String(v ?? "").trim().toLowerCase();
    return raw.includes("googleusercontent.com") || raw.includes("googleapis.com");
  });
}

export function isGoogleAccount(user: AccountUser | null | undefined): boolean {
  if (!user) return false;

  if (typeof user.is_google_account === "boolean") return user.is_google_account;
  if (typeof user.is_google === "boolean") return user.is_google;
  if (typeof user.is_google_user === "boolean") return user.is_google_user;
  if (typeof user.google_account === "boolean") return user.google_account;
  if (typeof user.is_social_account === "boolean" && user.is_social_account) return true;
  if (typeof user.is_oauth === "boolean" && user.is_oauth) return true;

  const provider = normalizedProvider(user);
  if (provider.includes("google")) return true;
  if (providersIncludeGoogle(user)) return true;
  if (user.google_id || user.google_sub) return true;
  if (typeof user.sub === "string" && user.sub.startsWith("google-")) return true;
  if (hasGoogleAvatarHost(user)) return true;

  return false;
}

export function canChangePassword(user: AccountUser | null | undefined): boolean {
  if (!user) return false;

  if (typeof user.can_change_password === "boolean") return user.can_change_password;
  if (typeof user.has_usable_password === "boolean") return user.has_usable_password;
  if (typeof user.has_password === "boolean") return user.has_password;
  if (typeof user.password_set === "boolean") return user.password_set;

  return !isGoogleAccount(user);
}
