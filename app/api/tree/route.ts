import { cachedTreeJson, readTree } from "../../../db/store";

const headers = { "cache-control": "public, max-age=30, stale-while-revalidate=120", "content-type": "application/json" };

export async function GET() {
  const cached = cachedTreeJson();
  if (cached) return new Response(cached, { headers });
  const tree = await readTree();
  return new Response(cachedTreeJson() ?? JSON.stringify(tree), { headers });
}
