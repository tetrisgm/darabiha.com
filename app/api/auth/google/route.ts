import { signToken } from "../../../apple-auth";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = (process.env.PUBLIC_ORIGIN || "").replace(/\/$/, "");
  if (!clientId || !origin || !process.env.AUTH_SESSION_SECRET) {
    return Response.json({ error: "google_sign_in_not_configured" }, { status: 503 });
  }
  const url = new URL(request.url);
  const requestedReturn = url.searchParams.get("return_to") || "/";
  const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/";
  const nonce = crypto.randomUUID();
  const state = await signToken({ nonce, returnTo, exp: Math.floor(Date.now() / 1000) + 10 * 60 });
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("prompt", "select_account");
  return Response.redirect(authorize, 302);
}
