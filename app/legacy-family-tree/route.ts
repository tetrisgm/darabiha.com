import { env } from "cloudflare:workers";
import { requireVisitor } from "../authz";

export async function GET(request: Request) {
  const access = await requireVisitor();
  // a page, not an API: send anonymous visitors to the sign-in gate
  if (!access.ok) return Response.redirect(new URL("/", request.url), 302);
  const object = await env.FILES.get("legacy/legacy-family-tree.html");
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, max-age=300" } });
}
