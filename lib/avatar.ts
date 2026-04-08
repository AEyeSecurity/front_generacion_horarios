import { CELL_COLOR_OPTIONS, CELL_TEXT_DARK } from "@/lib/cell-colors";

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
  const idx = hashString(seed) % CELL_COLOR_OPTIONS.length;
  return {
    background: CELL_COLOR_OPTIONS[idx],
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
