import type { AddPersonProposal, AgentConflict, ChangeProposal, FamilyTree, Person } from "./types";

const normalizedName = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const identityFields = ["birthDate", "deathDate", "birthCity", "birthCountry"] as const;

function contradictory(existing: Omit<Person, "id">, incoming: AddPersonProposal["person"]) {
  return identityFields.filter((key) => existing[key] && incoming[key] && normalizedName(String(existing[key])) !== normalizedName(String(incoming[key])));
}

function mergePerson(existing: Omit<Person, "id">, incoming: AddPersonProposal["person"]): Omit<Person, "id"> {
  return {
    displayName: incoming.displayName || existing.displayName,
    gender: incoming.gender ?? existing.gender,
    givenName: incoming.givenName ?? existing.givenName,
    familyName: incoming.familyName ?? existing.familyName,
    birthDate: incoming.birthDate ?? existing.birthDate,
    deathDate: incoming.deathDate ?? existing.deathDate,
    birthPlace: incoming.birthPlace ?? existing.birthPlace,
    deathPlace: incoming.deathPlace ?? existing.deathPlace,
    birthCity: incoming.birthCity ?? existing.birthCity,
    birthCountry: incoming.birthCountry ?? existing.birthCountry,
    deathCity: incoming.deathCity ?? existing.deathCity,
    deathCountry: incoming.deathCountry ?? existing.deathCountry,
    biography: incoming.biography ?? existing.biography,
    photoAttachmentId: incoming.photoAttachmentId ?? existing.photoAttachmentId,
  };
}

export function reconcileProposals(tree: FamilyTree, proposals: ChangeProposal[]) {
  const accepted: ChangeProposal[] = [];
  const conflicts: AgentConflict[] = [];
  const pendingAdds = new Map<string, { index: number; proposal: AddPersonProposal }>();
  for (const proposal of proposals) {
    if (proposal.kind !== "add_person") { accepted.push(proposal); continue; }
    const name = normalizedName(proposal.person.displayName);
    const matches = tree.people.filter((person) => normalizedName(person.displayName) === name);
    if (!matches.length) {
      const pending = pendingAdds.get(name);
      if (!pending) {
        pendingAdds.set(name, { index: accepted.length, proposal });
        accepted.push(proposal);
        continue;
      }
      const differences = contradictory(pending.proposal.person, proposal.person);
      if (!differences.length) {
        const merged = { ...pending.proposal, person: mergePerson(pending.proposal.person, proposal.person), summary: `${pending.proposal.summary}; ${proposal.summary}` };
        accepted[pending.index] = merged;
        pendingAdds.set(name, { index: pending.index, proposal: merged });
      } else {
        conflicts.push({
          question: `The import contains two different people named ${proposal.person.displayName}. Should both records be kept?`,
          reason: `Their ${differences.join(" and ")} values conflict.`,
          candidatePersonIds: [],
          evidence: [pending.proposal.person, proposal.person].map((person) => `${person.displayName} — born ${person.birthDate || "unknown"}${person.birthCity ? ` in ${person.birthCity}` : ""}`),
        });
      }
      continue;
    }
    const compatible = matches.filter((person) => contradictory(person, proposal.person).length === 0);
    if (compatible.length === 1) {
      const person = compatible[0];
      accepted.push({ kind: "update_person", summary: `Merged imported information into ${person.displayName}`, personId: person.id, patch: mergePerson(person, proposal.person) });
      continue;
    }
    const candidates = compatible.length ? compatible : matches;
    conflicts.push({
      question: `I found more than one plausible record for ${proposal.person.displayName}. Which person should receive this information, or is this a new person?`,
      reason: compatible.length ? "Multiple existing people have the same name and the uploaded facts do not distinguish them." : `The incoming identity fields conflict with the existing record${matches.length > 1 ? "s" : ""}.`,
      candidatePersonIds: candidates.map((person) => person.id),
      evidence: candidates.map((person) => `${person.displayName} — born ${person.birthDate || "unknown"}${person.birthCity ? ` in ${person.birthCity}` : ""}`),
    });
  }
  return { proposals: accepted, conflicts };
}
