#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile("public/legacy-family-tree-data.json", "utf8"));
const html = await readFile("public/legacy-family-tree.html", "utf8");
const people = new Map(data.people.map((person) => [person.id, person]));
const parents = new Map();
const children = new Map();
const relationKeys = new Set();

for (const relation of data.relationships) {
  assert.ok(people.has(relation.from), `Missing relation source ${relation.from}`);
  assert.ok(people.has(relation.to), `Missing relation target ${relation.to}`);
  assert.notEqual(relation.from, relation.to, "Self relationship found");
  const key = `${relation.type}|${relation.from}|${relation.to}`;
  assert.ok(!relationKeys.has(key), `Duplicate relationship ${key}`);
  relationKeys.add(key);
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

assert.ok(data.people.length >= 400, "The reconstructed archive unexpectedly lost people");
assert.ok(data.documents.length >= 14, "The reconstructed archive unexpectedly lost narrative documents");
assert.equal(data.images.length, 9, "The reconstructed archive unexpectedly lost photographs");
assert.ok(data.images.every((image) => !("dataUrl" in image)), "The machine-readable JSON should contain image metadata, not embedded image bytes");
assert.equal(data.meta.ambiguousIdentityWarnings.length, 0, "Identity ambiguities remain unresolved");
assert.equal(data.people.filter((person) => /^(x+|y+|z+|s+)\b/i.test(person.name)).length, 0, "Placeholder people leaked into output");

function uniquePerson(name) {
  const matches = data.people.filter((person) => person.name === name);
  assert.equal(matches.length, 1, `Expected one ${name}, found ${matches.length}`);
  return matches[0];
}
function parentNames(person) {
  return [...(parents.get(person.id) ?? [])].map((id) => people.get(id).name).sort();
}

assert.deepEqual(parentNames(uniquePerson("Ramine Darabiha")), ["Jila Khosravi Saeed", "Nasser Darabiha"]);
assert.deepEqual(parentNames(uniquePerson("Parissima Darabiha")), ["Jila Khosravi Saeed", "Nasser Darabiha"]);
assert.deepEqual(parentNames(uniquePerson("Keon Darabiha")), ["Mehdi Darabiha", "Nikoo Abtahi"]);
assert.ok(data.complexMarriages.some((marriage) => {
  const names = [people.get(marriage.left).name, people.get(marriage.right).name].sort();
  return names.join("|") === ["Kazem Darabiha", "Mehrangiz Darabi"].sort().join("|");
}), "Kazem/Mehrangiz cross-branch marriage was not detected");

assert.match(html, /^<!doctype html>/i);
assert.match(html, /Darabi family — reconstructed archive/);
assert.match(html, /const DATA=/);
assert.match(html, /data:image\/(?:jpeg|png|gif|webp);base64,/);

console.log(`Validated ${data.people.length} people, ${data.relationships.length} relationships, ${data.documents.length} archive documents, and ${data.images.length} photographs.`);
