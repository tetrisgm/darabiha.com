import { env } from "cloudflare:workers";
import { requireVisitor } from "../authz";

export async function GET() {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const object = await env.FILES.get("legacy/legacy-family-tree-data.json");
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": "application/json", "cache-control": "private, max-age=300" } });
}
