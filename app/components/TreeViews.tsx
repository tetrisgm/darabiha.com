"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** Ancestry-style pedigree around a focal person: children stacked on the
 * left, the focal couple in the middle, parents and grandparents branching
 * to the right, with measured connector lines, gendered silhouettes, ghost
 * "add parent" slots, and a click popover offering Tree here / Profile. */
function Silhouette({ gender }: { gender: Person["gender"] }) {
  return <span className={`ped-portrait ped-${gender ?? "unknown"}`} aria-hidden="true">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
  </span>;
}

function place(person: Person) {
  return [person.birthCity, person.birthCountry].filter(Boolean).join(", ") || person.birthPlace || "";
}

export function FocusFamilyView({ tree, focusId, onFocus, onOpen, onBack, canBack }: { tree: FamilyTree; focusId: string; onFocus: (person: Person) => void; onOpen: (person: Person) => void; onBack?: () => void; canBack?: boolean }) {
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<string[]>([]);
  const [popover, setPopover] = useState<{ person: Person; x: number; y: number } | null>(null);
  const model = useMemo(() => {
    const focal = maps.byId.get(focusId) ?? tree.people[0];
    if (!focal) return null;
    const get = (id: string) => maps.byId.get(id);
    const parents = (maps.parentsOf.get(focal.id) ?? []).map(get).filter(Boolean) as Person[];
    const father = parents.find((parent) => parent.gender === "male") ?? parents[0];
    const mother = parents.find((parent) => parent !== father);
    const spouses = [...new Set(maps.spousesOf.get(focal.id) ?? [])].map(get).filter(Boolean) as Person[];
    const children = [...new Set(maps.childrenOf.get(focal.id) ?? [])].map(get).filter(Boolean) as Person[];
    children.sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
    const siblings = [...new Set(parents.flatMap((parent) => maps.childrenOf.get(parent.id) ?? []))].filter((id) => id !== focal.id).map(get).filter(Boolean) as Person[];
    const childGroups: { spouse: Person | undefined; kids: Person[] }[] = [];
    for (const child of children) {
      const other = (maps.parentsOf.get(child.id) ?? []).filter((id) => id !== focal.id).map(get).filter(Boolean)[0] as Person | undefined;
      const existing = childGroups.find((group) => group.spouse?.id === other?.id);
      if (existing) existing.kids.push(child);
      else childGroups.push({ spouse: other, kids: [child] });
    }
    const links: [string, string][] = [];
    for (const child of children) links.push([`child-${child.id}`, "focal"]);
    if (father) links.push(["focal", "p-father"]);
    if (mother) links.push(["focal", "p-mother"]);
    const grandSlots: { parentKey: string; person: Person | undefined; key: string; label: string }[] = [];
    for (const [parentKey, parent] of [["p-father", father], ["p-mother", mother]] as const) {
      if (!parent) continue;
      const grandparents = (maps.parentsOf.get(parent.id) ?? []).map(get).filter(Boolean) as Person[];
      const grandfather = grandparents.find((gp) => gp.gender === "male") ?? grandparents[0];
      const grandmother = grandparents.find((gp) => gp !== grandfather);
      grandSlots.push({ parentKey, person: grandfather, key: `${parentKey}-gf`, label: "Add father" });
      grandSlots.push({ parentKey, person: grandmother, key: `${parentKey}-gm`, label: "Add mother" });
      if (grandfather) links.push([parentKey, `${parentKey}-gf`]);
      if (grandmother) links.push([parentKey, `${parentKey}-gm`]);
    }
    return { focal, father, mother, spouses, children, siblings, childGroups, grandSlots, links };
  }, [maps, tree, focusId]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !model) return;
    const draw = () => {
      const base = container.getBoundingClientRect();
      const next: string[] = [];
      for (const [fromKey, toKey] of model.links) {
        const from = slotRefs.current.get(fromKey)?.getBoundingClientRect();
        const to = slotRefs.current.get(toKey)?.getBoundingClientRect();
        if (!from || !to) continue;
        const x0 = from.right - base.left, y0 = from.top + from.height / 2 - base.top;
        const x1 = to.left - base.left, y1 = to.top + to.height / 2 - base.top;
        const mid = (x0 + x1) / 2;
        next.push(`M ${x0} ${y0} L ${mid} ${y0} L ${mid} ${y1} L ${x1} ${y1}`);
      }
      setPaths(next);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [model]);
  if (!model) return null;
  const { focal, father, mother, spouses, children, siblings, childGroups, grandSlots } = model;
  const setRef = (key: string) => (element: HTMLDivElement | null) => {
    if (element) slotRefs.current.set(key, element);
    else slotRefs.current.delete(key);
  };
  const openPopover = (person: Person, event: React.MouseEvent) => {
    const stage = (event.currentTarget as HTMLElement).closest(".ped-stage");
    const base = stage?.getBoundingClientRect();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!base) return;
    setPopover({ person, x: rect.left - base.left + rect.width / 2, y: rect.bottom - base.top + 8 });
  };
  const card = (person: Person, key: string, size: "lg" | "md" | "sm") =>
    <div ref={setRef(key)} className={`ped-card ped-card-${size} ${person.id === focal.id ? "is-focal" : ""}`} key={key}>
      <button type="button" onClick={(event) => openPopover(person, event)}>
        {person.photoAttachmentId ? <span className="ped-portrait ped-photo"><img src={`/api/photos/${person.photoAttachmentId}`} alt="" /></span> : <Silhouette gender={person.gender} />}
        <span className="ped-copy">
          <strong>{person.displayName}</strong>
          <span>{years(person) || "dates unknown"}</span>
          {size === "lg" && place(person) && <span className="ped-place">{place(person)}</span>}
        </span>
      </button>
    </div>;
  const ghost = (label: string, key: string) =>
    <div ref={setRef(key)} className="ped-card ped-card-sm ped-ghost" key={key}>
      <button type="button" onClick={() => onOpen(focal)} title="Open the record to add this relative">＋ {label}</button>
    </div>;
  return <section className="focus-view ped-view" aria-label="Family around one person">
    <div className="focus-toolbar">
      <button type="button" className="focus-back" onClick={onBack} disabled={!canBack}>← Back</button>
      <p className="focus-hint">Click a card for options — center the tree on them or open their record.</p>
    </div>
    <div className="ped-stage" ref={containerRef} onClick={(event) => { if (event.target === event.currentTarget) setPopover(null); }}>
      <svg className="ped-lines" aria-hidden="true">{paths.map((d, index) => <path key={index} d={d} />)}</svg>
      <div className="ped-columns">
        <div className="ped-col ped-col-children">
          <p className="ped-col-label">Children</p>
          {children.length === 0 && <p className="ped-none">none recorded</p>}
          {childGroups.map((group, index) => <div className="ped-group" key={index}>
            {(childGroups.length > 1 || spouses.length > 1) && <p className="ped-group-label">with {group.spouse?.displayName ?? "unrecorded partner"}</p>}
            {group.kids.map((child) => card(child, `child-${child.id}`, "md"))}
          </div>)}
        </div>
        <div className="ped-col ped-col-focal">
          <div className="ped-couple">
            {card(focal, "focal", "lg")}
            {spouses.map((spouse) => <div className="ped-spouse" key={spouse.id}><span className="ped-marriage">⚭</span>{card(spouse, `spouse-${spouse.id}`, "md")}</div>)}
          </div>
          {siblings.length > 0 && <details className="ped-siblings">
            <summary>Siblings ({siblings.length})</summary>
            {siblings.map((sibling) => card(sibling, `sib-${sibling.id}`, "sm"))}
          </details>}
        </div>
        <div className="ped-col ped-col-parents">
          <p className="ped-col-label">Parents</p>
          {father ? card(father, "p-father", "md") : ghost("Add father", "p-father")}
          {mother ? card(mother, "p-mother", "md") : ghost("Add mother", "p-mother")}
        </div>
        <div className="ped-col ped-col-grand">
          <p className="ped-col-label">Grandparents</p>
          {grandSlots.length === 0 && <p className="ped-none">—</p>}
          {grandSlots.map((slot) => <div className="ped-grand-slot" key={slot.key}>
            {slot.person ? card(slot.person, slot.key, "sm") : ghost(slot.label, slot.key)}
          </div>)}
        </div>
      </div>
      {popover && <div className="ped-popover" style={{ left: popover.x, top: popover.y }}>
        <div className="ped-popover-head">
          <Silhouette gender={popover.person.gender} />
          <div><strong>{popover.person.displayName}</strong><span>{years(popover.person) || "dates unknown"}{place(popover.person) ? ` · ${place(popover.person)}` : ""}</span></div>
        </div>
        <div className="ped-popover-actions">
          <button type="button" onClick={() => { const person = popover.person; setPopover(null); onFocus(person); }}>Tree here</button>
          <button type="button" onClick={() => { const person = popover.person; setPopover(null); onOpen(person); }}>Profile</button>
          <button type="button" className="ped-popover-close" onClick={() => setPopover(null)} aria-label="Close">×</button>
        </div>
      </div>}
    </div>
  </section>;
}

