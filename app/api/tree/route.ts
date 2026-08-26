import { cachedTreeJson, getSiteVisibility, readTree } from "../../../db/store";
import { requireVisitor } from "../../authz";

export async function GET() {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const visibility = await getSiteVisibility();
  const headers = {
    "cache-control": visibility === "members" ? "private, max-age=30" : "public, max-age=30, stale-while-revalidate=120",
    "content-type": "application/json",
  };
  const cached = cachedTreeJson();
  if (cached) return new Response(cached, { headers });
  const tree = await readTree();
  return new Response(cachedTreeJson() ?? JSON.stringify(tree), { headers });
}
