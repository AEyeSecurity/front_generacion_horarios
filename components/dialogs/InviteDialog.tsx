"use client";

import * as React from "react";
import { ArrowLeft, Link2, X } from "lucide-react";
import { TIER_STYLES, type Tier } from "@/components/TierBadge";
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
type LinkKind = "infinite" | "single_use";
type ViewMode = "overview" | "compose";

type AccessUser = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  isOwner: boolean;
  tier?: Tier;
};

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, supervisor: 2 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getTokenFromInvite(inv: any): string | null {
  const direct = inv?.token ?? inv?.invite_token ?? inv?.invitation_token ?? inv?.accept_token;
  if (direct) return String(direct);

  const rawUrl = inv?.invite_url ?? inv?.invitation_url ?? inv?.url ?? inv?.link;
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

function getShareUrl(inv: any): string {
  const explicit = inv?.invite_url ?? inv?.invitation_url ?? inv?.url ?? inv?.link;
  if (explicit && typeof explicit === "string") return explicit;
  const token = getTokenFromInvite(inv);
  if (!token) return "";
  if (typeof window !== "undefined") return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
  return `/invite/${encodeURIComponent(token)}`;
}

function listFromResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
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
  const [viewerLinks, setViewerLinks] = React.useState<any[]>([]);
  const [generalAccessKind, setGeneralAccessKind] = React.useState<LinkKind>("single_use");
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

      const membersData = membersRes.ok ? await membersRes.json().catch(() => ({})) : {};
      const participantsData = participantsRes.ok ? await participantsRes.json().catch(() => ({})) : {};
      const gridData = gridRes.ok ? await gridRes.json().catch(() => ({})) : {};
      const invitesData = invitesRes.ok ? await invitesRes.json().catch(() => ({})) : {};

      const memberships = listFromResponse(membersData);
      const participants = listFromResponse(participantsData);
      const invites = listFromResponse(invitesData);

      const tierByUser = new Map<string, Tier>();
      for (const p of participants) {
        const uidRaw = p?.user_id ?? (typeof p?.user === "number" ? p.user : p?.user?.id ?? p?.user);
        if (uidRaw === null || uidRaw === undefined) continue;
        const uid = String(uidRaw);
        const tier = p?.tier as Tier | undefined;
        if (!tier || tierByUser.has(uid)) continue;
        if (tier === "PRIMARY" || tier === "SECONDARY" || tier === "TERTIARY") {
          tierByUser.set(uid, tier);
        }
      }

      const creatorId = String(gridData?.creator ?? "");
      const byUser = new Map<string, AccessUser>();
      for (const m of memberships) {
        const uidRaw = m?.user_id ?? (typeof m?.user === "number" ? m.user : m?.user?.id ?? m?.user);
        if (uidRaw === null || uidRaw === undefined) continue;
        const uid = String(uidRaw);
        const roleValue = (m?.role || "viewer") as Role;
        const first = m?.user_first_name ?? m?.user?.first_name ?? "";
        const last = m?.user_last_name ?? m?.user?.last_name ?? "";
        const email = m?.user_email ?? m?.user?.email ?? "";
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

      const activeViewerLinks = invites.filter((inv: any) => {
        const typeOk = String(inv?.type || "").toLowerCase() === "link";
        const roleOk = String(inv?.role || "").toLowerCase() === "viewer";
        const status = String(inv?.status || "").toLowerCase();
        const active = inv?.active !== false && status !== "cancelled" && status !== "expired";
        return typeOk && roleOk && active;
      });
      setViewerLinks(activeViewerLinks);

      const selected =
        activeViewerLinks.find((inv: any) => (inv?.link_kind || "single_use") === "single_use") ||
        activeViewerLinks[0] ||
        null;
      if (selected) {
        const kind = (selected?.link_kind || "single_use") as LinkKind;
        setGeneralAccessKind(kind);
        setGeneralAccessUrl(getShareUrl(selected));
      } else {
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
    } catch {}
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
      const existing = viewerLinks.find((inv) => (inv?.link_kind || "single_use") === generalAccessKind);
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
          link_kind: generalAccessKind,
          role: "viewer",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || body?.detail || "Could not save general access.");
      }
      const url = getShareUrl(body);
      setGeneralAccessUrl(url);
      setViewerLinks((prev) => [...prev, body]);
    } catch (e: any) {
      setError(e?.message || "Could not save general access.");
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

    const payloads = emails.map((email) => {
      const p: Record<string, any> = {
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
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body?.error || body?.detail || "Invite failed.");
          return body;
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failed.length > 0) {
      setError(failed[0]?.reason?.message || `${failed.length} invites failed.`);
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
                  <div className="flex items-center gap-3">
                    <select
                      className="h-10 rounded border px-3 text-sm"
                      value={generalAccessKind}
                      onChange={(e) => setGeneralAccessKind(e.target.value as LinkKind)}
                    >
                      <option value="single_use">Single use (viewer)</option>
                      <option value="infinite">Infinite use (viewer)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}

            {viewMode === "compose" ? (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded border text-sm"
                  onClick={() => copy(generalAccessUrl)}
                  title="Copy URL"
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
                  className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                  disabled={!generalAccessUrl}
                  onClick={() => copy(generalAccessUrl)}
                >
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
