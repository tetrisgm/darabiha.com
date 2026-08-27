import { env } from "cloudflare:workers";
import type { Attachment, ChangeProposal, FamilyTree, OpenQuestion, Person, Relationship, Story } from "../lib/types";
import { runRecordChecks } from "../lib/record-checks";

let initialized = false;
const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL, gender TEXT CHECK(gender IN ('male', 'female')), given_name TEXT, family_name TEXT,
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
  `CREATE TABLE IF NOT EXISTS person_comments (
    id TEXT PRIMARY KEY, person_id TEXT NOT NULL, author_email TEXT NOT NULL, author_name TEXT,
    body TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_person_comments_person ON person_comments(person_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS person_photos (
    person_id TEXT NOT NULL, attachment_id TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_person_photos_unique ON person_photos(person_id, attachment_id)`,
  `CREATE TABLE IF NOT EXISTS open_questions (
    id TEXT PRIMARY KEY, question TEXT NOT NULL, evidence TEXT, action_summary TEXT,
    proposal_json TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'confirmed', 'denied')),
    answer_note TEXT, answered_by TEXT, answered_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS change_log (
    id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, kind TEXT NOT NULL,
    summary TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    email TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('admin', 'canEdit', 'canView')),
    person_id TEXT, added_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS member_links (
    email TEXT PRIMARY KEY, member_email TEXT NOT NULL, provider TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS document_queue (
    id TEXT PRIMARY KEY, attachment_id TEXT NOT NULL, filename TEXT NOT NULL,
    uploaded_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending', 'reading', 'read', 'failed')),
    result TEXT, created_at TEXT NOT NULL, processed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_document_queue_status ON document_queue(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
];

export async function ensureSchema() {
  if (initialized) return;
  await env.DB.batch(schemaStatements.map((sql) => env.DB.prepare(sql)));
  for (const column of ["birth_city", "birth_country", "death_city", "death_country", "gender", "maiden_name", "burial_place", "residence"]) {
    try { await env.DB.prepare(`ALTER TABLE people ADD COLUMN ${column} TEXT`).run(); } catch { /* existing deployment */ }
  }
  try { await env.DB.prepare("ALTER TABLE relationships ADD COLUMN status TEXT").run(); } catch { /* existing deployment */ }
  // Which person in the tree an account belongs to, so the archive can open
  // where that person stands rather than at the founders.
  try { await env.DB.prepare("ALTER TABLE members ADD COLUMN person_id TEXT").run(); } catch { /* existing deployment */ }
  // claimMemberPerson checks this too, but a check followed by a write is not
  // atomic: two claims arriving together would both pass it
  try { await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_members_person ON members(person_id) WHERE person_id IS NOT NULL").run(); } catch { /* older SQLite */ }
  // Imported archive material is written in its own language; body holds the
  // English a reader sees first, original_body the words the family wrote.
  try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN original_body TEXT").run(); } catch { /* existing deployment */ }
  // The roles are named for what they let a person do - canView, canEdit,
  // admin - and older databases carry 'viewer' and 'editor' under a CHECK
  // constraint SQLite cannot alter, so the table is rebuilt once and the
  // values mapped across.
  const membersSchema = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'").first<{ sql: string }>();
  if (membersSchema && !membersSchema.sql.includes("'canView'")) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS members_next (
        email TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('admin', 'canEdit', 'canView')),
        added_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`INSERT OR IGNORE INTO members_next
        SELECT email, CASE role WHEN 'editor' THEN 'canEdit' WHEN 'viewer' THEN 'canView' ELSE role END,
        added_by, created_at, updated_at FROM members`),
      env.DB.prepare("DROP TABLE members"),
      env.DB.prepare("ALTER TABLE members_next RENAME TO members"),
    ]);
  }
  // First run seeds the member list: the owner as admin, plus any emails the
  // old EDITOR_EMAILS allow-list carried, as editors.
  const memberCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM members").first<{ count: number }>();
  if (!memberCount?.count) {
    const now = new Date().toISOString();
    const seeds: [string, "admin" | "canEdit"][] = [["ramine@ramine.net", "admin"]];
    for (const email of (process.env.EDITOR_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)) {
      if (!seeds.some(([seeded]) => seeded === email)) seeds.push([email, "canEdit"]);
    }
    await env.DB.batch(seeds.map(([email, role]) =>
      env.DB.prepare("INSERT OR IGNORE INTO members (email, role, added_by, created_at, updated_at) VALUES (?, ?, 'seed', ?, ?)").bind(email, role, now, now)));
  }
  await env.DB.prepare("PRAGMA optimize").run();
  initialized = true;
}

export type MemberRole = "admin" | "canEdit" | "canView";

export type SiteVisibility = "public" | "members" | "password";
let visibilityCache: { value: SiteVisibility; time: number } | null = null;

/** "public": anyone can visit. "members": visitors must sign in (every first
 * sign-in auto-registers someone who can view, so the member list is the
 * guest book and admins can raise or remove anyone). "password": anyone with
 * the family's shared password, or the private link, or a place on the
 * member list. */
export async function getSiteVisibility(fresh = false): Promise<SiteVisibility> {
  // The cache is per-isolate, so a write in one isolate leaves another
  // holding the old answer for up to ten seconds. That is fine for deciding
  // whether to let a reader in; it is not fine for a decision that changes
  // who can see the archive, so those ask for a fresh read.
  if (!fresh && visibilityCache && Date.now() - visibilityCache.time < 10_000) return visibilityCache.value;
  await ensureSchema();
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'visibility'").first<{ value: string }>();
  const value: SiteVisibility = row?.value === "members" ? "members" : row?.value === "password" ? "password" : "public";
  visibilityCache = { value, time: Date.now() };
  return value;
}

/* The shared password and the private link.
 *
 * The password is only ever kept as the keyed digest lib/access.ts produces:
 * nothing here can return it, because nothing here has it. The share token is
 * a secret in the same sense - it is returned to admins so they can copy the
 * link, and to nobody else. */

async function readSetting(key: string): Promise<string | null> {
  await ensureSchema();
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string, actorEmail: string, summary: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, value, now),
    // the payload records that it happened, never what was set
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "site_access", summary, JSON.stringify({ setting: key }), now),
  ]);
}

export const accessPasswordDigest = () => readSetting("access_password");
export const hasAccessPassword = async () => Boolean(await readSetting("access_password"));

export async function setAccessPasswordDigest(digest: string, actorEmail: string) {
  await writeSetting("access_password", digest, actorEmail, "Set the family password");
}

export async function clearAccessPassword(actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM site_settings WHERE key = 'access_password'"),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "site_access", "Removed the family password", JSON.stringify({ setting: "access_password" }), now),
  ]);
}

export const shareToken = () => readSetting("access_share_token");

export async function setShareToken(token: string, actorEmail: string) {
  await writeSetting("access_share_token", token, actorEmail, "Made a new private link");
}

export async function setSiteVisibility(value: SiteVisibility, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_settings (key, value, updated_at) VALUES ('visibility', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(value, now),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "site_visibility", value === "members" ? "Restricted the site to signed-in members" : value === "password" ? "Put the site behind the family password" : "Opened the site to anyone with the link", JSON.stringify({ visibility: value }), now),
  ]);
  visibilityCache = { value, time: Date.now() };
}

/** First sign-in of an unknown identity registers it as a viewer, so every
 * account exists in the member list for admins to see and promote. */
export async function registerViewer(email: string) {
  // "Only people I add": while the site is members-only, sign-ins do not
  // self-register - the admins add each email themselves.
  if ((await getSiteVisibility()) === "members") return;
  const canonical = await resolveMemberEmail(email);
  const existing = await env.DB.prepare("SELECT role FROM members WHERE email = ?").bind(canonical).first<{ role: MemberRole }>();
  if (existing) return;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO members (email, role, added_by, created_at, updated_at) VALUES (?, 'canView', 'sign-up', ?, ?)").bind(canonical, now, now),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), canonical, "member_signup", `${canonical} signed in for the first time and can view the archive`, JSON.stringify({ email: canonical, role: "viewer" }), now),
  ]);
}
export type MemberIdentity = { email: string; provider: string | null };
export type Member = { email: string; role: MemberRole; addedBy: string; createdAt: string; links: MemberIdentity[] };

export async function listMembers(): Promise<Member[]> {
  await ensureSchema();
  const [members, links] = await Promise.all([
    env.DB.prepare("SELECT email, role, added_by AS addedBy, created_at AS createdAt FROM members ORDER BY role, email").all<Omit<Member, "links">>(),
    env.DB.prepare("SELECT email, member_email AS memberEmail, provider FROM member_links ORDER BY created_at").all<{ email: string; memberEmail: string; provider: string | null }>(),
  ]);
  return members.results.map((member) => ({
    ...member,
    links: links.results.filter((link) => link.memberEmail === member.email && link.email !== member.email).map((link) => ({ email: link.email, provider: link.provider })),
  }));
}

/** A sign-in email resolves through member_links to the canonical account
 * email — one person, several providers, one member row. */
export async function resolveMemberEmail(email: string): Promise<string> {
  await ensureSchema();
  const normalized = email.toLowerCase();
  const row = await env.DB.prepare("SELECT member_email AS memberEmail FROM member_links WHERE email = ?").bind(normalized).first<{ memberEmail: string }>();
  return row?.memberEmail ?? normalized;
}

export async function listLinksFor(memberEmail: string): Promise<MemberIdentity[]> {
  await ensureSchema();
  const result = await env.DB.prepare("SELECT email, provider FROM member_links WHERE member_email = ? AND email != member_email ORDER BY created_at").bind(memberEmail.toLowerCase()).all<MemberIdentity>();
  return result.results;
}

/** Every provider this account has signed in with - from link rows and the
 * self-row that recordSignInProvider keeps for the primary identity. */
export async function listConnectedProviders(memberEmail: string): Promise<string[]> {
  await ensureSchema();
  const result = await env.DB.prepare("SELECT DISTINCT provider FROM member_links WHERE member_email = ? AND provider IS NOT NULL").bind(memberEmail.toLowerCase()).all<{ provider: string }>();
  return result.results.map((row) => row.provider);
}

/** A self-row (email = member_email) records which provider an identity uses
 * without affecting resolution; linkIdentity re-points it when the identity
 * later joins another account. */
export async function recordSignInProvider(email: string, provider: string) {
  await ensureSchema();
  const normalized = email.toLowerCase();
  const canonical = await resolveMemberEmail(normalized);
  await env.DB.prepare(`INSERT INTO member_links (email, member_email, provider, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET provider = excluded.provider`).bind(normalized, canonical, provider, new Date().toISOString()).run();
}

/** Who a signed-in account is in the tree. Null until they say so. */
export async function getMemberPerson(email: string): Promise<string | null> {
  await ensureSchema();
  const canonical = await resolveMemberEmail(email);
  const row = await env.DB.prepare("SELECT person_id AS personId FROM members WHERE email = ?").bind(canonical).first<{ personId: string | null }>();
  return row?.personId ?? null;
}

/** A person can be claimed by one account: two people sharing a record would
 * make "where I stand in the tree" meaningless for both. */
export async function claimMemberPerson(email: string, personId: string | null): Promise<"ok" | "taken" | "unknown_person"> {
  await ensureSchema();
  const canonical = await resolveMemberEmail(email);
  const now = new Date().toISOString();
  if (personId) {
    const person = await env.DB.prepare("SELECT display_name AS name FROM people WHERE id = ?").bind(personId).first<{ name: string }>();
    if (!person) return "unknown_person";
    const held = await env.DB.prepare("SELECT email FROM members WHERE person_id = ? AND email <> ?").bind(personId, canonical).first<{ email: string }>();
    if (held) return "taken";
    await env.DB.batch([
      env.DB.prepare("UPDATE members SET person_id = ?, updated_at = ? WHERE email = ?").bind(personId, now, canonical),
      env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), canonical, "member_identity", `${canonical} is ${person.name} in the tree`, JSON.stringify({ personId }), now),
    ]);
    return "ok";
  }
  await env.DB.prepare("UPDATE members SET person_id = NULL, updated_at = ? WHERE email = ?").bind(now, canonical).run();
  return "ok";
}

export async function getMemberRole(email: string): Promise<MemberRole | null> {
  const canonical = await resolveMemberEmail(email);
  const row = await env.DB.prepare("SELECT role FROM members WHERE email = ?").bind(canonical).first<{ role: MemberRole }>();
  return row?.role ?? null;
}

/** Attach identityEmail to memberEmail's account. If identityEmail is itself
 * a member row, the two accounts merge: the target keeps the higher role, the
 * identity row dissolves into a link, and any links it held are re-pointed so
 * chains never form. */
export async function linkIdentity(identityEmail: string, memberEmail: string, provider: string | null, actorEmail: string) {
  await ensureSchema();
  const identity = identityEmail.toLowerCase();
  const canonical = await resolveMemberEmail(memberEmail);
  if (identity === canonical) return;
  const existing = await env.DB.prepare("SELECT member_email AS memberEmail FROM member_links WHERE email = ?").bind(identity).first<{ memberEmail: string }>();
  if (existing) {
    if (existing.memberEmail === canonical) return;
    if (existing.memberEmail !== identity) throw new Error("identity_linked_elsewhere");
  }
  const now = new Date().toISOString();
  const identityRow = await env.DB.prepare("SELECT role FROM members WHERE email = ?").bind(identity).first<{ role: MemberRole }>();
  const statements = [];
  if (identityRow) {
    statements.push(env.DB.prepare(`INSERT INTO members (email, role, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET role = CASE WHEN excluded.role = 'admin' THEN 'admin' ELSE members.role END, updated_at = excluded.updated_at`)
      .bind(canonical, identityRow.role, actorEmail, now, now));
    statements.push(env.DB.prepare("UPDATE member_links SET member_email = ? WHERE member_email = ?").bind(canonical, identity));
    statements.push(env.DB.prepare("DELETE FROM members WHERE email = ?").bind(identity));
  }
  statements.push(env.DB.prepare(`INSERT INTO member_links (email, member_email, provider, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET member_email = excluded.member_email, provider = COALESCE(member_links.provider, excluded.provider)`).bind(identity, canonical, provider, now));
  statements.push(env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorEmail, "member_link", `Linked ${identity} to ${canonical} as one account`, JSON.stringify({ email: identity, memberEmail: canonical, provider, merged: Boolean(identityRow) }), now));
  await env.DB.batch(statements);
}

export async function unlinkIdentity(identityEmail: string, actorEmail: string) {
  await ensureSchema();
  const identity = identityEmail.toLowerCase();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM member_links WHERE email = ?").bind(identity),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "member_unlink", `Unlinked ${identity} from its account`, JSON.stringify({ email: identity }), now),
  ]);
}

export async function upsertMember(email: string, role: MemberRole, actorEmail: string) {
  await ensureSchema();
  const normalized = email.toLowerCase();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO members (email, role, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`).bind(normalized, role, actorEmail, now, now),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "member_set", `Gave ${normalized} the ${role} role`, JSON.stringify({ email: normalized, role }), now),
  ]);
}

