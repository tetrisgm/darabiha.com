import { cachedTreeJson, readTree } from "../../../db/store";
import { archiveCacheHeaders, preventSharedCaching } from "../../../lib/archive-cache";
import { requireVisitor } from "../../authz";

export async function GET() {
  const access = await requireVisitor();
  if (!access.ok) return preventSharedCaching(access.response);
  const headers = {
    ...archiveCacheHeaders(access.visibility, "public, max-age=30, stale-while-revalidate=120"),
    "content-type": "application/json",
  };
  const cached = cachedTreeJson();
  if (cached) return new Response(cached, { headers });
  const tree = await readTree();
  return new Response(cachedTreeJson() ?? JSON.stringify(tree), { headers });
}
