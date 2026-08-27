import type { FamilyTree, Person } from "./types";

/** Something the archive can say without being asked: an anniversary falling
 * today, or a fact drawn from the shape of the tree. Used to greet a reader
 * before their first question, and by the archivist when asked for one. */
export type FamilyFact = { kind: "onThisDay" | "factoid"; text: string; personId?: string };

const year = (value: string | null | undefined) => {
  const parsed = Number(String(value ?? "").slice(0, 4));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const monthDay = (value: string | null | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value).slice(5) : null;
const ordinal = (count: number) => {
  const rest = count % 100;
  if (rest >= 11 && rest <= 13) return `${count}th`;
  return `${count}${["th", "st", "nd", "rd"][count % 10] ?? "th"}`;
};
const presumedLiving = (person: Person, today: Date) => {
  const born = year(person.birthDate);
  return !person.deathDate && (!born || today.getFullYear() - born <= 110);
};

/** Anniversaries falling on the given day: births and deaths of the recorded
 * family, and dated stories. Living people get a birthday; the dead get a
 * remembrance. */
export function onThisDay(tree: FamilyTree, today = new Date()): FamilyFact[] {
  const stamp = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const facts: FamilyFact[] = [];
  for (const person of tree.people) {
    if (monthDay(person.birthDate) === stamp) {
      const born = year(person.birthDate);
      const age = born ? today.getFullYear() - born : null;
      facts.push({
        kind: "onThisDay", personId: person.id,
        text: presumedLiving(person, today) && age
          ? `Today is ${person.displayName}'s birthday — they turn ${age}.`
          : age
            ? `${person.displayName} was born on this day in ${born}, ${age} years ago today.`
            : `${person.displayName} was born on this day.`,
      });
    }
    if (monthDay(person.deathDate) === stamp) {
      const died = year(person.deathDate);
      facts.push({
        kind: "onThisDay", personId: person.id,
        text: died ? `${person.displayName} died on this day in ${died}.` : `${person.displayName} died on this day.`,
      });
    }
  }
  for (const story of tree.stories) {
    if (monthDay(story.date) !== stamp) continue;
    facts.push({ kind: "onThisDay", text: `On this day in ${year(story.date)}: “${story.title}”.` });
  }
  return facts;
}

/** Facts about the shape of the family - true of the records as they stand,
 * recomputed every time so they never go stale. */
export function familyFactoids(tree: FamilyTree, today = new Date()): FamilyFact[] {
  const facts: FamilyFact[] = [];
  const withYears = tree.people.filter((person) => year(person.birthDate) && year(person.deathDate));
  const childrenOf = new Map<string, number>();
  for (const link of tree.relationships) {
    if (link.type !== "parent") continue;
    childrenOf.set(link.fromPersonId, (childrenOf.get(link.fromPersonId) ?? 0) + 1);
  }

  const longest = withYears.map((person) => ({ person, age: year(person.deathDate)! - year(person.birthDate)! }))
    .sort((a, b) => b.age - a.age)[0];
  if (longest) facts.push({ kind: "factoid", personId: longest.person.id, text: `${longest.person.displayName} lived the longest life the archive records — ${longest.age} years, from ${year(longest.person.birthDate)} to ${year(longest.person.deathDate)}.` });

  const mostChildren = [...childrenOf.entries()].sort((a, b) => b[1] - a[1])[0];
  const parent = mostChildren && tree.people.find((person) => person.id === mostChildren[0]);
  if (parent && mostChildren[1] > 1) facts.push({ kind: "factoid", personId: parent.id, text: `${parent.displayName} has the most recorded children in the family: ${mostChildren[1]}.` });

  const oldest = tree.people.filter((person) => year(person.birthDate)).sort((a, b) => year(a.birthDate)! - year(b.birthDate)!)[0];
  if (oldest) facts.push({ kind: "factoid", personId: oldest.id, text: `The earliest recorded birth in the family is ${oldest.displayName}, in ${year(oldest.birthDate)} — ${today.getFullYear() - year(oldest.birthDate)!} years ago.` });

  const places = new Map<string, number>();
  for (const person of tree.people) {
    for (const city of [person.birthCity, person.deathCity]) {
      if (city) places.set(city, (places.get(city) ?? 0) + 1);
    }
  }
  const topPlace = [...places.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPlace) facts.push({ kind: "factoid", text: `${topPlace[0]} appears in more records than anywhere else — ${topPlace[1]} births and deaths.` });

  if (tree.stories.length) facts.push({ kind: "factoid", text: `The archive holds ${tree.stories.length} family ${tree.stories.length === 1 ? "story" : "stories"}, kept in the Persian they were written in with an English translation beside them.` });

  const generations = new Set(tree.people.map((person) => year(person.birthDate)).filter(Boolean).map((born) => Math.floor((born! - 1700) / 25)));
  if (generations.size > 3) facts.push({ kind: "factoid", text: `${tree.people.length} people are recorded here, spanning roughly ${generations.size} generations.` });

  return facts;
}

/** One line to greet a reader with: an anniversary if the day has one,
 * otherwise a factoid chosen by the date so it is steady through the day and
 * different tomorrow. */
export function greetingFact(tree: FamilyTree, today = new Date()): FamilyFact | null {
  const anniversaries = onThisDay(tree, today);
  if (anniversaries.length) {
    const index = (today.getFullYear() + today.getMonth() + today.getDate()) % anniversaries.length;
    return anniversaries[index];
  }
  const factoids = familyFactoids(tree, today);
  if (!factoids.length) return null;
  const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
  return factoids[dayNumber % factoids.length];
}
