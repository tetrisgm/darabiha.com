#!/usr/bin/env node
// Import the archive's Persian family histories as stories.
//
// Mohmmad_Darabi_HISTORIES/ holds eight accounts written for the family - a
// hunting day outside Qazvin, the two Ramazans walking to Qom, the customs
// duty that nearly ruined the gut trade - and none of them had ever reached
// the site: the stories table was empty. A reader meets the English first
// (`body`, from legacy_story_translations.mjs) and the family's own Persian
// is kept beside it (`original_body`), never replaced by the translation.
//
// SECTIONS does the same for the family biography, which is one long document
// rather than one file per account: each entry slices the original between two
// markers and names its people outright, since the biography's short sections
// mention several Fatemehs and two Abbas Darabis between them.
//
// Each story is linked to the people it names. For the histories linking is by
// explicit Persian token, not by guesswork: NAMES maps a phrase that appears in
// the documents to a live display name, and every mapped name must resolve to
// exactly one person or the run fails. Titles are English glosses of the
// Persian ones; the Persian title survives as the opening words of the body.
//
// Prepare the input by re-running the extractor over the source ZIP (kept in
// R2 as an evidence attachment) - see scripts/import_legacy_photos.mjs.
//
// Usage: node scripts/import_legacy_stories.mjs --data <data.json> [--execute]
import { readFile, writeFile } from "node:fs/promises";
import { TRANSLATIONS } from "./legacy_story_translations.mjs";
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

// source filename -> English title, plus a date where the document supports
// one. `derived` marks a year the document does not state but fixes exactly:
// both of those give Ramazan Darabi's age at the event, and his birth year
// (1272 Solar Hijri = 1893) is on his record. The rest give no date at all and
// stay undated - an undated story sits on the people's records rather than on
// the timeline, which is the honest place for it.
const HISTORIES = new Map([
  ["ازدواج تاريخى.doc", { title: "A historic marriage", date: "1927", place: "Qazvin, Iran" }],
  ["حسين زهتاب( دارابى).doc", { title: "Hossein Zehtab (Darabi), fifth generation", place: "Qazvin, Iran" }],
  ["رمضان دارابى ( نسل  پنجم).doc", { title: "Ramazan Darabi, fifth generation", place: "Qazvin, Iran" }],
  ["فاطمه دارابى (نسل پنجم).doc", { title: "Fatemeh Darabi, fifth generation", place: "Qazvin, Iran" }],
  ["قاسم واسداله اولين با سواد فاميل.doc", { title: "Ghassem and Asadollah, the first in the family to read and write" }],
  ["مسافرت رمضانها به قم.doc", { title: "The two Ramazans' journey to Qom", place: "Qom, Iran", date: "1905",
    derived: "the document says Ramazan Darabi was twelve; he was born in 1893" }],
  ["يك روز شكار.doc", { title: "A day's hunting", place: "Qazvin, Iran", date: "1906",
    derived: "the document says Ramazan Darabi was about thirteen; he was born in 1893" }],
  ["گمرك روده.doc", { title: "The customs duty on gut" }],
]);

