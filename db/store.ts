import { env } from "cloudflare:workers";
import type { Attachment, ChangeProposal, FamilyTree, Person, Relationship, Story } from "../lib/types";

let initialized = false;
const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL, given_name TEXT, family_name TEXT,
    birth_date TEXT, death_date TEXT, birth_place TEXT, death_place TEXT, birth_city TEXT, birth_country TEXT, death_city TEXT, death_country TEXT, biography TEXT, photo_attachment_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY, from_person_id TEXT NOT NULL, to_person_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('parent', 'spouse')), created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_unique ON relationships(from_person_id, to_person_id, type)`,
  `CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, date TEXT, place TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS story_people (story_id TEXT NOT NULL, person_id TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_story_people_unique ON story_people(story_id, person_id)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, object_key TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
    size INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS story_attachments (story_id TEXT NOT NULL, attachment_id TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_story_attachments_unique ON story_attachments(story_id, attachment_id)`,
  `CREATE TABLE IF NOT EXISTS change_log (
    id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, kind TEXT NOT NULL,
    summary TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
];

export async function ensureSchema() {
  if (initialized) return;
  await env.DB.batch(schemaStatements.map((sql) => env.DB.prepare(sql)));
  for (const column of ["birth_city", "birth_country", "death_city", "death_country"]) {
    try { await env.DB.prepare(`ALTER TABLE people ADD COLUMN ${column} TEXT`).run(); } catch { /* existing deployment */ }
  }
  await env.DB.prepare("PRAGMA optimize").run();
  initialized = true;
}

export async function readTree(): Promise<FamilyTree> {
  await ensureSchema();
  const [peopleResult, relationshipsResult, storiesResult, storyPeopleResult] = await Promise.all([
    env.DB.prepare(`SELECT id, display_name AS displayName, given_name AS givenName,
      family_name AS familyName, birth_date AS birthDate, death_date AS deathDate,
      birth_place AS birthPlace, death_place AS deathPlace, birth_city AS birthCity, birth_country AS birthCountry,
      death_city AS deathCity, death_country AS deathCountry, biography, photo_attachment_id AS photoAttachmentId FROM people ORDER BY display_name`).all<Person>(),
    env.DB.prepare(`SELECT id, from_person_id AS fromPersonId, to_person_id AS toPersonId,
      type FROM relationships ORDER BY created_at`).all<Relationship>(),
    env.DB.prepare(`SELECT id, title, body, date, place FROM stories ORDER BY created_at DESC`).all<Omit<Story, "personIds">>(),
    env.DB.prepare(`SELECT story_id AS storyId, person_id AS personId FROM story_people`).all<{ storyId: string; personId: string }>(),
  ]);
  const links = new Map<string, string[]>();
  for (const row of storyPeopleResult.results) links.set(row.storyId, [...(links.get(row.storyId) ?? []), row.personId]);
  return {
    people: peopleResult.results,
    relationships: relationshipsResult.results,
    stories: storiesResult.results.map((story) => ({ ...story, personIds: links.get(story.id) ?? [] })),
  };
}

export async function saveAttachment(file: File, actorEmail: string): Promise<Attachment> {
  await ensureSchema();
  const id = crypto.randomUUID();
  const objectKey = `evidence/${id}`;
  await env.FILES.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { filename: file.name },
  });
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO attachments
    (id, object_key, filename, content_type, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, objectKey, file.name, file.type || "application/octet-stream", file.size, actorEmail, now).run();
  return { id, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size };
}

export async function readAttachment(id: string) {
  await ensureSchema();
  const metadata = await env.DB.prepare(`SELECT object_key AS objectKey, filename, content_type AS contentType
    FROM attachments WHERE id = ?`).bind(id).first<{ objectKey: string; filename: string; contentType: string }>();
  if (!metadata) return null;
  const object = await env.FILES.get(metadata.objectKey);
  return object ? { metadata, object } : null;
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function personValues(input: Record<string, unknown>): Omit<Person, "id"> {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) throw new Error("A person needs a display name.");
  return {
    displayName, givenName: nullable(input.givenName), familyName: nullable(input.familyName),
    birthDate: nullable(input.birthDate), deathDate: nullable(input.deathDate),
    birthPlace: nullable(input.birthPlace), deathPlace: nullable(input.deathPlace), birthCity: nullable(input.birthCity), birthCountry: nullable(input.birthCountry), deathCity: nullable(input.deathCity), deathCountry: nullable(input.deathCountry), biography: nullable(input.biography), photoAttachmentId: nullable(input.photoAttachmentId),
  };
}

