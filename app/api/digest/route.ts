import { listChangeLog, readTree } from "../../../db/store";
import { requireEditor } from "../../authz";
import { buildDigest, digestHtml, digestText } from "../../../lib/digest";

export const runtime = "edge";

/** The week's news from the archive. Readable now; sending it by email needs
 * a provider key the owner has to create (see docs/HANDOFF.md) - nothing here
 * pretends to deliver mail it cannot send. */
export async function GET(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
  const since = new Date(Date.now() - days * 86_400_000);
  const [tree, log] = await Promise.all([readTree(), listChangeLog(null, 300)]);
  const digest = buildDigest(tree, log.entries, since);
  if (url.searchParams.get("format") === "html") {
    return new Response(digestHtml(digest), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (url.searchParams.get("format") === "text") {
    return new Response(digestText(digest), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return Response.json(digest, { headers: { "cache-control": "no-store" } });
}
