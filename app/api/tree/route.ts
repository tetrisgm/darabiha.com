import { cachedTreeJson, readTree } from "../../../db/store";
import { archiveCacheHeaders, preventSharedCaching } from "../../../lib/archive-cache";
import { isArchiveMember, requireVisitor } from "../../authz";
import { redactLivingDetails } from "../../../lib/living-privacy";

export async function GET() {
  const access = await requireVisitor();
  if (!access.ok) return preventSharedCaching(access.response);
  const headers = {
    ...archiveCacheHeaders(access.visibility, "public, max-age=30, stale-while-revalidate=120"),
    "content-type": "application/json",
  };
  const member = await isArchiveMember();
  const redact = access.visibility === "public" && !member;
  const cached = redact ? null : cachedTreeJson();
  if (cached) return new Response(cached, { headers });
  const tree = await readTree();
  return new Response(redact ? JSON.stringify(redactLivingDetails(tree)) : cachedTreeJson() ?? JSON.stringify(tree), { headers });
}
