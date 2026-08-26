import type { FamilyTree, Person } from "./types";

export function buildGenerations(tree: FamilyTree) {
  const depth = new Map(tree.people.map((person) => [person.id, 0]));
  const parentLinks = tree.relationships.filter((item) => item.type === "parent");
  const spouseLinks = tree.relationships.filter((item) => item.type === "spouse");
  const hasParent = new Set(parentLinks.map((item) => item.toPersonId));
  const childrenOfRootless = new Map<string, string[]>();
  for (const link of parentLinks) {
    if (!hasParent.has(link.fromPersonId)) {
      childrenOfRootless.set(link.fromPersonId, [...(childrenOfRootless.get(link.fromPersonId) ?? []), link.toPersonId]);
    }
  }
  for (let pass = 0; pass < tree.people.length; pass += 1) {
    for (const link of parentLinks) {
      depth.set(link.toPersonId, Math.max(depth.get(link.toPersonId) ?? 0, (depth.get(link.fromPersonId) ?? 0) + 1));
    }
    // Spouses share a row: the shallower partner moves down to the deeper
    // one (a married-in spouse leaves the top row, and a bride with a
    // recorded father still stands on her husband's row).
    for (const link of spouseLinks) {
      const a = link.fromPersonId, b = link.toPersonId;
      const shared = Math.max(depth.get(a) ?? 0, depth.get(b) ?? 0);
      depth.set(a, shared);
      depth.set(b, shared);
    }
    // An in-law parent with no recorded ancestry (a bride's father named in
    // the biography) sits one row above their shallowest child.
    for (const [parent, children] of childrenOfRootless) {
      const shallowest = Math.min(...children.map((child) => depth.get(child) ?? 0));
      depth.set(parent, Math.max(depth.get(parent) ?? 0, shallowest - 1));
    }
  }
  const groups = new Map<number, Person[]>();
  tree.people.forEach((person) => {
    const level = depth.get(person.id) ?? 0;
    groups.set(level, [...(groups.get(level) ?? []), person]);
  });
  return { depth, groups };
}

export interface FamilyLayout {
  positions: Map<string, { x: number; y: number }>;
  /** total width in slot units */
  width: number;
  /** x slot of the first root (the patriarch) - the natural opening view */
  anchorX: number;
  /** child id -> the parent under whose family block the child is drawn */
  primaryParent: Map<string, string>;
}

/**
 * Classic genealogy layout: a couple sits side by side, their children hang
 * directly beneath them, and each sibling brings their own family block along.
 *
 * - A spouse with no recorded parents joins their partner's couple row (a
 *   person with two marriages sits between the two spouses).
 * - When both parents grew up in the tree (a cousin marriage), the children
 *   are drawn once, under the parent closest to the root; the other parent
 *   keeps their own place and the marriage line spans the distance.
 * - x is measured in "slots" (one card wide); y is the generation row.
 */
