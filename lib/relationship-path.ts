import type { FamilyTree, Person } from "./types";

/** How two people in the tree are related, in the words a family uses:
 * "your second cousin once removed", "your great-grandfather". Computed from
 * the recorded parent links, never guessed. */
export type RelationshipResult = {
  from: Person;
  to: Person;
  /** the family word for it, from `from`'s point of view */
  relationship: string;
  /** the people the connection runs through, `from` first and `to` last */
  path: Person[];
  /** the ancestors both descend from, when the link is by blood */
  sharedAncestors: Person[];
};

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const greats = (steps: number, base: string) => steps <= 1 ? base : steps === 2 ? `grand${base}` : `${"great-".repeat(steps - 2)}grand${base}`;

const removedSuffix = (removed: number) => removed === 0 ? "" : removed === 1 ? " once removed" : removed === 2 ? " twice removed" : ` ${removed} times removed`;

/** ancestor id -> how many generations up, walking parent links */
function ancestorsOf(personId: string, parentsOf: Map<string, string[]>): Map<string, number> {
  const found = new Map<string, number>([[personId, 0]]);
  let frontier = [personId];
  let depth = 0;
  while (frontier.length && depth < 30) {
    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const parentId of parentsOf.get(id) ?? []) {
        if (found.has(parentId)) continue;
        found.set(parentId, depth);
        next.push(parentId);
      }
    }
    frontier = next;
  }
  return found;
}

export function describeRelationship(tree: FamilyTree, fromId: string, toId: string): RelationshipResult | null {
  const byId = new Map(tree.people.map((person) => [person.id, person]));
  const from = byId.get(fromId), to = byId.get(toId);
  if (!from || !to) return null;
  if (fromId === toId) return { from, to, relationship: "the same person", path: [from], sharedAncestors: [] };

  const parentsOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const link of tree.relationships) {
    if (link.type === "parent") parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
    else if (link.type === "spouse") {
      spousesOf.set(link.fromPersonId, [...(spousesOf.get(link.fromPersonId) ?? []), link.toPersonId]);
      spousesOf.set(link.toPersonId, [...(spousesOf.get(link.toPersonId) ?? []), link.fromPersonId]);
    }
  }

  const shortestPath = (): Person[] => {
    // undirected walk over parent and spouse links, for the trail of names
    const neighbours = (id: string) => [
      ...(parentsOf.get(id) ?? []),
      ...tree.relationships.filter((link) => link.type === "parent" && link.fromPersonId === id).map((link) => link.toPersonId),
      ...(spousesOf.get(id) ?? []),
    ];
    const previous = new Map<string, string | null>([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === toId) break;
      for (const nextId of neighbours(id)) {
        if (previous.has(nextId)) continue;
        previous.set(nextId, id);
        queue.push(nextId);
      }
    }
    if (!previous.has(toId)) return [];
    const trail: Person[] = [];
    for (let cursor: string | null = toId; cursor; cursor = previous.get(cursor) ?? null) {
      const person = byId.get(cursor);
      if (person) trail.unshift(person);
    }
    return trail;
  };

  const mine = ancestorsOf(fromId, parentsOf);
  const theirs = ancestorsOf(toId, parentsOf);
  let best: { id: string; up: number; down: number } | null = null;
  for (const [id, up] of mine) {
    const down = theirs.get(id);
    if (down === undefined) continue;
    if (!best || up + down < best.up + best.down) best = { id, up, down };
  }

  const path = shortestPath();
  const spouseOfFrom = new Set(spousesOf.get(fromId) ?? []);
  const male = to.gender === "male", female = to.gender === "female";

  if (best) {
    const { up, down } = best;
    const sharedAncestors = [...mine.keys()]
      .filter((id) => theirs.get(id) === best!.down && mine.get(id) === best!.up)
      .map((id) => byId.get(id))
      .filter((person): person is Person => Boolean(person));
    let relationship: string;
    if (up === 0) relationship = greats(down, male ? "son" : female ? "daughter" : "child");
    else if (down === 0) relationship = greats(up, male ? "father" : female ? "mother" : "parent");
    else if (up === 1 && down === 1) relationship = male ? "brother" : female ? "sister" : "sibling";
    else if (up === 1) relationship = greats(down - 1, male ? "nephew" : female ? "niece" : "nephew or niece");
    else if (down === 1) relationship = greats(up - 1, male ? "uncle" : female ? "aunt" : "aunt or uncle");
    else {
      const cousinDegree = Math.min(up, down) - 1;
      const removed = Math.abs(up - down);
      relationship = `${ORDINALS[cousinDegree - 1] ?? `${cousinDegree}th`} cousin${removedSuffix(removed)}`;
    }
    return { from, to, relationship, path, sharedAncestors };
  }

  if (spouseOfFrom.has(toId)) {
    return { from, to, relationship: male ? "husband" : female ? "wife" : "spouse", path, sharedAncestors: [] };
  }
  // related by marriage: someone on the path married in
  if (path.length) {
    const throughSpouse = path.find((person, index) => index > 0 && index < path.length - 1 && (spousesOf.get(person.id) ?? []).some((id) => path.some((other) => other.id === id)));
    return {
      from, to,
      relationship: throughSpouse ? `related by marriage, through ${throughSpouse.displayName}` : "related by marriage",
      path, sharedAncestors: [],
    };
  }
  return { from, to, relationship: "not connected in the records", path: [], sharedAncestors: [] };
}

/** A sentence a person can read: "Niloufar is your second cousin — you share
 * Ghassem Darabi and Robabeh Masoudi." */
export function relationshipSentence(result: RelationshipResult): string {
  if (result.relationship === "not connected in the records") {
    return `${result.from.displayName} and ${result.to.displayName} are not connected by any recorded relationship.`;
  }
  if (result.relationship === "the same person") return `${result.from.displayName} is the same person.`;
  // on a direct line the "shared ancestor" is one of the two people, which
  // reads as nonsense ("Haj Chorok is your great-grandfather. They share Haj Chorok.")
  const direct = result.sharedAncestors.some((person) => person.id === result.from.id || person.id === result.to.id);
  const shared = result.sharedAncestors.length && !direct
    ? ` They share ${result.sharedAncestors.map((person) => person.displayName).join(" and ")}.`
    : "";
  return `${result.to.displayName} is ${result.from.displayName}'s ${result.relationship}.${shared}`;
}