// Sections of the family biography and the introduction. `from`/`to` slice the
// archive's own text, so the Persian in the record is never hand-copied here.
// The three fifth-generation accounts the biography repeats (Hossein, Fatemeh,
// Ramazan) are deliberately absent: they are already stories of their own.
const SECTIONS = [
  { source: "A_Introduction.html", title: "The dedication", from: "باعث افتخار است", to: "با تشکر فراوان",
    date: "2013", people: ["Nasser Darabiha", "Mohammad Darabi", "Nahid Jaberian", "Helen Jaberian", "Farnoush Darabi",
      "Niloufar Hashemzad Forouzan", "Mahin Darabi", "Sheida Eftekhari Rad", "Massoud Darabiha", "Farzad Hosseinzadeh"] },
  { source: "B_Family_Biography_English.html", title: "How this biography was written", from: "با عرض سلام", to: "١- حاج چورُك",
    date: "2013", people: ["Mohammad Darabi", "Nasser Darabiha", "Ramazan Darabi", "Fatemeh Darabi", "Haj Ramazan Jaberian",
      "Nahid Jaberian", "Helen Jaberian", "Mahin Darabi", "Massoud Darabiha", "Farzad Hosseinzadeh", "Sheida Eftekhari Rad",
      "Niloufar Hashemzad Forouzan"] },
  { source: "B_Family_Biography_English.html", title: "Haj Chorok, first generation", from: "١- حاج چورُك", to: "٢- محمد زهتاب",
    place: "Qazvin, Iran", people: ["Haj Chorok", "Haj Agha"] },
  { source: "B_Family_Biography_English.html", title: "Mohammad Zehtab (Darabi), fourth generation", from: "٢- محمد زهتاب", to: "سرشاخه ها",
    place: "Qazvin, Iran", people: ["Mohammad Zehtab Darabi", "Haj Khalil", "Haj Agha", "Salmeh", "Hossein Zehtab Darabi",
      "Ramazan Darabi", "Ghassem Darabi", "Asadollah Jaberian"] },
  { source: "B_Family_Biography_English.html", title: "The main branches of the family", from: "سرشاخه ها", to: "٣- حسين زهتاب",
    people: ["Mohammad Zehtab Darabi", "Hossein Zehtab Darabi", "Fatemeh Darabi", "Ramazan Darabi", "Ghassem Darabi",
      { name: "Abbas Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"] }] },
  { source: "B_Family_Biography_English.html", title: "Ghassem Darabi, fifth generation", from: "٦-قاسم دارابي", to: null,
    place: "Tehran, Iran", people: ["Ghassem Darabi", "Robabeh Masoudi", "Haj Mirza Agha Masoudi", "Kazem Darabiha",
      "Ashraf Darabi", "Reza Darabiha", "Mohammad Taghi Darabi", "Mohammad Karim Darabiha", "Effat Darabiha",
      "Mohammad Rahim Darabi", "Nasser Darabiha"] },
];

const arg = (flag) => { const index = process.argv.indexOf(flag); return index === -1 ? null : process.argv[index + 1]; };
const dataPath = arg("--data");
if (!dataPath) { console.error("Usage: import_legacy_stories.mjs --data <data.json> [--execute]"); process.exit(1); }

const archive = JSON.parse(await readFile(dataPath, "utf8"));
const tree = await (await fetch(TREE_URL)).json();
const personByName = new Map();
for (const person of tree.people) personByName.set(person.displayName, [...(personByName.get(person.displayName) ?? []), person]);
const parentsOf = new Map();
for (const link of tree.relationships) {
  if (link.type !== "parent") continue;
  parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
}
const byId = new Map(tree.people.map((person) => [person.id, person]));
function resolvePerson(entry) {
  const name = typeof entry === "string" ? entry : entry.name;
  let matches = personByName.get(name) ?? [];
  if (matches.length > 1 && typeof entry !== "string" && entry.parents) {
    matches = matches.filter((person) => {
      const parents = (parentsOf.get(person.id) ?? []).map((id) => byId.get(id)?.displayName).filter(Boolean).sort();
      return JSON.stringify(parents) === JSON.stringify([...entry.parents].sort());
    });
  }
  if (matches.length !== 1) { console.error(`"${name}" resolves to ${matches.length} live records - fix the mapping before importing.`); process.exit(1); }
  return matches[0];
}
for (const name of new Set(NAMES.values())) resolvePerson(name);
for (const section of SECTIONS) for (const entry of section.people) resolvePerson(entry);

