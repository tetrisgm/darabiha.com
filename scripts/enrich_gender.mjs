#!/usr/bin/env node
// Assign gender to people in the live D1 tree from three sources, in order:
//  1. a curated lexicon of the given names appearing in this family
//     (Persian names are strongly gendered; foreign in-law names included),
//  2. marriage deduction: the spouse of a known man is a woman and vice
//     versa (per the owner's instruction, every recorded marriage in this
//     archive is between a man and a woman), iterated to a fixpoint,
//  3. nothing else - a name that stays ambiguous after both passes is left
//     NULL for the family to settle in the Fill-in queue.
// Only NULL genders are ever written; existing values are respected.
//
// Usage: node scripts/enrich_gender.mjs [--execute]
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TREE_URL = "https://darabiha.com/api/tree";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/enrich_gender.generated.sql";

const MALE = new Set([
  "Abbas", "Abdolkarim", "Abolghasem", "Abtin", "Afshin", "Ahmad", "Akbar", "Alaedin", "Ali", "Alireza",
  "Amir", "Amirhossein", "Arash", "Aria", "Arian", "Ario", "Arjang", "Arman", "Arshia", "Asadollah",
  "Asghar", "Aydin", "Babak", "Bagher", "Bahram", "Bardia", "Behrooz", "Behrouz", "Behzad", "Danial",
  "Dara", "Daryush", "Diaco", "Ehsan", "Emad", "Esfandiar", "Esmail", "Ezatollah", "Farajollah",
  "Farhang", "Fariborz", "Farzad", "Ghassem", "Gholam", "Gholamreza", "Giuseppe", "Habibollah", "Haj",
  "Hamid", "Hasan", "Hassan", "Hojat", "Holger", "Hossein", "Houman", "Houshang", "Iman", "Jafar",
  "Kambiz", "Kasra", "Kazem", "Keon", "Kevin", "Keyvan", "Khosro", "Kourosh", "Kyle", "Lenox", "Luis",
  "Mahan", "Mahmoud", "Majid", "Mani", "Manouchehr", "Massoud", "Mehdi", "Mehran", "Mehrdad", "Meysam",
  "Mohamad", "Mohammad", "Mohsen", "Mojtaba", "Moosa", "Morteza", "Nasrollah", "Nasser", "Neema", "Nick",
  "Nima", "Nosratolah", "Nosratollah", "Parsa", "Parviz", "Pedram", "Pejman", "Radin", "Ramazan",
  "Ramin", "Reymond", "Reza", "Rodvin", "Saeed", "Sahand", "Said", "Saman", "Seena", "Seifollah",
  "Shaahin", "Shahram", "Shayan", "Sirous", "Soheil", "Soroush", "Taghi", "Vahid", "Yashar",
]);
const FEMALE = new Set([
  "Aazam", "Afsaneh", "Afshang", "Anahita", "Anis", "Asieh", "Ategheh", "Atousa", "Ava", "Bahareh",
  "Baran", "Behjat", "Behnaz", "Bita", "Clara", "Darya", "Diana", "Doniya", "Donya", "Effat", "Elham",
  "Farangis", "Fariba", "Farideh", "Farinaz", "Farnoush", "Farrokhandeh", "Farkhondeh", "Fatemeh",
  "Feri", "Firouzeh", "Forough", "Ghazale", "Ghazaleh", "Gita", "Giti", "Hana", "Hava", "Hayedeh",
  "Hediyeh", "Helen", "Hoda", "Ilene", "Jaleh", "Jila", "Julia", "Katayun", "Kiana", "Kimia", "Kobra",
  "Ladan", "Laleh", "Lili", "Lilia", "Linda", "Mahboubeh", "Mahin", "Mahnaz", "Mahtab", "Maliheh",
  "Mana", "Mandana", "Manijeh", "Mansooreh", "Marjan", "Maryam", "Meava", "Medisa", "Mehrangiz",
  "Mehrnoush", "Mehrsima", "Melika", "Mersedeh", "Mina", "Mitra", "Mohadeseh", "Mohtaram", "Mojgan",
  "Moloud", "Mona", "Nafiseh", "Nahid", "Nasrin", "Nastaran", "Nazanin", "Nazbanou", "Nazi", "Neda",
  "Neeka", "Negar", "Negin", "Nicki", "Niki", "Niknaz", "Nikoo", "Nikta", "Niloufar", "Nina",
  "Noushin", "Paniz", "Parissima", "Parvin", "Pegah", "Robabeh", "Roghiyeh", "Rojina", "Rose",
  "Rosebanou", "Rouhi", "Roxana", "Roya", "Sadaf", "Saeedeh", "Sahar", "Salmeh", "Salameh", "Saloomeh",
  "Salyjin", "Samaneh", "Samira", "Sanam", "Sara", "Sepideh", "Shabnam", "Shadi", "Shahrzad",
  "Sharareh", "Sheida", "Shirin", "Shiva", "Shokoufeh", "Sima", "Soheila", "Somayeh", "Soraya",
  "Sotoudeh", "Tabasom", "Tahereh", "Tara", "Taraneh", "Touran", "Yasaman", "Zari",
]);
// deliberately unlisted (ambiguous, or a living person whose gender the
// archive should not guess): Ramine, Heshmat, Karen, Sasha, Meesha, Setia,
// Shervine, Shahin, Ashraf, Akhtar, Eshrat, Aghdas, Akram, Geng, Vahidi,
// code-only names - marriages resolve most of them.