export async function removeMember(email: string, actorEmail: string) {
  await ensureSchema();
  const normalized = email.toLowerCase();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM members WHERE email = ?").bind(normalized),
    env.DB.prepare("DELETE FROM member_links WHERE member_email = ?").bind(normalized),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "member_remove", `Removed ${normalized} from the member list`, JSON.stringify({ email: normalized }), now),
  ]);
}

// Serialized-tree cache: the public tree endpoint is hit constantly and the
// Worker CPU budget is tight, so the JSON built by the latest readTree() is
// reused for a few seconds. Mutations end in readTree(), which refreshes it.
let treeJsonCache: { body: string; time: number } | null = null;
export function cachedTreeJson(): string | null {
  return treeJsonCache && Date.now() - treeJsonCache.time < 10_000 ? treeJsonCache.body : null;
}

export async function readTree(): Promise<FamilyTree> {
  await ensureSchema();
  const [peopleResult, relationshipsResult, storiesResult, storyPeopleResult, storyAttachmentsResult, personPhotosResult] = await Promise.all([
    env.DB.prepare(`SELECT id, display_name AS displayName, gender, given_name AS givenName,
      family_name AS familyName, maiden_name AS maidenName, birth_date AS birthDate, death_date AS deathDate,
      birth_place AS birthPlace, death_place AS deathPlace, birth_city AS birthCity, birth_country AS birthCountry,
      death_city AS deathCity, death_country AS deathCountry, burial_place AS burialPlace, residence, biography, photo_attachment_id AS photoAttachmentId FROM people ORDER BY display_name`).all<Person>(),
    env.DB.prepare(`SELECT id, from_person_id AS fromPersonId, to_person_id AS toPersonId,
      type, status FROM relationships ORDER BY created_at`).all<Relationship>(),
    env.DB.prepare(`SELECT id, title, body, original_body AS originalBody, date, place FROM stories ORDER BY created_at DESC`).all<Omit<Story, "personIds">>(),
    env.DB.prepare(`SELECT story_id AS storyId, person_id AS personId FROM story_people`).all<{ storyId: string; personId: string }>(),
    env.DB.prepare(`SELECT story_id AS storyId, attachment_id AS attachmentId FROM story_attachments`).all<{ storyId: string; attachmentId: string }>(),
    env.DB.prepare(`SELECT person_id AS personId, attachment_id AS attachmentId FROM person_photos ORDER BY created_at`).all<{ personId: string; attachmentId: string }>(),
  ]);
  const links = new Map<string, string[]>();
  for (const row of storyPeopleResult.results) links.set(row.storyId, [...(links.get(row.storyId) ?? []), row.personId]);
  const attachmentLinks = new Map<string, string[]>();
  for (const row of storyAttachmentsResult.results) attachmentLinks.set(row.storyId, [...(attachmentLinks.get(row.storyId) ?? []), row.attachmentId]);
  // a photo can belong to several people (group photographs); the portrait
  // always leads the gallery
  const photoLinks = new Map<string, string[]>();
  for (const row of personPhotosResult.results) photoLinks.set(row.personId, [...(photoLinks.get(row.personId) ?? []), row.attachmentId]);
  const tree: FamilyTree = {
    people: peopleResult.results.map((person) => {
      const gallery = photoLinks.get(person.id) ?? [];
      const ordered = person.photoAttachmentId ? [person.photoAttachmentId, ...gallery.filter((id) => id !== person.photoAttachmentId)] : gallery;
      return { ...person, photoIds: ordered };
    }),
    relationships: relationshipsResult.results,
    stories: storiesResult.results.map((story) => ({ ...story, personIds: links.get(story.id) ?? [], attachmentIds: attachmentLinks.get(story.id) ?? [] })),
  };
  treeJsonCache = { body: JSON.stringify(tree), time: Date.now() };
  return tree;
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
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO attachments
      (id, object_key, filename, content_type, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, objectKey, file.name, file.type || "application/octet-stream", file.size, actorEmail, now),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "upload_attachment", `Uploaded ${file.name}`, JSON.stringify({ attachmentId: id, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size }), now),
  ]);
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

