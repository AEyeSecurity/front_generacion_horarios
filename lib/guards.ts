import type { Role } from "./types";

// jerarquía: supervisor > editor > viewer
const order: Record<Role, number> = { viewer: 1, editor: 2, supervisor: 3 };

export function hasAtLeast(role: Role, required: Role) {
  return order[role] >= order[required];
}
