import OpenAI from "openai";
import { Buffer } from "node:buffer";
import { strFromU8 } from "fflate";
import { requireEditor } from "../../authz";
import { cookies } from "next/headers";
import { LANGUAGE_ENDONYM, LANG_COOKIE, parseLang } from "../../../lib/i18n";
import { listAttachments, readTree, recordAgentQuestions, saveAttachment } from "../../../db/store";
import { extractArchiveEntries } from "../../../lib/archive-import";
import { reconcileProposals } from "../../../lib/agent-reconcile";
import { familyFactoids, onThisDay } from "../../../lib/family-facts";
import { describeRelationship, relationshipSentence } from "../../../lib/relationship-path";
import { interviewLeads } from "../../../lib/interview";
import type { AgentConflict, ChangeProposal, FamilyTree, Person } from "../../../lib/types";

export const runtime = "edge";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_EXTRACTED_BYTES = 30 * 1024 * 1024;
const MAX_ARCHIVE_TEXT_CHARS = 1_000_000;
const MAX_ARCHIVE_IMAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;
const nullableString = { type: ["string", "null"] } as const;
const personProperties = {
  display_name: { type: "string", description: "The person's public display name." },
  gender: { type: ["string", "null"], enum: ["male", "female", null], description: "Record only when the source states or unambiguously identifies it; otherwise null." },
  given_name: nullableString, family_name: nullableString,
  birth_date: { ...nullableString, description: "Use YYYY, YYYY-MM, or YYYY-MM-DD only when known." },
  death_date: { ...nullableString, description: "Use YYYY, YYYY-MM, or YYYY-MM-DD only when known." },
  birth_place: nullableString, death_place: nullableString,
  birth_city: nullableString, birth_country: nullableString, death_city: nullableString, death_country: nullableString,
  burial_place: { ...nullableString, description: "Cemetery or plot where the person is buried, when the source names one." },
  residence: { ...nullableString, description: "Where the person lives, or last lived - a city or country, not a street address." },
  biography: nullableString,
  photo_attachment_id: { ...nullableString, description: "Use an uploaded image attachment ID only when the evidence clearly identifies the pictured person." },
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
        summary: { type: "string" }, from_person_id: { ...nullableString, description: "Exact existing ID, or null when this person is being created in the same response." },
        to_person_id: { ...nullableString, description: "Exact existing ID, or null when this person is being created in the same response." },
        from_person_name: { ...nullableString, description: "Exact display name used to resolve a newly created person when no ID exists." },
        to_person_name: { ...nullableString, description: "Exact display name used to resolve a newly created person when no ID exists." },
        relationship_type: { type: "string", enum: ["parent", "spouse"] },
      },
      required: ["summary", "from_person_id", "to_person_id", "from_person_name", "to_person_name", "relationship_type"],
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
  {
    type: "function", name: "propose_delete_person", strict: true,
    description: "Delete a person only when the editor explicitly asks, or when evidence unambiguously proves this is an accidental duplicate. This also removes their relationships.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, person_id: { type: "string" } },
      required: ["summary", "person_id"],
    },
  },
  {
    type: "function", name: "propose_delete_relationship", strict: true,
    description: "Remove one incorrect relationship using its exact relationship ID from the current tree.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, relationship_id: { type: "string" } },
      required: ["summary", "relationship_id"],
    },
  },
  {
    type: "function", name: "propose_update_story", strict: true,
    description: "Replace a stored story while preserving every value that the editor did not change.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        summary: { type: "string" }, story_id: { type: "string" }, title: { type: "string" }, body: { type: "string" },
        date: nullableString, place: nullableString,
        person_ids: { type: "array", items: { type: "string" } },
        attachment_ids: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "story_id", "title", "body", "date", "place", "person_ids", "attachment_ids"],
    },
  },
  {
    type: "function", name: "propose_delete_story", strict: true,
    description: "Delete a story only when the editor explicitly asks or evidence unambiguously proves it is a duplicate.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, story_id: { type: "string" } },
      required: ["summary", "story_id"],
    },
  },
  {
    type: "function", name: "propose_delete_attachment", strict: true,
    description: "Permanently delete private uploaded evidence only when the editor explicitly asks. Links from stories and portraits are removed too.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { summary: { type: "string" }, attachment_id: { type: "string" } },
      required: ["summary", "attachment_id"],
    },
  },
  {
    type: "function", name: "request_clarification", strict: true,
    description: "Ask one focused question only when plausible identities or contradictory facts cannot be resolved from the current tree, conversation, and evidence.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        question: { type: "string" }, reason: { type: "string" },
        candidate_person_ids: { type: "array", items: { type: "string" } },
        evidence: { type: "array", items: { type: "string" } },
      },
      required: ["question", "reason", "candidate_person_ids", "evidence"],
    },
  },
];

