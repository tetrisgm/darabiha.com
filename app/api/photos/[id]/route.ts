import { getSiteVisibility, readAttachment } from "../../../../db/store";
import { archiveCacheHeaders, preventSharedCaching, privateArchiveCacheHeaders } from "../../../../lib/archive-cache";
import { isPublicRasterContentType } from "../../../../lib/attachment-types";
import { requireEditor, requireVisitor } from "../../../authz";

export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireVisitor();
  if (!access.ok) return preventSharedCaching(access.response);
  const { id } = await context.params;
  const attachment = await readAttachment(id);
  if (!attachment) return preventSharedCaching(new Response("Not found", { status: 404 }));
  // photographs are part of the archive anyone may see; source documents are
  // private evidence and need an editor
  const isPublicRaster = isPublicRasterContentType(attachment.metadata.contentType);
  if (!isPublicRaster && !(await requireEditor()).ok) {
    return preventSharedCaching(new Response("Not found", { status: 404 }));
  }
  const cacheHeaders = isPublicRaster
    ? archiveCacheHeaders(await getSiteVisibility(), "public, max-age=86400, immutable")
    : privateArchiveCacheHeaders();
  return new Response(attachment.object.body, {
    headers: {
      "content-type": attachment.metadata.contentType,
      "x-content-type-options": "nosniff",
      ...cacheHeaders,
      "content-disposition": `${isPublicRaster ? "inline" : "attachment"}; filename="${attachment.metadata.filename.replace(/[\"\r\n]/g, "")}"`,
      ...(isPublicRaster ? {} : { "content-security-policy": "sandbox" }),
    },
  });
}
