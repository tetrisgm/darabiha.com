/** MCP write tools: builders that turn tool arguments into ChangeProposals.
 *
 * Pure by design - each builder returns a validated proposal, and the MCP
 * route submits it to the agent-proposal queue where an editor applies or
 * rejects it. External agents never mutate the tree directly, and only
 * additive kinds exist here: no update, delete, or merge tool is offered.
 */

import { isChangeProposal } from "./change-proposal";
import type { ChangeProposal, FamilyTree, Person } from "./types";

type JsonSchema = Record<string, unknown>;
export type McpWriteTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  build: (args: Record<string, unknown>, tree: FamilyTree) => { proposal: ChangeProposal; note: string | null };
};

const text = (value: unknown, maximum: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
};

const note = (args: Record<string, unknown>) => text(args.source_note, 1000);

const requirePerson = (tree: FamilyTree, id: unknown, field: string): Person => {
  const person = typeof id === "string" ? tree.people.find((candidate) => candidate.id === id) : undefined;
  if (!person) throw new Error(`${field} does not name a person in the archive. Use find_person to look up ids.`);
  return person;
};

const emptyPerson: Omit<Person, "id"> = {
  displayName: "", gender: null, givenName: null, familyName: null, maidenName: null,
  birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, birthCity: null,
  birthCountry: null, deathCity: null, deathCountry: null, burialPlace: null,
  residence: null, biography: null, photoAttachmentId: null,
};

const validated = (proposal: ChangeProposal): ChangeProposal => {
  if (!isChangeProposal(proposal)) throw new Error("The proposal did not validate; check field lengths and formats.");
  return proposal;
};

export const MCP_WRITE_TOOLS: McpWriteTool[] = [
  {
    name: "propose_person",
    description: "Propose adding a person to the archive. The proposal waits for a family editor to review; it does not change the tree immediately. Include a source_note saying where this information comes from.",
    inputSchema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "The person's full display name." },
        gender: { type: "string", enum: ["male", "female"] },
        birth_date: { type: "string", description: "YYYY, YYYY-MM, or YYYY-MM-DD." },
        death_date: { type: "string" },
        birth_city: { type: "string" }, birth_country: { type: "string" },
        biography: { type: "string" },
        source_note: { type: "string", description: "Where this information comes from - a document, a relative, a record." },
      },
      required: ["display_name", "source_note"],
      additionalProperties: false,
    },
    build: (args, tree) => {
      const displayName = text(args.display_name, 300);
      if (!displayName) throw new Error("display_name is required.");
      const existing = tree.people.filter((person) => person.displayName.toLowerCase() === displayName.toLowerCase());
      if (existing.length) throw new Error(`${displayName} may already be recorded (${existing.map((person) => person.id).join(", ")}). Look at the existing record first; if this is truly a different person, say so in source_note and retry with a distinguishing detail in the name.`);
      return {
        proposal: validated({
          kind: "add_person",
          summary: `Add ${displayName}`,
          person: {
            ...emptyPerson,
            displayName,
            gender: args.gender === "male" || args.gender === "female" ? args.gender : null,
            birthDate: text(args.birth_date, 100),
            deathDate: text(args.death_date, 100),
            birthCity: text(args.birth_city, 500),
            birthCountry: text(args.birth_country, 500),
            biography: text(args.biography, 50_000),
          },
        }),
        note: note(args),
      };
    },
  },
  {
    name: "propose_relationship",
    description: "Propose linking two recorded people: a parent-child link (from parent to child) or a marriage. Waits for editor review.",
    inputSchema: {
      type: "object",
      properties: {
        from_person_id: { type: "string", description: "For parent links, the parent." },
        to_person_id: { type: "string", description: "For parent links, the child." },
        relationship_type: { type: "string", enum: ["parent", "spouse"] },
        source_note: { type: "string" },
      },
      required: ["from_person_id", "to_person_id", "relationship_type", "source_note"],
      additionalProperties: false,
    },
    build: (args, tree) => {
      const from = requirePerson(tree, args.from_person_id, "from_person_id");
      const to = requirePerson(tree, args.to_person_id, "to_person_id");
      const type = args.relationship_type === "parent" || args.relationship_type === "spouse" ? args.relationship_type : null;
      if (!type) throw new Error("relationship_type must be parent or spouse.");
      if (from.id === to.id) throw new Error("A person cannot be linked to themselves.");
      const already = tree.relationships.some((link) => link.type === type
        && ((link.fromPersonId === from.id && link.toPersonId === to.id) || (type === "spouse" && link.fromPersonId === to.id && link.toPersonId === from.id)));
      if (already) throw new Error("That relationship is already recorded.");
      return {
        proposal: validated({
          kind: "add_relationship",
          summary: type === "parent" ? `Record ${from.displayName} as a parent of ${to.displayName}` : `Record the marriage of ${from.displayName} and ${to.displayName}`,
          fromPersonId: from.id,
          toPersonId: to.id,
          relationshipType: type,
        }),
        note: note(args),
      };
    },
  },
  {
    name: "propose_story",
    description: "Propose adding a family story or memory, linked to the people it involves. Waits for editor review.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "The story, in English." },
        date: { type: "string" }, place: { type: "string" },
        person_ids: { type: "array", items: { type: "string" }, description: "People this story involves." },
        source_note: { type: "string" },
      },
      required: ["title", "body", "source_note"],
      additionalProperties: false,
    },
    build: (args, tree) => {
      const title = text(args.title, 500);
      const body = text(args.body, 200_000);
      if (!title || !body) throw new Error("title and body are required.");
      const personIds = Array.isArray(args.person_ids) ? args.person_ids.slice(0, 32).map((id) => requirePerson(tree, id, "person_ids").id) : [];
      return {
        proposal: validated({
          kind: "add_story",
          summary: `Add the story “${title}”`,
          title, body,
          date: text(args.date, 100),
          place: text(args.place, 500),
          personIds,
          attachmentIds: [],
        }),
        note: note(args),
      };
    },
  },
];

export function findMcpWriteTool(name: string): McpWriteTool | null {
  return MCP_WRITE_TOOLS.find((candidate) => candidate.name === name) ?? null;
}
