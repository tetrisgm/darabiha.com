import { readTree } from "../../../db/store";
import { requireVisitor } from "../../authz";
import { familyFactoids, greetingFact } from "../../../lib/family-facts";
import { archiveCacheHeaders, preventSharedCaching } from "../../../lib/archive-cache";

export const runtime = "edge";

/** What the archive says before it is asked: an anniversary falling today, or
 * a fact about the family, and then a few more facts drawn from the numbers -
 * a reader taps one to have the archivist expand on it. These used to be
 * hand-written openers ("Which records are missing birth dates?"), which read
 * as chores rather than as anything the family would want to know. */
export async function GET() {
  const auth = await requireVisitor();
  if (!auth.ok) return preventSharedCaching(auth.response);
  const tree = await readTree();
  const fact = greetingFact(tree);

  // steady through the day, different tomorrow, and never the one already
  // shown above
  const day = Math.floor(Date.now() / 86_400_000);
  const pool = familyFactoids(tree).filter((candidate) => candidate.ask && candidate.text !== fact?.text);
  const rotated = pool.map((_, index) => pool[(index + day) % pool.length]);
  const factoids = rotated.slice(0, 3).map((candidate) => ({ text: candidate.text, ask: candidate.ask!, personId: candidate.personId ?? null }));

  return Response.json(
    { fact: fact?.text ?? null, personId: fact?.personId ?? null, factoids },
    { headers: archiveCacheHeaders(auth.visibility, "public, max-age=300") },
  );
}
