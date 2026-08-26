import { describe, expect, it } from "vitest";
import { buildGenerations } from "../lib/tree-layout";
import type { FamilyTree, Person } from "../lib/types";

const person = (id: string): Person => ({ id, displayName: id, givenName: null, familyName: null, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, birthCity: null, birthCountry: null, deathCity: null, deathCountry: null, biography: null, photoAttachmentId: null });
const tree: FamilyTree = { people: ["mother", "father", "daughter", "son", "grandchild"].map(person), relationships: [
  { id: "p1", fromPersonId: "mother", toPersonId: "daughter", type: "parent" },
  { id: "p2", fromPersonId: "father", toPersonId: "daughter", type: "parent" },
  { id: "p3", fromPersonId: "mother", toPersonId: "son", type: "parent" },
  { id: "p4", fromPersonId: "father", toPersonId: "son", type: "parent" },
  { id: "p5", fromPersonId: "daughter", toPersonId: "grandchild", type: "parent" },
], stories: [] };

describe("tree generation layout", () => {
  it("places parents above children and grandchildren below", () => {
    const result = buildGenerations(tree);
    expect(result.depth.get("mother")).toBe(0);
    expect(result.depth.get("father")).toBe(0);
    expect(result.depth.get("daughter")).toBe(1);
    expect(result.depth.get("son")).toBe(1);
    expect(result.depth.get("grandchild")).toBe(2);
  });

  it("keeps siblings in the same generation group", () => {
    const result = buildGenerations(tree);
    expect(result.groups.get(1)?.map((person) => person.id)).toEqual(["daughter", "son"]);
  });

  it("places a married-in spouse beside their partner instead of the top row", () => {
    const withSpouse: FamilyTree = {
      people: [...tree.people, person("daughter-in-law"), person("grandchild2")],
      relationships: [
        ...tree.relationships,
        { id: "s1", fromPersonId: "daughter-in-law", toPersonId: "son", type: "spouse" },
        { id: "p6", fromPersonId: "son", toPersonId: "grandchild2", type: "parent" },
        { id: "p7", fromPersonId: "daughter-in-law", toPersonId: "grandchild2", type: "parent" },
      ],
      stories: [],
    };
    const result = buildGenerations(withSpouse);
    expect(result.depth.get("daughter-in-law")).toBe(1);
    expect(result.depth.get("grandchild2")).toBe(2);
    expect(result.depth.get("mother")).toBe(0);
  });
});
