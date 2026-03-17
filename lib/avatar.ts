type AvatarUserLike = {
  id?: number | string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  avatar?: string | null;
  image?: string | null;
  avatarUrl?: string | null;
};

const CELL_BG_COLORS = [
  "#E7180B",
  "#FF692A",
  "#FE9A37",
  "#FDC745",
  "#7CCF35",
  "#31C950",
  "#37BC7D",
  "#36BBA7",
  "#3BB8DB",
  "#34A6F4",
  "#2B7FFF",
  "#615FFF",
  "#8E51FF",
  "#AD46FF",
  "#E12AFB",
  "#F6339A",
  "#FF2056",
] as const;

const CELL_TEXT_DARK = [
  "#460809",
  "#441306",
  "#461901",
  "#432004",
  "#192E03",
  "#032E15",
  "#012C22",
  "#022F2E",
  "#053345",
  "#052F4A",
  "#162456",
  "#1E1A4D",
  "#2F0D68",
  "#3C0366",
  "#4B004F",
  "#510424",
  "#4D0218",
] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getAvatarSource(user: AvatarUserLike) {
  return user.avatar_url || user.avatar || user.image || user.avatarUrl || null;
}

export function getAvatarSeed(user: AvatarUserLike) {
  if (user.id !== undefined && user.id !== null) return String(user.id);
  if (user.email) return user.email;
  if (user.name) return user.name;
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "unknown-user";
}

export function getAvatarPalette(seed: string) {
  const idx = hashString(seed) % CELL_BG_COLORS.length;
  return {
    background: CELL_BG_COLORS[idx],
    text: CELL_TEXT_DARK[idx],
  };
}

export function getAvatarDisplayName(user: AvatarUserLike) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.name) return user.name;
  return user.email || "User";
}

export function getAvatarInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
