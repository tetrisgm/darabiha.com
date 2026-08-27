import { listAttachments, queueDocument, saveAttachment } from "../../../db/store";
import { requireEditor } from "../../authz";

export const runtime = "edge";

/** The evidence room: every file the archive was built from. Editors only —
 * these are private source documents, not published material. */
export async function GET() {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  return Response.json({ documents: await listAttachments() });
}

const MAX_BYTES = 50 * 1024 * 1024;

/** Sending the archive a document. It is stored and queued; reading it is
 * somebody else's request, so the sender can close the tab. */
export async function POST(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return Response.json({ error: "expected_form_data" }, { status: 400 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "expected_form_data" }, { status: 400 });
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return Response.json({ error: "no_files" }, { status: 400 });
  if (files.some((file) => file.size > MAX_BYTES)) return Response.json({ error: "file_too_large" }, { status: 413 });
  const queued = [];
  for (const file of files) {
    const [attachment] = await saveAttachment(file, auth.user.email).then((value) => [value]);
    await queueDocument(attachment.id, file.name, auth.user.email);
    queued.push({ id: attachment.id, filename: file.name });
  }
  return Response.json({ queued });
}
