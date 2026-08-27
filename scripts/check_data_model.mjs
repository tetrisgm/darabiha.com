#!/usr/bin/env node
// Every property the archive's data should hold, checked against the live D1.
//
// There are no foreign keys on these tables - D1 would need every table
// rebuilt to add them - so the guarantees live in the code that writes, and
// this is how we find out whether that code is telling the truth. Read-only:
// it never writes, so it is safe to run against production at any time.
//
// Usage: node scripts/check_data_model.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const DB = "darabiha-family";

const CHECKS = [
  ["a link points at someone who is not in the tree",
    "SELECT COUNT(*) n FROM relationships r WHERE NOT EXISTS(SELECT 1 FROM people p WHERE p.id=r.from_person_id) OR NOT EXISTS(SELECT 1 FROM people p WHERE p.id=r.to_person_id)"],
  ["someone is their own parent or spouse",
    "SELECT COUNT(*) n FROM relationships WHERE from_person_id = to_person_id"],
  ["the same link is stored twice",
    "SELECT COUNT(*) n FROM (SELECT from_person_id,to_person_id,type,COUNT(*) c FROM relationships GROUP BY 1,2,3 HAVING c>1)"],
  ["a marriage is stored from both sides",
    "SELECT COUNT(*) n FROM relationships a JOIN relationships b ON a.from_person_id=b.to_person_id AND a.to_person_id=b.from_person_id AND a.type='spouse' AND b.type='spouse'"],
  ["a story names someone who is gone",
    "SELECT COUNT(*) n FROM story_people sp WHERE NOT EXISTS(SELECT 1 FROM people p WHERE p.id=sp.person_id) OR NOT EXISTS(SELECT 1 FROM stories s WHERE s.id=sp.story_id)"],
  ["a photograph is linked to someone who is gone",
    "SELECT COUNT(*) n FROM person_photos pp WHERE NOT EXISTS(SELECT 1 FROM people p WHERE p.id=pp.person_id) OR NOT EXISTS(SELECT 1 FROM attachments a WHERE a.id=pp.attachment_id)"],
  ["a comment is left on someone who is gone",
    "SELECT COUNT(*) n FROM person_comments c WHERE NOT EXISTS(SELECT 1 FROM people p WHERE p.id=c.person_id)"],
  ["a story's attachment is missing",
    "SELECT COUNT(*) n FROM story_attachments sa WHERE NOT EXISTS(SELECT 1 FROM stories s WHERE s.id=sa.story_id) OR NOT EXISTS(SELECT 1 FROM attachments a WHERE a.id=sa.attachment_id)"],
  ["a portrait points at a file that is not there",
    "SELECT COUNT(*) n FROM people WHERE photo_attachment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM attachments a WHERE a.id=people.photo_attachment_id)"],
  ["an account claims a person who is gone",
    "SELECT COUNT(*) n FROM members WHERE person_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM people p WHERE p.id=members.person_id)"],
  ["two accounts claim the same person",
    "SELECT COUNT(*) n FROM (SELECT person_id, COUNT(*) c FROM members WHERE person_id IS NOT NULL GROUP BY 1 HAVING c>1)"],
  ["a role is not one of admin, canEdit, canView",
    "SELECT COUNT(*) n FROM members WHERE role NOT IN ('admin','canEdit','canView')"],
  ["nobody can administer the archive",
    "SELECT CASE WHEN COUNT(*)>0 THEN 0 ELSE 1 END n FROM members WHERE role='admin'"],
  ["a gender is neither male nor female",
    "SELECT COUNT(*) n FROM people WHERE gender IS NOT NULL AND gender NOT IN ('male','female')"],
  ["someone died before they were born",
    "SELECT COUNT(*) n FROM people WHERE birth_date IS NOT NULL AND death_date IS NOT NULL AND CAST(substr(death_date,1,4) AS INT) < CAST(substr(birth_date,1,4) AS INT)"],
  ["someone has more than two parents",
    "SELECT COUNT(*) n FROM (SELECT to_person_id, COUNT(*) c FROM relationships WHERE type='parent' GROUP BY 1 HAVING c>2)"],
  ["a parent is not older than their child",
    "SELECT COUNT(*) n FROM relationships r JOIN people pa ON pa.id=r.from_person_id JOIN people ch ON ch.id=r.to_person_id WHERE r.type='parent' AND pa.birth_date IS NOT NULL AND ch.birth_date IS NOT NULL AND CAST(substr(pa.birth_date,1,4) AS INT) >= CAST(substr(ch.birth_date,1,4) AS INT)"],
  ["a person has no name",
    "SELECT COUNT(*) n FROM people WHERE display_name IS NULL OR TRIM(display_name)=''"],
  ["a date is not a year",
    "SELECT COUNT(*) n FROM people WHERE (birth_date IS NOT NULL AND birth_date NOT GLOB '[0-9][0-9][0-9][0-9]*') OR (death_date IS NOT NULL AND death_date NOT GLOB '[0-9][0-9][0-9][0-9]*')"],
  ["a question is answered but has no answer recorded",
    "SELECT COUNT(*) n FROM open_questions WHERE status <> 'open' AND answered_at IS NULL"],
];

async function count(sql) {
  // the API rate-limits a burst, so these go one at a time
  const { stdout } = await run("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql], { maxBuffer: 1 << 22 });
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(stdout.slice(0, 200));
  return Number(Object.values(JSON.parse(stdout.slice(start))[0].results[0])[0]);
}

let failed = 0;
for (const [label, sql] of CHECKS) {
  let n;
  try { n = await count(sql); } catch (error) { console.log(`?? ${label} — ${String(error).slice(0, 90)}`); failed += 1; continue; }
  if (n) failed += 1;
  console.log(`${n ? "!!" : "  "} ${String(n).padStart(4)}  ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} need attention.` : "\nThe data model holds.");
process.exit(failed ? 1 : 0);
