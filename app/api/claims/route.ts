import { listEvidenceClaims } from "../../../db/store";
import { requireEditor } from "../../authz";
import { preventSharedCaching, privateJsonResponse } from "../../../lib/archive-cache";

export const runtime = "edge";

export async function GET(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return preventSharedCaching(auth.response);
  const url = new URL(request.url);
  const subjectType = url.searchParams.get("subjectType");
  const subjectId = url.searchParams.get("subjectId")?.trim();
  if ((subjectType !== "person" && subjectType !== "relationship") || !subjectId) {
    return privateJsonResponse({ error: "invalid_claim_subject" }, { status: 400 });
  }
  return privateJsonResponse({ claims: await listEvidenceClaims(subjectType, subjectId) });
}
