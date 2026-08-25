import { getAppleUser, type AppleUser } from "./apple-auth";

// TEMPORARY TEST MODE: keep this isolated so Apple enforcement can be restored in one change
// after the family finishes testing archive imports.
export const TEMPORARY_OPEN_EDITOR = true;
const temporaryEditor: AppleUser = { subject: "temporary-open-editor", email: "temporary-open-editor@darabiha.com", displayName: "Temporary editor" };

export function isEditor(user: AppleUser | null): boolean {
  if (TEMPORARY_OPEN_EDITOR) return true;
  if (!user) return false;
  const configured = (process.env.EDITOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(user.email.toLowerCase());
}

export async function getEditor(): Promise<AppleUser | null> {
  const user = await getAppleUser();
  return isEditor(user) ? user : null;
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
  if (!isEditor(user)) {
    return {
      ok: false,
      response: Response.json({ error: "editor_access_required" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
