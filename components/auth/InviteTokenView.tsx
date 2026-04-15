"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/use-i18n";

type Id = number | string;

type UserRef = {
  id: Id | null;
  email: string | null;
};

type GridRef = {
  id: Id | null;
  name: string | null;
  grid_code: string | null;
};

type ParticipantRef = {
  id: Id | null;
  name: string | null;
  surname: string | null;
};

type ResolveData = {
  grid_name: string | null;
  grid_id: Id | null;
  grid: GridRef | null;
  grid_code: string | null;
  role: string | null;
  type: string | null;
  message: string | null;
  status: string | null;
  active: boolean | null;
  expires_at: string | null;
  email: string | null;
  to_email: string | null;
  to_user_email: string | null;
  recipient_email: string | null;
  to_user_id: Id | null;
  to_user: UserRef | null;
  recipient_id: Id | null;
  recipient: UserRef | null;
  participant_id: Id | null;
  participant: ParticipantRef | null;
};

type WhoAmI = {
  id: Id | null;
  email: string | null;
};

type MembershipListItem = {
  user_id: Id | null;
  user_email: string | null;
  user: UserRef | null;
};

type StatusBadge = {
  label: string;
  className: string;
};
type InviteStatusKey =
  | "invite_token.accepted"
  | "invite_token.declined"
  | "invite_token.expired"
  | "invite_token.cancelled"
  | "invite_token.pending";

