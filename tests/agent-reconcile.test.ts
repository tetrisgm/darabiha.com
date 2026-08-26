import { describe, expect, it } from "vitest";
import { reconcileProposals } from "../lib/agent-reconcile";
import type { AddPersonProposal, FamilyTree, Person } from "../lib/types";

const person = (overrides: Partial<Person>): Person => ({ id: "p1", displayName: "Nasser Darabiha", givenName: null, familyName: null, maidenName: null, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, birthCity: null, birthCountry: null, deathCity: null, deathCountry: null, biography: null, photoAttachmentId: null, ...overrides });
const incoming = (overrides: Partial<Omit<Person, "id">> = {}): AddPersonProposal => {
  const basePerson = person({});
  const base: Omit<Person, "id"> = { displayName: basePerson.displayName, givenName: basePerson.givenName, familyName: basePerson.familyName, maidenName: basePerson.maidenName, birthDate: basePerson.birthDate, deathDate: basePerson.deathDate, birthPlace: basePerson.birthPlace, deathPlace: basePerson.deathPlace, birthCity: basePerson.birthCity, birthCountry: basePerson.birthCountry, deathCity: basePerson.deathCity, deathCountry: basePerson.deathCountry, biography: basePerson.biography, photoAttachmentId: basePerson.photoAttachmentId };
  return { kind: "add_person", summary: "Imported Nasser", person: { ...base, birthDate: "1940", ...overrides } };
};

describe("agent reconciliation", () => {
  it("merges an unambiguous overlap instead of creating a duplicate", () => {
    const tree: FamilyTree = { people: [person({ birthCity: "Tehran" })], relationships: [], stories: [] };
    const result = reconcileProposals(tree, [incoming()]);
    expect(result.conflicts).toEqual([]);
    expect(result.proposals[0]).toMatchObject({ kind: "update_person", personId: "p1", patch: { birthDate: "1940", birthCity: "Tehran" } });
  });

  it("asks only when identity evidence conflicts", () => {
    const tree: FamilyTree = { people: [person({ birthDate: "1938" })], relationships: [], stories: [] };
    const result = reconcileProposals(tree, [incoming({ birthDate: "1940" })]);
    expect(result.proposals).toEqual([]);
    expect(result.conflicts[0].candidatePersonIds).toEqual(["p1"]);
  });

  it("collapses duplicate people within one import batch", () => {
    const tree: FamilyTree = { people: [], relationships: [], stories: [] };
    const result = reconcileProposals(tree, [incoming({ birthCity: "Tehran" }), incoming({ biography: "Family notes" })]);
    expect(result.conflicts).toEqual([]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ kind: "add_person", person: { birthDate: "1940", birthCity: "Tehran", biography: "Family notes" } });
  });
});