export async function applyProposal(proposal: ChangeProposal, actorEmail: string): Promise<FamilyTree> {
  await ensureSchema();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let addedPersonId: string | null = null;
  if (proposal.kind === "add_person") {
    const person = personValues(proposal.person as unknown as Record<string, unknown>);
    const personId = crypto.randomUUID(); addedPersonId = personId;
    statements.push(env.DB.prepare(`INSERT INTO people
      (id, display_name, given_name, family_name, birth_date, death_date, birth_place, death_place, birth_city, birth_country, death_city, death_country, biography, photo_attachment_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(personId, person.displayName, person.givenName, person.familyName, person.birthDate,
        person.deathDate, person.birthPlace, person.deathPlace, person.birthCity, person.birthCountry, person.deathCity, person.deathCountry, person.biography, person.photoAttachmentId, now, now));
  } else if (proposal.kind === "update_person") {
    const person = personValues(proposal.patch as unknown as Record<string, unknown>);
    statements.push(env.DB.prepare(`UPDATE people SET display_name = ?, given_name = ?, family_name = ?, birth_date = ?,
      death_date = ?, birth_place = ?, death_place = ?, birth_city = ?, birth_country = ?, death_city = ?, death_country = ?, biography = ?, photo_attachment_id = ?, updated_at = ? WHERE id = ?`)
      .bind(person.displayName, person.givenName, person.familyName, person.birthDate, person.deathDate,
        person.birthPlace, person.deathPlace, person.birthCity, person.birthCountry, person.deathCity, person.deathCountry, person.biography, person.photoAttachmentId, now, proposal.personId));
  } else if (proposal.kind === "add_relationship") {
    if (proposal.fromPersonId === proposal.toPersonId) throw new Error("A person cannot be related to themself.");
    if (!(["parent", "spouse"] as const).includes(proposal.relationshipType)) throw new Error("Unsupported relationship.");
    statements.push(env.DB.prepare(`INSERT INTO relationships
      (id, from_person_id, to_person_id, type, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), proposal.fromPersonId, proposal.toPersonId, proposal.relationshipType, now));
  } else if (proposal.kind === "add_story") {
    if (!proposal.title.trim() || !proposal.body.trim()) throw new Error("A story needs a title and text.");
    const storyId = crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO stories (id, title, body, date, place, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(storyId, proposal.title.trim(), proposal.body.trim(), nullable(proposal.date), nullable(proposal.place), now));
    for (const personId of proposal.personIds) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (?, ?)`).bind(storyId, personId));
    for (const attachmentId of proposal.attachmentIds) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO story_attachments (story_id, attachment_id) VALUES (?, ?)`).bind(storyId, attachmentId));
  }
  statements.push(env.DB.prepare(`INSERT INTO change_log
    (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorEmail, proposal.kind, proposal.summary, JSON.stringify(proposal), now));
    await env.DB.batch(statements);
    if (proposal.kind === "add_person" && proposal.relationshipHints?.length) {
      for (const hint of proposal.relationshipHints) {
        const related = await env.DB.prepare("SELECT id FROM people WHERE lower(display_name) = lower(?) LIMIT 1").bind(hint.personName.trim()).first<{ id: string }>();
        if (related && addedPersonId && related.id !== addedPersonId) {
          const from = hint.relationshipType === "parent" ? related.id : addedPersonId;
          const to = hint.relationshipType === "parent" ? addedPersonId : related.id;
          await env.DB.prepare("INSERT OR IGNORE INTO relationships (id, from_person_id, to_person_id, type, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), from, to, hint.relationshipType, now).run();
        }
      }
    }
  return readTree();
}

export async function updatePerson(personId: string, patch: Record<string, unknown>, actorEmail: string) {
  return applyProposal({ kind: "update_person", summary: "Updated person details", personId, patch: personValues(patch) }, actorEmail);
}

export async function addRelationship(fromPersonId: string, toPersonId: string, relationshipType: "parent" | "spouse", actorEmail: string) {
  return applyProposal({ kind: "add_relationship", summary: "Added a family relationship", fromPersonId, toPersonId, relationshipType }, actorEmail);
}

export async function removeRelationship(relationshipId: string, actorEmail: string) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM relationships WHERE id = ?").bind(relationshipId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actorEmail, "remove_relationship", "Removed a family relationship", JSON.stringify({ relationshipId }), now),
  ]);
  return readTree();
}

export async function attachPersonPhoto(personId: string, file: File, actorEmail: string) {
  const attachment = await saveAttachment(file, actorEmail);
  await ensureSchema();
  await env.DB.prepare("UPDATE people SET photo_attachment_id = ?, updated_at = ? WHERE id = ?")
    .bind(attachment.id, new Date().toISOString(), personId).run();
  return readTree();
}

export async function removePerson(personId: string, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM relationships WHERE from_person_id = ? OR to_person_id = ?").bind(personId, personId),
    env.DB.prepare("DELETE FROM story_people WHERE person_id = ?").bind(personId),
    env.DB.prepare("DELETE FROM people WHERE id = ?").bind(personId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actorEmail, "remove_person", "Removed a family member", JSON.stringify({ personId }), now),
  ]);
  return readTree();
}
