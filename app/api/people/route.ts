import { requireEditor } from "../../authz";
import { addRelationship, applyProposal, attachPersonPhoto, readTree, removePerson, removePersonPhoto, removeRelationship, updatePerson } from "../../../db/store";

export const runtime = "edge";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const personId = String(form.get("personId") ?? "");
      const file = form.get("photo");
      if (!personId || !(file instanceof File) || !IMAGE_TYPES.has(file.type)) {
        return Response.json({ error: "invalid_photo" }, { status: 400 });
      }
      if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: "photo_too_large" }, { status: 413 });
      return Response.json({ ok: true, tree: await attachPersonPhoto(personId, file, auth.user.email) });
    }
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "update") {
      return Response.json({ ok: true, tree: await updatePerson(String(body.personId ?? ""), (body.patch ?? {}) as Record<string, unknown>, auth.user.email) });
    }
    if (action === "remove") return Response.json({ ok: true, tree: await removePerson(String(body.personId ?? ""), auth.user.email) });
    if (action === "remove_relationship") return Response.json({ ok: true, tree: await removeRelationship(String(body.relationshipId ?? ""), auth.user.email) });
    if (action === "remove_photo") return Response.json({ ok: true, tree: await removePersonPhoto(String(body.personId ?? ""), auth.user.email) });
    if (action === "add") {
      const displayName = String(body.displayName ?? "").trim();
      if (!displayName) return Response.json({ error: "display_name_required" }, { status: 400 });
      const text = (key: string) => {
        const value = body[key];
        return typeof value === "string" && value.trim() ? value.trim() : null;
      };
      return Response.json({ ok: true, tree: await applyProposal({ kind: "add_person", summary: "Added a family member", person: { displayName, givenName: null, familyName: null, birthDate: text("birthDate"), deathDate: text("deathDate"), birthPlace: null, deathPlace: null, birthCity: text("birthCity"), birthCountry: text("birthCountry"), deathCity: text("deathCity"), deathCountry: text("deathCountry"), biography: text("biography"), photoAttachmentId: null } }, auth.user.email) });
    }
    if (action === "relationship") {
      const relationshipType = body.relationshipType === "spouse" ? "spouse" : "parent";
      return Response.json({ ok: true, tree: await addRelationship(String(body.fromPersonId ?? ""), String(body.toPersonId ?? ""), relationshipType, auth.user.email) });
    }
    if (action === "tree") return Response.json({ ok: true, tree: await readTree() });
    return Response.json({ error: "unsupported_action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "people_update_failed" }, { status: 400 });
  }
}
