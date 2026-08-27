#!/usr/bin/env node
// Enter onto the cards the facts the family histories state about people.
//
// The histories and the family biography (imported as stories, Versions
// 82–84) assert facts that the structured records never carried: five people
// they name outright do not exist in the tree, and several people they
// describe have no biography or a biography missing a stated fact. This
// script is the curated diff between what the stories say and what the cards
// hold. Every entry cites its source; nothing here is inferred — the
// plausible-but-unstated leads (see the handoff) are deliberately left out.
//
// Idempotent and convergent: people are matched by name+parents before
// insert, and biography updates are guarded on the exact current text, so a
// re-run after the fact changes nothing and a concurrent edit loses nothing.
//
// Usage: node scripts/enrich_from_histories.mjs [--execute]
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TREE_URL = "https://darabiha.com/api/tree";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/enrich_from_histories.generated.sql";
const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

const tree = await (await fetch(TREE_URL)).json();
const byId = new Map(tree.people.map((person) => [person.id, person]));
const parentsOf = new Map();
for (const link of tree.relationships) {
  if (link.type !== "parent") continue;
  parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
}
const find = (name, parents = null) => {
  let matches = tree.people.filter((person) => person.displayName === name);
  if (matches.length > 1 && parents) {
    matches = matches.filter((person) => {
      const actual = (parentsOf.get(person.id) ?? []).map((id) => byId.get(id)?.displayName).filter(Boolean).sort();
      return JSON.stringify(actual) === JSON.stringify([...parents].sort());
    });
  }
  if (matches.length !== 1) { console.error(`"${name}" resolves to ${matches.length} records`); process.exit(1); }
  return matches[0];
};

// ---- new people the stories name outright -------------------------------
// "His wife was named Robabeh Masoudi, daughter of Haj Mirza Agha; her
// brothers and sisters were Ebrahim, Esmail, Mahmoud, Fatemeh and Masoumeh."
// (Ghassem Darabi, fifth generation — and Robabeh's own biography.) The
// sibling Fatemeh is NOT created: Fatemeh Massoudi already exists as
// Seifollah Jaberian's wife and is plausibly her, but no document says so.
const NEW_PEOPLE = [
  { name: "Ebrahim Masoudi", gender: "male", parents: ["Haj Mirza Agha Masoudi"],
    biography: "Son of Haj Mirza Agha Masoudi and brother of Robabeh Masoudi, named in the family biography's account of Ghassem Darabi." },
  { name: "Esmail Masoudi", gender: "male", parents: ["Haj Mirza Agha Masoudi"],
    biography: "Son of Haj Mirza Agha Masoudi and brother of Robabeh Masoudi. The family history of the customs duty on gut records that it was Esmail who noticed the customs notice on a scrap of newspaper wrapped around vegetables and brought it to Ramazan Darabi, two days before the deadline." },
  { name: "Mahmoud Masoudi", gender: "male", parents: ["Haj Mirza Agha Masoudi"],
    biography: "Son of Haj Mirza Agha Masoudi and brother of Robabeh Masoudi, named in the family biography's account of Ghassem Darabi." },
  { name: "Masoumeh Masoudi", gender: "female", parents: ["Haj Mirza Agha Masoudi"],
    biography: "Daughter of Haj Mirza Agha Masoudi and sister of Robabeh Masoudi, named in the family biography's account of Ghassem Darabi." },
  // "By his wife Ategheh Khanom he had three children: Gholamreza,
  // Gholamhossein and Akram. Gholamreza died of illness in childhood, and his
  // birth certificate was given over to Gholamhossein, who from then on was
  // known as Gholamreza." (Hossein Zehtab, fifth generation.)
  { name: "Gholamreza Darabi", gender: "male", parents: ["Hossein Zehtab Darabi", "Ategheh Khanom"],
    biography: "First son of Hossein Zehtab Darabi and Ategheh Khanom. He died of illness in childhood, and his birth certificate was given over to his younger brother Gholamhossein, who was known as Gholamreza from then on — the Gholam Reza Darabi of this tree is that brother." },
];

// ---- biography corrections and additions --------------------------------
// `append` adds sentences to the existing biography; `replace` sets a new one
// where the record has none or only the import's alias note.
const BIO_EDITS = [
  { name: "Fatemeh Darabi",
    append: "In her husband's household she was called Mirza Baji." },
  { name: "Abbas Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"],
    replace: "Generation 5, the youngest of the five children of Mohammad Zehtab Darabi and Salmeh. The family biography records that he died in his youth. He stands first from the left in the family photograph of about 1920." },
  { name: "Gholam Reza Darabi",
    replace: "Son of Hossein Zehtab Darabi and Ategheh Khanom, born Gholamhossein. After his elder brother Gholamreza died in childhood, the family biography records that the brother's birth certificate was given over to him and he was known as Gholamreza from then on. He was among the first children of the family sent to school. Also recorded in the family archive as Gholamreza Darabi." },
  { name: "Asadollah Jaberian",
    replace: "Eldest son of Fatemeh Darabi and Haj Ramazan Jaberian. He worked in the family partnership as bookkeeper of the factory and the slaughterhouse, and with his uncle Ghassem was one of the first two in the family to read and write, sent to night school by Ramazan Darabi. In the double wedding of about 1927 he was married to Ashraf in a match arranged the same evening — the family history records he learned of his own wedding two nights before it. He stands third from the left, a boy in white, in the family photograph of about 1920." },
  { name: "Haj Mirza Agha Masoudi",
    append: "He was head of the butchers' guild in Qazvin. His children were Ebrahim, Esmail, Mahmoud, Fatemeh, Robabeh, and Masoumeh." },
  { name: "Mohammad Zehtab Darabi",
    append: "His first wife Salmeh died in middle age, and his children later chose a second wife for him, who remained at his side to the end of his life. The family biography records that he worked at the factory until the day before his death, and that he arranged his own funeral — the grave bought, the mosque spoken to, and the money for the ceremony left on the ledge of the room." },
  { name: "Ghassem Darabi",
    append: "With his nephew Asadollah he was one of the first two in the family to read and write, sent to night school by his brother Ramazan." },
  { name: "Hossein Zehtab Darabi",
    append: "In the family partnership he ran the company." },
];

