import { listChangeLog } from "../../../db/store";
import { requireEditor } from "../../authz";
import { preventSharedCaching, privateJsonResponse } from "../../../lib/archive-cache";

export const runtime = "edge";

/** Everything anyone has changed, newest first. */
export async function GET(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return preventSharedCaching(auth.response);
  const before = new URL(request.url).searchParams.get("before");
  return privateJsonResponse(await listChangeLog(before));
}
