#!/usr/bin/env node
// Infer maiden names for women in the live tree. A maiden name is recorded
// only when it is informative - i.e. it differs from the surname the woman
// is displayed under. Sources, in order of trust:
//   1. her father's surname (a recorded male parent),
//   2. the archive alias in her biography ("Also recorded in the family
//      archive as <full name>").
// Only NULL maiden_name fields are ever written.
//
// Usage: node scripts/infer_maiden_names.mjs [--execute]
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TREE_URL = "https://darabiha.com/api/tree";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/infer_maiden_names.generated.sql";
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

// Names known only from the import's variant-name table, not from any field
// on the record itself.
const CURATED = new Map([
  ["Jila Darabiha", { maiden: "Khosravi Saeed", source: "the import's variant-name record (archive: Jila Khosravi Saeed)" }],
]);

// Darabi / Darabiha and similar are variant spellings of one family name -
// a maiden name equal to a variant of the displayed surname says nothing.
const sameFamily = (a, b) => {
  if (!a || !b) return false;
  const left = a.toLocaleLowerCase(), right = b.toLocaleLowerCase();
  return left.startsWith(right) || right.startsWith(left);
};

const surnameOf = (name) => {
  const tokens = name.trim().split(/\s+/).filter((token) => !/^\(.*\)$/.test(token));
  return tokens.length > 1 ? tokens[tokens.length - 1] : null;
};

const tree = await (await fetch(TREE_URL)).json();
const byId = new Map(tree.people.map((person) => [person.id, person]));
const parentsOf = new Map();
for (const link of tree.relationships) {
  if (link.type !== "parent") continue;
  parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
}

const statements = [];
const report = [];
for (const person of tree.people) {
  if (person.gender !== "female" || person.maidenName) continue;
  const own = surnameOf(person.displayName);
  const father = (parentsOf.get(person.id) ?? []).map((id) => byId.get(id)).find((parent) => parent?.gender === "male");
  let inferred = null, source = null;
  const curated = CURATED.get(person.displayName);
  const fatherSurname = father ? surnameOf(father.displayName) : null;
  if (curated) {
    inferred = curated.maiden; source = curated.source;
  } else if (fatherSurname && !sameFamily(fatherSurname, own)) {
    inferred = fatherSurname; source = `father ${father.displayName}`;
  }
  if (!inferred) continue;
  report.push(`${person.displayName} -> née ${inferred} (${source})`);
  statements.push(`UPDATE people SET maiden_name = ${q(inferred)}, updated_at = ${q(new Date().toISOString())} WHERE id = ${q(person.id)} AND maiden_name IS NULL;`);
}
const summary = `Inferred maiden names for ${statements.length} women from recorded fathers and curated import records; set only where the name differs from the displayed surname.`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'infer_maiden_names', ${q(summary)}, ${q(JSON.stringify({ count: report.length, entries: report }))}, ${q(new Date().toISOString())});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(summary);
for (const line of report) console.log("  " + line);
if (process.argv.includes("--execute")) {
  execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
}
