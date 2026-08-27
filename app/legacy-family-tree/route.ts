import { env } from "cloudflare:workers";
import { requireVisitor } from "../authz";

const assets = () => (env as unknown as { ASSETS: { fetch(input: Request): Promise<Response> } }).ASSETS;

export async function GET(request: Request) {
  const access = await requireVisitor();
  // a page, not an API: send anonymous visitors to the sign-in gate
  if (!access.ok) return Response.redirect(new URL("/", request.url), 302);
  const response = await assets().fetch(new Request(new URL("/legacy-family-tree.html", request.url)));
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}
