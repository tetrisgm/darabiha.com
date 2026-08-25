import { readAttachment } from "../../../../db/store";

export const runtime = "edge";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const attachment = await readAttachment(id);
  if (!attachment || !attachment.metadata.contentType.startsWith("image/")) return new Response("Not found", { status: 404 });
  return new Response(attachment.object.body, {
    headers: {
      "content-type": attachment.metadata.contentType,
      "cache-control": "public, max-age=86400, immutable",
      "content-disposition": `inline; filename="${attachment.metadata.filename.replace(/[\"\r\n]/g, "")}"`,
    },
  });
}