const AUTO_JOIN_STORAGE_KEY = "invite_auto_join_token";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readId(value: unknown): Id | null {
  if (typeof value === "number" || typeof value === "string") return value;
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeUserRef(value: unknown): UserRef | null {
  const raw = asObject(value);
  if (!raw) return null;
  const id = readId(raw.id);
  const email = readString(raw.email);
  if (id == null && !email) return null;
  return { id, email };
}

function normalizeGridRef(value: unknown): GridRef | null {
  const raw = asObject(value);
  if (!raw) return null;
  const id = readId(raw.id);
  const name = readString(raw.name);
  const gridCode = readString(raw.grid_code);
  if (id == null && !name && !gridCode) return null;
  return {
    id,
    name,
    grid_code: gridCode,
  };
}

function normalizeParticipantRef(value: unknown): ParticipantRef | null {
  const raw = asObject(value);
  if (!raw) return null;
  const id = readId(raw.id);
  const name = readString(raw.name);
  const surname = readString(raw.surname);
  if (id == null && !name && !surname) return null;
  return {
    id,
    name,
    surname,
  };
}

function statusBadgeFromValue(status: unknown, t: (key: InviteStatusKey) => string): StatusBadge {
  const raw = String(status ?? "").toLowerCase().trim();
  if (raw === "accepted") {
    return { label: t("invite_token.accepted"), className: "text-green-700 bg-green-50 border border-green-200" };
  }
  if (raw === "declined" || raw === "rejected") {
    return { label: t("invite_token.declined"), className: "text-red-700 bg-red-50 border border-red-200" };
  }
  if (raw === "expired") {
    return { label: t("invite_token.expired"), className: "text-yellow-700 bg-yellow-50 border border-yellow-200" };
  }
  if (raw === "cancelled" || raw === "canceled") {
    return { label: t("invite_token.cancelled"), className: "text-orange-700 bg-orange-50 border border-orange-200" };
  }
  return { label: t("invite_token.pending"), className: "text-gray-700 bg-gray-100 border border-gray-200" };
}

function normalizeResolveData(data: unknown): ResolveData {
  const raw = asObject(data) ?? {};
  const grid = normalizeGridRef(raw.grid);
  const toUser = normalizeUserRef(raw.to_user);
  const recipient = normalizeUserRef(raw.recipient);
  const participant = normalizeParticipantRef(raw.participant);
  return {
    grid_name: readString(raw.grid_name),
    grid_id: readId(raw.grid_id),
    grid,
    grid_code: readString(raw.grid_code),
    role: readString(raw.role),
    type: readString(raw.type),
    message: readString(raw.message),
    status: readString(raw.status),
    active: readBoolean(raw.active),
    expires_at: readString(raw.expires_at),
    email: readString(raw.email),
    to_email: readString(raw.to_email),
    to_user_email: readString(raw.to_user_email),
    recipient_email: readString(raw.recipient_email),
    to_user_id: readId(raw.to_user_id),
    to_user: toUser,
    recipient_id: readId(raw.recipient_id),
    recipient,
    participant_id: readId(raw.participant_id),
    participant,
  };
}

type AcceptResponse = {
  error: string | null;
  detail: string | null;
  grid_code: string | null;
  membership: {
    grid_id: Id | null;
    grid_code: string | null;
  } | null;
};

function normalizeAcceptResponse(data: unknown): AcceptResponse {
  const raw = asObject(data) ?? {};
  const membershipRaw = asObject(raw.membership);
  return {
    error: readString(raw.error),
    detail: readString(raw.detail),
    grid_code: readString(raw.grid_code),
    membership: membershipRaw
      ? {
          grid_id: readId(membershipRaw.grid_id),
          grid_code: readString(membershipRaw.grid_code),
        }
      : null,
  };
}

function normalizeWhoAmI(data: unknown): WhoAmI {
  const raw = asObject(data) ?? {};
  return {
    id: readId(raw.id),
    email: readString(raw.email),
  };
}

function normalizeMembershipList(data: unknown): MembershipListItem[] {
  const dataObj = asObject(data);
  const rawList = Array.isArray(data)
    ? data
    : dataObj && Array.isArray(dataObj.results)
      ? dataObj.results
      : [];
  return rawList.map((item) => {
    const raw = asObject(item) ?? {};
    const user = normalizeUserRef(raw.user);
    return {
      user_id: readId(raw.user_id),
      user_email: readString(raw.user_email),
      user,
    } satisfies MembershipListItem;
  });
}

function hasRenderableResolveInfo(data: ResolveData): boolean {
  return Boolean(
    data.status ||
      data.grid_name ||
      data.grid?.name ||
      data.role ||
      data.type ||
      data.message ||
      data.expires_at,
  );
}

function statusLowercase(value: string | null): string {
  return String(value ?? "").toLowerCase();
}

function resolveErrorMessage(raw: unknown, fallback: string): string {
  const obj = asObject(raw);
  const error = obj ? readString(obj.error) : null;
  const detail = obj ? readString(obj.detail) : null;
  return error || detail || fallback;
}

function resolveInactiveError(raw: unknown): boolean {
  const obj = asObject(raw);
  const message = String((obj ? readString(obj.error) : null) ?? (obj ? readString(obj.detail) : null) ?? "").toLowerCase();
  return message.includes("inactive");
}

function gridTargetFromResolved(data: ResolveData | null): { code: string | null; id: number | string | null } {
  if (!data) return { code: null, id: null };
  return {
    code: data.grid_code ?? data.grid?.grid_code ?? null,
    id: data.grid_id,
  };
}

function invitedEmailFromResolved(resolved: ResolveData | null): string {
  if (!resolved) return "";
  return normalizeEmail(
    resolved.email ??
      resolved.to_email ??
      resolved.to_user_email ??
      resolved.recipient_email ??
      resolved.to_user?.email ??
      resolved.recipient?.email ??
      ""
  );
}

export default function InviteTokenView({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveData | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [meId, setMeId] = useState<string>("");
  const [meEmail, setMeEmail] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigateToGrid = useCallback(
    async (codeLike: string | number | null | undefined, idLike: string | number | null | undefined) => {
      let code = codeLike != null ? String(codeLike).trim() : "";
      const rawId = idLike != null ? String(idLike).trim() : "";
      if (!code && idLike != null) {
        try {
          if (rawId) {
            const r = await fetch(`/api/grids/${encodeURIComponent(rawId)}`, { cache: "no-store" });
            if (r.ok) {
              const gRaw = await r.json().catch(() => null);
              const g = asObject(gRaw);
              const gridCode = g ? readString(g.grid_code) : null;
              if (gridCode) code = gridCode.trim();
            }
          }
        } catch {}
      }
      if (!code) return false;
      router.replace(`/grid/${encodeURIComponent(code)}`);
      router.refresh();
      return true;
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/whoami", { cache: "no-store" });
        if (!cancelled) {
          setIsAuthenticated(r.ok);
          if (r.ok) {
            const me = normalizeWhoAmI(await r.json().catch(() => null));
            setMeId(me.id != null ? String(me.id) : "");
            setMeEmail(normalizeEmail(me.email));
          }
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const resolveRaw = await r.json().catch(() => null);
        const resolvedFromApi = normalizeResolveData(resolveRaw);
        const status = statusLowercase(resolvedFromApi.status);
        const gridCode = resolvedFromApi.grid_code ?? resolvedFromApi.grid?.grid_code ?? null;
        const gridId = resolvedFromApi.grid_id ?? resolvedFromApi.grid?.id ?? null;

        if (status === "accepted") {
          const moved = await navigateToGrid(gridCode, gridId);
          if (!moved && !cancelled) {
            setResolved(resolvedFromApi);
          }
          return;
        }

        const hasRenderableInfo = hasRenderableResolveInfo(resolvedFromApi);
        if (!r.ok) {
          if (hasRenderableInfo && !cancelled) {
            setResolved(resolvedFromApi);
            const target = gridTargetFromResolved(resolvedFromApi);
            if (statusLowercase(resolvedFromApi.status) === "accepted" && (target.code || target.id)) {
              await navigateToGrid(target.code, target.id);
            }
            return;
          }

          // Never surface "Invitation is inactive" generic message.
          if (resolveInactiveError(resolveRaw)) {
            if (!cancelled) setError(t("invite_token.could_not_load"));
            return;
          }
          setError(resolveErrorMessage(resolveRaw, t("invite_token.invalid_or_expired")));
          return;
        }
        if (!cancelled) setResolved(resolvedFromApi);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("invite_token.could_not_resolve"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router, navigateToGrid, t]);

  const invitedEmail = invitedEmailFromResolved(resolved);
  const resolvedStatus = String(resolved?.status ?? "").toLowerCase();
  const statusTag = statusBadgeFromValue(resolved?.status, t);
  const isPendingStatus = resolvedStatus === "pending";
  const isAlreadyAccepted = resolvedStatus === "accepted";
  const isLinkInvite = String(resolved?.type ?? "").toLowerCase() === "link";
  const mustUseInvitedAccount = Boolean(
    isAuthenticated &&
    invitedEmail &&
    meEmail &&
    invitedEmail !== meEmail
  );

  const accept = useCallback(async () => {
    if (isLinkInvite && isAuthenticated === false) {
      try {
        window.sessionStorage.setItem(AUTO_JOIN_STORAGE_KEY, token);
      } catch {}
      router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    if (mustUseInvitedAccount) {
      setError(t("invite_token.use_invited_account", { email: invitedEmail }));
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const r = await fetch(`/api/invitations/accept/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const acceptRaw = await r.json().catch(() => null);
      const acceptedData = normalizeAcceptResponse(acceptRaw);
      if (!r.ok) {
        if (r.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
          return;
        }
        throw new Error(acceptedData.error || acceptedData.detail || t("invite_token.could_not_accept"));
      }
      setAccepted(true);
      router.refresh();
      const gridCode =
        acceptedData.grid_code ??
        acceptedData.membership?.grid_code ??
        resolved?.grid_code ??
        resolved?.grid?.grid_code ??
        null;
      const gridId = acceptedData.membership?.grid_id ?? resolved?.grid_id ?? resolved?.grid?.id ?? null;
      let moved = await navigateToGrid(gridCode, gridId);

      if (!moved) {
        try {
          const rr = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
          const rj = normalizeResolveData(await rr.json().catch(() => null));
          const rCode = rj.grid_code ?? rj.grid?.grid_code ?? null;
          const rId = rj.grid_id ?? rj.grid?.id ?? null;
          moved = await navigateToGrid(rCode, rId);
        } catch {}
      }

      if (!moved) {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("invite_token.could_not_accept"));
    } finally {
      setAccepting(false);
    }
  }, [invitedEmail, isAuthenticated, isLinkInvite, mustUseInvitedAccount, resolved, router, token, navigateToGrid, t]);

  // Safety net: once accepted, keep trying a short-lived resolve->redirect flow
  // in case backend response arrives without grid_code on first attempt.
  useEffect(() => {
    if (!accepted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tryRedirect = async (attempt: number) => {
      if (cancelled) return;
      let moved = await navigateToGrid(
        resolved?.grid_code ?? resolved?.grid?.grid_code ?? null,
        resolved?.grid_id ?? resolved?.grid?.id ?? null
      );
      if (moved || cancelled) return;

      try {
        const rr = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const rj = normalizeResolveData(await rr.json().catch(() => null));
        moved = await navigateToGrid(rj.grid_code ?? rj.grid?.grid_code ?? null, rj.grid_id ?? rj.grid?.id ?? null);
      } catch {}
      if (moved || cancelled) return;

      if (attempt >= 5) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      timer = setTimeout(() => void tryRedirect(attempt + 1), 300);
    };

    void tryRedirect(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [accepted, navigateToGrid, resolved?.grid?.grid_code, resolved?.grid?.id, resolved?.grid_code, resolved?.grid_id, router, token]);

  useEffect(() => {
    if (!isLinkInvite) return;
    if (!isPendingStatus) return;
    if (isAuthenticated !== true) return;
    if (mustUseInvitedAccount) return;
    if (accepting || accepted) return;

    let autoJoinToken = "";
    try {
      autoJoinToken = window.sessionStorage.getItem(AUTO_JOIN_STORAGE_KEY) || "";
    } catch {
      autoJoinToken = "";
    }
    if (autoJoinToken !== token) return;

    try {
      window.sessionStorage.removeItem(AUTO_JOIN_STORAGE_KEY);
    } catch {}
    void accept();
  }, [
    accept,
    accepted,
    accepting,
    isAuthenticated,
    isLinkInvite,
    isPendingStatus,
    mustUseInvitedAccount,
    token,
  ]);

  // Link invites remain pending (reusable), so detect "already joined" via membership.
  useEffect(() => {
    if (!isLinkInvite) return;
    if (isAuthenticated !== true) return;
    if (!resolved) return;
    if (accepting) return;
    const blocked = ["declined", "rejected", "expired", "cancelled", "canceled"];
    if (blocked.includes(resolvedStatus)) return;

    let cancelled = false;
    (async () => {
      let gridId: string | null =
        resolved?.grid_id != null
          ? String(resolved.grid_id)
          : resolved?.grid?.id != null
          ? String(resolved.grid.id)
          : null;
      const gridCode = resolved?.grid_code ?? resolved?.grid?.grid_code ?? null;

      if (!gridId && gridCode) {
        try {
          const gr = await fetch(`/api/grids/code/${encodeURIComponent(String(gridCode))}`, { cache: "no-store" });
          if (gr.ok) {
            const gjRaw = await gr.json().catch(() => null);
            const gj = asObject(gjRaw);
            const resolvedGridId = gj ? readId(gj.id) : null;
            if (resolvedGridId != null) gridId = String(resolvedGridId);
          }
        } catch {}
      }
      if (!gridId) return;

      try {
        const mr = await fetch(`/api/grid_memberships/?grid=${encodeURIComponent(gridId)}`, { cache: "no-store" });
        if (!mr.ok || cancelled) return;
        const mj = await mr.json().catch(() => null);
        const list = normalizeMembershipList(mj);
        const myEmail = meEmail;
        const mine = list.find((m) => {
          const uid = m.user_id;
          const email = normalizeEmail(m.user_email ?? m.user?.email ?? "");
          if (meId && uid != null && String(uid) === meId) return true;
          if (myEmail && email && email === myEmail) return true;
          return false;
        });
        if (!mine || cancelled) return;
        await navigateToGrid(gridCode, gridId);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accepting,
    isAuthenticated,
    isLinkInvite,
    meEmail,
    meId,
    navigateToGrid,
    resolved,
    resolvedStatus,
  ]);

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-2">{t("invite_token.invitation")}</h1>
        <p className="text-sm text-red-600">{t("invite_token.missing_token")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">{t("invite_token.invitation")}</h1>
      {loading && <p className="text-sm text-gray-700">{t("invite_token.loading_invitation")}</p>}

      {!loading && resolved && (
        <div className="space-y-2 text-sm">
          <div><span className="text-gray-500">{t("invite_token.grid")}</span> {resolved.grid_name || resolved.grid?.name || t("invite_token.fallback_symbol")}</div>
          <div><span className="text-gray-500">{t("invite_token.role")}</span> {resolved.role || t("invite_token.fallback_symbol")}</div>
          <div><span className="text-gray-500">{t("invite_token.type")}</span> {resolved.type || t("invite_token.fallback_symbol")}</div>
          {resolved.message && <div><span className="text-gray-500">{t("invite_token.message")}</span> {resolved.message}</div>}
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t("invite_token.status")}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTag.className}`}>
              {statusTag.label}
            </span>
          </div>
          {resolved.expires_at && <div><span className="text-gray-500">{t("invite_token.expires")}</span> {new Date(resolved.expires_at).toLocaleString()}</div>}
          {isPendingStatus && (
            <button
              type="button"
              onClick={accept}
              disabled={accepting || accepted || mustUseInvitedAccount || isAlreadyAccepted}
              className="mt-2 px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
            >
              {accepting
                ? t("invite_token.joining")
                : accepted || isAlreadyAccepted
                  ? t("invite_token.accepted")
                  : isLinkInvite
                    ? t("invite_token.join_grid")
                    : t("invite_token.accept_invitation")}
            </button>
          )}
          {mustUseInvitedAccount && (
            <div className="text-xs text-red-600">
              {t("invite_token.use_invited_account", { email: invitedEmail })}
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
      {isAuthenticated === false && !isLinkInvite && (
        <p className="text-sm text-gray-600">
          <Link href="/login" className="underline">{t("invite_token.log_in")}</Link> or{" "}
          <Link href="/register" className="underline">{t("invite_token.create_account")}</Link>.
        </p>
      )}
    </div>
  );
}