type ToolCall = { type: "function_call"; name: string; arguments: string };

/** Relationships are graph facts, so they are computed and handed over rather
 * than left to the model; the interview leads are the gaps near whoever is
 * being discussed, which is the only place a living relative can actually
 * help. */
function archivistContext(tree: FamilyTree, conversation: string): string {
  const asked = conversation.toLocaleLowerCase();
  const named = tree.people.filter((person) => person.displayName.length >= 4 && asked.includes(person.displayName.toLocaleLowerCase().split(" ")[0]));
  const pairs: string[] = [];
  for (let i = 0; i < named.length && i < 6; i += 1) {
    for (let j = i + 1; j < named.length && j < 6; j += 1) {
      const result = describeRelationship(tree, named[i].id, named[j].id);
      if (result) pairs.push(relationshipSentence(result));
    }
  }
  const leads = interviewLeads(tree, named.map((person) => person.id));
  const today = onThisDay(tree).map((fact) => fact.text);
  return [
    pairs.length ? `Computed relationships (authoritative):\n${pairs.join("\n")}` : "",
    leads.length ? `Worth asking about (gaps near the people in this conversation):\n${leads.map((lead) => `- ${lead.personName}${lead.nearTo ? ` (near ${lead.nearTo})` : ""}: missing ${lead.missing.join(", ")}`).join("\n")}` : "",
    today.length ? `Anniversaries today:\n${today.join("\n")}` : "",
    `Facts about the archive:\n${familyFactoids(tree).map((fact) => fact.text).join("\n")}`,
  ].filter(Boolean).join("\n\n") + "\n\n";
}

function personFromArgs(args: Record<string, unknown>): Omit<Person, "id"> {
  return {
    displayName: String(args.display_name ?? ""),
    gender: args.gender as "male" | "female" | null,
    givenName: args.given_name as string | null,
    familyName: args.family_name as string | null,
  maidenName: (args.maiden_name as string | null) ?? null,
    birthDate: args.birth_date as string | null,
    deathDate: args.death_date as string | null,
    birthPlace: args.birth_place as string | null,
    deathPlace: args.death_place as string | null,
    birthCity: args.birth_city as string | null,
    birthCountry: args.birth_country as string | null,
    deathCity: args.death_city as string | null,
    deathCountry: args.death_country as string | null,
    burialPlace: (args.burial_place as string | null) ?? null,
    residence: (args.residence as string | null) ?? null,
    biography: args.biography as string | null,
    photoAttachmentId: args.photo_attachment_id as string | null,
  };
}

function proposalFromCall(call: ToolCall): ChangeProposal | null {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments) as Record<string, unknown>; } catch { return null; }
  const summary = String(args.summary ?? "Suggested family-tree change");
  if (call.name === "propose_add_person") return { kind: "add_person", summary, person: personFromArgs(args), relationshipHints: Array.isArray(args.relationship_hints) ? args.relationship_hints.map((hint) => ({ personName: String((hint as Record<string, unknown>).person_name ?? ""), relationshipType: (hint as Record<string, unknown>).relationship_type as "parent" | "spouse" })) : [] };
  if (call.name === "propose_update_person") return {
    kind: "update_person", summary, personId: String(args.person_id ?? ""), patch: personFromArgs(args),
  };
  if (call.name === "propose_add_relationship") return {
    kind: "add_relationship", summary, fromPersonId: String(args.from_person_id ?? ""),
    toPersonId: String(args.to_person_id ?? ""), fromPersonName: args.from_person_name as string | null,
    toPersonName: args.to_person_name as string | null, relationshipType: args.relationship_type as "parent" | "spouse",
  };
  if (call.name === "propose_add_story") return {
    kind: "add_story", summary, title: String(args.title ?? "Family story"), body: String(args.body ?? ""),
    date: args.date as string | null, place: args.place as string | null,
    personIds: Array.isArray(args.person_ids) ? args.person_ids.map(String) : [],
    attachmentIds: Array.isArray(args.attachment_ids) ? args.attachment_ids.map(String) : [],
  };
  if (call.name === "propose_delete_person") return { kind: "delete_person", summary, personId: String(args.person_id ?? "") };
  if (call.name === "propose_delete_relationship") return { kind: "delete_relationship", summary, relationshipId: String(args.relationship_id ?? "") };
  if (call.name === "propose_update_story") return {
    kind: "update_story", summary, storyId: String(args.story_id ?? ""), title: String(args.title ?? "Family story"), body: String(args.body ?? ""),
    date: args.date as string | null, place: args.place as string | null,
    personIds: Array.isArray(args.person_ids) ? args.person_ids.map(String) : [],
    attachmentIds: Array.isArray(args.attachment_ids) ? args.attachment_ids.map(String) : [],
  };
  if (call.name === "propose_delete_story") return { kind: "delete_story", summary, storyId: String(args.story_id ?? "") };
  if (call.name === "propose_delete_attachment") return { kind: "delete_attachment", summary, attachmentId: String(args.attachment_id ?? "") };
  return null;
}

