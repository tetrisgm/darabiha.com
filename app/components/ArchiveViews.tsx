"use client";

import { useRef, useState } from "react";
import { buildTimeline, mapFamilyPlaces, type MappedPlace } from "../../lib/archive-views";
import { WORLD_COUNTRY_PATHS } from "../../lib/world-map-paths";
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

export function WorldMapView({ tree, onSelectPlace }: { tree: FamilyTree; onSelectPlace: (place: MappedPlace) => void }) {
  const { mapped, unmapped } = mapFamilyPlaces(tree);
  // The map pans and zooms with the same grammar as the Tree and Family
  // canvases: drag or wheel to pan, ctrl/cmd+wheel or the buttons to zoom.
  // Zoom bottoms out at 1 - the frame already shows the whole world.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const dragRef = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPanning(true);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };
  const endPan = () => { dragRef.current = null; setPanning(false); };
  const wheelPan = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) setScale((current) => Math.max(1, Math.min(8, current * (event.deltaY > 0 ? 0.94 : 1.06))));
    else setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
  };
  // Full-bleed like the other canvases: the stage is the whole tab, and the
  // 2:1 board (which the marker percentages are calibrated to) covers it.
  return <section className="archive-view family-map-view" aria-label="Family places">
    <div className="world-map" role="img" aria-label="World map with recorded family locations" data-panning={panning ? "true" : "false"}
      onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={wheelPan}>
      <div className="canvas-controls map-zoom" role="group" aria-label="Map zoom controls">
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setScale((current) => Math.max(1, current * 0.9))} aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className="canvas-zoom-level" aria-label="Reset zoom" title="Reset zoom">{Math.round(scale * 100)}%</button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setScale((current) => Math.min(8, current * 1.1))} aria-label="Zoom in" title="Zoom in">＋</button>
      </div>
      <div className="world-map-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, "--map-scale": String(scale) } as React.CSSProperties}>
      <div className="world-map-board">
      <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {WORLD_COUNTRY_PATHS.map((d, index) => <path d={d} key={index} />)}
      </svg>
      {mapped.map((location) => <button type="button" className="map-marker" style={{ left: `${location.x}%`, top: `${location.y}%`, zIndex: 4 + location.people.length }} key={location.key} onClick={() => onSelectPlace(location)} aria-label={`${location.label}: ${location.people.map((person) => person.displayName).join(", ")}`}><span>{location.people.length}</span><strong>{location.label}</strong></button>)}
      {!mapped.length && <p className="map-empty">Add a birth or death city and country to place someone on the map.</p>}
      </div>
      </div>
    </div>
    {unmapped.length > 0 && <p className="unmapped-places">Recorded locations awaiting map coordinates: {unmapped.join(" · ")}</p>}
  </section>;
}
