#!/usr/bin/env node
// Merge the corrected legacy archive graph (public/legacy-family-tree-data.json)
// into the live D1 tree that powers darabiha.com.
//
// The merge is additive and preserves everything the family entered by hand:
// existing people keep their ids, display names, portraits, places, and full
// birth dates (archive years fill in only where a field is NULL). Existing
// people are matched to archive identities by an explicit table below plus
// exact normalized-name matching; relationships already present are skipped
// (spouse rows in either orientation). Running the script again after a
// successful import produces no further inserts.
//
// Usage:
//   node scripts/import_legacy_tree_to_d1.mjs             # write SQL + stats
//   node scripts/import_legacy_tree_to_d1.mjs --execute   # also run wrangler
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TREE_URL = "https://darabiha.com/api/tree";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/import_legacy_tree_to_d1.generated.sql";
const CODE_TOKEN = /^x[A-Za-z]{2,5}_\d+[a-z]?$/;

// Existing D1 display name -> archive identity (name + generation where the
// archive holds two people with that name). Verified against both datasets
// on 2026-08-26; every current D1 relationship is consistent with the archive.
const MANUAL_MATCHES = {
  "Haj Chorok": { name: "Haj Chorok Darabi" },
  "Haj Agha": { name: "Haj Agha Darabi" },
  "Haj Khalil": { name: "Haj Khalil Darabi" },
  "Mohammad Zehtab Darabi": { name: "Mohammad Darabi", generation: 4 },
  "Salmeh": { name: "Salameh X" },
  "Hossein Zehtab Darabi": { name: "Hossein Darabi", generation: 5 },
  "Ategheh Khanom": { name: "Aategheh Dastmardi" },
  "Haj Ramazan Jaberian": { name: "Ramazan Jaberian" },
  "Farrokhandeh": { name: "Farkhondeh Ariyehbandha" },
  "Robabeh Masoudi": { name: "Robabeh Massoudi" },
  "Jila Darabiha": { name: "Jila Khosravi Saeed" },
};

const norm = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z]+/g, "")
    .toLowerCase();

const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

const legacy = JSON.parse(await readFile("public/legacy-family-tree-data.json", "utf8"));
const live = await (await fetch(TREE_URL)).json();

// --- match archive people to existing D1 people
const legacyByKey = new Map(); // norm|gen and norm -> legacy person
for (const person of legacy.people) {
  legacyByKey.set(`${norm(person.name)}|${person.generation}`, person);
  const bare = norm(person.name);
  legacyByKey.set(bare, legacyByKey.has(bare) && legacyByKey.get(bare) !== person ? "ambiguous" : person);
}

const targetId = new Map(); // legacy id -> D1 id
const matched = [];
const unmatchedExisting = [];
for (const existing of live.people) {
  const manual = MANUAL_MATCHES[existing.displayName];
  let hit = null;
  if (manual) {
    hit = legacyByKey.get(manual.generation ? `${norm(manual.name)}|${manual.generation}` : norm(manual.name));
    if (!hit || hit === "ambiguous") throw new Error(`Manual match failed for ${existing.displayName}`);
  } else {
    const auto = legacyByKey.get(norm(existing.displayName));
    if (auto === "ambiguous") throw new Error(`Ambiguous automatic match for ${existing.displayName}`);
    hit = auto ?? null;
  }
  if (hit) {
    if (targetId.has(hit.id)) throw new Error(`Two existing people match archive person ${hit.name}`);
    targetId.set(hit.id, existing.id);
    matched.push([existing.displayName, hit.name]);
  } else {
    unmatchedExisting.push(existing.displayName);
  }
}

// --- build SQL
const now = new Date().toISOString();
const statements = [];
const inserts = [];
const fills = [];