function conflictFromCall(call: ToolCall): AgentConflict | null {
  if (call.name !== "request_clarification") return null;
  try {
    const args = JSON.parse(call.arguments) as Record<string, unknown>;
    return {
      question: String(args.question ?? "Could you clarify which person you mean?"),
      reason: String(args.reason ?? "The records contain conflicting identity evidence."),
      candidatePersonIds: Array.isArray(args.candidate_person_ids) ? args.candidate_person_ids.map(String) : [],
      evidence: Array.isArray(args.evidence) ? args.evidence.map(String) : [],
    };
  } catch { return null; }
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
  const [tree, existingAttachments] = await Promise.all([readTree(), listAttachments()]);
  // the archive is multilingual and so is the reader
  const readerLanguage = LANGUAGE_ENDONYM[parseLang((await cookies()).get(LANG_COOKIE)?.value)];
  const stored = await Promise.all(files.map((file) => saveAttachment(file, auth.user.email)));
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `${message || "Please examine the attached material."}\n\nRecent conversation:\n${history || "(none)"}\n\nFolder/file manifest (paths preserve recursive folder structure):\n${manifest || "(none)"}\n\n${archivistContext(tree, `${message} ${history}`)}Current tree JSON:\n${JSON.stringify(tree)}\n\nExisting private attachment metadata:\n${JSON.stringify(existingAttachments)}\n\nNew uploaded evidence IDs:\n${JSON.stringify(stored)}`,
  }];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        const entries = extractArchiveEntries(new Uint8Array(await file.arrayBuffer()), { entryBytes: MAX_ARCHIVE_ENTRY_BYTES, totalBytes: MAX_ARCHIVE_EXTRACTED_BYTES, entries: 500 });
        let textChars = 0;
        let imageCount = 0;
        for (const { path, bytes, kind } of entries) {
          if (kind === "text") {
            const remaining = MAX_ARCHIVE_TEXT_CHARS - textChars;
            if (remaining <= 0) continue;
            const extracted = strFromU8(bytes).slice(0, Math.min(120_000, remaining));
            textChars += extracted.length;
            content.push({ type: "input_text", text: `Extracted from ${file.name}/${path}:\n${extracted}` });
          } else {
            if (imageCount >= MAX_ARCHIVE_IMAGES) continue;
            imageCount += 1;
            const extension = path.split(".").pop()?.toLowerCase();
            const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
            const embedded = await saveAttachment(new File([bytes as unknown as BlobPart], path, { type: mime }), auth.user.email);
            stored.push(embedded);
            content.push({ type: "input_text", text: `Embedded image ${file.name}/${path} was preserved as attachment ID ${embedded.id}. Use that ID as a portrait only if the archive explicitly links this image to a person.` });
            content.push({ type: "input_image", image_url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`, detail: "high" });
          }
        }
      } catch { content.push({ type: "input_text", text: `The uploaded ZIP ${file.name} could not be unpacked; use its filename as evidence only.` }); }
      continue;
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const contentType = file.type || "application/octet-stream";
    const dataUrl = `data:${contentType};base64,${base64}`;
    content.push(contentType.startsWith("image/")
      ? { type: "input_image", image_url: dataUrl, detail: "high" }
      : /\.(pdf|docx|xlsx|csv|txt|md|html?|json|xml)$/i.test(file.name)
        ? { type: "input_file", filename: file.name, file_data: dataUrl, detail: "high" }
        : { type: "input_text", text: `Uploaded evidence file ${file.name} (${contentType}, ${file.size} bytes) was preserved, but its binary format cannot be read directly.` });
  }

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4",
      instructions: `You are the careful archivist and data manager for the public Darabiha family tree. You have full create, read, update, and delete capability through the supplied tools. Treat each editor message and every attached file, recursive folder export, or ZIP as a dataset to ingest, not as a single fact. Extract ALL distinct people, dates, city/country locations, biographies, photographs, stories, and relationships that are explicitly stated or legible. Inspect HTML structure, visible text, GEDCOM, embedded JSON, linked data, CSV rows, document tables, and images; CSS/JS are evidence only when they contain labels, data objects, or relationship metadata. Never guess.

Past data must never block new information. Reconcile incoming people against the current tree using normalized names, dates, places, biography, parents, spouses, children, and sibling context. When one existing record clearly matches, update it instead of creating a duplicate. When the editor explicitly identifies an accidental duplicate, consolidate useful facts into the canonical person and delete the duplicate. Resolve harmless formatting, capitalization, empty-field, and more-complete-value differences yourself. Ask a clarification question only when evidence supports multiple plausible people or contains a material contradiction you cannot resolve. Do not ask for confirmation for routine high-confidence changes.

For a rich message or multi-file upload, call tools once for every distinct person, relationship, and story; do not stop after the first item. Preserve complex graphs: cousins or siblings may marry, a person may have multiple spouses, and blended or repeated parent/child links must be represented without inventing relationships. Existing person, relationship, and story IDs must be copied exactly from the supplied tree. For people created in this same response, set the relationship ID to null and provide their exact display name so the server can resolve it after creation. A parent relationship is directional: from_person_id/from_person_name is the parent and to_person_id/to_person_name is the child. Preserve every existing field not changed by the editor. Use delete tools only for an explicit request or an unambiguous duplicate. Every summary must include enough disambiguating context for same-name relatives. Uploaded documents remain private evidence; attachment IDs may be linked to stories. Keep prose warm, direct, and concise. Write replies for a narrow chat column: short paragraphs, each list item on its own line beginning with "- ", bold only for a name or a label, and never print internal IDs or UUIDs — refer to people by name.

When the editor asks how two people are related, use the precomputed relationships supplied with the tree rather than working them out yourself.

LANGUAGE. This family's records are not in one language: the histories were written in Persian, part of the family lives in France, and the archive holds all of it. Read whatever you are given - Persian, French, English, or a message that mixes them - and reply in the language the reader is using, which is ${readerLanguage}. A question asked in Persian is answered in Persian.

Names carry across scripts badly. When a document names someone in Persian or French, match them against the existing records first and reuse the spelling the archive already uses for that person; transliterate afresh only for someone genuinely new, and then keep to one spelling throughout. A name is a record, not a phrase to translate.

Dates may be Solar Hijri. Convert to a Gregorian year only when you are certain; otherwise record the date as the source writes it and ask which year is meant rather than guessing.

When you preserve a passage the family wrote, keep their own words as the story's original and put a faithful English rendering in the body - the archive stores both, and the original is the record.

INTERVIEWING. This archive is filled in by the family, so behave like an interviewer as well as a scribe. After you have applied what the editor told you, look at the gaps listed under "Worth asking about" and ask ONE natural follow-up about a person they plainly know — where a relative was born, where they live now, when someone married, who a spouse's parents were, what someone did for a living. Ask about people close to the ones they are already discussing, never about strangers deep in the tree. One question at a time, warm and specific ("Do you know where Kazem's children were born?"), and drop it if they ignore it twice. If the editor says they do not know, accept it and move on.`,
      input: [{ role: "user", content }] as never,
      tools: tools as never,
      parallel_tool_calls: true,
      safety_identifier: `editor_${auth.user.subject}`,
      store: false,
    });
    const calls = response.output.filter((item): item is typeof item & ToolCall => item.type === "function_call");
    const rawProposals = calls
      .map((item) => proposalFromCall(item))
      .filter((item): item is ChangeProposal => item !== null);
    const explicitConflicts = calls.map((item) => conflictFromCall(item)).filter((item): item is AgentConflict => item !== null);
    const reconciled = reconcileProposals(tree, rawProposals);
    const conflicts = [...explicitConflicts, ...reconciled.conflicts];
    // What reading the material raised but could not settle belongs in the
    // Fill-in tab, where the family can answer it, rather than only in a chat
    // reply that scrolls away.
    await recordAgentQuestions(conflicts, auth.user.email);
    const reply = response.output_text.trim() || (conflicts.length
      ? conflicts.map((conflict) => conflict.question).join("\n\n")
      : reconciled.proposals.length
        ? `I found and applied ${reconciled.proposals.length === 1 ? "one update" : `${reconciled.proposals.length} updates`}.`
        : "I could not find a concrete change to make yet.");
    return Response.json({ reply, proposals: reconciled.proposals, conflicts, attachments: stored });
  } catch (error) {
    console.warn("Family archivist request failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "agent_failed" }, { status: 502 });
  }
}
