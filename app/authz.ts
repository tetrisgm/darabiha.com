import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

const LOCAL_EDITOR = "seedy@sites.test";

export function isEditor(user: ChatGPTUser | null): boolean {
  if (!user) return false;
  const configured = (process.env.EDITOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") configured.push(LOCAL_EDITOR);
  return configured.includes(user.email.toLowerCase());
}

export async function getEditor(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  return isEditor(user) ? user : null;
}

export async function requireEditor(): Promise<
  { ok: true; user: ChatGPTUser } | { ok: false; response: Response }
> {
  const user = await getChatGPTUser();
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
