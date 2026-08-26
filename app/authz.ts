import { getAppleUser, type AppleUser } from "./apple-auth";
import { getMemberRole, getSiteVisibility, type MemberRole } from "../db/store";

// Editing is enforced: only members with the editor or admin role can
// mutate the archive. Flipping this to true reopens the old test mode where
// every visitor could edit.
export const TEMPORARY_OPEN_EDITOR = false;
const temporaryEditor: AppleUser = { subject: "temporary-open-editor", email: "temporary-open-editor@darabiha.com", displayName: "Temporary editor" };

export type ViewerRole = MemberRole | null;

/** The signed-in user's role from the members table; null when signed out
 * or not on the list. */
export async function getViewerRole(user: AppleUser | null): Promise<ViewerRole> {
  if (!user) return null;
  return getMemberRole(user.email);
}

export async function requireEditor(): Promise<
  { ok: true; user: AppleUser } | { ok: false; response: Response }
> {
  const user = await getAppleUser();
  if (TEMPORARY_OPEN_EDITOR) return { ok: true, user: user ?? temporaryEditor };
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "sign_in_required" }, { status: 401 }),
    };
  }
  const role = await getViewerRole(user);
  if (role !== "admin" && role !== "editor") {
    return {
      ok: false,
      response: Response.json({ error: "editor_access_required" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

/** Gate for read access. In "public" visibility everyone passes; in
 * "members" visibility the visitor must be signed in with any role (every
 * sign-in auto-registers a viewer, and admins can remove one). */
export async function requireVisitor(): Promise<
  { ok: true } | { ok: false; response: Response }
> {
  if ((await getSiteVisibility()) === "public") return { ok: true };
  const user = await getAppleUser();
  if (!user) {
    return { ok: false, response: Response.json({ error: "sign_in_required" }, { status: 401 }) };
  }
  if (!(await getViewerRole(user))) {
    return { ok: false, response: Response.json({ error: "viewer_access_required" }, { status: 403 }) };
  }
  return { ok: true };
}

/** Member management is admin-only and is never opened by the temporary
 * open-editor test mode. */
export async function requireAdmin(): Promise<
  { ok: true; user: AppleUser } | { ok: false; response: Response }
> {
  const user = await getAppleUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "sign_in_required" }, { status: 401 }),
    };
  }
  if ((await getViewerRole(user)) !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "admin_access_required" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
