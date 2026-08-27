import { getSiteVisibility, readAttachment } from "../../../../db/store";
import { requireEditor, requireVisitor } from "../../../authz";

export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const attachment = await readAttachment(id);
  if (!attachment) return new Response("Not found", { status: 404 });
  // photographs are part of the archive anyone may see; source documents are
  // private evidence and need an editor
  if (!attachment.metadata.contentType.startsWith("image/") && !(await requireEditor()).ok) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(attachment.object.body, {
    headers: {
      "content-type": attachment.metadata.contentType,
      "cache-control": (await getSiteVisibility()) === "members" ? "private, max-age=3600" : "public, max-age=86400, immutable",
      "content-disposition": `inline; filename="${attachment.metadata.filename.replace(/[\"\r\n]/g, "")}"`,
    },
  });
}
