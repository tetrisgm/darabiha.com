import type { FamilyTree, Person } from "./types";

export function buildGenerations(tree: FamilyTree) {
  const depth = new Map(tree.people.map((person) => [person.id, 0]));
  for (let pass = 0; pass < tree.people.length; pass += 1) {
    for (const link of tree.relationships.filter((item) => item.type === "parent")) {
      depth.set(link.toPersonId, Math.max(depth.get(link.toPersonId) ?? 0, (depth.get(link.fromPersonId) ?? 0) + 1));
    }
  }
  const groups = new Map<number, Person[]>();
  tree.people.forEach((person) => {
    const level = depth.get(person.id) ?? 0;
    groups.set(level, [...(groups.get(level) ?? []), person]);
  });
  return { depth, groups };
}