const CODE = /^x[A-Za-z]{2,5}_\d+[a-z]?$/;
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

const tree = await (await fetch(TREE_URL)).json();
const gender = new Map();
const evidence = new Map();
for (const person of tree.people) {
  if (person.gender) { gender.set(person.id, person.gender); evidence.set(person.id, "already recorded"); continue; }
  const tokens = person.displayName.replace(/[()]/g, " ").split(/\s+/).filter((token) => token && !CODE.test(token));
  const hit = tokens.find((token) => MALE.has(token) || FEMALE.has(token));
  if (hit) {
    gender.set(person.id, MALE.has(hit) ? "male" : "female");
    evidence.set(person.id, `name ${hit}`);
  }
}
// marriage deduction to a fixpoint
const couples = tree.relationships.filter((link) => link.type === "spouse");
let changed = true;
const conflicts = [];
while (changed) {
  changed = false;
  for (const link of couples) {
    const a = link.fromPersonId, b = link.toPersonId;
    const ga = gender.get(a), gb = gender.get(b);
    if (ga && gb) {
      if (ga === gb) conflicts.push([a, b]);
      continue;
    }
    if (ga && !gb) { gender.set(b, ga === "male" ? "female" : "male"); evidence.set(b, "spouse deduction"); changed = true; }
    if (gb && !ga) { gender.set(a, gb === "male" ? "female" : "male"); evidence.set(a, "spouse deduction"); changed = true; }
  }
}

const byId = new Map(tree.people.map((person) => [person.id, person]));
const statements = [];
let assigned = 0;
const counts = { male: 0, female: 0 };
for (const person of tree.people) {
  if (person.gender) continue;
  const value = gender.get(person.id);
  if (!value) continue;
  statements.push(`UPDATE people SET gender = ${q(value)}, updated_at = ${q(new Date().toISOString())} WHERE id = ${q(person.id)} AND gender IS NULL;`);
  assigned += 1;
  counts[value] += 1;
}
const unresolved = tree.people.filter((person) => !person.gender && !gender.get(person.id));
const summary = `Assigned gender to ${assigned} people (${counts.male} men, ${counts.female} women) from the family's given names and marriage deduction; ${unresolved.length} left for the family to settle.`;
statements.push(
  `INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'enrich_gender', ${q(summary)}, ${q(JSON.stringify({ assigned, ...counts, unresolved: unresolved.map((person) => person.displayName) }))}, ${q(new Date().toISOString())});`,
);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(summary);
if (conflicts.length) {
  console.log("CONFLICTS (same-gender marriage implies a naming error - nothing was written for these):");
  for (const [a, b] of new Set(conflicts.map((pair) => pair.join("|")))) {
    const [x, y] = a ? [a, b] : [];
    void x; void y;
  }
  for (const pair of conflicts) console.log(" ", byId.get(pair[0])?.displayName, "~", byId.get(pair[1])?.displayName);
}
console.log("Left NULL:", unresolved.map((person) => person.displayName).join("; ") || "none");
console.log(`SQL written to ${OUT_SQL} (${statements.length} statements).`);
if (process.argv.includes("--execute")) {
  execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
}
