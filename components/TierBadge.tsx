"use client";

export type Tier = "PRIMARY" | "SECONDARY" | "TERTIARY";

export const TIER_STYLES: Record<Tier, { label: string; border: string; text: string; shadow: string }> = {
  PRIMARY: {
    label: "PRI",
    border: "#E0A800",
    text: "#E0A800",
    shadow: "#FFF1B8",
  },
  SECONDARY: {
    label: "SEC",
    border: "#8A8A8A",
    text: "#7A7A7A",
    shadow: "#E5E5E5",
  },
  TERTIARY: {
    label: "TER",
    border: "#C2411C",
    text: "#C2411C",
    shadow: "#F6C7BC",
  },
};

export const TIER_FILTER_LABELS: Record<Tier, string> = {
  PRIMARY: "1°",
  SECONDARY: "2°",
  TERTIARY: "3°",
};

export function TierBadge({
  tier,
  compact = false,
  className,
}: {
  tier?: Tier;
  compact?: boolean;
  className?: string;
}) {
  if (!tier || !TIER_STYLES[tier]) return null;
  const style = TIER_STYLES[tier];

  return (
    <div
      className={[
        "inline-flex items-center justify-center border-2 bg-white text-center font-semibold whitespace-nowrap",
        compact
          ? "h-8 min-w-[76px] rounded-[14px] px-3 text-[11px] tracking-[0.22em]"
          : "h-9 min-w-[88px] rounded-[16px] px-4 text-[13px] tracking-[0.28em]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderColor: style.border,
        color: style.text,
        textShadow: `0 0 6px ${style.shadow}`,
      }}
    >
      {style.label}
    </div>
  );
}

export function TierFilterChip({ tier, className }: { tier: Tier; className?: string }) {
  const style = TIER_STYLES[tier];

  return (
    <div
      className={[
        "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-[11px] font-semibold leading-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderColor: style.border,
        color: style.text,
        textShadow: `0 0 6px ${style.shadow}`,
      }}
    >
      {TIER_FILTER_LABELS[tier]}
    </div>
  );
}

export function AllTierLabel({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={[
        "font-semibold uppercase text-gray-600",
        compact ? "text-[11px] tracking-[0.16em]" : "text-xs tracking-[0.16em]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      All
    </span>
  );
}
