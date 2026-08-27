#!/usr/bin/env node
// Import the archive's Persian family histories as stories.
//
// Mohmmad_Darabi_HISTORIES/ holds eight accounts written for the family - a
// hunting day outside Qazvin, the two Ramazans walking to Qom, the customs
// duty that nearly ruined the gut trade - and none of them had ever reached
// the site: the stories table was empty. The text is imported verbatim in the
// original Persian; the archive wrote it that way and translating it is the
// family's call, not this script's.
//
// Each story is linked to the people it names. Linking is by explicit Persian
// token, not by guesswork: NAMES maps a phrase that appears in the documents to
// a live display name, and every mapped name must resolve to exactly one
// person or the run fails. Titles are English glosses of the Persian ones; the
// Persian title survives as the opening words of the body.
//
// Prepare the input by re-running the extractor over the source ZIP (kept in
// R2 as an evidence attachment) - see scripts/import_legacy_photos.mjs.
//
// Usage: node scripts/import_legacy_stories.mjs --data <data.json> [--execute]
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TREE_URL = "https://darabiha.com/api/tree";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/import_legacy_stories.generated.sql";
const PREFIX = "Mohmmad_Darabi_HISTORIES/";
const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

// Arabic and Persian letter forms are mixed through the archive; fold them
// before matching so a token written either way still finds its person.
const fold = (value) => value.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ");

// Persian phrase as it appears in the histories -> live display name
const NAMES = new Map([
  ["محمد زهتاب", "Mohammad Zehtab Darabi"],
  ["حسين زهتاب", "Hossein Zehtab Darabi"],
  ["حسين دارابى", "Hossein Zehtab Darabi"],
  ["رمضان دارابى", "Ramazan Darabi"],
  ["رمضان جابريان", "Haj Ramazan Jaberian"],
  ["قاسم", "Ghassem Darabi"],
  ["فاطمه خانم", "Fatemeh Darabi"],
  ["فاطمه دارابى", "Fatemeh Darabi"],
  ["اسداله", "Asadollah Jaberian"],
  ["سيف اله", "Seifollah Jaberian"],
  ["فرج اله", "Farajollah Jaberian"],
  ["عزت اله", "Ezatollah (Ahmad) Jaberian"],
  ["كبرى", "Kobra Jaberian"],
  ["عاتقه خانم", "Ategheh Khanom"],
  ["سلمه", "Salmeh"],
  ["مهدى زهتاب", "Mehdi Zehtab"],
  ["فرخنده", "Farrokhandeh"],
  ["اكرم", "Akram Darabi"],
  ["ربابه", "Robabeh Masoudi"],
].map(([token, name]) => [fold(token), name]));

// source filename -> English title, and a date only where the document states
// one outright. Seven of the eight give no date at all: an undated story sits
// on the people's records rather than on the timeline, which is the honest
// place for it.
const HISTORIES = new Map([
  ["ازدواج تاريخى.doc", { title: "A historic marriage", date: "1927", place: "Qazvin, Iran" }],
  ["حسين زهتاب( دارابى).doc", { title: "Hossein Zehtab (Darabi), fifth generation", place: "Qazvin, Iran" }],
  ["رمضان دارابى ( نسل  پنجم).doc", { title: "Ramazan Darabi, fifth generation", place: "Qazvin, Iran" }],
  ["فاطمه دارابى (نسل پنجم).doc", { title: "Fatemeh Darabi, fifth generation", place: "Qazvin, Iran" }],
  ["قاسم واسداله اولين با سواد فاميل.doc", { title: "Ghassem and Asadollah, the first in the family to read and write" }],
  ["مسافرت رمضانها به قم.doc", { title: "The two Ramazans' journey to Qom", place: "Qom, Iran" }],
  ["يك روز شكار.doc", { title: "A day's hunting", place: "Qazvin, Iran" }],
  ["گمرك روده.doc", { title: "The customs duty on gut" }],
]);

const arg = (flag) => { const index = process.argv.indexOf(flag); return index === -1 ? null : process.argv[index + 1]; };
const dataPath = arg("--data");
if (!dataPath) { console.error("Usage: import_legacy_stories.mjs --data <data.json> [--execute]"); process.exit(1); }

const archive = JSON.parse(await readFile(dataPath, "utf8"));
const tree = await (await fetch(TREE_URL)).json();
const personByName = new Map();
for (const person of tree.people) personByName.set(person.displayName, [...(personByName.get(person.displayName) ?? []), person]);
for (const name of new Set(NAMES.values())) {
  const matches = personByName.get(name) ?? [];
  if (matches.length !== 1) { console.error(`"${name}" resolves to ${matches.length} live records - fix NAMES before importing.`); process.exit(1); }
}

const existingTitles = new Set(tree.stories.map((story) => story.title));
const statements = [];
const report = [];
const now = new Date().toISOString();
for (const document of archive.documents) {
  if (!document.source.startsWith(PREFIX)) continue;
  const filename = document.source.slice(PREFIX.length);
  const meta = HISTORIES.get(filename);
  if (!meta) { report.push(`${filename}: no curated title, skipped`); continue; }
  if (existingTitles.has(meta.title)) { report.push(`${meta.title}: already imported, skipped`); continue; }
  const body = document.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const folded = fold(body);
  const people = [...new Set([...NAMES].filter(([token]) => folded.includes(token)).map(([, name]) => name))];
  const storyId = randomUUID();
  statements.push(`INSERT INTO stories (id, title, body, date, place, created_at) VALUES (${q(storyId)}, ${q(meta.title)}, ${q(body)}, ${q(meta.date ?? null)}, ${q(meta.place ?? null)}, ${q(now)});`);
  for (const name of people) statements.push(`INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (${q(storyId)}, ${q(personByName.get(name)[0].id)});`);
  report.push(`${meta.title}${meta.date ? ` (${meta.date})` : ""} — ${body.length} chars, ${people.length} people: ${people.join(", ")}`);
}

console.log(report.join("\n"));
if (!statements.length) { console.log("\nNothing to import."); process.exit(0); }
const summary = `Imported ${statements.filter((line) => line.startsWith("INSERT INTO stories")).length} Persian family histories from the legacy archive as stories.`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'import_legacy_stories', ${q(summary)}, ${q(JSON.stringify({ entries: report }))}, ${q(now)});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(`\n${summary}\nSQL written to ${OUT_SQL}`);
if (!process.argv.includes("--execute")) { console.log("Dry run - pass --execute to apply."); process.exit(0); }
execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