const statements = [];
const report = [];
const now = new Date().toISOString();
for (const document of archive.documents) {
  if (!document.source.startsWith(PREFIX)) continue;
  const filename = document.source.slice(PREFIX.length);
  const meta = HISTORIES.get(filename);
  if (!meta) { report.push(`${filename}: no curated title, skipped`); continue; }
  const body = document.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const english = TRANSLATIONS.get(meta.title);
  if (!english) { console.error(`No translation for "${meta.title}" - add one to legacy_story_translations.mjs.`); process.exit(1); }
  const existing = tree.stories.find((story) => story.title === meta.title);
  if (existing) {
    const changes = [];
    if ((existing.date ?? null) !== (meta.date ?? null)) changes.push(`date = ${q(meta.date ?? null)}`);
    if ((existing.place ?? null) !== (meta.place ?? null)) changes.push(`place = ${q(meta.place ?? null)}`);
    if (existing.body !== english) changes.push(`body = ${q(english)}`);
    if ((existing.originalBody ?? null) !== body) changes.push(`original_body = ${q(body)}`);
    if (!changes.length) { report.push(`${meta.title}: already imported, unchanged`); continue; }
    statements.push(`UPDATE stories SET ${changes.join(", ")} WHERE id = ${q(existing.id)};`);
    report.push(`${meta.title}: set ${changes.map((change) => change.split(" = ")[0]).join(", ")}${meta.derived ? ` (date derived — ${meta.derived})` : ""}`);
    continue;
  }
  const folded = fold(body);
  const people = [...new Set([...NAMES].filter(([token]) => folded.includes(token)).map(([, name]) => name))];
  const storyId = randomUUID();
  statements.push(`INSERT INTO stories (id, title, body, original_body, date, place, created_at) VALUES (${q(storyId)}, ${q(meta.title)}, ${q(english)}, ${q(body)}, ${q(meta.date ?? null)}, ${q(meta.place ?? null)}, ${q(now)});`);
  for (const name of people) statements.push(`INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (${q(storyId)}, ${q(resolvePerson(name).id)});`);
  report.push(`${meta.title}${meta.date ? ` (${meta.date}${meta.derived ? " derived" : ""})` : ""} — ${body.length} chars, ${people.length} people: ${people.join(", ")}`);
}

const docBySource = new Map(archive.documents.map((document) => [document.source, document.text]));
for (const section of SECTIONS) {
  const text = docBySource.get(section.source);
  if (!text) { console.error(`Missing document ${section.source}`); process.exit(1); }
  const start = text.indexOf(section.from);
  if (start === -1) { console.error(`Marker "${section.from}" not found in ${section.source}`); process.exit(1); }
  const end = section.to ? text.indexOf(section.to, start) : text.length;
  const body = text.slice(start, end === -1 ? text.length : end).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const english = TRANSLATIONS.get(section.title);
  if (!english) { console.error(`No translation for "${section.title}".`); process.exit(1); }
  const existing = tree.stories.find((story) => story.title === section.title);
  if (existing) {
    const changes = [];
    if ((existing.date ?? null) !== (section.date ?? null)) changes.push(`date = ${q(section.date ?? null)}`);
    if ((existing.place ?? null) !== (section.place ?? null)) changes.push(`place = ${q(section.place ?? null)}`);
    if (existing.body !== english) changes.push(`body = ${q(english)}`);
    if ((existing.originalBody ?? null) !== body) changes.push(`original_body = ${q(body)}`);
    if (!changes.length) { report.push(`${section.title}: already imported, unchanged`); continue; }
    statements.push(`UPDATE stories SET ${changes.join(", ")} WHERE id = ${q(existing.id)};`);
    report.push(`${section.title}: set ${changes.map((change) => change.split(" = ")[0]).join(", ")}`);
    continue;
  }
  const storyId = randomUUID();
  statements.push(`INSERT INTO stories (id, title, body, original_body, date, place, created_at) VALUES (${q(storyId)}, ${q(section.title)}, ${q(english)}, ${q(body)}, ${q(section.date ?? null)}, ${q(section.place ?? null)}, ${q(now)});`);
  for (const entry of section.people) statements.push(`INSERT OR IGNORE INTO story_people (story_id, person_id) VALUES (${q(storyId)}, ${q(resolvePerson(entry).id)});`);
  report.push(`${section.title}${section.date ? ` (${section.date})` : ""} — ${body.length} chars original, ${english.length} chars English, ${section.people.length} people`);
}

console.log(report.join("\n"));
if (!statements.length) { console.log("\nNothing to import."); process.exit(0); }
const inserted = statements.filter((line) => line.startsWith("INSERT INTO stories")).length;
const updated = statements.filter((line) => line.startsWith("UPDATE stories")).length;
const summary = inserted
  ? `Imported ${inserted} Persian family histories from the legacy archive as stories.`
  : `Updated ${updated} imported family histories (English body, Persian original, dates).`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'import_legacy_stories', ${q(summary)}, ${q(JSON.stringify({ entries: report }))}, ${q(now)});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(`\n${summary}\nSQL written to ${OUT_SQL}`);
if (!process.argv.includes("--execute")) { console.log("Dry run - pass --execute to apply."); process.exit(0); }
execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
