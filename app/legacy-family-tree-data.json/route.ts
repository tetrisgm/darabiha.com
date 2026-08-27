import { env } from "cloudflare:workers";
import { requireVisitor } from "../authz";

const assets = () => (env as unknown as { ASSETS: { fetch(input: Request): Promise<Response> } }).ASSETS;

export async function GET(request: Request) {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const response = await assets().fetch(new Request(new URL("/legacy-family-tree-data.json", request.url)));
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, max-age=300");
  return new Response(response.body, { status: response.status, headers });
}
