"use client";

import * as React from "react";
import { ArrowLeft, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { TIER_STYLES, type Tier } from "@/components/badges/TierBadge";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

type Role = "viewer" | "editor" | "supervisor";
type InviteType = "email" | "link";
type ViewMode = "overview" | "compose";
type Id = number | string;

type AccessUser = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  isOwner: boolean;
  tier?: Tier;
};

type ApiObject = Record<string, unknown>;

type UserRef = {
  id: Id | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  avatar: string | null;
  image: string | null;
};

type ParticipantRef = {
  id: Id | null;
  name: string | null;
  surname: string | null;
};

type GridRef = {
  id: Id | null;
  name: string | null;
  grid_code: string | null;
};

type MembershipRecord = {
  role: string | null;
  user_id: Id | null;
  user: UserRef | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_email: string | null;
};

type ParticipantRecord = {
  tier: Tier | null;
  user_id: Id | null;
  user: UserRef | null;
};

type GridRecord = {
  creator: Id | null;
};

type InvitationRecord = {
  id: Id | null;
  token: string | null;
  invite_token: string | null;
  invitation_token: string | null;
  accept_token: string | null;
  invite_url: string | null;
  link_url: string | null;
  invitation_url: string | null;
  url: string | null;
  link: string | null;
  type: string | null;
  role: string | null;
  status: string | null;
  active: boolean | null;
  participant_id: Id | null;
  participant: ParticipantRef | null;
  to_user_id: Id | null;
  to_user: UserRef | null;
  recipient_id: Id | null;
  recipient: UserRef | null;
  grid_id: Id | null;
  grid: GridRef | null;
};

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, supervisor: 2 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asObject(value: unknown): ApiObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ApiObject;
}