export async function listAttachments(): Promise<Attachment[]> {
  await ensureSchema();
  const result = await env.DB.prepare("SELECT id, filename, content_type AS contentType, size FROM attachments ORDER BY created_at DESC").all<Attachment>();
  return result.results;
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function personValues(input: Record<string, unknown>): Omit<Person, "id"> {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) throw new Error("A person needs a display name.");
  return {
    displayName, gender: input.gender === "male" || input.gender === "female" ? input.gender : null, givenName: nullable(input.givenName), familyName: nullable(input.familyName), maidenName: nullable(input.maidenName),
    birthDate: nullable(input.birthDate), deathDate: nullable(input.deathDate),
    birthPlace: nullable(input.birthPlace), deathPlace: nullable(input.deathPlace), birthCity: nullable(input.birthCity), birthCountry: nullable(input.birthCountry), deathCity: nullable(input.deathCity), deathCountry: nullable(input.deathCountry), burialPlace: nullable(input.burialPlace), residence: nullable(input.residence), biography: nullable(input.biography), photoAttachmentId: nullable(input.photoAttachmentId),
  };
}

export async function applyProposal(proposal: ChangeProposal, actorEmail: string): Promise<FamilyTree> {
  await ensureSchema();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let addedPersonId: string | null = null;
  let deletedObjectKey: string | null = null;
  if (proposal.kind === "add_person") {
    const person = personValues(proposal.person as unknown as Record<string, unknown>);
    const personId = crypto.randomUUID(); addedPersonId = personId;
    statements.push(env.DB.prepare(`INSERT INTO people
      (id, display_name, gender, given_name, family_name, maiden_name, birth_date, death_date, birth_place, death_place, birth_city, birth_country, death_city, death_country, burial_place, residence, biography, photo_attachment_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(personId, person.displayName, person.gender, person.givenName, person.familyName, person.maidenName, person.birthDate,
        person.deathDate, person.birthPlace, person.deathPlace, person.birthCity, person.birthCountry, person.deathCity, person.deathCountry, person.burialPlace, person.residence, person.biography, person.photoAttachmentId, now, now));
  } else if (proposal.kind === "update_person") {
    const person = personValues(proposal.patch as unknown as Record<string, unknown>);
    statements.push(env.DB.prepare(`UPDATE people SET display_name = ?, gender = ?, given_name = ?, family_name = ?, maiden_name = ?, birth_date = ?,
      death_date = ?, birth_place = ?, death_place = ?, birth_city = ?, birth_country = ?, death_city = ?, death_country = ?, burial_place = ?, residence = ?, biography = ?, photo_attachment_id = ?, updated_at = ? WHERE id = ?`)
      .bind(person.displayName, person.gender, person.givenName, person.familyName, person.maidenName, person.birthDate, person.deathDate,
        person.birthPlace, person.deathPlace, person.birthCity, person.birthCountry, person.deathCity, person.deathCountry, person.burialPlace, person.residence, person.biography, person.photoAttachmentId, now, proposal.personId));
  } else if (proposal.kind === "delete_person") {
    // There are no foreign keys on these tables, so everything that points at
    // a person has to be cleared here. Photographs and comments were added
    // after this path was written and were being left behind; a member who
    // had claimed the person would have been left pointing at a ghost.
    statements.push(
      env.DB.prepare("DELETE FROM relationships WHERE from_person_id = ? OR to_person_id = ?").bind(proposal.personId, proposal.personId),
      env.DB.prepare("DELETE FROM story_people WHERE person_id = ?").bind(proposal.personId),
      env.DB.prepare("DELETE FROM person_photos WHERE person_id = ?").bind(proposal.personId),
      env.DB.prepare("DELETE FROM person_comments WHERE person_id = ?").bind(proposal.personId),
      env.DB.prepare("UPDATE members SET person_id = NULL WHERE person_id = ?").bind(proposal.personId),
      env.DB.prepare("DELETE FROM people WHERE id = ?").bind(proposal.personId),
    );
  } else if (proposal.kind === "add_relationship") {
    const resolvePersonId = async (id: string, name?: string | null) => {
      if (id) {
        const record = await env.DB.prepare("SELECT id FROM people WHERE id = ?").bind(id).first<{ id: string }>();
        if (!record) throw new Error("A referenced person no longer exists.");
        return record.id;
      }
      if (!name?.trim()) throw new Error("A relationship needs two people.");
      const matches = await env.DB.prepare("SELECT id FROM people WHERE lower(display_name) = lower(?)").bind(name.trim()).all<{ id: string }>();
      if (matches.results.length !== 1) throw new Error(matches.results.length ? `More than one person is named ${name}.` : `${name} is not in the tree yet.`);
      return matches.results[0].id;
    };
    const fromPersonId = await resolvePersonId(proposal.fromPersonId, proposal.fromPersonName);
    const toPersonId = await resolvePersonId(proposal.toPersonId, proposal.toPersonName);
    if (fromPersonId === toPersonId) throw new Error("A person cannot be related to themself.");
    if (!(["parent", "spouse"] as const).includes(proposal.relationshipType)) throw new Error("Unsupported relationship.");
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO relationships
      (id, from_person_id, to_person_id, type, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), fromPersonId, toPersonId, proposal.relationshipType, now));
  } else if (proposal.kind === "delete_relationship") {
    statements.push(env.DB.prepare("DELETE FROM relationships WHERE id = ?").bind(proposal.relationshipId));
  } else if (proposal.kind === "add_story") {
    if (!proposal.title.trim() || !proposal.body.trim()) throw new Error("A story needs a title and text.");
    const storyId = crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO stories (id, title, body, date, place, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(storyId, proposal.title.trim(), proposal.body.trim(), nullable(proposal.date), nullable(proposal.place), now));
    for (const personId of proposal.personIds) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (?, ?)`).bind(storyId, personId));
    for (const attachmentId of proposal.attachmentIds) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO story_attachments (story_id, attachment_id) VALUES (?, ?)`).bind(storyId, attachmentId));
  } else if (proposal.kind === "update_story") {
    if (!proposal.title.trim() || !proposal.body.trim()) throw new Error("A story needs a title and text.");
    statements.push(
      env.DB.prepare("UPDATE stories SET title = ?, body = ?, date = ?, place = ? WHERE id = ?").bind(proposal.title.trim(), proposal.body.trim(), nullable(proposal.date), nullable(proposal.place), proposal.storyId),
      env.DB.prepare("DELETE FROM story_people WHERE story_id = ?").bind(proposal.storyId),
      env.DB.prepare("DELETE FROM story_attachments WHERE story_id = ?").bind(proposal.storyId),
    );
    for (const personId of proposal.personIds) statements.push(env.DB.prepare("INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (?, ?)").bind(proposal.storyId, personId));
    for (const attachmentId of proposal.attachmentIds) statements.push(env.DB.prepare("INSERT OR IGNORE INTO story_attachments (story_id, attachment_id) VALUES (?, ?)").bind(proposal.storyId, attachmentId));
  } else if (proposal.kind === "delete_story") {
    statements.push(
      env.DB.prepare("DELETE FROM story_people WHERE story_id = ?").bind(proposal.storyId),
      env.DB.prepare("DELETE FROM story_attachments WHERE story_id = ?").bind(proposal.storyId),
      env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(proposal.storyId),
    );
  } else if (proposal.kind === "delete_attachment") {
    const attachment = await env.DB.prepare("SELECT object_key AS objectKey FROM attachments WHERE id = ?").bind(proposal.attachmentId).first<{ objectKey: string }>();
    if (!attachment) throw new Error("That attachment no longer exists.");
    deletedObjectKey = attachment.objectKey;
    statements.push(
      env.DB.prepare("UPDATE people SET photo_attachment_id = NULL, updated_at = ? WHERE photo_attachment_id = ?").bind(now, proposal.attachmentId),
      env.DB.prepare("DELETE FROM story_attachments WHERE attachment_id = ?").bind(proposal.attachmentId),
      env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(proposal.attachmentId),
    );
  }
  statements.push(env.DB.prepare(`INSERT INTO change_log
    (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorEmail, proposal.kind, proposal.summary, JSON.stringify(proposal), now));
    await env.DB.batch(statements);
    if (deletedObjectKey) await env.FILES.delete(deletedObjectKey);
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
  const current = (await readTree()).people.find((person) => person.id === personId);
  if (!current) throw new Error("That person is no longer in the tree.");
  const merged = Object.fromEntries(Object.keys(current).filter((key) => key !== "id").map((key) => [key, Object.prototype.hasOwnProperty.call(patch, key) ? patch[key] : current[key as keyof Person]]));
  return applyProposal({ kind: "update_person", summary: "Updated person details", personId, patch: personValues(merged) }, actorEmail);
}

