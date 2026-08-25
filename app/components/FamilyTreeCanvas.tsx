"use client";

import { useRef, useState } from "react";
import type { FamilyTree, Person } from "../../lib/types";
import { buildGenerations } from "../../lib/tree-layout";

function cardDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function FamilyTreeCanvas({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const { depth, groups } = buildGenerations(tree);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const gesture = useRef<{ x: number; y: number; view: typeof view; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const point = (person: Person) => {
    const group = groups.get(depth.get(person.id) ?? 0) ?? [];
    const index = group.findIndex((item) => item.id === person.id);
    return { x: 50 + (index - (group.length - 1) / 2) * 18, y: 28 + (depth.get(person.id) ?? 0) * 28 };
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, view, moved: false };
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture.current) return;
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.current.moved = true;
    setView((current) => ({ ...current, x: gesture.current!.view.x + dx, y: gesture.current!.view.y + dy }));
  };
  const end = () => { suppressClick.current = Boolean(gesture.current?.moved); gesture.current = null; };
  const zoom = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? .92 : 1.08;
    const rect = event.currentTarget.getBoundingClientRect();
    setView((current) => {
      const nextScale = Math.max(.5, Math.min(3, current.scale * factor));
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      return { scale: nextScale, x: cx - (cx - current.x) * (nextScale / current.scale), y: cy - (cy - current.y) * (nextScale / current.scale) };
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
  const parentGroups = [...new Set(tree.relationships.filter((link) => link.type === "parent").map((link) => link.toPersonId))].map((childId) => ({ child: tree.people.find((person) => person.id === childId), parents: tree.relationships.filter((link) => link.type === "parent" && link.toPersonId === childId).map((link) => tree.people.find((person) => person.id === link.fromPersonId)).filter(Boolean) as Person[] })).filter((group) => group.child && group.parents.length);
  return <div className="family-canvas" role="application" aria-label="Interactive family tree. Use arrow keys to pan, plus or minus to zoom, and 0 to reset." tabIndex={0} onKeyDown={keyDown} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onWheel={zoom}>
    <div className="tree-viewport" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <svg className="tree-connectors" viewBox="0 0 100 100" preserveAspectRatio="none">
        {tree.relationships.filter((link) => link.type === "spouse").map((link) => { const from = tree.people.find((person) => person.id === link.fromPersonId); const to = tree.people.find((person) => person.id === link.toPersonId); if (!from || !to) return null; const a = point(from); const b = point(to); return <line className="spouse-connector" key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
        {parentGroups.map(({ child, parents }) => { if (!child) return null; const childPoint = point(child); const parentPoints = parents.map(point); const left = Math.min(...parentPoints.map((item) => item.x)); const right = Math.max(...parentPoints.map((item) => item.x)); const junctionY = childPoint.y - 14; return <g className="parent-connector" key={child.id}><line x1={left} y1={parentPoints[0].y} x2={right} y2={parentPoints[0].y} /><line x1={(left + right) / 2} y1={parentPoints[0].y} x2={(left + right) / 2} y2={junctionY} /><line x1={left} y1={junctionY} x2={right} y2={junctionY} /><line x1={childPoint.x} y1={junctionY} x2={childPoint.x} y2={childPoint.y} /></g>; })}
      </svg>
      {tree.people.map((person) => { const p = point(person); const location = [person.birthCity, person.birthCountry].filter(Boolean).join(", "); return <button className="tree-card" style={{ left: `${p.x}%`, top: `${p.y}%` }} key={person.id} onClick={() => { if (!suppressClick.current) onSelect(person); suppressClick.current = false; }} aria-label={`Open ${person.displayName}`}><span className="tree-card-portrait">{person.photoAttachmentId ? <img src={`/api/photos/${person.photoAttachmentId}`} alt="" /> : person.displayName.slice(0, 1).toUpperCase()}</span><span className="tree-card-copy"><strong>{person.displayName}</strong><span>{person.birthDate ? `Born ${cardDate(person.birthDate)}` : "Birth date unknown"}{location ? ` · ${location}` : ""}</span></span></button>; })}
    </div>
  </div>;
}
