// lib/auth.ts

import { redirect } from "next/navigation";
import { backendFetchJSON } from "./backend";
import { ApiError } from "./errors";
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

export function isAuthApiError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export async function requireUserOrRedirect(nextPath: string): Promise<User> {
  const me = await getCurrentUser();
  if (!me) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return me;
}
