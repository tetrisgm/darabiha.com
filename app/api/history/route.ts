import { listChangeLog } from "../../../db/store";
import { requireEditor } from "../../authz";

export const runtime = "edge";

/** Everything anyone has changed, newest first. */
export async function GET(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const before = new URL(request.url).searchParams.get("before");
  return Response.json(await listChangeLog(before));
}