export async function addRelationship(fromPersonId: string, toPersonId: string, relationshipType: "parent" | "spouse", actorEmail: string) {
  return applyProposal({ kind: "add_relationship", summary: "Added a family relationship", fromPersonId, toPersonId, relationshipType }, actorEmail);
}

export async function setRelationshipStatus(relationshipId: string, status: string | null, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE relationships SET status = ? WHERE id = ? AND type = 'spouse'").bind(status, relationshipId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "set_relationship_status", status ? `Marked a marriage as ${status}` : "Cleared a marriage status", JSON.stringify({ relationshipId, status }), now),
  ]);
  return readTree();
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
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO person_photos (person_id, attachment_id, created_at) VALUES (?, ?, ?)").bind(personId, attachment.id, now),
    // the first photograph of someone becomes their portrait; later ones join the gallery
    env.DB.prepare("UPDATE people SET photo_attachment_id = COALESCE(photo_attachment_id, ?), updated_at = ? WHERE id = ?").bind(attachment.id, now, personId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actorEmail, "attach_person_photo", "Added a family photograph", JSON.stringify({ personId, attachmentId: attachment.id }), now),
  ]);
  return readTree();
}

export async function removePersonPhoto(personId: string, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE people SET photo_attachment_id = NULL, updated_at = ? WHERE id = ?").bind(now, personId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actorEmail, "remove_person_photo", "Removed a family portrait", JSON.stringify({ personId }), now),
  ]);
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