function listFromResponse(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const raw = asObject(data);
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
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
  const firstName = readString(raw.first_name);
  const lastName = readString(raw.last_name);
  const email = readString(raw.email);
  const avatarUrl = readString(raw.avatar_url);
  const avatar = readString(raw.avatar);
  const image = readString(raw.image);
  if (id == null && !firstName && !lastName && !email && !avatarUrl && !avatar && !image) return null;
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    email,
    avatar_url: avatarUrl,
    avatar,
    image,
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

function normalizeMembershipList(data: unknown): MembershipRecord[] {
  return listFromResponse(data).map((item) => {
    const raw = asObject(item) ?? {};
    return {
      role: readString(raw.role),
      user_id: readId(raw.user_id),
      user: normalizeUserRef(raw.user),
      user_first_name: readString(raw.user_first_name),
      user_last_name: readString(raw.user_last_name),
      user_email: readString(raw.user_email),
    } satisfies MembershipRecord;
  });
}

function normalizeParticipantList(data: unknown): ParticipantRecord[] {
  return listFromResponse(data).map((item) => {
    const raw = asObject(item) ?? {};
    const tierRaw = readString(raw.tier);
    const tier =
      tierRaw === "PRIMARY" || tierRaw === "SECONDARY" || tierRaw === "TERTIARY"
        ? tierRaw
        : null;
    return {
      tier,
      user_id: readId(raw.user_id),
      user: normalizeUserRef(raw.user),
    } satisfies ParticipantRecord;
  });
}

function normalizeGridRecord(data: unknown): GridRecord {
  const raw = asObject(data) ?? {};
  return {
    creator: readId(raw.creator),
  };
}

function normalizeInvitation(data: unknown): InvitationRecord {
  const raw = asObject(data) ?? {};
  return {
    id: readId(raw.id),
    token: readString(raw.token),
    invite_token: readString(raw.invite_token),
    invitation_token: readString(raw.invitation_token),
    accept_token: readString(raw.accept_token),
    invite_url: readString(raw.invite_url),
    link_url: readString(raw.link_url),
    invitation_url: readString(raw.invitation_url),
    url: readString(raw.url),
    link: readString(raw.link),
    type: readString(raw.type),
    role: readString(raw.role),
    status: readString(raw.status),
    active: readBoolean(raw.active),
    participant_id: readId(raw.participant_id),
    participant: normalizeParticipantRef(raw.participant),
    to_user_id: readId(raw.to_user_id),
    to_user: normalizeUserRef(raw.to_user),
    recipient_id: readId(raw.recipient_id),
    recipient: normalizeUserRef(raw.recipient),
    grid_id: readId(raw.grid_id),
    grid: normalizeGridRef(raw.grid),
  };
}

function normalizeInvitationList(data: unknown): InvitationRecord[] {
  return listFromResponse(data).map((item) => normalizeInvitation(item));
}

function parseApiError(data: unknown, fallback: string): string {
  const raw = asObject(data);
  const error = raw ? readString(raw.error) : null;
  const detail = raw ? readString(raw.detail) : null;
  return error || detail || fallback;
}

function getTokenFromInvite(inv: InvitationRecord): string | null {
  const direct = inv.token ?? inv.invite_token ?? inv.invitation_token ?? inv.accept_token;
  if (direct) return String(direct);

  const rawUrl = inv.link_url ?? inv.invite_url ?? inv.invitation_url ?? inv.url ?? inv.link;
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(rawUrl, base);
    const token = u.searchParams.get("token");
    if (token) return token;
    const m = u.pathname.match(/\/invite\/([^/?#]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function getShareUrl(inv: InvitationRecord): string {
  const explicit = inv.link_url ?? inv.invite_url ?? inv.invitation_url ?? inv.url ?? inv.link;
  if (explicit && typeof explicit === "string") return explicit;
  const token = getTokenFromInvite(inv);
  if (!token) return "";
  if (typeof window !== "undefined") return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
  return `/invite/${encodeURIComponent(token)}`;
}

export default function InviteDialog({
  gridId,
  gridName,
  open,
  onOpenChange,
  roleOptions,
}: {
  gridId: number;
  gridName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roleOptions?: Role[];
}) {
  const allowedRoles = React.useMemo<Role[]>(
    () => (roleOptions && roleOptions.length > 0 ? roleOptions : ["viewer", "editor", "supervisor"]),
    [roleOptions]
  );

  const [viewMode, setViewMode] = React.useState<ViewMode>("overview");
  const [emails, setEmails] = React.useState<string[]>([]);
  const [draftEmail, setDraftEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("viewer");
  const [participantTier, setParticipantTier] = React.useState<Tier>("PRIMARY");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loadingData, setLoadingData] = React.useState(false);
  const [savingGeneral, setSavingGeneral] = React.useState(false);
  const [sendingEmails, setSendingEmails] = React.useState(false);

  const [accessList, setAccessList] = React.useState<AccessUser[]>([]);
  const [viewerLinks, setViewerLinks] = React.useState<InvitationRecord[]>([]);
  const [generalAccessEnabled, setGeneralAccessEnabled] = React.useState(false);
  const [generalAccessUrl, setGeneralAccessUrl] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setViewMode("overview");
    setEmails([]);
    setDraftEmail("");
    setMessage("");
    setError(null);
    setRole(allowedRoles[0] ?? "viewer");
  }, [open, allowedRoles]);

  const loadData = React.useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [membersRes, participantsRes, gridRes, invitesRes] = await Promise.all([
        fetch(`/api/grid_memberships/?grid=${gridId}`, { cache: "no-store" }),
        fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" }),
        fetch(`/api/grids/${gridId}`, { cache: "no-store" }),
        fetch(`/api/invitations/?grid=${gridId}`, { cache: "no-store" }),
      ]);

      const membersData = membersRes.ok ? await membersRes.json().catch(() => null) : null;
      const participantsData = participantsRes.ok ? await participantsRes.json().catch(() => null) : null;
      const gridData = gridRes.ok ? await gridRes.json().catch(() => null) : null;
      const invitesData = invitesRes.ok ? await invitesRes.json().catch(() => null) : null;

      const memberships = normalizeMembershipList(membersData);
      const participants = normalizeParticipantList(participantsData);
      const invites = normalizeInvitationList(invitesData);

      const tierByUser = new Map<string, Tier>();
      for (const p of participants) {
        const uidRaw = p.user_id;
        if (uidRaw === null || uidRaw === undefined) continue;
        const uid = String(uidRaw);
        const tier = p.tier;
        if (!tier || tierByUser.has(uid)) continue;
        tierByUser.set(uid, tier);
      }

      const creatorIdRaw = normalizeGridRecord(gridData).creator;
      const creatorId = creatorIdRaw == null ? "" : String(creatorIdRaw);
      const byUser = new Map<string, AccessUser>();
      for (const m of memberships) {
        const uidRaw = m.user_id;
        if (uidRaw === null || uidRaw === undefined) continue;
        const uid = String(uidRaw);
        const rawRole = String(m.role ?? "").toLowerCase();
        const roleValue: Role =
          rawRole === "supervisor" || rawRole === "editor" || rawRole === "viewer" ? rawRole : "viewer";
        const first = m.user_first_name ?? m.user?.first_name ?? "";
        const last = m.user_last_name ?? m.user?.last_name ?? "";
        const email = m.user_email ?? m.user?.email ?? "";
        const name = [first, last].filter(Boolean).join(" ").trim() || email || `User ${uid}`;

        const existing = byUser.get(uid);
        if (!existing) {
          byUser.set(uid, {
            userId: uid,
            name,
            email,
            role: roleValue,
            isOwner: creatorId !== "" && creatorId === uid,
            tier: tierByUser.get(uid),
          });
          continue;
        }
        if (ROLE_RANK[roleValue] > ROLE_RANK[existing.role]) existing.role = roleValue;
        if (!existing.email && email) existing.email = email;
        if (!existing.tier && tierByUser.get(uid)) existing.tier = tierByUser.get(uid);
      }

      const filtered = Array.from(byUser.values())
        .filter((u) => u.role === "supervisor" || u.role === "editor")
        .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));
      setAccessList(filtered);

      const activeViewerLinks = invites.filter((inv) => {
        const typeOk = String(inv.type ?? "").toLowerCase() === "link";
        const roleOk = String(inv.role ?? "").toLowerCase() === "viewer";
        const status = String(inv.status ?? "").toLowerCase();
        const active = inv.active !== false && status !== "cancelled" && status !== "expired";
        return typeOk && roleOk && active;
      });
      setViewerLinks(activeViewerLinks);

      const selected = activeViewerLinks[0] || null;
      if (selected) {
        setGeneralAccessEnabled(true);
        setGeneralAccessUrl(getShareUrl(selected));
      } else {
        setGeneralAccessEnabled(false);
        setGeneralAccessUrl("");
      }
    } catch {
      setError("Could not load sharing data.");
    } finally {
      setLoadingData(false);
    }
  }, [gridId]);

  React.useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, loadData]);

  async function copy(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  function addEmail(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setError("Invalid email address.");
      return;
    }
    if (emails.includes(value)) {
      setDraftEmail("");
      setError(null);
      setViewMode("compose");
      return;
    }
    if (emails.length >= 10) {
      setError("Maximum 10 addresses.");
      return;
    }
    setEmails((prev) => [...prev, value]);
    setDraftEmail("");
    setError(null);
    setViewMode("compose");
  }

  function removeEmail(email: string) {
    setEmails((prev) => {
      const next = prev.filter((e) => e !== email);
      if (next.length === 0) {
        setViewMode("overview");
      }
      return next;
    });
  }

  function onEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addEmail(draftEmail);
    }
    if (e.key === "Backspace" && !draftEmail && emails.length > 0) {
      setEmails((prev) => prev.slice(0, -1));
    }
  }

  async function saveGeneralAccess() {
    setSavingGeneral(true);
    setError(null);
    try {
      const activeViewerLinks = viewerLinks.filter((inv) => {
        const status = String(inv.status ?? "").toLowerCase();
        return inv.active !== false && status !== "cancelled" && status !== "expired";
      });

      if (!generalAccessEnabled) {
        if (activeViewerLinks.length === 0) {
          setGeneralAccessUrl("");
          return;
        }

        const idsToCancel = activeViewerLinks
          .map((inv) => inv.id)
          .filter((id): id is Id => id !== null);

        const cancelResults = await Promise.allSettled(
          idsToCancel.map((id) =>
            fetch(`/api/invitations/${encodeURIComponent(String(id))}/cancel/`, { method: "POST" })
          )
        );

        const failedCancel = cancelResults.find(
          (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)
        );
        if (failedCancel) {
          throw new Error("Could not deactivate general access.");
        }

        setViewerLinks((prev) =>
          prev.map((inv) => {
            const id = inv.id;
            const isCancelled = id !== null && idsToCancel.some((targetId) => String(targetId) === String(id));
            if (!isCancelled) return inv;
            return { ...inv, active: false, status: "cancelled" };
          })
        );
        setGeneralAccessUrl("");
        return;
      }

      const existing = activeViewerLinks[0];
      if (existing) {
        setGeneralAccessUrl(getShareUrl(existing));
        return;
      }

      const res = await fetch(`/api/invitations/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          type: "link" as InviteType,
          role: "viewer",
        }),
      });
      const bodyRaw = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseApiError(bodyRaw, "Could not save general access."));
      }
      const body = normalizeInvitation(bodyRaw);
      const url = getShareUrl(body);
      setGeneralAccessUrl(url);
      setGeneralAccessEnabled(true);
      setViewerLinks((prev) => [...prev, body]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save general access.");
    } finally {
      setSavingGeneral(false);
    }
  }

  async function sendEmailInvites() {
    if (emails.length === 0) {
      setError("Add at least one email.");
      return;
    }
    setSendingEmails(true);
    setError(null);

    type EmailInvitePayload = {
      grid: number;
      type: "email";
      email: string;
      role: Role;
      message?: string;
      participant_tier?: Tier;
    };

    const payloads: EmailInvitePayload[] = emails.map((email) => {
      const p: EmailInvitePayload = {
        grid: gridId,
        type: "email",
        email,
        role,
      };
      if (message.trim()) p.message = message.trim();
      if (role === "editor") p.participant_tier = participantTier;
      return p;
    });

    const results = await Promise.allSettled(
      payloads.map((p) =>
        fetch(`/api/invitations/`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(p),
        }).then(async (res) => {
          const bodyRaw = await res.json().catch(() => null);
          if (!res.ok) throw new Error(parseApiError(bodyRaw, "Invite failed."));
          return normalizeInvitation(bodyRaw);
        })
      )
    );

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed.length > 0) {
      const firstReason = failed[0]?.reason;
      const reasonMessage = firstReason instanceof Error ? firstReason.message : "";
      setError(reasonMessage || `${failed.length} invites failed.`);
      setSendingEmails(false);
      return;
    }

    setSendingEmails(false);
    setEmails([]);
    setDraftEmail("");
    setMessage("");
    setViewMode("overview");
    onOpenChange(false);
  }

  const showEditorTier = role === "editor";

  function cancelCompose() {
    setEmails([]);
    setDraftEmail("");
    setMessage("");
    setError(null);
    setViewMode("overview");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogContent className="sm:max-w-[760px] z-[96]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {viewMode === "compose" && (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100"
                  onClick={() => setViewMode("overview")}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <DialogTitle>Share "{gridName}"</DialogTitle>
            </div>
            <DialogDescription>
              Add up to 10 email addresses at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`grid gap-3 ${viewMode === "compose" ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`}>
              <div className="min-w-0 border rounded px-3 py-2">
                <div className="overflow-x-auto">
                  <div className="inline-flex min-w-max items-center gap-2 whitespace-nowrap pr-1">
                    {emails.map((email) => (
                      <span key={email} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm shrink-0">
                        {email}
                        <button type="button" onClick={() => removeEmail(email)} aria-label={`Remove ${email}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      className="w-[260px] shrink-0 border-0 bg-transparent p-0 text-sm outline-none"
                      placeholder="Add people by email"
                      value={draftEmail}
                      onChange={(e) => setDraftEmail(e.target.value)}
                      onKeyDown={onEmailKeyDown}
                      onBlur={() => addEmail(draftEmail)}
                    />
                  </div>
                </div>
              </div>

              {viewMode === "compose" && (
                <div className="shrink-0 flex items-center gap-2">
                  <select
                    className="h-10 rounded border px-3 text-sm"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    {allowedRoles.includes("viewer") && <option value="viewer">Viewer</option>}
                    {allowedRoles.includes("editor") && <option value="editor">Editor</option>}
                    {allowedRoles.includes("supervisor") && <option value="supervisor">Supervisor</option>}
                  </select>
                  {showEditorTier && (
                    <select
                      className="h-10 rounded border px-3 text-sm"
                      value={participantTier}
                      onChange={(e) => setParticipantTier(e.target.value as Tier)}
                    >
                      <option value="PRIMARY">Primary</option>
                      <option value="SECONDARY">Secondary</option>
                      <option value="TERTIARY">Tertiary</option>
                    </select>
                  )}
                </div>
              )}
            </div>

            {viewMode === "compose" ? (
              <div>
                <label className="block text-sm mb-1">Message (optional)</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message"
                />
              </div>
            ) : (
              <>
                <div className="rounded border p-3">
                  <div className="text-base font-semibold mb-2">People with access</div>
                  {loadingData ? (
                    <div className="text-sm text-gray-500">Loading...</div>
                  ) : accessList.length === 0 ? (
                    <div className="text-sm text-gray-500">No supervisors or editors yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {accessList.map((u) => {
                        const tierStyle = u.tier ? TIER_STYLES[u.tier] : null;
                        return (
                          <div key={u.userId} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{u.name}</div>
                              {u.email && <div className="text-xs text-gray-500 truncate">{u.email}</div>}
                            </div>
                            <div className="shrink-0 text-sm">
                              {u.role === "supervisor" ? (
                                <span className="text-gray-600">{u.isOwner ? "Owner" : "Supervisor"}</span>
                              ) : (
                                <span style={{ color: tierStyle?.text || "#555" }}>Editor</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded border p-3">
                  <div className="text-base font-semibold mb-2">General access</div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {generalAccessEnabled ? "Anyone with the link" : "General link disabled"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {generalAccessEnabled
                          ? "Viewer access through the link is active."
                          : "No public viewer link is currently active."}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`h-9 rounded px-3 text-sm border ${
                        generalAccessEnabled
                          ? "border-red-300 text-red-700 hover:bg-red-50"
                          : "border-green-300 text-green-700 hover:bg-green-50"
                      }`}
                      onClick={() => setGeneralAccessEnabled((v) => !v)}
                    >
                      {generalAccessEnabled ? "Deactivate URL" : "Activate URL"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}

            {viewMode === "compose" ? (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded text-sm hover:bg-gray-100 disabled:opacity-50"
                  onClick={() => copy(generalAccessUrl)}
                  title="Copy URL"
                  disabled={!generalAccessUrl}
                >
                  <Link2 className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-3 py-2 rounded text-sm text-blue-600 hover:underline"
                    onClick={cancelCompose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                    disabled={sendingEmails || emails.length === 0}
                    onClick={sendEmailInvites}
                  >
                    {sendingEmails ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded border text-sm disabled:opacity-50"
                  disabled={!generalAccessUrl}
                  onClick={() => copy(generalAccessUrl)}
                >
                  <Link2 className="h-4 w-4" />
                  Copy URL
                </button>
                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <button type="button" className="px-3 py-2 rounded border text-sm">Close</button>
                  </DialogClose>
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                    disabled={savingGeneral}
                    onClick={saveGeneralAccess}
                  >
                    {savingGeneral ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
