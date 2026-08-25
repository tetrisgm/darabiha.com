"use client";

import { useEffect, useRef, useState } from "react";
import type { FamilyTree, Person } from "../../lib/types";
import { buildGenerations } from "../../lib/tree-layout";

function cardDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function genderGlyph(person: Person) {
  return person.gender === "female" ? "♀" : person.gender === "male" ? "♂" : "•";
}

export function clampScale(scale: number) { return Math.max(0.5, Math.min(3, scale)); }
export function zoomView(view: { x: number; y: number; scale: number }, factor: number, cursor: { x: number; y: number }) {
  const scale = clampScale(view.scale * factor);
  return { scale, x: cursor.x - (cursor.x - view.x) * (scale / view.scale), y: cursor.y - (cursor.y - view.y) * (scale / view.scale) };
}

type CanvasCursorMode = "grab" | "grabbing" | "pointer";

function CanvasCursor({ mode, cursorRef }: { mode: CanvasCursorMode; cursorRef: React.RefObject<HTMLSpanElement | null> }) {
  return <span ref={cursorRef} className="tree-custom-cursor" data-mode={mode} data-visible="false" aria-hidden="true">
    <svg viewBox="0 0 32 32" focusable="false">
      {mode === "pointer" ? <path d="M9.5 3.5a2 2 0 0 1 4 0v9.1l1.1-1.4a2.1 2.1 0 0 1 3.4 2.4l.6-.8a2.1 2.1 0 0 1 3.5 2.2l.4-.4a2 2 0 0 1 3.4 1.9l-1.4 7.2a6.5 6.5 0 0 1-6.4 5.3h-2.7a7 7 0 0 1-5.7-3L5.8 20a2.2 2.2 0 0 1 3.4-2.7l.3.3V3.5Z" /> : mode === "grabbing" ? <path d="M8.3 12.4a2.2 2.2 0 0 1 3.4-1.8 2.3 2.3 0 0 1 4.1-.9 2.3 2.3 0 0 1 4.2.7 2.2 2.2 0 0 1 3.8 1.5l1 6.1a8.5 8.5 0 0 1-8.4 9.9h-.8a8.5 8.5 0 0 1-8.3-6.8l-.9-4.4a2.2 2.2 0 0 1 1.9-4.3Z" /> : <path d="M7.8 13.8V8.1a2 2 0 0 1 4 0v4.1-6.4a2 2 0 0 1 4 0v6-7.1a2 2 0 0 1 4 0v7.6-5.1a2 2 0 0 1 4 0v10.4a10 10 0 0 1-10 10h-.4a8.4 8.4 0 0 1-7.7-5L3.9 18a2.2 2.2 0 0 1 3.9-2v-2.2Z" />}
    </svg>
  </span>;
}