export function buildFamilyLayout(tree: FamilyTree): FamilyLayout {
  const { depth } = buildGenerations(tree);
  // ancestry depth over parent edges only (no spouse alignment): how far a
  // person's recorded ancestor chain reaches up
  const lineage = new Map(tree.people.map((person) => [person.id, 0]));
  const parentEdges = tree.relationships.filter((item) => item.type === "parent");
  for (let pass = 0; pass < tree.people.length; pass += 1) {
    for (const link of parentEdges) {
      lineage.set(link.toPersonId, Math.max(lineage.get(link.toPersonId) ?? 0, (lineage.get(link.fromPersonId) ?? 0) + 1));
    }
  }
  const byId = new Map(tree.people.map((person) => [person.id, person]));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const link of tree.relationships) {
    if (link.type === "parent") {
      parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
      childrenOf.set(link.fromPersonId, [...(childrenOf.get(link.fromPersonId) ?? []), link.toPersonId]);
    } else {
      spousesOf.set(link.fromPersonId, [...(spousesOf.get(link.fromPersonId) ?? []), link.toPersonId]);
      spousesOf.set(link.toPersonId, [...(spousesOf.get(link.toPersonId) ?? []), link.fromPersonId]);
    }
  }
  // two people who share a child stand together even without a recorded
  // marriage (layout only - no marriage line is drawn for them)
  for (const parents of parentsOf.values()) {
    if (parents.length !== 2) continue;
    const [a, b] = parents;
    if (!(spousesOf.get(a) ?? []).includes(b)) {
      spousesOf.set(a, [...(spousesOf.get(a) ?? []), b]);
      spousesOf.set(b, [...(spousesOf.get(b) ?? []), a]);
    }
  }
  const hasParents = (id: string) => (parentsOf.get(id)?.length ?? 0) > 0;
  const name = (id: string) => byId.get(id)?.displayName ?? "";

  // each child is drawn under exactly one parent: the one whose own ancestor
  // chain reaches deepest into the tree (so a family stays in the main line
  // rather than migrating under a bride's newly recorded father)
  const ancestorCount = new Map<string, number>();
  const countAncestors = (id: string): number => {
    const cached = ancestorCount.get(id);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      for (const parent of parentsOf.get(current) ?? []) {
        if (!seen.has(parent)) {
          seen.add(parent);
          stack.push(parent);
        }
      }
    }
    ancestorCount.set(id, seen.size);
    return seen.size;
  };
  const primaryParent = new Map<string, string>();
  for (const [child, parents] of parentsOf) {
    const pool = parents.filter(hasParents);
    const candidates = pool.length ? pool : parents;
    const best = [...candidates].sort(
      (a, b) =>
        (lineage.get(b) ?? 0) - (lineage.get(a) ?? 0) ||
        countAncestors(b) - countAncestors(a) ||
        (depth.get(a) ?? 0) - (depth.get(b) ?? 0) ||
        name(a).localeCompare(name(b)),
    )[0];
    primaryParent.set(child, best);
  }

  // a married-in spouse (no recorded parents) is drawn inside the partner's
  // couple row; everyone else anchors their own family block
  const attachedTo = new Map<string, string>();
  for (const person of tree.people) {
    if (hasParents(person.id)) continue;
    const partners = (spousesOf.get(person.id) ?? []).filter((partner) => hasParents(partner) || (spousesOf.get(partner)?.length ?? 0) === 0);
    const anchor = partners.filter(hasParents).sort((a, b) => name(a).localeCompare(name(b)))[0];
    if (anchor) attachedTo.set(person.id, anchor);
  }
  // two rootless people married to each other: attach the later name to the first
  for (const person of tree.people) {
    if (hasParents(person.id) || attachedTo.has(person.id)) continue;
    const partners = (spousesOf.get(person.id) ?? []).filter((partner) => !hasParents(partner) && !attachedTo.has(partner));
    for (const partner of partners) {
      if (name(partner) > name(person.id) || (name(partner) === name(person.id) && partner > person.id)) attachedTo.set(partner, person.id);
    }
  }

  const memberRow = (owner: string) => {
    const attached = (spousesOf.get(owner) ?? []).filter((spouse) => attachedTo.get(spouse) === owner);
    attached.sort((a, b) => name(a).localeCompare(name(b)));
    if (attached.length <= 1) return [owner, ...attached];
    return [attached[0], owner, ...attached.slice(1)]; // sit between two spouses
  };
  const childList = (owner: string) => {
    const ids = new Set<string>();
    for (const member of memberRow(owner)) for (const child of childrenOf.get(member) ?? []) if (primaryParent.get(child) === member || primaryParent.get(child) === owner) ids.add(child);
    return [...ids]
      .filter((child) => primaryParent.get(child) && memberRow(owner).includes(primaryParent.get(child)!))
      .sort((a, b) => {
        const ya = Number(byId.get(a)?.birthDate?.slice(0, 4)) || 9999;
        const yb = Number(byId.get(b)?.birthDate?.slice(0, 4)) || 9999;
        return ya - yb || name(a).localeCompare(name(b));
      });
  };

  const widths = new Map<string, number>();
  const measure = (owner: string): number => {
    if (widths.has(owner)) return widths.get(owner)!;
    widths.set(owner, memberRow(owner).length); // guard against cycles
    const kids = childList(owner);
    const childrenWidth = kids.reduce((sum, child) => sum + measure(child), 0);
    const width = Math.max(memberRow(owner).length, childrenWidth);
    widths.set(owner, width);
    return width;
  };

  const positions = new Map<string, { x: number; y: number }>();
  const place = (owner: string, left: number) => {
    if (positions.has(owner)) return;
    const width = measure(owner);
    const members = memberRow(owner);
    const row = depth.get(owner) ?? 0;
    const start = left + width / 2 - members.length / 2;
    members.forEach((member, index) => {
      if (!positions.has(member)) positions.set(member, { x: start + index + 0.5, y: depth.get(member) === row ? row : depth.get(member) ?? row });
    });
    let cursor = left + Math.max(0, (width - childList(owner).reduce((sum, child) => sum + measure(child), 0)) / 2);
    for (const child of childList(owner)) {
      place(child, cursor);
      cursor += measure(child);
    }
  };

  // roots: no parents and not drawn inside someone else's couple row
  const roots = tree.people
    .filter((person) => !hasParents(person.id) && !attachedTo.has(person.id))
    .sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || ((spousesOf.get(b.id)?.length ?? 0) - (spousesOf.get(a.id)?.length ?? 0)) || a.displayName.localeCompare(b.displayName));
  let cursor = 0;
  let anchorX: number | null = null;
  for (const root of roots) {
    if (positions.has(root.id)) continue;
    place(root.id, cursor);
    if (anchorX === null) anchorX = positions.get(root.id)?.x ?? null;
    cursor += measure(root.id) + 1;
  }
  // safety net: anything unplaced (odd data shapes) lines up at the end
  for (const person of tree.people) {
    if (!positions.has(person.id)) {
      positions.set(person.id, { x: cursor + 0.5, y: depth.get(person.id) ?? 0 });
      cursor += 1.5;
    }
  }
  return { positions, width: Math.max(cursor, 1), anchorX: anchorX ?? Math.max(cursor, 1) / 2, primaryParent };
}