// ---------- open questions: the Fill-in tab's review queue ----------
// A question records something the archive implies but never states. The
// proposal_json holds the prepared change, with person ids resolved when the
// question was seeded; confirming applies it, denying just closes it. Either
// way the verdict is permanent in the row and in the change log.
type QuestionAction =
  | { type: "add_parent"; parentId: string; childId: string }
  | { type: "append_biography"; personId: string; text: string }
  | { type: "create_spouse"; ofId: string; gender: "male" | "female" | null; nameFromAnswer: true; biography: string };

/** What the archivist could not settle while reading a document becomes a
 * question for the family rather than a line in a chat that scrolls away.
 *
 * The id is derived from the question itself, so re-reading the same document
 * does not ask the family the same thing twice, and a question they have
 * already answered stays answered. */
/* Documents the family sends, waiting to be read.
 *
 * An upload should not have to be watched. A file goes to R2 and a row goes
 * here; something drains the queue afterwards and the reader can close the
 * tab. Rows are never deleted - what was read, and what came of it, is part
 * of the archive's record of itself. */

export type QueuedDocument = {
  id: string; attachmentId: string; filename: string; uploadedBy: string;
  status: "pending" | "reading" | "read" | "failed"; result: string | null;
  createdAt: string; processedAt: string | null;
};

