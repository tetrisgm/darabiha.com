import { readTree } from "../../../db/store";
import { requireVisitor } from "../../authz";
import { greetingFact } from "../../../lib/family-facts";
import { describeRelationship } from "../../../lib/relationship-path";

export const runtime = "edge";

/** What the archive says before it is asked: an anniversary falling today, or
 * a fact about the family, plus openers worth tapping. */
export async function GET() {
  const auth = await requireVisitor();
  if (!auth.ok) return auth.response;
  const tree = await readTree();
  const fact = greetingFact(tree);
  const person = fact?.personId ? tree.people.find((candidate) => candidate.id === fact.personId) : undefined;

  // suggestions that only make sense when the records can answer them
  const suggestions: string[] = [];
  if (person) suggestions.push(`Tell me about ${person.displayName}`);
  const withStories = tree.stories.filter((story) => story.personIds.length);
  if (withStories.length) suggestions.push(`Tell me the story of ${withStories[Math.floor(Date.now() / 86_400_000) % withStories.length].title}`);
  // a relationship worth asking about: two people who are actually connected
  const anchors = tree.people.filter((candidate) => candidate.photoAttachmentId).slice(0, 6);
  if (anchors.length >= 2) {
    const pair = anchors.find((candidate, index) => index > 0 && describeRelationship(tree, anchors[0].id, candidate.id)?.sharedAncestors.length);
    if (pair) suggestions.push(`How is ${anchors[0].displayName} related to ${pair.displayName}?`);
  }
  suggestions.push("Which records are missing birth dates?");

  return Response.json({ fact: fact?.text ?? null, personId: fact?.personId ?? null, suggestions: suggestions.slice(0, 4) },
    { headers: { "cache-control": "private, max-age=300" } });
}
