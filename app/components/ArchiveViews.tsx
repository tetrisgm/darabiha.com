"use client";

import { buildTimeline, mapFamilyPlaces } from "../../lib/archive-views";
import type { FamilyTree, Person } from "../../lib/types";

function prettyDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function TimelineView({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const events = buildTimeline(tree);
  return <section className="archive-view archive-timeline" aria-label="Family timeline">
    <div className="archive-view-heading"><p className="eyebrow">Timeline</p><h2>Lives and stories through time</h2><p>Births, deaths, and dated family stories appear here automatically.</p></div>
    {events.length ? <ol className="timeline-list">{events.map((event) => {
      const person = event.personIds.length === 1 ? tree.people.find((candidate) => candidate.id === event.personIds[0]) : undefined;
      return <li key={event.id}><time>{event.year}</time><span className={`timeline-dot is-${event.kind}`} /><button type="button" disabled={!person} onClick={() => person && onSelect(person)}><span>{event.title}</span><strong>{prettyDate(event.date)}{event.detail ? ` · ${event.detail}` : ""}</strong></button></li>;
    })}</ol> : <p className="archive-empty">Dates added to people and stories will build this timeline.</p>}
  </section>;
}

export function WorldMapView({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const { mapped, unmapped } = mapFamilyPlaces(tree);
  return <section className="archive-view family-map-view" aria-label="Family places">
    <div className="archive-view-heading"><p className="eyebrow">Places</p><h2>Where the family has lived</h2><p>Locations come directly from the city and country fields in each record.</p></div>
    <div className="world-map" role="img" aria-label="World map with recorded family locations">
      <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d="M62 120 118 72l100 6 53 43-20 63-50 26-22 83-56-19-23-76-51-29Z" />
        <path d="m248 310 65 23 45 61-24 85-45-18-31-69Z" />
        <path d="m410 110 75-42 155 25 68 53-26 47-89 5-45 49-53-26-69 12-38-57Z" />
        <path d="m485 244 74 9 50 64-35 143-53-26-28-98-42-39Z" />
        <path d="m698 182 94-44 123 36 24 86-70 51-95-18-35-54Z" />
        <path d="m802 353 91-12 56 58-27 57-99-10-42-51Z" />
      </svg>
      {mapped.map((location) => <button type="button" className="map-marker" style={{ left: `${location.x}%`, top: `${location.y}%` }} key={location.key} onClick={() => onSelect(location.people[0])} aria-label={`${location.label}: ${location.people.map((person) => person.displayName).join(", ")}`}><span>{location.people.length}</span><strong>{location.label}</strong></button>)}
      {!mapped.length && <p className="map-empty">Add a birth or death city and country to place someone on the map.</p>}
    </div>
    {unmapped.length > 0 && <p className="unmapped-places">Recorded locations awaiting map coordinates: {unmapped.join(" · ")}</p>}
  </section>;
}
