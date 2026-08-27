import { env } from "cloudflare:workers";
import { requireVisitor } from "../../authz";

const assets = () => (env as unknown as { ASSETS: { fetch(input: Request): Promise<Response> } }).ASSETS;

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const { file } = await context.params;
  if (!/^[\w][\w.-]*$/.test(file)) return new Response("Not found", { status: 404 });
  const response = await assets().fetch(new Request(new URL(`/legacy-photos/${file}`, request.url)));
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(response.body, { status: response.status, headers });
}
