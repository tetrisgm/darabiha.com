import { getSiteVisibility, readAttachment } from "../../../../db/store";
import { requireVisitor } from "../../../authz";

export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireVisitor();
  if (!access.ok) return access.response;
  const { id } = await context.params;
  const attachment = await readAttachment(id);
  if (!attachment || !attachment.metadata.contentType.startsWith("image/")) return new Response("Not found", { status: 404 });
  return new Response(attachment.object.body, {
    headers: {
      "content-type": attachment.metadata.contentType,
      "cache-control": (await getSiteVisibility()) === "members" ? "private, max-age=3600" : "public, max-age=86400, immutable",
      "content-disposition": `inline; filename="${attachment.metadata.filename.replace(/[\"\r\n]/g, "")}"`,
    },
  });
}
