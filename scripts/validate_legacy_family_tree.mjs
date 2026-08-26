#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";

const data = JSON.parse(await readFile("public/legacy-family-tree-data.json", "utf8"));
const html = await readFile("public/legacy-family-tree.html", "utf8");
const people = new Map(data.people.map((person) => [person.id, person]));
const parents = new Map();
const children = new Map();
const linked = new Set();
const relationKeys = new Set();

for (const relation of data.relationships) {
  assert.ok(people.has(relation.from), `Missing relation source ${relation.from}`);
  assert.ok(people.has(relation.to), `Missing relation target ${relation.to}`);
  assert.notEqual(relation.from, relation.to, "Self relationship found");
  const key = `${relation.type}|${relation.from}|${relation.to}`;
  assert.ok(!relationKeys.has(key), `Duplicate relationship ${key}`);
  relationKeys.add(key);
  linked.add(relation.from);
  linked.add(relation.to);
  if (relation.type === "parent") {
    const parent = people.get(relation.from);
    const child = people.get(relation.to);
    assert.ok(parent.generation < child.generation, `${parent.name} must precede ${child.name}`);
    if (!parents.has(child.id)) parents.set(child.id, new Set());
    if (!children.has(parent.id)) children.set(parent.id, new Set());
    parents.get(child.id).add(parent.id);
    children.get(parent.id).add(child.id);
  }
}

for (const [child, recordedParents] of parents) {
  assert.ok(recordedParents.size <= 2, `${people.get(child).name} has more than two recorded parents`);
}

// no cycles down parent -> child edges
const visiting = new Set();
const visited = new Set();
function visit(personId) {
  assert.ok(!visiting.has(personId), `Parent cycle reaches ${people.get(personId).name}`);
  if (visited.has(personId)) return;
  visiting.add(personId);
  for (const child of children.get(personId) ?? []) visit(child);
  visiting.delete(personId);
  visited.add(personId);
}
for (const personId of people.keys()) visit(personId);

// the failure mode of the first reconstruction: people created but never
// connected to anyone. Every person must have at least one relationship.
const isolated = data.people.filter((person) => !linked.has(person.id));
assert.equal(isolated.length, 0, `Isolated people: ${isolated.map((p) => p.name).join(", ")}`);

assert.ok(data.people.length >= 400, "The reconstructed archive unexpectedly lost people");
assert.ok(data.relationships.filter((r) => r.type === "parent").length >= 530, "Parent links unexpectedly lost");
assert.ok(data.relationships.filter((r) => r.type === "spouse").length >= 135, "Marriages unexpectedly lost");
assert.ok(data.documents.length >= 14, "The reconstructed archive unexpectedly lost narrative documents");
assert.equal(data.images.length, 9, "The reconstructed archive unexpectedly lost photographs");
assert.ok(data.images.every((image) => image.file?.startsWith("legacy-photos/")), "Images must reference served files");
assert.equal(data.meta.ambiguousIdentityWarnings.length, 0, "Identity ambiguities remain unresolved");
assert.equal(
  data.people.filter((person) => /^(x{2,}|y{2,}|z{2,}|s{2,})\b/i.test(person.name)).length,
  0,
  "Placeholder people leaked into output",
);
assert.equal(data.complexMarriages.length, 5, "Expected the five known marriages between relatives");

function uniquePerson(name) {
  const matches = data.people.filter((person) => person.name === name);
  assert.equal(matches.length, 1, `Expected one ${name}, found ${matches.length}`);
  return matches[0];
}
function parentNames(person) {
  return [...(parents.get(person.id) ?? [])].map((id) => people.get(id).name).sort();
}

// known family chains
assert.deepEqual(parentNames(uniquePerson("Ramine Darabiha")), ["Jila Khosravi Saeed", "Nasser Darabiha"]);
assert.deepEqual(parentNames(uniquePerson("Parissima Darabiha")), ["Jila Khosravi Saeed", "Nasser Darabiha"]);
assert.deepEqual(parentNames(uniquePerson("Keon Darabiha")), ["Mehdi Darabiha", "Nikoo Abtahi"]);

// regressions caught in the 2026-08-25 audit of the first reconstruction
assert.deepEqual(parentNames(uniquePerson("Aria Golriz")), ["Hamid Golriz", "Ladan xAsJ_31"]);
assert.deepEqual(parentNames(uniquePerson("Karen Kamali")), ["Behrooz Kamali", "Sharareh Eftekhari Rad"]);
assert.deepEqual(parentNames(uniquePerson("Rojina Khavarian")), ["Afshin Khavarian", "Maryam Khavarian"]);
assert.deepEqual(parentNames(uniquePerson("Afshin Khavarian")), ["Mina Jaberian", "Nasrollah Khavarian"]);
// Ali and Alireza Eftekhari Rad are brothers, not one person
assert.deepEqual(parentNames(uniquePerson("Ali Eftekhari Rad")), ["Hossein Eftekhari Rad", "Nahid Helalian"]);
assert.deepEqual(parentNames(uniquePerson("Alireza Eftekhari Rad")), ["Hossein Eftekhari Rad", "Nahid Helalian"]);
assert.deepEqual(parentNames(uniquePerson("Sharareh Eftekhari Rad")), ["Hossein Eftekhari Rad", "Nazi Eftekhari"]);
// marker-split mothers of Farajollah's two marriages
assert.deepEqual(parentNames(uniquePerson("Nahid Jaberian")), ["Farajollah Jaberian", "Moloud Nemati"]);
assert.deepEqual(parentNames(uniquePerson("Helen Jaberian")), ["Aazam (Forough) Nemati", "Farajollah Jaberian"]);
// same-name relatives stay distinct
for (const [name, count] of [
  ["Mohammad Darabi", 2],
  ["Hossein Darabi", 2],
  ["Abbas Darabi", 2],
]) {
  assert.equal(data.people.filter((p) => p.name === name).length, count, `Expected ${count} people named ${name}`);
}

assert.ok(
  data.complexMarriages.some((marriage) => {
    const names = [people.get(marriage.left).name, people.get(marriage.right).name].sort();
    return names.join("|") === ["Kazem Darabiha", "Mehrangiz Darabi"].sort().join("|");
  }),
  "Kazem/Mehrangiz cross-branch marriage was not detected",
);

// the standalone page
assert.match(html, /^<!doctype html>/i);
assert.match(html, /<title>Darabi Family Tree<\/title>/);
assert.match(html, /شجره نامه خاندان دارابی/);
const anchors = html.match(/id="n\d+"/g) ?? [];
assert.ok(anchors.length >= 250, `Tree renders too few people (${anchors.length})`);
assert.ok(html.length < 1_000_000, "The page should stay small; photographs belong in legacy-photos/");
for (const image of data.images) {
  await stat(`public/${image.file}`);
}

console.log(
  `Validated ${data.people.length} people, ${data.relationships.length} relationships, ` +
    `${data.documents.length} archive documents, and ${data.images.length} photographs.`,
);
