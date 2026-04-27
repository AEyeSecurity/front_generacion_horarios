export function readGridTierEnabled(raw: unknown, fallback = true): boolean {
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Record<string, unknown>;
  const candidates = [
    source.tier_enable,
    source.tier_enabled,
    source.tiers_enabled,
    source.tiers_enable,
    source.tiers,
    (source.settings as Record<string, unknown> | undefined)?.tier_enable,
    (source.settings as Record<string, unknown> | undefined)?.tier_enabled,
    (source.settings as Record<string, unknown> | undefined)?.tiers_enabled,
  ];

  for (const value of candidates) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }
  }
  return fallback;
}

