import { requireEditor } from "../../authz";
import { applyProposal } from "../../../db/store";
import { isChangeProposal } from "../../../lib/change-proposal";

export async function POST(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  let proposal: unknown;
  try {
    proposal = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isChangeProposal(proposal)) {
    return Response.json({ error: "invalid_proposal" }, { status: 400 });
  }
  try {
    const tree = await applyProposal(proposal, auth.user.email);
    return Response.json({ ok: true, tree });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "change_failed" }, { status: 400 });
  }
}