/** Fan chart with two directions: ancestors of the focal person in
 * ahnentafel rings, or every descendant of a chosen forebear as
 * proportional wedges. */
export function FanChartView({ tree, focusId, onFocus }: { tree: FamilyTree; focusId: string; onFocus: (person: Person) => void }) {
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const descent = useMemo(() => buildDescentModel(tree), [tree]);
  const [mode, setMode] = useState<"descendants" | "ancestors">("descendants");
  const [descendRoot, setDescendRoot] = useState<string | null>(null);
  const focal = maps.byId.get(focusId) ?? tree.people[0];
  if (!focal) return null;
  if (mode === "descendants") {
    // default center: the top of the focal person's own line
    let centerId = descendRoot ?? focal.id;
    if (!descendRoot) {
      let guard = 0;
      while (guard < 20) {
        const parent = descent.primary.get(centerId);
        if (!parent) break;
        centerId = parent;
        guard += 1;
      }
    }
    const center = maps.byId.get(centerId) ?? focal;
    const leafCount = new Map<string, number>();
    const countLeaves = (id: string): number => {
      const cached = leafCount.get(id);
      if (cached !== undefined) return cached;
      const kids = descent.kidsOf.get(id) ?? [];
      const value = kids.length ? kids.reduce((sum, kid) => sum + countLeaves(kid), 0) : 1;
      leafCount.set(id, value);
      return value;
    };
    countLeaves(center.id);
    let maxDepth = 1;
    const measureDepth = (id: string, depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      for (const kid of descent.kidsOf.get(id) ?? []) measureDepth(kid, depth + 1);
    };
    measureDepth(center.id, 0);
    const CX = 480, CY = 470, R0 = 66;
    const RING = Math.min(78, (398 - R0) / Math.max(1, maxDepth));
    const wedges: { person: Person; path: string; labelX: number; labelY: number; rotate: number; arc: number; ring: number; tint: string }[] = [];
    const point = (radius: number, angle: number) => [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
    const HUES = [148, 32, 208, 268, 96, 4];
    const walk = (id: string, ring: number, a0: number, a1: number, branch: number) => {
      const kids = descent.kidsOf.get(id) ?? [];
      let angle = a0;
      kids.forEach((kid, index) => {
        const person = maps.byId.get(kid);
        const share = (countLeaves(kid) / Math.max(1, countLeaves(id))) * (a1 - a0);
        const b0 = angle, b1 = angle + share;
        angle = b1;
        if (!person) return;
        const childBranch = ring === 1 ? index : branch;
        const inner = R0 + (ring - 1) * RING;
        const outer = inner + RING;
        const [x0, y0] = point(inner, b0);
        const [x1, y1] = point(outer, b0);
        const [x2, y2] = point(outer, b1);
        const [x3, y3] = point(inner, b1);
        const path = `M ${x0} ${y0} L ${x1} ${y1} A ${outer} ${outer} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x0} ${y0}`;
        const mid = (b0 + b1) / 2;
        const [labelX, labelY] = point((inner + outer) / 2, mid);
        let rotate = 90 - (mid * 180) / Math.PI;
        if (rotate > 90) rotate -= 180;
        const tint = `hsl(${HUES[childBranch % HUES.length]} 42% ${Math.min(97, 88 + ring * 1.6)}%)`;
        wedges.push({ person, path, labelX, labelY, rotate, arc: Math.abs(b1 - b0) * ((inner + outer) / 2), ring, tint });
        walk(kid, ring + 1, b0, b1, childBranch);
      });
    };
    walk(center.id, 1, Math.PI, 0, 0);
    const centerParent = descent.primary.get(center.id) ? maps.byId.get(descent.primary.get(center.id)!) : undefined;
    return <section className="fan-view" aria-label="Descendant fan chart">
      <div className="fan-mode"><button type="button" className="is-active">Descendants</button><button type="button" onClick={() => setMode("ancestors")}>Ancestors</button></div>
      <svg viewBox="0 0 960 500" role="img" aria-label={`Descendants of ${center.displayName}`}>
        {wedges.map((wedge) => <g key={wedge.person.id} className="fan-sector" onClick={() => { setDescendRoot(wedge.person.id); onFocus(wedge.person); }}>
          <path d={wedge.path} style={{ fill: wedge.tint }}><title>{`${wedge.person.displayName}${years(wedge.person) ? ` · ${years(wedge.person)}` : ""}`}</title></path>
          {wedge.arc > 46 && <text x={wedge.labelX} y={wedge.labelY} transform={`rotate(${wedge.rotate} ${wedge.labelX} ${wedge.labelY})`} className={`fan-label fan-label-${Math.min(5, Math.max(1, wedge.ring))}`}>
            <tspan x={wedge.labelX} dy="0.32em">{wedge.arc > 120 ? wedge.person.displayName : wedge.person.displayName.split(/\s+/)[0]}</tspan>
          </text>}
        </g>)}
        <circle cx={CX} cy={CY} r={R0 - 6} className="fan-center" />
        <text x={CX} y={CY - 26} className="fan-center-name"><tspan x={CX}>{center.displayName.split(/\s+/)[0]}</tspan><tspan x={CX} dy="1.25em">{center.displayName.split(/\s+/).slice(1).join(" ")}</tspan><tspan x={CX} dy="1.5em" className="fan-years">{years(center)}</tspan></text>
      </svg>
      <div className="fan-children">
        Showing {wedges.length} descendants of {center.displayName}. Click a wedge to make it the center; hover for names.
        {centerParent && <button type="button" onClick={() => setDescendRoot(centerParent.id)}>↑ Up to {centerParent.displayName}</button>}
      </div>
    </section>;
  }
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
    <div className="fan-mode"><button type="button" onClick={() => setMode("descendants")}>Descendants</button><button type="button" className="is-active">Ancestors</button></div>
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

function buildDescentModel(tree: FamilyTree) {
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
  for (const kids of kidsOf.values()) {
    kids.sort((a, b) => (Number(maps.byId.get(a)?.birthDate?.slice(0, 4)) || 9999) - (Number(maps.byId.get(b)?.birthDate?.slice(0, 4)) || 9999) || (maps.byId.get(a)?.displayName ?? "").localeCompare(maps.byId.get(b)?.displayName ?? ""));
  }
  return { maps, primary, kidsOf };
}

/** The whole family as a collapsible indented outline. */
export function OutlineView({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const model = useMemo(() => {
    const { maps, kidsOf } = buildDescentModel(tree);
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
    return <details key={person.id} open>
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

/** A review queue of incomplete records: one card per person listing what is
 * missing, with inline inputs, save, and skip. Skips persist per browser. */
export function MissingDataView({ tree, onSaved, onOpen }: { tree: FamilyTree; onSaved: (tree: FamilyTree) => void; onOpen: (person: Person) => void }) {
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const generationOf = useMemo(() => {
    const depth = new Map(tree.people.map((person) => [person.id, 0]));
    for (let pass = 0; pass < tree.people.length; pass += 1) {
      for (const [child, parents] of maps.parentsOf) {
        for (const parent of parents) depth.set(child, Math.max(depth.get(child) ?? 0, (depth.get(parent) ?? 0) + 1));
      }
    }
    return depth;
  }, [tree, maps]);
  const [skipped, setSkipped] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem("darabiha-skipped") ?? "[]") as string[]); } catch { return new Set(); }
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const missingOf = (person: Person) => {
    const missing: string[] = [];
    if (!person.gender) missing.push("gender");
    if (!person.birthDate) missing.push("birth date");
    if (!person.birthCity && !person.birthCountry && !person.birthPlace) missing.push("birth place");
    if (!person.photoAttachmentId) missing.push("photo");
    return missing;
  };
  const incomplete = tree.people.filter((person) => missingOf(person).length > 0);
  const queue = incomplete
    .filter((person) => !skipped.has(person.id))
    .sort((a, b) => (generationOf.get(b.id) ?? 0) - (generationOf.get(a.id) ?? 0) || a.displayName.localeCompare(b.displayName));
  const current = queue[0];
  const persistSkips = (next: Set<string>) => {
    setSkipped(next);
    try { window.localStorage.setItem("darabiha-skipped", JSON.stringify([...next])); } catch { /* private mode */ }
  };
  const skip = () => {
    if (!current) return;
    persistSkips(new Set([...skipped, current.id]));
    setForm({});
    setNotice("");
  };
  const save = async () => {
    if (!current) return;
    const patch: Record<string, string> = {};
    for (const key of ["gender", "birthDate", "deathDate", "birthCity", "birthCountry"]) {
      if (form[key]?.trim()) patch[key] = form[key].trim();
    }
    if (!Object.keys(patch).length) { skip(); return; }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", personId: current.id, patch }) });
      const data = await response.json() as { tree?: FamilyTree };
      if (!response.ok || !data.tree) throw new Error("save_failed");
      onSaved(data.tree);
      setForm({});
      setNotice(`Saved ${current.displayName}.`);
    } catch {
      setNotice("Could not save — please try again.");
    } finally {
      setBusy(false);
    }
  };
  const context = (person: Person) => {
    const parents = (maps.parentsOf.get(person.id) ?? []).map((id) => maps.byId.get(id)?.displayName).filter(Boolean);
    const spouses = [...new Set(maps.spousesOf.get(person.id) ?? [])].map((id) => maps.byId.get(id)?.displayName).filter(Boolean);
    const kids = [...new Set(maps.childrenOf.get(person.id) ?? [])].length;
    const parts = [];
    if (parents.length) parts.push(`child of ${parents.join(" and ")}`);
    if (spouses.length) parts.push(`married to ${spouses.join(", ")}`);
    if (kids) parts.push(`${kids} ${kids === 1 ? "child" : "children"}`);
    return parts.join(" · ") || "no recorded relatives";
  };
  const complete = tree.people.length - incomplete.length;
  const field = (key: string, placeholder: string) =>
    <input className="fill-input" value={form[key] ?? ""} placeholder={placeholder} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />;
  return <section className="fill-view" aria-label="Fill in missing details">
    <div className="fill-progress">
      <strong>{complete}</strong> of {tree.people.length} records are complete · <strong>{queue.length}</strong> to review
      {skipped.size > 0 && <> · {skipped.size} skipped <button type="button" className="fill-reset" onClick={() => persistSkips(new Set())}>reset</button></>}
    </div>
    {!current && <div className="fill-done">Every card has been reviewed. Thank you! {skipped.size > 0 ? "Reset the skipped list to go through them again." : ""}</div>}
    {current && <div className="fill-card">
      <div className="fill-head">
        <button type="button" className="fill-name" onClick={() => onOpen(current)}>{current.displayName}</button>
        <span className="fill-context">{context(current)}</span>
        <span className="fill-missing">Missing: {missingOf(current).join(", ")}</span>
      </div>
      <div className="fill-fields">
        {!current.gender && <div className="fill-field"><label>Gender</label><div className="fill-gender">
          {(["female", "male"] as const).map((option) => <button key={option} type="button" className={form.gender === option ? "is-active" : ""} onClick={() => setForm({ ...form, gender: option })}>{option === "female" ? "♀ Female" : "♂ Male"}</button>)}
        </div></div>}
        {!current.birthDate && <div className="fill-field"><label>Born</label>{field("birthDate", "1962 or 1962-04-17")}</div>}
        {!current.deathDate && <div className="fill-field"><label>Died <em>(leave empty if living)</em></label>{field("deathDate", "1990 or 1990-11-02")}</div>}
        {!current.birthCity && !current.birthPlace && <div className="fill-field"><label>Birth city</label>{field("birthCity", "Qazvin")}</div>}
        {!current.birthCountry && !current.birthPlace && <div className="fill-field"><label>Birth country</label>{field("birthCountry", "Iran")}</div>}
      </div>
      <div className="fill-actions">
        <button type="button" className="fill-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="fill-skip" disabled={busy} onClick={skip}>Skip this person</button>
        {notice && <span className="fill-notice">{notice}</span>}
      </div>
    </div>}
    <p className="fill-footnote">Cards start with the youngest generations — the people the family knows best. A photo can be added from the person&rsquo;s record (click their name above). Anything saved here goes straight into the tree, the timeline, and the map.</p>
  </section>;
}
