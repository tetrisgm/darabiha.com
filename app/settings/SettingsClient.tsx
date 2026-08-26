"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Role = "admin" | "editor" | null;
type Identity = { email: string; provider: string | null };
type Member = { email: string; role: "admin" | "editor"; addedBy: string; createdAt: string; links: Identity[] };
type Props = {
  viewer: { signedIn: boolean; email: string | null; accountEmail: string | null; displayName: string | null; role: Role; links: Identity[] };
  appleSignInPath: string;
  googleSignInPath: string | null;
  signOutPath: string;
};

const PROVIDER_LABEL: Record<string, string> = { apple: "Apple", google: "Google" };

const ERROR_COPY: Record<string, string> = {
  invalid_response: "The sign-in response was incomplete. Please try again.",
  google_token_exchange_failed: "Google returned an authentication error. Please try again.",
  apple_token_exchange_failed: "Apple returned an authentication error. Please try again.",
  invalid_identity_token: "The identity token could not be verified. Please try again.",
  sign_in_failed: "We could not complete sign-in. Please try again.",
  last_admin: "That is the last admin — give someone else the admin role first.",
  not_a_member: "That email address is not on the member list.",
  invalid_email: "That does not look like an email address.",
  identity_linked_elsewhere: "That sign-in is already linked to a different member \u2014 unlink it there first.",
};

export default function SettingsClient({ viewer, appleSignInPath, googleSignInPath, signOutPath }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"editor" | "admin">("editor");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("auth_error");
    if (requested) requestAnimationFrame(() => setAuthError(ERROR_COPY[requested] ?? ERROR_COPY.sign_in_failed));
  }, []);
  useEffect(() => {
    if (viewer.role !== "admin") return;
    let cancelled = false;
    fetch("/api/members").then((response) => response.json() as Promise<{ members?: Member[] }>).then((data) => {
      if (!cancelled && data.members) setMembers(data.members);
    }).catch(() => { if (!cancelled) setNotice("Could not load the member list."); });
    return () => { cancelled = true; };
  }, [viewer.role]);

  const mutate = async (payload: Record<string, string>) => {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { members?: Member[]; error?: string };
      if (!response.ok || !data.members) { setNotice(ERROR_COPY[data.error ?? ""] ?? "The change could not be saved."); return; }
      setMembers(data.members);
      if (payload.action === "set" && payload.email === newEmail.trim().toLowerCase()) setNewEmail("");
    } catch {
      setNotice("The change could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="settings-page">
    <header className="settings-masthead">
      <Link className="settings-wordmark" href="/">Darabiha</Link>
      <Link className="settings-back" href="/">← Back to the tree</Link>
    </header>
    <section className="settings-panel">
      <p className="eyebrow settings-eyebrow">Site settings</p>
      <h1>Access &amp; members</h1>

      {authError && <p className="settings-error">{authError}</p>}

      {!viewer.signedIn && <div className="settings-card">
        <p>Sign in to see your access. Editing rights are granted on this page by a site admin.</p>
        <div className="settings-signin-row">
          <a className="settings-signin" href={appleSignInPath}> Sign in with Apple</a>
          {googleSignInPath && <a className="settings-signin is-google" href={googleSignInPath}><span aria-hidden="true">G</span> Sign in with Google</a>}
        </div>
      </div>}

      {viewer.signedIn && <div className="settings-card settings-identity">
        <div>
          <strong>{viewer.displayName ?? viewer.email}</strong>
          <span>{viewer.email}{viewer.accountEmail && viewer.accountEmail !== viewer.email ? ` \u00b7 account ${viewer.accountEmail}` : ""}</span>
        </div>
        <span className={`settings-role-badge is-${viewer.role ?? "none"}`}>{viewer.role ?? "no access"}</span>
        <a className="settings-signout" href={signOutPath}>Sign out</a>
      </div>}

      {viewer.signedIn && <div className="settings-card">
        <h2>Linked sign-ins</h2>
        <p className="settings-hint">Link your Apple and Google sign-ins so either one lands in this same account — linking works by completing the other provider&rsquo;s sign-in once.</p>
        <ul className="settings-identity-list">
          <li><span className="settings-member-email">{viewer.accountEmail}</span><span className="settings-provider">primary</span></li>
          {viewer.links.map((link) => <li key={link.email}>
            <span className="settings-member-email">{link.email}</span>
            <span className="settings-provider">{link.provider ? PROVIDER_LABEL[link.provider] ?? link.provider : "linked"}</span>
          </li>)}
        </ul>
        <div className="settings-signin-row">
          <a className="settings-signin" href={`${appleSignInPath}&link=1`}> Link an Apple sign-in</a>
          {googleSignInPath && <a className="settings-signin is-google" href={`${googleSignInPath}&link=1`}><span aria-hidden="true">G</span> Link a Google sign-in</a>}
        </div>
      </div>}

      {viewer.signedIn && viewer.role === null && <div className="settings-card">
        <p>Your account is signed in but not on the member list yet. Ask a site admin to add <strong>{viewer.email}</strong> below — until then you can browse the archive but not edit it.</p>
      </div>}

      {viewer.signedIn && viewer.role === "editor" && <div className="settings-card">
        <p>You can edit the archive — add people, correct records, and attach photos. Managing who has access is reserved for admins.</p>
      </div>}

      {viewer.role === "admin" && <div className="settings-card">
        <h2>Members</h2>
        <p className="settings-hint">Editors can change the family records. Admins can also manage this list.</p>
        {notice && <p className="settings-error">{notice}</p>}
        {!members && <p className="settings-hint">Loading the member list…</p>}
        {members && <ul className="settings-members">
          {members.map((member) => <li key={member.email}>
            <span className="settings-member-email">
              {member.email}{member.email === viewer.accountEmail ? <em> · you</em> : null}
              {member.links.length > 0 && <span className="settings-member-links">
                {member.links.map((link) => <span key={link.email} className="settings-member-link">↪ {link.email}{link.provider ? ` (${PROVIDER_LABEL[link.provider] ?? link.provider})` : ""}
                  <button type="button" className="settings-unlink" disabled={busy} aria-label={`Unlink ${link.email}`} title="Unlink this sign-in" onClick={() => mutate({ action: "unlink", email: link.email })}>×</button>
                </span>)}
              </span>}
            </span>
            <select value={member.role} disabled={busy} aria-label={`Role for ${member.email}`}
              onChange={(event) => mutate({ action: "set", email: member.email, role: event.target.value })}>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
            <button type="button" className="settings-remove" disabled={busy} aria-label={`Remove ${member.email}`}
              onClick={() => mutate({ action: "remove", email: member.email })}>×</button>
          </li>)}
        </ul>}
        <form className="settings-add" onSubmit={(event) => { event.preventDefault(); if (newEmail.trim()) mutate({ action: "set", email: newEmail.trim().toLowerCase(), role: newRole }); }}>
          <input type="email" required placeholder="name@example.com" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} aria-label="Email address to add" />
          <select value={newRole} onChange={(event) => setNewRole(event.target.value === "admin" ? "admin" : "editor")} aria-label="Role for the new member">
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={busy || !newEmail.trim()}>Add member</button>
        </form>
      </div>}
    </section>
  </main>;
}
