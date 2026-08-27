#!/usr/bin/env node
// Put the whole 1920 group photograph on every named figure's record.
//
// Until galleries existed (Version 100) each person could hold one image, so
// the four named figures carry single-face crops of this photograph. Now that
// a photograph can belong to several people, the uncropped original joins all
// four galleries as one shared image - the crops stay as their portraits.
//
// Usage: node scripts/link_group_photograph.mjs --file <photodarabi2.jpg> [--execute]
import { writeFile, stat, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TREE_URL = "https://darabiha.com/api/tree";
const BUCKET = "darabiha-family-files";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/link_group_photograph.generated.sql";
const FILENAME = "photoDarabi2.jpg";
const MAX_EDGE = 1800; // the whole frame, so faces stay legible when opened
const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

// left to right, per the family biography's caption; figures 4 and 6 unnamed
const FIGURES = [
  { name: "Abbas Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"] },
  { name: "Hossein Zehtab Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"] },
  { name: "Asadollah Jaberian", parents: ["Fatemeh Darabi", "Haj Ramazan Jaberian"] },
  { name: "Ghassem Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"] },
];

const arg = (flag) => { const index = process.argv.indexOf(flag); return index === -1 ? null : process.argv[index + 1]; };
const source = arg("--file");
if (!source) { console.error("Usage: link_group_photograph.mjs --file <jpg> [--execute]"); process.exit(1); }

const tree = await (await fetch(TREE_URL)).json();
const byId = new Map(tree.people.map((person) => [person.id, person]));
const parentsOf = new Map();
for (const link of tree.relationships) {
  if (link.type !== "parent") continue;
  parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
}
const resolve = (figure) => {
  const matches = tree.people.filter((person) => {
    if (person.displayName !== figure.name) return false;
    const parents = (parentsOf.get(person.id) ?? []).map((id) => byId.get(id)?.displayName).filter(Boolean).sort();
    return JSON.stringify(parents) === JSON.stringify([...figure.parents].sort());
  });
  if (matches.length !== 1) { console.error(`"${figure.name}" resolves to ${matches.length} records`); process.exit(1); }
  return matches[0];
};

const people = FIGURES.map(resolve);
// re-running must not add a second copy: every figure holding more than one
// photograph means the shared original is already in place
const alreadyLinked = people.every((person) => (person.photoIds ?? []).length > 1);
if (alreadyLinked) { console.log("Every figure already holds more than one photograph - nothing to do."); process.exit(0); }

const scratch = await mkdtemp(join(tmpdir(), "darabiha-group-"));
const attachmentId = randomUUID();
const resized = join(scratch, `${attachmentId}.jpg`);
execFileSync("sips", ["-Z", String(MAX_EDGE), "-s", "format", "jpeg", "-s", "formatOptions", "82", source, "--out", resized], { stdio: "ignore" });
const size = (await stat(resized)).size;

const now = new Date().toISOString();
const statements = [
  `INSERT INTO attachments (id, object_key, filename, content_type, size, created_by, created_at) VALUES (${q(attachmentId)}, ${q(`evidence/${attachmentId}`)}, ${q(FILENAME)}, 'image/jpeg', ${size}, ${q(ACTOR)}, ${q(now)});`,
  ...people.map((person) => `INSERT OR IGNORE INTO person_photos (person_id, attachment_id, created_at) VALUES (${q(person.id)}, ${q(attachmentId)}, ${q(now)});`),
];
const summary = `Linked the ~1920 group photograph to all ${people.length} figures the biography names.`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'link_group_photograph', ${q(summary)}, ${q(JSON.stringify({ attachmentId, people: people.map((person) => person.displayName) }))}, ${q(now)});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(`${summary}\n  ${Math.round(size / 1024)} KB → ${people.map((person) => person.displayName).join(", ")}\nSQL written to ${OUT_SQL}`);
if (!process.argv.includes("--execute")) { console.log("Dry run - pass --execute to upload and apply."); process.exit(0); }
execFileSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/evidence/${attachmentId}`, "--file", resized, "--content-type", "image/jpeg", "--remote"], { stdio: "inherit" });
execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
