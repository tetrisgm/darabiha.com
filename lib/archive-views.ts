import type { FamilyTree, Person } from "./types";

export type TimelineEvent = {
  id: string;
  year: number;
  date: string;
  kind: "birth" | "death" | "story";
  title: string;
  detail: string;
  personIds: string[];
};

export type MappedPlace = {
  key: string;
  label: string;
  x: number;
  y: number;
  people: Person[];
};

const cityCoordinates: Record<string, [number, number]> = {
  paris: [49.4, 31.8], tehran: [63.3, 35.9], shiraz: [61.2, 40.6], tabriz: [61.4, 32.9],
  london: [47.7, 28.5], geneva: [49.6, 32.5], montreal: [28.8, 30.2], toronto: [27.2, 32.1],
  "new york": [30.5, 33.8], "san francisco": [15.9, 35.1], "los angeles": [15.9, 40.1],
  washington: [29.2, 35.8], miami: [28.5, 43.9], vancouver: [15.9, 27.6], dubai: [61.8, 43.1],
  istanbul: [55.1, 34.2], beirut: [57.8, 37.1], rome: [50.4, 36.3], berlin: [51.5, 28.7],
};

const countryCoordinates: Record<string, [number, number]> = {
  iran: [63.2, 38.2], france: [48.5, 33.4], "united states": [22.8, 36.2], usa: [22.8, 36.2],
  canada: [22.5, 25.7], "united kingdom": [47.3, 28.5], uk: [47.3, 28.5], germany: [51.2, 30.5],
  italy: [51.2, 36.9], switzerland: [49.6, 32.5], turkey: [56.2, 35.9], lebanon: [58.2, 37.8],
  australia: [85.2, 73.1], india: [71.2, 49.5], japan: [87.1, 38.8], china: [78.2, 38.5],
};

const normalized = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").trim();
const yearOf = (date: string | null) => date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
const place = (city: string | null, country: string | null, fallback: string | null) => [city, country].filter(Boolean).join(", ") || fallback || "";

export function buildTimeline(tree: FamilyTree): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const person of tree.people) {
    const birthYear = yearOf(person.birthDate);
    const deathYear = yearOf(person.deathDate);
    if (birthYear && person.birthDate) events.push({ id: `birth-${person.id}`, year: birthYear, date: person.birthDate, kind: "birth", title: `${person.displayName} was born`, detail: place(person.birthCity, person.birthCountry, person.birthPlace), personIds: [person.id] });
    if (deathYear && person.deathDate) events.push({ id: `death-${person.id}`, year: deathYear, date: person.deathDate, kind: "death", title: `${person.displayName} died`, detail: place(person.deathCity, person.deathCountry, person.deathPlace), personIds: [person.id] });
  }
  for (const story of tree.stories) {
    const year = yearOf(story.date);
    if (year && story.date) events.push({ id: `story-${story.id}`, year, date: story.date, kind: "story", title: story.title, detail: story.place || story.body, personIds: story.personIds });
  }
  return events.sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
}

export function mapFamilyPlaces(tree: FamilyTree): { mapped: MappedPlace[]; unmapped: string[] } {
  const groups = new Map<string, MappedPlace>();
  const unmapped = new Set<string>();
  for (const person of tree.people) {
    const locations = [
      { city: person.birthCity, country: person.birthCountry, fallback: person.birthPlace },
      { city: person.deathCity, country: person.deathCountry, fallback: person.deathPlace },
    ];
    for (const location of locations) {
      const label = place(location.city, location.country, location.fallback);
      if (!label) continue;
      const coordinates = location.city ? cityCoordinates[normalized(location.city)] : undefined;
      const fallbackCoordinates = location.country ? countryCoordinates[normalized(location.country)] : undefined;
      const point = coordinates || fallbackCoordinates;
      if (!point) { unmapped.add(label); continue; }
      const key = normalized(label);
      const group = groups.get(key) || { key, label, x: point[0], y: point[1], people: [] };
      if (!group.people.some((candidate) => candidate.id === person.id)) group.people.push(person);
      groups.set(key, group);
    }
  }
  return { mapped: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)), unmapped: [...unmapped].sort() };
}
