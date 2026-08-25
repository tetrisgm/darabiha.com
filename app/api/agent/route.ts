import OpenAI from "openai";
import { Buffer } from "node:buffer";
import { strFromU8, unzipSync } from "fflate";
import { requireEditor } from "../../authz";
import { readTree, saveAttachment } from "../../../db/store";
import type { ChangeProposal, Person } from "../../../lib/types";

export const runtime = "edge";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 8_000;
const ALLOWED_TYPES = new Set([
  "application/pdf", "text/plain", "text/csv", "text/markdown",
  "text/html", "text/css", "text/javascript", "application/javascript", "application/json", "application/xml", "text/xml",
  "application/zip", "application/x-zip-compressed",
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
  birth_place: nullableString, death_place: nullableString,
  birth_city: nullableString, birth_country: nullableString, death_city: nullableString, death_country: nullableString,
  biography: nullableString,
};
const personRequired = Object.keys(personProperties);

const tools = [
  {
    type: "function", name: "propose_add_person", strict: true,
    description: "Propose adding one person to the public family tree. Never invent missing facts.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, ...personProperties, relationship_hints: { type: "array", items: { type: "object", additionalProperties: false, properties: { person_name: { type: "string" }, relationship_type: { type: "string", enum: ["parent", "spouse"] } }, required: ["person_name", "relationship_type"] } } },
      required: ["summary", ...personRequired, "relationship_hints"],
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
    birthCity: args.birth_city as string | null,
    birthCountry: args.birth_country as string | null,
    deathCity: args.death_city as string | null,
    deathCountry: args.death_country as string | null,
    biography: args.biography as string | null,
    photoAttachmentId: null,
  };
}

function proposalFromCall(call: ToolCall): ChangeProposal | null {
  let args: Record<string, unknown>;
  try { args = JSON.parse(call.arguments) as Record<string, unknown>; } catch { return null; }
  const summary = String(args.summary ?? "Suggested family-tree change");
  if (call.name === "propose_add_person") return { kind: "add_person", summary, person: personFromArgs(args), relationshipHints: Array.isArray(args.relationship_hints) ? args.relationship_hints.map((hint) => ({ personName: String((hint as Record<string, unknown>).person_name ?? ""), relationshipType: (hint as Record<string, unknown>).relationship_type as "parent" | "spouse" })) : [] };
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
  const manifest = String(form.get("file_manifest") ?? "").slice(0, 20_000);
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!message && files.length === 0) return Response.json({ error: "empty_message" }, { status: 400 });
  if (files.some((file) => file.size > MAX_FILE_BYTES) || files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
    return Response.json({ error: "files_too_large" }, { status: 413 });
  }
  if (files.some((file) => !ALLOWED_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".zip"))) {
    return Response.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  const tree = await readTree();
  const stored = await Promise.all(files.map((file) => saveAttachment(file, auth.user.email)));
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `${message || "Please examine the attached material."}\n\nRecent conversation:\n${history || "(none)"}\n\nFolder/file manifest (paths preserve recursive folder structure):\n${manifest || "(none)"}\n\nCurrent tree JSON:\n${JSON.stringify(tree)}\n\nUploaded evidence IDs:\n${JSON.stringify(stored)}`,
  }];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
        for (const [path, bytes] of Object.entries(entries)) {
          if (bytes.length > 2_000_000 || !/\.(html?|css|js(on)?|txt|md|csv|xml)$/i.test(path)) continue;
          content.push({ type: "input_text", text: `Extracted from ${file.name}/${path}:\n${strFromU8(bytes).slice(0, 120_000)}` });
        }
      } catch { content.push({ type: "input_text", text: `The uploaded ZIP ${file.name} could not be unpacked; use its filename as evidence only.` }); }
      continue;
    }
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
      instructions: `You are the careful archivist for the public Darabi family tree. Treat each editor message and every attached file or folder export as a dataset to ingest, not as a single fact. Extract ALL distinct people, dates, city/country locations, biographies, stories, and relationships that are explicitly stated or legible. Inspect HTML structure, visible text, embedded JSON, linked data, CSV rows, and document tables; CSS/JS are evidence only when they contain labels, data objects, or relationship metadata. Never guess. For a rich message or multi-file upload, call proposal tools once for every distinct person, relationship, and story; do not stop after the first proposal. Reconcile duplicate names against the current tree using dates, places, biography, and family context. Preserve complex graphs: cousins or siblings may marry, a person may have multiple spouses, and blended or repeated parent/child links must be represented without inventing relationships. Existing person IDs must be copied exactly from the supplied tree. A parent relationship is directional: from_person_id is the parent and to_person_id is the child. Every proposal summary must include enough disambiguating context (date/year, place, and relationship) for an editor to distinguish people with the same name. Use proposal tools for every concrete change. You may propose many changes in one response. Uploaded documents remain private evidence; attachment IDs may be linked to stories. Keep your prose warm, plain, and concise.`,
      input: [{ role: "user", content }] as never,
      tools: tools as never,
      parallel_tool_calls: true,
      safety_identifier: `editor_${auth.user.subject}`,
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
