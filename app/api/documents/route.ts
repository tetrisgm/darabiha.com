import { listAttachments } from "../../../db/store";
import { requireEditor } from "../../authz";

export const runtime = "edge";

/** The evidence room: every file the archive was built from. Editors only —
 * these are private source documents, not published material. */
export async function GET() {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  return Response.json({ documents: await listAttachments() });
}