for (const person of legacy.people) {
  if (targetId.has(person.id)) {
    const existing = live.people.find((p) => p.id === targetId.get(person.id));
    const updates = [];
    if (!existing.birthDate && person.birthYear) updates.push(`birth_date = ${q(String(person.birthYear))}`);
    if (!existing.deathDate && person.deathYear) updates.push(`death_date = ${q(String(person.deathYear))}`);
    if (updates.length) {
      statements.push(`UPDATE people SET ${updates.join(", ")}, updated_at = ${q(now)} WHERE id = ${q(existing.id)};`);
      fills.push(existing.displayName);
    }
    continue;
  }
  const id = randomUUID();
  targetId.set(person.id, id);
  const tokens = person.name.split(/\s+/);
  const coded = tokens.some((t) => CODE_TOKEN.test(t));
  const familyName = !coded && tokens.length > 1 ? tokens[tokens.length - 1] : null;
  const givenName = coded ? null : tokens.length > 1 ? tokens.slice(0, -1).join(" ") : person.name;
  const bio = [];
  if (person.aliases?.length) bio.push(`Also recorded in the family archive as ${person.aliases.join(", ")}.`);
  if (coded) bio.push("The family archive records this person with a placeholder code; their name was not collected yet.");
  statements.push(
    `INSERT INTO people (id, display_name, gender, given_name, family_name, birth_date, death_date, birth_place, death_place, birth_city, birth_country, death_city, death_country, biography, photo_attachment_id, created_at, updated_at) VALUES (` +
      [
        q(id), q(person.name), "NULL", q(givenName), q(familyName),
        q(person.birthYear ? String(person.birthYear) : null), q(person.deathYear ? String(person.deathYear) : null),
        "NULL", "NULL", "NULL", "NULL", "NULL", "NULL", q(bio.length ? bio.join(" ") : null), "NULL", q(now), q(now),
      ].join(", ") +
      `);`,
  );
  inserts.push(person.name);
}

// --- relationships (skip ones already present; spouse matches either way)
const existingParent = new Set();
const existingSpouse = new Set();
for (const rel of live.relationships) {
  if (rel.type === "parent") existingParent.add(`${rel.fromPersonId}|${rel.toPersonId}`);
  else existingSpouse.add([rel.fromPersonId, rel.toPersonId].sort().join("|"));
}
let addedParents = 0, addedSpouses = 0, skipped = 0;
for (const rel of legacy.relationships) {
  const from = targetId.get(rel.from);
  const to = targetId.get(rel.to);
  if (!from || !to) throw new Error(`Unmapped relationship endpoint ${rel.from} -> ${rel.to}`);
  if (rel.type === "parent") {
    if (existingParent.has(`${from}|${to}`)) { skipped += 1; continue; }
    addedParents += 1;
  } else {
    if (existingSpouse.has([from, to].sort().join("|"))) { skipped += 1; continue; }
    addedSpouses += 1;
  }
  statements.push(
    `INSERT OR IGNORE INTO relationships (id, from_person_id, to_person_id, type, created_at) VALUES (${q(randomUUID())}, ${q(from)}, ${q(to)}, ${q(rel.type)}, ${q(now)});`,
  );
}

const summary = `Imported the corrected legacy archive: ${inserts.length} people added, ${matched.length} matched to existing records (${fills.length} date fills), ${addedParents} parent links and ${addedSpouses} marriages added, ${skipped} already present.`;
statements.push(
  `INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'import_legacy_archive', ${q(summary)}, ${q(
    JSON.stringify({ sourceSha256: legacy.meta.sourceSha256, peopleAdded: inserts.length, matched: matched.length, parentLinksAdded: addedParents, marriagesAdded: addedSpouses }),
  )}, ${q(now)});`,
);

await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(summary);
console.log(`Matched existing people: ${matched.map(([a, b]) => (a === b ? a : `${a} = ${b}`)).join("; ")}`);
console.log(`Existing people left untouched (no archive counterpart): ${unmatchedExisting.join(", ") || "none"}`);
console.log(`SQL written to ${OUT_SQL} (${statements.length} statements).`);

if (process.argv.includes("--execute")) {
  execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
}
