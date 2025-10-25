// lib/auth.ts
"use server";

import { backendFetchJSON } from "./backend";
import type { User } from "./types";

export async function getCurrentUser(): Promise<User | null> {
  try {
    const me = await backendFetchJSON<User>("/api/auth/whoami/");
    return me;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const me = await getCurrentUser();
  if (!me) throw new Error("UNAUTHENTICATED");
  return me;
}
