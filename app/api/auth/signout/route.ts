import { clearSessionCookie } from "../../../apple-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("return_to") || "/";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const response = Response.redirect(new URL(returnTo, url.origin), 303);
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}