export async function queueDocument(attachmentId: string, filename: string, uploadedBy: string): Promise<void> {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO document_queue (id, attachment_id, filename, uploaded_by, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)`).bind(crypto.randomUUID(), attachmentId, filename, uploadedBy, now).run();
}

export async function listDocumentQueue(limit = 40): Promise<QueuedDocument[]> {
  await ensureSchema();
  const result = await env.DB.prepare(`SELECT id, attachment_id AS attachmentId, filename, uploaded_by AS uploadedBy,
    status, result, created_at AS createdAt, processed_at AS processedAt
    FROM document_queue ORDER BY created_at DESC LIMIT ?`).bind(limit).all<QueuedDocument>();
  return result.results;
}

/** Takes the oldest waiting document and marks it as being read, so two
 *  drains running at once cannot read the same file twice.
 *
 *  A claim that never finishes - the request was abandoned, the tab closed,
 *  the Worker cut off mid-read - would otherwise strand that document in
 *  "reading" for good, so a claim older than ten minutes is treated as
 *  abandoned and the document goes back in the queue. Ten minutes is well
 *  past any real read and short enough that nobody waits on it. */
const CLAIM_MINUTES = 10;

export async function claimNextDocument(): Promise<QueuedDocument | null> {
  await ensureSchema();
  const stale = new Date(Date.now() - CLAIM_MINUTES * 60_000).toISOString();
  const row = await env.DB.prepare(`SELECT id, attachment_id AS attachmentId, filename, uploaded_by AS uploadedBy,
    status, result, created_at AS createdAt, processed_at AS processedAt
    FROM document_queue
    WHERE status = 'pending' OR (status = 'reading' AND (processed_at IS NULL OR processed_at < ?))
    ORDER BY created_at LIMIT 1`).bind(stale).first<QueuedDocument>();
  if (!row) return null;
  const now = new Date().toISOString();
  // processed_at doubles as "last touched": set on the claim so an abandoned
  // one can be recognised, and overwritten when the read finishes
  const claimed = await env.DB.prepare(`UPDATE document_queue SET status = 'reading', processed_at = ?
    WHERE id = ? AND (status = 'pending' OR (status = 'reading' AND (processed_at IS NULL OR processed_at < ?)))`)
    .bind(now, row.id, stale).run();
  if (!claimed.meta.changes) return null;
  return { ...row, status: "reading" };
}

export async function finishDocument(id: string, status: "read" | "failed", result: string): Promise<void> {
  await ensureSchema();
  await env.DB.prepare("UPDATE document_queue SET status = ?, result = ?, processed_at = ? WHERE id = ?")
    .bind(status, result.slice(0, 2000), new Date().toISOString(), id).run();
}

export async function readAttachmentBytes(attachmentId: string): Promise<{ bytes: Uint8Array; contentType: string; filename: string } | null> {
  await ensureSchema();
  const row = await env.DB.prepare("SELECT object_key AS objectKey, content_type AS contentType, filename FROM attachments WHERE id = ?")
    .bind(attachmentId).first<{ objectKey: string; contentType: string; filename: string }>();
  if (!row) return null;
  const object = await env.FILES.get(row.objectKey);
  if (!object) return null;
  return { bytes: new Uint8Array(await object.arrayBuffer()), contentType: row.contentType, filename: row.filename };
}

export async function recordAgentQuestions(
  conflicts: { question: string; reason: string; candidatePersonIds: string[]; evidence: string[] }[],
  actorEmail: string,
): Promise<number> {
  if (!conflicts.length) return 0;
  await ensureSchema();
  const now = new Date().toISOString();
  const statements = [];
  for (const conflict of conflicts) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(conflict.question)));
    const id = `agent-${[...digest.slice(0, 10)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const evidence = [conflict.reason, ...conflict.evidence].filter(Boolean).join(" · ") || null;
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO open_questions
      (id, question, evidence, action_summary, proposal_json, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)`)
      .bind(id, conflict.question, evidence, "Answer here and an editor will apply it.",
        JSON.stringify({ candidatePersonIds: conflict.candidatePersonIds }), now));
  }
  statements.push(env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorEmail, "agent_questions",
      `Reading what was sent raised ${conflicts.length} question${conflicts.length === 1 ? "" : "s"} for the family`,
      JSON.stringify({ questions: conflicts.map((conflict) => conflict.question) }), now));
  await env.DB.batch(statements);
  return conflicts.length;
}

export async function listOpenQuestions(): Promise<OpenQuestion[]> {
  await ensureSchema();
  // Consistency problems are derived, not stored: the checker runs against the
  // live tree each time, so a question disappears the moment the records stop
  // disagreeing. Only the family's verdicts are persisted - a denied check
  // stays denied by id even though the check itself is recomputed.
  const [result, answered, tree] = await Promise.all([
    env.DB.prepare(`SELECT id, question, evidence, action_summary AS actionSummary, proposal_json AS proposalJson, status, created_at AS createdAt
      FROM open_questions WHERE status = 'open' ORDER BY created_at`).all<{ id: string; question: string; evidence: string | null; actionSummary: string | null; proposalJson: string | null; status: "open"; createdAt: string }>(),
    env.DB.prepare("SELECT id FROM open_questions WHERE status != 'open'").all<{ id: string }>(),
    readTree(),
  ]);
  const settled = new Set(answered.results.map((row) => row.id));
  const derived: OpenQuestion[] = runRecordChecks(tree)
    .filter((check) => !settled.has(check.id) && !result.results.some((row) => row.id === check.id))
    .map((check) => ({
      id: check.id, question: check.question, evidence: check.evidence,
      actionSummary: check.kind === "duplicate"
        ? "Answering records the verdict; an editor merges them if they are one person."
        : "Your answer is recorded for an editor to apply.",
      needsAnswerText: false,
      choices: check.choices,
      status: "open" as const, createdAt: "",
    }));
  const meta = (json: string | null) => {
    if (!json) return {} as { choices?: OpenQuestion["choices"]; imageId?: string | null };
    try { const parsed = JSON.parse(json); return { choices: parsed.choices, imageId: parsed.imageId ?? null }; } catch { return {}; }
  };
  return [...result.results.map((row) => ({
    id: row.id, question: row.question, evidence: row.evidence, actionSummary: row.actionSummary,
    needsAnswerText: Boolean(row.proposalJson && JSON.parse(row.proposalJson).actions?.some((action: QuestionAction) => "nameFromAnswer" in action && action.nameFromAnswer)),
    ...meta(row.proposalJson),
    status: row.status, createdAt: row.createdAt,
  })), ...derived];
}

export async function answerQuestion(id: string, verdict: "confirm" | "deny", note: string | null, actorEmail: string): Promise<FamilyTree> {
  await ensureSchema();
  let row = await env.DB.prepare("SELECT question, proposal_json AS proposalJson, status FROM open_questions WHERE id = ?")
    .bind(id).first<{ question: string; proposalJson: string | null; status: string }>();
  if (!row && id.startsWith("chk-")) {
    // a derived consistency check: persist it at the moment it is answered so
    // the verdict survives, then fall through to the normal path
    const check = runRecordChecks(await readTree()).find((candidate) => candidate.id === id);
    if (!check) throw new Error("question_not_found");
    const created = new Date().toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO open_questions (id, question, evidence, action_summary, proposal_json, status, created_at) VALUES (?, ?, ?, ?, NULL, 'open', ?)")
      .bind(id, check.question, check.evidence, null, created).run();
    row = { question: check.question, proposalJson: null, status: "open" };
  }
  if (!row) throw new Error("question_not_found");
  if (row.status !== "open") throw new Error("question_already_answered");
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const applied: string[] = [];
  if (verdict === "confirm" && row.proposalJson) {
    const actions = (JSON.parse(row.proposalJson).actions ?? []) as QuestionAction[];
    for (const action of actions) {
      if (action.type === "add_parent") {
        statements.push(env.DB.prepare("INSERT OR IGNORE INTO relationships (id, from_person_id, to_person_id, type, created_at) VALUES (?, ?, ?, 'parent', ?)")
          .bind(crypto.randomUUID(), action.parentId, action.childId, now));
        applied.push("parent link added");
      } else if (action.type === "append_biography") {
        const person = await env.DB.prepare("SELECT biography FROM people WHERE id = ?").bind(action.personId).first<{ biography: string | null }>();
        const current = person?.biography?.trim() ?? "";
        if (!current.includes(action.text.slice(0, 40))) {
          const next = current ? `${current}${current.endsWith(".") ? "" : "."} ${action.text}` : action.text;
          statements.push(env.DB.prepare("UPDATE people SET biography = ?, updated_at = ? WHERE id = ?").bind(next, now, action.personId));
          applied.push("biography updated");
        }
      } else if (action.type === "create_spouse") {
        const name = note?.trim();
        if (!name) throw new Error("answer_name_required");
        const personId = crypto.randomUUID();
        statements.push(env.DB.prepare("INSERT INTO people (id, display_name, gender, biography, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(personId, name, action.gender, action.biography, now, now));
        statements.push(env.DB.prepare("INSERT INTO relationships (id, from_person_id, to_person_id, type, created_at) VALUES (?, ?, ?, 'spouse', ?)")
          .bind(crypto.randomUUID(), action.ofId, personId, now));
        applied.push(`added ${name} as spouse`);
      }
    }
  }
  statements.push(env.DB.prepare("UPDATE open_questions SET status = ?, answer_note = ?, answered_by = ?, answered_at = ? WHERE id = ? AND status = 'open'")
    .bind(verdict === "confirm" ? "confirmed" : "denied", note?.trim() || null, actorEmail, now, id));
  statements.push(env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorEmail, "answer_question",
      `${verdict === "confirm" ? "Confirmed" : "Denied"}: ${row.question}`,
      JSON.stringify({ questionId: id, verdict, note: note?.trim() || null, applied }), now));
  await env.DB.batch(statements);
  treeJsonCache = null;
  return readTree();
}


// ---------- photo galleries ----------
/** One photograph, many people: a group portrait is linked to each person in
 * it rather than duplicated. The portrait is whichever gallery photo the
 * person's photo_attachment_id points at. */
export async function setPersonPortrait(personId: string, attachmentId: string | null, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE people SET photo_attachment_id = ?, updated_at = ? WHERE id = ?").bind(attachmentId, now, personId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "set_person_portrait", attachmentId ? "Chose a portrait" : "Cleared a portrait", JSON.stringify({ personId, attachmentId }), now),
  ]);
  treeJsonCache = null;
  return readTree();
}

export async function linkPersonPhoto(personId: string, attachmentId: string, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO person_photos (person_id, attachment_id, created_at) VALUES (?, ?, ?)").bind(personId, attachmentId, now),
    env.DB.prepare("UPDATE people SET photo_attachment_id = COALESCE(photo_attachment_id, ?), updated_at = ? WHERE id = ?").bind(attachmentId, now, personId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "link_person_photo", "Added someone to a photograph", JSON.stringify({ personId, attachmentId }), now),
  ]);
  treeJsonCache = null;
  return readTree();
}

export async function unlinkPersonPhoto(personId: string, attachmentId: string, actorEmail: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM person_photos WHERE person_id = ? AND attachment_id = ?").bind(personId, attachmentId),
    // dropping the portrait promotes whatever else the person still has
    env.DB.prepare(`UPDATE people SET photo_attachment_id = (SELECT attachment_id FROM person_photos WHERE person_id = ? ORDER BY created_at LIMIT 1), updated_at = ?
      WHERE id = ? AND photo_attachment_id = ?`).bind(personId, now, personId, attachmentId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "unlink_person_photo", "Removed a photograph from a record", JSON.stringify({ personId, attachmentId }), now),
  ]);
  treeJsonCache = null;
  return readTree();
}


// ---------- the record of who changed what ----------
export type ChangeEntry = { id: string; actorEmail: string; kind: string; summary: string; createdAt: string };

/** Newest first, a page at a time. Every mutation in the archive writes here,
 * so this is the full account of who did what. */
export async function listChangeLog(before?: string | null, limit = 60): Promise<{ entries: ChangeEntry[]; nextBefore: string | null }> {
  await ensureSchema();
  const rows = before
    ? await env.DB.prepare(`SELECT id, actor_email AS actorEmail, kind, summary, created_at AS createdAt FROM change_log
        WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`).bind(before, limit + 1).all<ChangeEntry>()
    : await env.DB.prepare(`SELECT id, actor_email AS actorEmail, kind, summary, created_at AS createdAt FROM change_log
        ORDER BY created_at DESC LIMIT ?`).bind(limit + 1).all<ChangeEntry>();
  const entries = rows.results.slice(0, limit);
  return { entries, nextBefore: rows.results.length > limit ? entries[entries.length - 1]?.createdAt ?? null : null };
}

// ---------- comments ----------
export type PersonComment = { id: string; personId: string; authorName: string; body: string; createdAt: string; mine?: boolean };

export async function listComments(): Promise<PersonComment[]> {
  await ensureSchema();
  const rows = await env.DB.prepare(`SELECT id, person_id AS personId, author_email AS authorEmail, author_name AS authorName, body, created_at AS createdAt
    FROM person_comments ORDER BY created_at`).all<PersonComment & { authorEmail: string }>();
  return rows.results.map(({ authorEmail, ...comment }) => ({ ...comment, authorName: comment.authorName || authorEmail.split("@")[0] }));
}

export async function addComment(personId: string, body: string, actorEmail: string, authorName: string | null): Promise<PersonComment[]> {
  await ensureSchema();
  const text = body.trim().slice(0, 4000);
  if (!personId || !text) throw new Error("comment_required");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO person_comments (id, person_id, author_email, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), personId, actorEmail, authorName, text, now),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "add_comment", "Left a comment on a record", JSON.stringify({ personId }), now),
  ]);
  return listComments();
}

/** Anyone may delete their own; an admin may delete any. */
export async function removeComment(commentId: string, actorEmail: string, isAdmin: boolean): Promise<PersonComment[]> {
  await ensureSchema();
  const owner = await env.DB.prepare("SELECT author_email AS authorEmail FROM person_comments WHERE id = ?").bind(commentId).first<{ authorEmail: string }>();
  if (!owner) throw new Error("comment_not_found");
  if (!isAdmin && owner.authorEmail.toLocaleLowerCase() !== actorEmail.toLocaleLowerCase()) throw new Error("not_your_comment");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM person_comments WHERE id = ?").bind(commentId),
    env.DB.prepare("INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actorEmail, "remove_comment", "Removed a comment", JSON.stringify({ commentId }), now),
  ]);
  return listComments();
}
