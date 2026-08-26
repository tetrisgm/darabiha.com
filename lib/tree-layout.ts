import type { FamilyTree, Person } from "./types";

export function buildGenerations(tree: FamilyTree) {
  const depth = new Map(tree.people.map((person) => [person.id, 0]));
  const parentLinks = tree.relationships.filter((item) => item.type === "parent");
  const spouseLinks = tree.relationships.filter((item) => item.type === "spouse");
  const hasParent = new Set(parentLinks.map((item) => item.toPersonId));
  for (let pass = 0; pass < tree.people.length; pass += 1) {
    for (const link of parentLinks) {
      depth.set(link.toPersonId, Math.max(depth.get(link.toPersonId) ?? 0, (depth.get(link.fromPersonId) ?? 0) + 1));
    }
    // A spouse who married into the family has no recorded parents; show them
    // beside their partner instead of stacking every such person in row zero.
    for (const link of spouseLinks) {
      const a = link.fromPersonId, b = link.toPersonId;
      if (!hasParent.has(a)) depth.set(a, Math.max(depth.get(a) ?? 0, depth.get(b) ?? 0));
      if (!hasParent.has(b)) depth.set(b, Math.max(depth.get(b) ?? 0, depth.get(a) ?? 0));
    }
  }
  const groups = new Map<number, Person[]>();
  tree.people.forEach((person) => {
    const level = depth.get(person.id) ?? 0;
    groups.set(level, [...(groups.get(level) ?? []), person]);
  });
  return { depth, groups };
}