export function FamilyTreeCanvas({ tree, onSelect, highlightedIds = [], focusPersonId }: { tree: FamilyTree; onSelect: (person: Person) => void; highlightedIds?: string[]; focusPersonId?: string }) {
  const { depth, groups } = buildGenerations(tree);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [cursorMode, setCursorMode] = useState<CanvasCursorMode>("grab");
  const gesture = useRef<{ x: number; y: number; view: typeof view; moved: boolean } | null>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const zoomBy = (factor: number) => setView((current) => zoomView(current, factor, { x: 0, y: 0 }));
  const point = (person: Person) => {
    const group = groups.get(depth.get(person.id) ?? 0) ?? [];
    const index = group.findIndex((item) => item.id === person.id);
    return { x: 50 + (index - (group.length - 1) / 2) * 30, y: 28 + (depth.get(person.id) ?? 0) * 28 };
  };
  const centerOn = (person: Person, animate = true) => {
    const rect = cursorRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const p = point(person);
    const target = { x: -((p.x - 50) / 100) * rect.width * view.scale, y: -((p.y - 50) / 100) * rect.height * view.scale };
    if (!animate) { setView((current) => ({ ...current, ...target })); return; }
    const start = view; const started = performance.now();
    const tick = (now: number) => { const progress = Math.min(1, (now - started) / 360); const eased = 1 - (1 - progress) ** 3; setView((current) => ({ ...current, x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased })); if (progress < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  useEffect(() => { const person = focusPersonId ? tree.people.find((candidate) => candidate.id === focusPersonId) : undefined; if (person) centerOn(person); }, [focusPersonId]);
  const positionCursor = (event: React.PointerEvent<HTMLDivElement>) => {
    const cursor = cursorRef.current;
    if (!cursor || event.pointerType === "touch") return;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    const target = event.target as Element;
    if (target.closest?.(".canvas-controls")) {
      cursor.dataset.visible = "false";
      return;
    }
    cursor.dataset.visible = "true";
    setCursorMode(gesture.current ? "grabbing" : target.closest?.(".tree-card") ? "pointer" : "grab");
  };
  const hideCursor = () => {
    if (cursorRef.current && !gesture.current) cursorRef.current.dataset.visible = "false";
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, view, moved: false };
    setIsPanning(true);
    setCursorMode("grabbing");
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    positionCursor(event);
    if (!gesture.current) return;
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.current.moved = true;
    setView((current) => ({ ...current, x: gesture.current!.view.x + dx, y: gesture.current!.view.y + dy }));
  };
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    gesture.current = null;
    setIsPanning(false);
    setCursorMode((event.target as Element).closest?.(".tree-card") ? "pointer" : "grab");
  };
  const zoom = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? .92 : 1.08;
    const rect = event.currentTarget.getBoundingClientRect();
    setView((current) => {
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      return zoomView(current, factor, { x: cx, y: cy });
    });
  };
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setView({ ...view, x: view.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0), y: view.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0) });
    } else if (event.key === "+" || event.key === "=") setView({ ...view, scale: Math.min(3, view.scale * 1.1) });
    else if (event.key === "-" || event.key === "_") setView({ ...view, scale: Math.max(.5, view.scale * .9) });
    else if (event.key === "0") setView({ x: 0, y: 0, scale: 1 });
  };
  const parentSets = [...new Map([...new Set(tree.relationships.filter((link) => link.type === "parent").map((link) => link.toPersonId))].map((childId) => { const parentIds = tree.relationships.filter((link) => link.type === "parent" && link.toPersonId === childId).map((link) => link.fromPersonId).sort(); return [`${parentIds.join("|")}`, { children: [childId], parentIds }]; })).values()].map((set) => ({ ...set, children: [...new Set(tree.relationships.filter((link) => link.type === "parent" && set.parentIds.includes(link.fromPersonId)).map((link) => link.toPersonId).filter((childId) => tree.relationships.filter((candidate) => candidate.type === "parent" && candidate.toPersonId === childId).map((candidate) => candidate.fromPersonId).sort().join("|") === set.parentIds.join("|")))] }));
  return <div className="family-canvas" role="application" aria-label="Interactive family tree. Use arrow keys to pan, plus or minus to zoom, and 0 to reset." tabIndex={0} data-custom-cursor="true" data-interactive="true" data-panning={isPanning ? "true" : "false"} style={{ cursor: isPanning ? "grabbing" : "grab" }} onKeyDown={keyDown} onPointerEnter={positionCursor} onPointerLeave={hideCursor} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onWheel={zoom}>
    <div className="canvas-hit-surface" aria-hidden="true" style={{ cursor: isPanning ? "grabbing" : "grab" }} />
    <div className="canvas-controls" role="group" aria-label="Canvas zoom controls">
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(0.9)} aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" className="canvas-zoom-level" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView({ x: 0, y: 0, scale: 1 })} aria-label={`Reset zoom to 100 percent`} title="Reset zoom">{Math.round(view.scale * 100)}%</button>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(1.1)} aria-label="Zoom in" title="Zoom in">＋</button>
    </div>
    <div className="tree-viewport" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <svg className="tree-connectors" viewBox="0 0 100 100" preserveAspectRatio="none">
        {tree.relationships.filter((link) => link.type === "spouse").map((link) => { const from = tree.people.find((person) => person.id === link.fromPersonId); const to = tree.people.find((person) => person.id === link.toPersonId); if (!from || !to) return null; const a = point(from); const b = point(to); return <line className="spouse-connector" key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
        {parentSets.map(({ children, parentIds }) => { const parents = parentIds.map((id) => tree.people.find((person) => person.id === id)).filter(Boolean) as Person[]; const childPeople = children.map((id) => tree.people.find((person) => person.id === id)).filter(Boolean) as Person[]; if (!parents.length || !childPeople.length) return null; const parentPoints = parents.map(point); const childPoints = childPeople.map(point); const left = Math.min(...childPoints.map((item) => item.x)); const right = Math.max(...childPoints.map((item) => item.x)); const parentLeft = Math.min(...parentPoints.map((item) => item.x)); const parentRight = Math.max(...parentPoints.map((item) => item.x)); const junctionY = Math.min(...childPoints.map((item) => item.y)) - 14; const parentY = parentPoints[0].y; return <g className="parent-connector" key={parentIds.join("|")}><line x1={parentLeft} y1={parentY} x2={parentRight} y2={parentY} /><line x1={(parentLeft + parentRight) / 2} y1={parentY} x2={(parentLeft + parentRight) / 2} y2={junctionY} /><line x1={left} y1={junctionY} x2={right} y2={junctionY} />{childPoints.map((childPoint) => <line key={`${childPoint.x}-${childPoint.y}`} x1={childPoint.x} y1={junctionY} x2={childPoint.x} y2={childPoint.y} />)}</g>; })}
      </svg>
      {tree.people.map((person) => { const p = point(person); const location = [person.birthCity, person.birthCountry].filter(Boolean).join(", "); const glyph = genderGlyph(person); return <button className={`tree-card ${highlightedIds.includes(person.id) ? "is-highlighted" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%`, cursor: "pointer" }} key={person.id} onClick={() => { centerOn(person); onSelect(person); }} aria-label={`Open ${person.displayName}`}><span className="tree-card-gender" aria-label={glyph === "♀" ? "Female" : glyph === "♂" ? "Male" : "Gender not recorded"}>{glyph}</span><span className="tree-card-portrait">{person.photoAttachmentId ? <img src={`/api/photos/${person.photoAttachmentId}`} alt="" /> : person.displayName.slice(0, 1).toUpperCase()}</span><span className="tree-card-copy"><strong>{person.displayName}</strong><span>{person.birthDate ? `Born ${cardDate(person.birthDate)}` : "Birth date unknown"}{location ? ` · ${location}` : ""}</span></span></button>; })}
    </div>
    <CanvasCursor mode={cursorMode} cursorRef={cursorRef} />
  </div>;
}
