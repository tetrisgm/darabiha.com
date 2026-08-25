import OpenAI from "openai";
import { Buffer } from "node:buffer";
import { requireEditor } from "../../authz";
import { readTree, saveAttachment } from "../../../db/store";
import type { ChangeProposal, Person } from "../../../lib/types";

export const runtime = "edge";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 8_000;
const ALLOWED_TYPES = new Set([
  "application/pdf", "text/plain", "text/csv", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg", "image/png", "image/webp", "image/gif",
]);

const nullableString = { type: ["string", "null"] } as const;
const personProperties = {
  display_name: { type: "string", description: "The person's public display name." },
  given_name: nullableString, family_name: nullableString,
  birth_date: { ...nullableString, description: "Use YYYY, YYYY-MM, or YYYY-MM-DD only when known." },
  death_date: { ...nullableString, description: "Use YYYY, YYYY-MM, or YYYY-MM-DD only when known." },
  birth_place: nullableString, death_place: nullableString, biography: nullableString,
};
const personRequired = Object.keys(personProperties);

const tools = [
  {
    type: "function", name: "propose_add_person", strict: true,
    description: "Propose adding one person to the public family tree. Never invent missing facts.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, ...personProperties },
      required: ["summary", ...personRequired],
    },
  },
  {
    type: "function", name: "propose_update_person", strict: true,
    description: "Propose replacing the stored fields for one existing person. Preserve every existing value not explicitly changed by the user.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, person_id: { type: "string" }, ...personProperties },
      required: ["summary", "person_id", ...personRequired],
    },
  },
  {
    type: "function", name: "propose_add_relationship", strict: true,
    description: "Propose a parent-to-child or spouse relationship between two people already in the tree.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        summary: { type: "string" }, from_person_id: { type: "string", description: "Parent for parent relationships; either spouse for spouse relationships." },
        to_person_id: { type: "string", description: "Child for parent relationships; the other spouse for spouse relationships." },
        relationship_type: { type: "string", enum: ["parent", "spouse"] },
      },
      required: ["summary", "from_person_id", "to_person_id", "relationship_type"],
    },
  },
  {
    type: "function", name: "propose_add_story", strict: true,
    description: "Propose preserving a family story, memory, or document note and link it to known people and uploaded evidence.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        summary: { type: "string" }, title: { type: "string" }, body: { type: "string" },
        date: nullableString, place: nullableString,
        person_ids: { type: "array", items: { type: "string" } },
        attachment_ids: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "title", "body", "date", "place", "person_ids", "attachment_ids"],
    },
  },
];

type ToolCall = { type: "function_call"; name: string; arguments: string };

function personFromArgs(args: Record<string, unknown>): Omit<Person, "id"> {
  return {
    displayName: String(args.display_name ?? ""),
    givenName: args.given_name as string | null,
    familyName: args.family_name as string | null,
    birthDate: args.birth_date as string | null,
    deathDate: args.death_date as string | null,
    birthPlace: args.birth_place as string | null,
    deathPlace: args.death_place as string | null,
    biography: args.biography as string | null,
  };
}

function proposalFromCall(call: ToolCall): ChangeProposal | null {
  let args: Record<string, unknown>;
  try { args = JSON.parse(call.arguments) as Record<string, unknown>; } catch { return null; }
  const summary = String(args.summary ?? "Suggested family-tree change");
  if (call.name === "propose_add_person") return { kind: "add_person", summary, person: personFromArgs(args) };
  if (call.name === "propose_update_person") return {
    kind: "update_person", summary, personId: String(args.person_id ?? ""), patch: personFromArgs(args),
  };
  if (call.name === "propose_add_relationship") return {
    kind: "add_relationship", summary, fromPersonId: String(args.from_person_id ?? ""),
    toPersonId: String(args.to_person_id ?? ""), relationshipType: args.relationship_type as "parent" | "spouse",
  };
  if (call.name === "propose_add_story") return {
    kind: "add_story", summary, title: String(args.title ?? "Family story"), body: String(args.body ?? ""),
    date: args.date as string | null, place: args.place as string | null,
    personIds: Array.isArray(args.person_ids) ? args.person_ids.map(String) : [],
    attachmentIds: Array.isArray(args.attachment_ids) ? args.attachment_ids.map(String) : [],
  };
  return null;
}

export async function POST(request: Request) {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "openai_not_configured" }, { status: 503 });

  const form = await request.formData();
  const message = String(form.get("message") ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  const history = String(form.get("history") ?? "").slice(0, 16_000);
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!message && files.length === 0) return Response.json({ error: "empty_message" }, { status: 400 });
  if (files.some((file) => file.size > MAX_FILE_BYTES) || files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
    return Response.json({ error: "files_too_large" }, { status: 413 });
  }
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) {
    return Response.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  const tree = await readTree();
  const stored = await Promise.all(files.map((file) => saveAttachment(file, auth.user.email)));
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `${message || "Please examine the attached material."}\n\nRecent conversation:\n${history || "(none)"}\n\nCurrent tree JSON:\n${JSON.stringify(tree)}\n\nUploaded evidence IDs:\n${JSON.stringify(stored)}`,
  }];
  for (const file of files) {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;
    content.push(file.type.startsWith("image/")
      ? { type: "input_image", image_url: dataUrl, detail: "high" }
      : { type: "input_file", filename: file.name, file_data: dataUrl, detail: "high" });
  }

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4",
      instructions: `You are the careful archivist for the public Darabi family tree. Extract only facts the editor states or that are legible in attached evidence. Never guess names, dates, places, identities, or relationships. If a request is ambiguous, ask one concise question and do not call a tool. Existing person IDs must be copied exactly from the supplied tree. A parent relationship is directional: from_person_id is the parent and to_person_id is the child. Changes are proposals reviewed by the editor, so use the proposal tools for every concrete change. You may propose several changes. Uploaded documents remain private evidence; attachment IDs may be linked to a story. Keep your prose warm, plain, and concise.`,
      input: [{ role: "user", content }] as never,
      tools: tools as never,
      parallel_tool_calls: false,
      safety_identifier: `editor_${auth.user.userId}`,
      store: false,
    });
    const proposals = response.output
      .filter((item): item is typeof item & ToolCall => item.type === "function_call")
      .map((item) => proposalFromCall(item))
      .filter((item): item is ChangeProposal => item !== null);
    const reply = response.output_text.trim() || (proposals.length
      ? `I prepared ${proposals.length === 1 ? "a change" : `${proposals.length} changes`} for your review.`
      : "I need a little more detail before changing the tree.");
    return Response.json({ reply, proposals, attachments: stored });
  } catch (error) {
    console.warn("Family archivist request failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "agent_failed" }, { status: 502 });
  }
}
