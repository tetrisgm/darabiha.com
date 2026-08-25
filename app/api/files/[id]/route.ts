import { requireEditor } from "../../../authz";
import { readAttachment } from "../../../../db/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const result = await readAttachment(id);
  if (!result) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  result.object.writeHttpMetadata(headers);
  headers.set("content-type", result.metadata.contentType);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(result.metadata.filename)}`);
  headers.set("cache-control", "private, max-age=300");
  return new Response(result.object.body, { headers });
}