// ---- link people to the stories that mention them -----------------------
// (title from the story imports -> people named in that account who were not
// linkable at import time, either because they did not exist yet or because
// the token map could not name them safely)
const STORY_LINKS = [
  { title: "The customs duty on gut", people: ["Esmail Masoudi"] },
  { title: "Hossein Zehtab (Darabi), fifth generation", people: ["Gholamreza Darabi", "Gholam Reza Darabi"] },
  { title: "Ghassem Darabi, fifth generation", people: ["Ebrahim Masoudi", "Esmail Masoudi", "Mahmoud Masoudi", "Masoumeh Masoudi"] },
  { title: "Ghassem and Asadollah, the first in the family to read and write", people: ["Gholam Reza Darabi", "Aghdas Darabi"] },
];

const statements = [];
const report = [];
const now = new Date().toISOString();
const newIds = new Map();

for (const entry of NEW_PEOPLE) {
  const existing = tree.people.filter((person) => person.displayName === entry.name);
  const alreadyThere = existing.find((person) => {
    const actual = (parentsOf.get(person.id) ?? []).map((id) => byId.get(id)?.displayName).filter(Boolean);
    return entry.parents.every((parent) => actual.includes(parent));
  });
  if (alreadyThere) { report.push(`${entry.name}: already recorded, skipped`); continue; }
  const id = randomUUID();
  newIds.set(entry.name, id);
  statements.push(`INSERT INTO people (id, display_name, gender, biography, created_at, updated_at) VALUES (${q(id)}, ${q(entry.name)}, ${q(entry.gender)}, ${q(entry.biography)}, ${q(now)}, ${q(now)});`);
  for (const parentName of entry.parents) {
    statements.push(`INSERT OR IGNORE INTO relationships (id, from_person_id, to_person_id, type, created_at) VALUES (${q(randomUUID())}, ${q(find(parentName).id)}, ${q(id)}, 'parent', ${q(now)});`);
  }
  report.push(`+ ${entry.name} (${entry.gender}), child of ${entry.parents.join(" + ")}`);
}

for (const edit of BIO_EDITS) {
  const person = find(edit.name, edit.parents ?? null);
  const current = person.biography?.trim() || null;
  const next = edit.replace ?? (current ? `${current.replace(/\s+$/, "")}${current.endsWith(".") ? "" : "."} ${edit.append}` : edit.append);
  if (current === next) { report.push(`${edit.name}: biography already carries this, skipped`); continue; }
  if (edit.append && current?.includes(edit.append.slice(0, 40))) { report.push(`${edit.name}: addition already present, skipped`); continue; }
  statements.push(`UPDATE people SET biography = ${q(next)}, updated_at = ${q(now)} WHERE id = ${q(person.id)} AND biography ${current === null ? "IS NULL" : `= ${q(person.biography)}`};`);
  report.push(`~ ${edit.name}: ${edit.replace ? "biography written" : "added: " + edit.append.slice(0, 70)}`);
}

for (const link of STORY_LINKS) {
  const story = tree.stories.find((candidate) => candidate.title === link.title);
  if (!story) { console.error(`Story "${link.title}" not found`); process.exit(1); }
  for (const name of link.people) {
    const personId = newIds.get(name) ?? find(name).id;
    if (story.personIds.includes(personId)) { report.push(`${link.title} <-> ${name}: already linked`); continue; }
    statements.push(`INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (${q(story.id)}, ${q(personId)});`);
    report.push(`* linked ${name} to "${link.title}"`);
  }
}

console.log(report.join("\n"));
if (!statements.length) { console.log("\nNothing to change."); process.exit(0); }
const summary = `Entered the facts the family histories state: ${statements.filter((s) => s.startsWith("INSERT INTO people")).length} people added, ${statements.filter((s) => s.startsWith("UPDATE people")).length} biographies corrected.`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'enrich_from_histories', ${q(summary)}, ${q(JSON.stringify({ entries: report }))}, ${q(now)});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(`\n${summary}\nSQL written to ${OUT_SQL}`);
if (!process.argv.includes("--execute")) { console.log("Dry run - pass --execute to apply."); process.exit(0); }
execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
