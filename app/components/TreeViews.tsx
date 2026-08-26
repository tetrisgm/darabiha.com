"use client";

import { useMemo, useRef, useState } from "react";
import type { FamilyTree, Person } from "../../lib/types";
import { buildRelationMaps } from "../../lib/tree-layout";

function years(person: Person | undefined) {
  if (!person) return "";
  const b = person.birthDate?.slice(0, 4);
  const d = person.deathDate?.slice(0, 4);
  if (b && d) return `${b}–${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "";
}

function initial(person: Person) {
  return person.displayName.slice(0, 1).toUpperCase();
}

function PersonCard({ person, size, onClick, label }: { person: Person; size: "sm" | "md" | "lg"; onClick: () => void; label?: string }) {
  return <button type="button" className={`focus-card focus-card-${size}`} onClick={onClick}>
    <span className="focus-card-portrait">{person.photoAttachmentId ? <img src={`/api/photos/${person.photoAttachmentId}`} alt="" /> : initial(person)}</span>
    <span className="focus-card-copy"><strong>{person.displayName}</strong><span>{years(person) || " "}</span>{label ? <em>{label}</em> : null}</span>
  </button>;
}

/** One screen around a focal person: grandparents, parents, the couple, and
 * children. Clicking any relative re-centers on them. */
export function FocusFamilyView({ tree, focusId, onFocus, onOpen }: { tree: FamilyTree; focusId: string; onFocus: (person: Person) => void; onOpen: (person: Person) => void }) {
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const focal = maps.byId.get(focusId) ?? tree.people[0];
  if (!focal) return null;
  const get = (id: string) => maps.byId.get(id);
  const parents = (maps.parentsOf.get(focal.id) ?? []).map(get).filter(Boolean) as Person[];
  const grandparents = parents.map((parent) => ((maps.parentsOf.get(parent.id) ?? []).map(get).filter(Boolean) as Person[]));
  const spouses = [...new Set(maps.spousesOf.get(focal.id) ?? [])].map(get).filter(Boolean) as Person[];
  const childIds = [...new Set(maps.childrenOf.get(focal.id) ?? [])];
  const children = childIds.map(get).filter(Boolean) as Person[];
  children.sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
  const siblings = [...new Set(parents.flatMap((parent) => maps.childrenOf.get(parent.id) ?? []))]
    .filter((id) => id !== focal.id)
    .map(get).filter(Boolean) as Person[];
  const otherParentOf = (child: Person) => (maps.parentsOf.get(child.id) ?? []).filter((id) => id !== focal.id).map(get).filter(Boolean)[0] as Person | undefined;
  const groups = new Map<string, { spouse: Person | undefined; kids: Person[] }>();
  for (const child of children) {
    const other = otherParentOf(child);
    const key = other?.id ?? "-";
    const group = groups.get(key) ?? { spouse: other, kids: [] };
    group.kids.push(child);
    groups.set(key, group);
  }
  return <section className="focus-view" aria-label="Family around one person">
    <div className="focus-rows">
      {grandparents.some((pair) => pair.length) && <div className="focus-row focus-row-grandparents">
        {grandparents.map((pair, index) => <div className="focus-pair" key={index}>{pair.map((gp) => <PersonCard key={gp.id} person={gp} size="sm" onClick={() => onFocus(gp)} />)}</div>)}
      </div>}
      {parents.length > 0 && <div className="focus-row">{parents.map((parent) => <PersonCard key={parent.id} person={parent} size="md" onClick={() => onFocus(parent)} />)}</div>}
      <div className="focus-row focus-row-focal">
        <PersonCard person={focal} size="lg" onClick={() => onOpen(focal)} label="Open record" />
        {spouses.map((spouse) => <span className="focus-marriage" key={spouse.id}><span className="focus-marriage-glyph">⚭</span><PersonCard person={spouse} size="md" onClick={() => onFocus(spouse)} /></span>)}
      </div>
      {siblings.length > 0 && <div className="focus-siblings">Siblings: {siblings.map((sibling) => <button type="button" key={sibling.id} onClick={() => onFocus(sibling)}>{sibling.displayName}</button>)}</div>}
      {children.length > 0 && <div className="focus-children">
        {[...groups.values()].map((group, index) => <div className="focus-child-group" key={index}>
          {(groups.size > 1 || spouses.length > 1) && <p className="focus-group-label">with {group.spouse?.displayName ?? "unrecorded partner"}</p>}
          <div className="focus-row">{group.kids.map((child) => <PersonCard key={child.id} person={child} size="md" onClick={() => onFocus(child)} />)}</div>
        </div>)}
      </div>}
      {parents.length === 0 && children.length === 0 && spouses.length === 0 && <p className="focus-empty">No recorded relatives yet.</p>}
    </div>
  </section>;
}

/** Half-fan ancestor chart: the focal person at the center, ancestors in
 * concentric rings, children below to walk back down. */
export function FanChartView({ tree, focusId, onFocus }: { tree: FamilyTree; focusId: string; onFocus: (person: Person) => void }) {
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const focal = maps.byId.get(focusId) ?? tree.people[0];
  if (!focal) return null;
  const RINGS = 5;
  // ahnentafel slots: slot 1 = focal, parents of slot n are 2n and 2n + 1
  const slots = new Map<number, Person>();
  slots.set(1, focal);
  for (let n = 1; n < 2 ** RINGS; n += 1) {
    const person = slots.get(n);
    if (!person) continue;
    const parents = (maps.parentsOf.get(person.id) ?? []).map((id) => maps.byId.get(id)).filter(Boolean) as Person[];
    const father = parents.find((parent) => parent.gender === "male") ?? parents[0];
    const mother = parents.find((parent) => parent !== father);
    if (father) slots.set(2 * n, father);
    if (mother) slots.set(2 * n + 1, mother);
  }
  const CX = 480, CY = 470, R0 = 74, RING = 78;
  const sectors: { n: number; ring: number; path: string; person: Person | undefined; labelX: number; labelY: number; rotate: number }[] = [];
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const count = 2 ** ring;
    const inner = R0 + (ring - 1) * RING;
    const outer = inner + RING;
    for (let index = 0; index < count; index += 1) {
      const n = count + index;
      const a0 = Math.PI - (Math.PI * index) / count;
      const a1 = Math.PI - (Math.PI * (index + 1)) / count;
      const point = (radius: number, angle: number) => [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
      const [x0, y0] = point(inner, a0);
      const [x1, y1] = point(outer, a0);
      const [x2, y2] = point(outer, a1);
      const [x3, y3] = point(inner, a1);
      const path = `M ${x0} ${y0} L ${x1} ${y1} A ${outer} ${outer} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x0} ${y0}`;
      const mid = (a0 + a1) / 2;
      const labelRadius = (inner + outer) / 2;
      const [labelX, labelY] = point(labelRadius, mid);
      let rotate = 90 - (mid * 180) / Math.PI;
      if (rotate > 90) rotate -= 180;
      sectors.push({ n, ring, path, person: slots.get(n), labelX, labelY, rotate });
    }
  }
  const children = [...new Set(maps.childrenOf.get(focal.id) ?? [])].map((id) => maps.byId.get(id)).filter(Boolean) as Person[];
  const label = (person: Person, ring: number) => {
    const parts = person.displayName.split(/\s+/);
    if (ring >= 4) return parts[0];
    if (ring === 3) return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : person.displayName;
    return person.displayName;
  };
  return <section className="fan-view" aria-label="Ancestor fan chart">
    <svg viewBox="0 0 960 500" role="img" aria-label={`Ancestors of ${focal.displayName}`}>
      {sectors.map((sector) => <g key={sector.n} className={sector.person ? "fan-sector" : "fan-sector fan-sector-empty"} onClick={() => sector.person && onFocus(sector.person)}>
        <path d={sector.path} />
        {sector.person && <text x={sector.labelX} y={sector.labelY} transform={`rotate(${sector.rotate} ${sector.labelX} ${sector.labelY})`} className={`fan-label fan-label-${sector.ring}`}>
          <tspan x={sector.labelX} dy={sector.ring <= 2 ? "-0.2em" : "0.32em"}>{label(sector.person, sector.ring)}</tspan>
          {sector.ring <= 2 && <tspan x={sector.labelX} dy="1.3em" className="fan-years">{years(sector.person)}</tspan>}
        </text>}
      </g>)}
      <circle cx={CX} cy={CY} r={R0 - 6} className="fan-center" />
      <text x={CX} y={CY - 26} className="fan-center-name"><tspan x={CX}>{focal.displayName.split(/\s+/)[0]}</tspan><tspan x={CX} dy="1.25em">{focal.displayName.split(/\s+/).slice(1).join(" ")}</tspan><tspan x={CX} dy="1.5em" className="fan-years">{years(focal)}</tspan></text>
    </svg>
    <div className="fan-children">{children.length ? <>Step down to: {children.map((child) => <button type="button" key={child.id} onClick={() => onFocus(child)}>{child.displayName}</button>)}</> : "No recorded children."}</div>
  </section>;
}

/** The whole family as a collapsible indented outline. */
export function OutlineView({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const model = useMemo(() => {
    const maps = buildRelationMaps(tree);
    const lineage = new Map(tree.people.map((person) => [person.id, 0]));
    for (let pass = 0; pass < tree.people.length; pass += 1) {
      for (const [child, parents] of maps.parentsOf) {
        for (const parent of parents) lineage.set(child, Math.max(lineage.get(child) ?? 0, (lineage.get(parent) ?? 0) + 1));
      }
    }
    const primary = new Map<string, string>();
    for (const [child, parents] of maps.parentsOf) {
      const best = [...parents].sort((a, b) => (lineage.get(b) ?? 0) - (lineage.get(a) ?? 0) || (maps.byId.get(a)?.displayName ?? "").localeCompare(maps.byId.get(b)?.displayName ?? ""))[0];
      primary.set(child, best);
    }
    const kidsOf = new Map<string, string[]>();
    for (const [child, parent] of primary) kidsOf.set(parent, [...(kidsOf.get(parent) ?? []), child]);
    const placedAsSpouse = new Set<string>();
    for (const person of tree.people) {
      if (maps.parentsOf.has(person.id)) continue;
      const partner = (maps.spousesOf.get(person.id) ?? []).find((id) => maps.parentsOf.has(id) || kidsOf.has(id));
      if (partner) placedAsSpouse.add(person.id);
    }
    const roots = tree.people
      .filter((person) => !maps.parentsOf.has(person.id) && !placedAsSpouse.has(person.id))
      .sort((a, b) => (kidsOf.get(b.id)?.length ?? 0) - (kidsOf.get(a.id)?.length ?? 0) || a.displayName.localeCompare(b.displayName));
    return { maps, kidsOf, roots };
  }, [tree]);
  const { maps, kidsOf, roots } = model;
  const renderPerson = (person: Person, depth: number, seen: Set<string>): React.ReactNode => {
    if (seen.has(person.id)) return null;
    seen.add(person.id);
    const spouses = [...new Set(maps.spousesOf.get(person.id) ?? [])].map((id) => maps.byId.get(id)).filter(Boolean) as Person[];
    const kids = (kidsOf.get(person.id) ?? []).map((id) => maps.byId.get(id)).filter(Boolean) as Person[];
    kids.sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
    const line = <span className="outline-line">
      <button type="button" className="outline-name" onClick={() => onSelect(person)}>{person.displayName}</button>
      {years(person) && <span className="outline-years">{years(person)}</span>}
      {spouses.map((spouse) => <span className="outline-spouse" key={spouse.id}>⚭ <button type="button" onClick={() => onSelect(spouse)}>{spouse.displayName}</button>{years(spouse) ? ` ${years(spouse)}` : ""}</span>)}
    </span>;
    if (!kids.length) return <div className="outline-leaf" key={person.id}>{line}</div>;
    return <details key={person.id} open={depth < 2}>
      <summary>{line}</summary>
      <div className="outline-kids">{kids.map((kid) => renderPerson(kid, depth + 1, seen))}</div>
    </details>;
  };
  const seen = new Set<string>();
  return <section className="outline-view" aria-label="Family list">
    {roots.map((root) => renderPerson(root, 0, seen))}
  </section>;
}

/** Type-ahead person search shared by every view. */
export function TreeSearch({ tree, onPick }: { tree: FamilyTree; onPick: (person: Person) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return tree.people
      .filter((person) => person.displayName.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        const aStarts = a.displayName.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.displayName.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 8);
  }, [tree, query]);
  const pick = (person: Person) => {
    setQuery("");
    setOpen(false);
    onPick(person);
  };
  return <div className="tree-search" ref={boxRef}>
    <input
      type="search"
      placeholder="Find a person…"
      value={query}
      autoComplete="off"
      aria-label="Find a person"
      onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) pick(matches[0]); if (event.key === "Escape") { setQuery(""); setOpen(false); } }}
    />
    {open && matches.length > 0 && <div className="tree-search-results">
      {matches.map((person) => <button type="button" key={person.id} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(person)}>
        <strong>{person.displayName}</strong><span>{years(person) || "dates unknown"}</span>
      </button>)}
    </div>}
  </div>;
}
