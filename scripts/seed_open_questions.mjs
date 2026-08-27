#!/usr/bin/env node
// Queue the archive's open questions in the Fill-in tab for the family.
//
// These are the leads the enrichment pass (enrich_from_histories.mjs)
// deliberately did NOT act on: each is implied by the record but stated
// nowhere, so the verdict belongs to the family — the owner's father reviews
// them in the Fill-in tab and confirms or denies. Confirming applies the
// prepared change in proposal_json (person ids resolved here, at seed time);
// denying closes the question for good. Both are recorded in change_log.
//
// Stable ids make the seed idempotent: INSERT OR IGNORE never duplicates a
// question, and never reopens one the family has already answered.
//
// Usage: node scripts/seed_open_questions.mjs [--execute]
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TREE_URL = "https://darabiha.com/api/tree";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/seed_open_questions.generated.sql";
const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

const tree = await (await fetch(TREE_URL)).json();
const find = (name) => {
  const matches = tree.people.filter((person) => person.displayName === name);
  if (matches.length !== 1) { console.error(`"${name}" resolves to ${matches.length} records`); process.exit(1); }
  return matches[0];
};

const QUESTIONS = [
  {
    id: "oq-fatemeh-massoudi-sister",
    question: "Is Fatemeh Massoudi — Seifollah Jaberian's wife — the same Fatemeh who was Robabeh Masoudi's sister?",
    evidence: "The family biography's account of Ghassem Darabi names Robabeh's brothers and sisters: Ebrahim, Esmail, Mahmoud, Fatemeh and Masoumeh. A Fatemeh Massoudi is recorded as Seifollah Jaberian's wife, but no document states she is that sister.",
    actionSummary: "If yes, Fatemeh Massoudi is linked as a daughter of Haj Mirza Agha Masoudi and her record notes she was Robabeh's sister.",
    choices: [{ label: "Yes, the same person", verdict: "confirm" }, { label: "No, someone else", verdict: "deny" }],
    actions: [
      { type: "add_parent", parentId: find("Haj Mirza Agha Masoudi").id, childId: find("Fatemeh Massoudi").id },
      { type: "append_biography", personId: find("Fatemeh Massoudi").id, text: "Daughter of Haj Mirza Agha Masoudi and sister of Robabeh Masoudi." },
    ],
  },
  {
    id: "oq-mohammad-zehtab-second-wife",
    question: "What was the name of Mohammad Zehtab Darabi's second wife?",
    evidence: "The family biography records that after Salmeh died in middle age, Mohammad's children chose a second wife for him, and that she remained at his side to the end of his life — but it never gives her name.",
    actionSummary: "Enter her name to add her to the tree as Mohammad Zehtab Darabi's wife.",
    actions: [
      { type: "create_spouse", ofId: find("Mohammad Zehtab Darabi").id, gender: "female", nameFromAnswer: true,
        biography: "Second wife of Mohammad Zehtab Darabi, chosen for him by his children after Salmeh died in middle age. The family biography records that she remained at his side to the end of his life." },
    ],
  },
  {
    id: "oq-ashraf-bookkeeper-daughter",
    question: "Was Ashraf Nokhodberizan the bookkeeper's daughter of the double wedding of about 1927?",
    evidence: "The history “A historic marriage” records that Asadollah Jaberian married the daughter of the partnership's bookkeeper — a respected Qazvin merchant who had lost his fortune — in a match arranged the same evening. Asadollah's recorded wife is Ashraf Nokhodberizan, but the story never names the bride.",
    actionSummary: "If yes, Ashraf's record notes that her father was the partnership's bookkeeper of the marriage story.",
    choices: [{ label: "Yes, that was her", verdict: "confirm" }, { label: "No", verdict: "deny" }],
    actions: [
      { type: "append_biography", personId: find("Ashraf Nokhodberizan").id, text: "Her father was a respected Qazvin merchant who, after losing his fortune, joined the family partnership as its bookkeeper; the double wedding of about 1927 in the family history is hers and Asadollah's." },
    ],
  },
  {
    id: "oq-1920-photo-figures",
    question: "Who are the two unidentified men in the 1920 photograph (fourth and sixth from the left)?",
    evidence: "The family biography's caption for the earliest photograph reads: “Left to right: Abbas Darabi, Hossein Zehtab Darabi, Asadollah Jaberian, -?, Ghassem Darabi, -?. Picture; approximately 1920.” Figures 4 and 6 were never identified.",
    actionSummary: "Write what you know in the note — an editor will add them to the photograph's records.",
    choices: [{ label: "Save what I wrote", verdict: "confirm" }, { label: "Still unknown", verdict: "deny" }],
    // the question is about a photograph, so it should be shown with it
    image: true, // the ~1920 group photograph
    actions: null, // nothing to auto-apply; the note itself is the answer
  },
];

// The group photograph is the one image several people share - which is
// exactly what makes it the group photograph - so it needs no filename lookup
// and the seed never uploads a second copy.
const sharedPhotograph = () => {
  const counts = new Map();
  for (const person of tree.people) for (const id of person.photoIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  const [id, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return count > 1 ? id : null;
};

const statements = [];
const report = [];
const now = new Date().toISOString();
for (const entry of QUESTIONS) {
  const imageId = entry.image ? sharedPhotograph() : null;
  const proposal = entry.actions || entry.choices || imageId
    ? JSON.stringify({ actions: entry.actions ?? undefined, choices: entry.choices ?? undefined, imageId: imageId ?? undefined })
    : null;
  statements.push(`INSERT OR IGNORE INTO open_questions (id, question, evidence, action_summary, proposal_json, status, created_at) VALUES (${q(entry.id)}, ${q(entry.question)}, ${q(entry.evidence)}, ${q(entry.actionSummary)}, ${q(proposal)}, 'open', ${q(now)});`);
  report.push(`${entry.question}${entry.choices ? ` [${entry.choices.map((choice) => choice.label).join(" / ")}]` : ""}${imageId ? " +photo" : ""}`);
}
// seeded rows already exist, so refresh their metadata in place
for (const entry of QUESTIONS) {
  const imageId = entry.image ? sharedPhotograph() : null;
  const proposal = entry.actions || entry.choices || imageId
    ? JSON.stringify({ actions: entry.actions ?? undefined, choices: entry.choices ?? undefined, imageId: imageId ?? undefined })
    : null;
  statements.push(`UPDATE open_questions SET question = ${q(entry.question)}, evidence = ${q(entry.evidence)}, action_summary = ${q(entry.actionSummary)}, proposal_json = ${q(proposal)} WHERE id = ${q(entry.id)} AND status = 'open';`);
}
const summary = `Queued ${QUESTIONS.length} open questions from the family histories for review in the Fill-in tab.`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'seed_open_questions', ${q(summary)}, ${q(JSON.stringify({ questions: report }))}, ${q(now)});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(report.map((line) => "? " + line).join("\n"));
console.log(`\n${summary}\nSQL written to ${OUT_SQL}`);
if (!process.argv.includes("--execute")) { console.log("Dry run - pass --execute to apply."); process.exit(0); }
execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
