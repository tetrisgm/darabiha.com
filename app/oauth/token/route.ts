import { exchangeCodeForToken } from "../../../lib/mcp-oauth";

export const runtime = "edge";

const oauthError = (error: string, description: string, status = 400) =>
  Response.json({ error, error_description: description }, { status, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });

export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return oauthError("invalid_request", "The token request body is unreadable.");
  }
  if (form.get("grant_type") !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported; re-run the approval when a token expires.");
  }
  const code = form.get("code") ?? "";
  const clientId = form.get("client_id") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  const codeVerifier = form.get("code_verifier") ?? "";
  if (!code || !clientId || !redirectUri || !codeVerifier) return oauthError("invalid_request", "code, client_id, redirect_uri, and code_verifier are all required.");
  const result = await exchangeCodeForToken({ code, clientId, redirectUri, codeVerifier });
  if (!result.ok) return oauthError(result.error, result.description);
  return Response.json(result.body, { headers: { "access-control-allow-origin": "*", "cache-control": "no-store", pragma: "no-cache" } });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
