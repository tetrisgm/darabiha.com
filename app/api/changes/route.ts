import { requireEditor } from "../../authz";
import { applyProposal } from "../../../db/store";
import type { ChangeProposal } from "../../../lib/types";

const allowedKinds = new Set(["add_person", "update_person", "delete_person", "add_relationship", "delete_relationship", "add_story", "update_story", "delete_story"]);

export async function POST(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  let proposal: ChangeProposal;
  try {
    proposal = (await request.json()) as ChangeProposal;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!proposal || !allowedKinds.has(proposal.kind) || typeof proposal.summary !== "string") {
    return Response.json({ error: "invalid_proposal" }, { status: 400 });
  }
  try {
    const tree = await applyProposal(proposal, auth.user.email);
    return Response.json({ ok: true, tree });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "change_failed" }, { status: 400 });
  }
}
