import { env } from "cloudflare:workers";
import { requireVisitor } from "../../authz";

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const { file } = await context.params;
  if (!/^[\w][\w.-]*\.jpg$/.test(file)) return new Response("Not found", { status: 404 });
  const object = await env.FILES.get(`legacy/photos/${file}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
}
