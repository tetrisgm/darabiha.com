import OpenAI from "openai";
import { Buffer } from "node:buffer";
import { cookies } from "next/headers";
import { requireEditor } from "../../authz";
import {
  applyProposal, claimNextDocument, finishDocument, listDocumentQueue,
  readAttachmentBytes, readTree, recordAgentQuestions,
} from "../../../db/store";
import { archivistInstructions, archivistTools } from "../../../lib/archivist";
import { reconcileProposals } from "../../../lib/agent-reconcile";
import { conflictFromCall, proposalFromCall } from "../../../lib/agent-calls";
import { LANGUAGE_ENDONYM, LANG_COOKIE, parseLang } from "../../../lib/i18n";
import type { ChangeProposal } from "../../../lib/types";
import { preventSharedCaching, privateJsonResponse } from "../../../lib/archive-cache";

export const runtime = "edge";

/** Reading the documents the family sent, one at a time, with nobody watching.
 *
 * The chat path hands its proposals to the browser, which applies them while
 * the editor is there to see it. Nobody is there for a queued document, so
 * this applies them itself - the same reconciliation, so a document that
 * describes someone already recorded updates them rather than making a
 * second copy - and everything it could not settle becomes a question in the
 * Fill-in tab instead of vanishing.
 *
 * One document per request. Draining is somebody else calling this again:
 * there is no timer in here, and installing one is not this code's decision. */

function proposalRank(proposal: ChangeProposal): number {
  return proposal.kind === "add_person" ? 0 : proposal.kind === "update_person" ? 1 : proposal.kind === "add_relationship" ? 2 : 3;
}

export async function GET() {
  const auth = await requireEditor();
  if (!auth.ok) return preventSharedCaching(auth.response);
  const queue = await listDocumentQueue();
  return privateJsonResponse({ queue, pending: queue.filter((item) => item.status === "pending").length });
}

export async function POST() {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "openai_not_configured" }, { status: 503 });

  const item = await claimNextDocument();
  if (!item) return Response.json({ done: true, read: null, pending: 0 });

  try {
    const file = await readAttachmentBytes(item.attachmentId);
    if (!file) throw new Error("the uploaded file is no longer in storage");
    const tree = await readTree();
    const readerLanguage = LANGUAGE_ENDONYM[parseLang((await cookies()).get(LANG_COOKIE)?.value)];
    const dataUrl = `data:${file.contentType};base64,${Buffer.from(file.bytes).toString("base64")}`;
    const isImage = file.contentType.startsWith("image/");

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: "gpt-5",
      instructions: archivistInstructions(readerLanguage),
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `A family member sent this document for the archive: ${file.filename}. Read it and record everything it states. Nobody is watching, so ask nothing you could answer from the document, and raise a conflict for anything you cannot settle.\n\nCurrent tree JSON:\n${JSON.stringify(tree)}` },
          isImage
            ? { type: "input_image", image_url: dataUrl, detail: "high" }
            : { type: "input_file", filename: file.filename, file_data: dataUrl },
        ],
      }] as never,
      tools: archivistTools as never,
      parallel_tool_calls: true,
      safety_identifier: `ingest_${auth.user.subject}`,
      store: false,
    });

    const calls = response.output.filter((output): output is typeof output & { type: "function_call"; name: string; arguments: string } => output.type === "function_call");
    const rawProposals = calls.map(proposalFromCall).filter((value): value is ChangeProposal => value !== null);
    const reconciled = reconcileProposals(tree, rawProposals);
    const conflicts = [...calls.map(conflictFromCall).filter((value) => value !== null), ...reconciled.conflicts];
    const proposals = reconciled.proposals;

    // people before the links between them, or a link has nobody to attach to
    let applied = 0;
    for (const proposal of [...proposals].sort((left, right) => proposalRank(left) - proposalRank(right))) {
      try {
        await applyProposal(proposal, item.uploadedBy, {
          sourceType: "attachment",
          sourceLabel: item.filename,
          attachmentId: item.attachmentId,
          sourceLocator: item.filename,
          confidence: 85,
        });
        applied += 1;
      } catch { /* one bad row must not lose the rest */ }
    }
    await recordAgentQuestions(conflicts, item.uploadedBy);

    const summary = `${applied} change${applied === 1 ? "" : "s"} applied, ${conflicts.length} question${conflicts.length === 1 ? "" : "s"} for the family`;
    await finishDocument(item.id, "read", summary);
    const queue = await listDocumentQueue();
    return Response.json({
      done: false, read: { filename: item.filename, applied, questions: conflicts.length, summary },
      pending: queue.filter((entry) => entry.status === "pending").length,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "could not be read";
    await finishDocument(item.id, "failed", reason);
    return Response.json({ done: false, read: { filename: item.filename, failed: reason }, pending: 0 }, { status: 200 });
  }
}
